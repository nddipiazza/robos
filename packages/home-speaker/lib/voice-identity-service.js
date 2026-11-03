'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_SAMPLE_RATE = 16000;
const ACOUSTIC_VECTOR_DIM = 48;
const XVECTOR_DIM = 512;

/**
 * Standard 3-step Voice Onboarding calibration phrases.
 * Designed to cover phonetic diversity (vowels, sibilants, nasal consonants, plosives)
 * and natural cadence when addressing the speaker.
 */
const VOICE_ONBOARDING_PHRASES = [
  {
    step: 1,
    id: 'phrase_wake_intro',
    prompt: 'Hello Nabu, this is my voice on RobOS.',
    hint: 'Establishes your baseline pitch, timbre, and wake-phrase cadence.',
  },
  {
    step: 2,
    id: 'phrase_media_cast',
    prompt: 'Hello Nabu, play some music in the living room.',
    hint: 'Captures natural media command inflection and nasal/liquid resonance.',
  },
  {
    step: 3,
    id: 'phrase_system_query',
    prompt: 'Hello Nabu, what is the status of my system today?',
    hint: 'Captures question intonation and sibilant frequency distribution.',
  },
];

const AVATAR_PALETTE = [
  '#00bcd4',
  '#3fb950',
  '#a371f7',
  '#f0883e',
  '#58a6ff',
  '#f778ba',
  '#d29922',
];

function slugifyUserId(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `user-${Date.now().toString(36)}`;
}

/**
 * L2-normalize a numeric array or Float32Array into a plain Number[] of unit length.
 */
function l2Normalize(vec) {
  if (!vec || !vec.length) return [];
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = Number(vec[i]) || 0;
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  if (norm < 1e-12) return Array.from({ length: vec.length }, () => 0);
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = (Number(vec[i]) || 0) / norm;
  }
  return out;
}

/**
 * Cosine similarity between two vectors in [-1, 1].
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const va = Number(a[i]) || 0;
    const vb = Number(b[i]) || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return 0;
  return Math.max(-1, Math.min(1, dot / denom));
}

/**
 * Average multiple vectors of the same dimension and L2-normalize the centroid.
 */
function computeCentroid(vectors) {
  const valid = (vectors || []).filter((v) => Array.isArray(v) && v.length > 0);
  if (valid.length === 0) return [];
  const dim = valid[0].length;
  const sum = new Array(dim).fill(0);
  let count = 0;
  for (const vec of valid) {
    if (vec.length !== dim) continue;
    for (let i = 0; i < dim; i++) {
      sum[i] += Number(vec[i]) || 0;
    }
    count++;
  }
  if (count === 0) return [];
  for (let i = 0; i < dim; i++) sum[i] /= count;
  return l2Normalize(sum);
}

/**
 * Convert 16-bit signed LE PCM Buffer to Float32Array in [-1, 1].
 */
function pcm16leToFloat32(pcmBuffer) {
  if (!Buffer.isBuffer(pcmBuffer) || pcmBuffer.length < 2) {
    return new Float32Array(0);
  }
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = pcmBuffer.readInt16LE(i * 2) / 32768.0;
  }
  return out;
}

/**
 * Convert Float32Array [-1, 1] to 16-bit signed LE PCM Buffer.
 */
function float32ToPcm16le(float32) {
  if (!float32 || !float32.length) return Buffer.alloc(0);
  const buf = Buffer.alloc(float32.length * 2);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, Number(float32[i]) || 0));
    buf.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  return buf;
}

/**
 * Read a 16-bit PCM WAV file into { float32, pcmBuffer, sampleRate }.
 */
function readWavFile(wavPath) {
  if (!wavPath || !fs.existsSync(wavPath)) return null;
  const buf = fs.readFileSync(wavPath);
  if (buf.length <= 44) return null;

  let sampleRate = DEFAULT_SAMPLE_RATE;
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    sampleRate = buf.readUInt32LE(24) || DEFAULT_SAMPLE_RATE;
  }

  let dataOffset = 44;
  let dataLen = buf.length - 44;
  let offset = 12;
  while (offset <= buf.length - 8) {
    const id = buf.toString('ascii', offset, offset + 4);
    const sz = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      dataOffset = offset + 8;
      dataLen = Math.min(sz || (buf.length - dataOffset), buf.length - dataOffset);
      break;
    }
    if (sz <= 0) break;
    offset += 8 + sz;
  }

  const pcmBuffer = buf.slice(dataOffset, dataOffset + dataLen);
  const float32 = pcm16leToFloat32(pcmBuffer);
  return { float32, pcmBuffer, sampleRate };
}

/**
 * Write a 16kHz 16-bit mono PCM buffer to a RIFF WAVE file.
 */
function writePcmToWavFile(pcmBuffer, outPath, sampleRate = DEFAULT_SAMPLE_RATE) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([header, pcmBuffer]));
  return outPath;
}

/**
 * Extract a deterministic 48-dimensional Acoustic & Spectral DSP Biometric Voiceprint
 * from a 16kHz mono Float32Array waveform.
 *
 * Captures:
 *  - Fundamental pitch contour (F0 mean, median, std, P10, P90, IQR) via autocorrelation
 *  - Harmonic-to-noise clarity (autocorrelation peak strength)
 *  - 16 Mel-spaced spectral band log-energies (mean & std across voiced frames)
 *  - 12 Mel-Frequency Cepstral Coefficients (MFCCs C1..C12 via DCT-II)
 *  - Spectral centroid, spectral rolloff (85%), zero-crossing rate, and formant ratios
 */
function extractAcousticVoiceprint(float32Input, sampleRate = DEFAULT_SAMPLE_RATE) {
  if (!float32Input || float32Input.length < 800) {
    return {
      vector: new Array(ACOUSTIC_VECTOR_DIM).fill(0),
      stats: { pitchHz: 0, pitchStdHz: 0, voicedRatio: 0, durationSec: 0 },
    };
  }

  // 1. Pre-emphasis + peak normalization on active speech frames
  const N = float32Input.length;
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const a = Math.abs(float32Input[i]);
    if (a > peak) peak = a;
  }
  const scale = peak > 1e-4 ? 1.0 / peak : 1.0;
  const sig = new Float32Array(N);
  sig[0] = float32Input[0] * scale;
  for (let i = 1; i < N; i++) {
    sig[i] = (float32Input[i] - 0.95 * float32Input[i - 1]) * scale;
  }

  const rawNorm = new Float32Array(N);
  for (let i = 0; i < N; i++) rawNorm[i] = float32Input[i] * scale;

  const frameSize = 400; // 25ms @ 16kHz
  const hopSize = 160;   // 10ms @ 16kHz
  const minLag = Math.floor(sampleRate / 380); // ~380 Hz max F0
  const maxLag = Math.floor(sampleRate / 65);  // ~65 Hz min F0

  // Precompute 16 Goertzel / DFT center frequencies spaced on the Mel scale (120 Hz -> 6800 Hz)
  const numBands = 16;
  const melMin = 2595 * Math.log10(1 + 120 / 700);
  const melMax = 2595 * Math.log10(1 + 6800 / 700);
  const bandFreqs = [];
  for (let b = 0; b < numBands; b++) {
    const mel = melMin + (b / (numBands - 1)) * (melMax - melMin);
    bandFreqs.push(700 * (Math.pow(10, mel / 2595) - 1));
  }

  const hamming = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    hamming[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
  }

  const pitches = [];
  const harmonicStrengths = [];
  const zcrs = [];
  const centroids = [];
  const bandFrames = [];

  let totalFrames = 0;
  for (let start = 0; start + frameSize <= N; start += hopSize) {
    totalFrames++;
    let energy = 0;
    let zcr = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = rawNorm[start + i];
      energy += s * s;
      if (i > 0 && ((rawNorm[start + i] >= 0) !== (rawNorm[start + i - 1] >= 0))) {
        zcr++;
      }
    }
    const rms = Math.sqrt(energy / frameSize);
    if (rms < 0.035) continue; // Skip silence frames

    zcrs.push(zcr / frameSize);

    // Pitch estimation on un-preemphasized normalized signal via normalized autocorrelation
    let bestLag = 0;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag && start + lag + frameSize <= N; lag += 1) {
      let num = 0;
      let den1 = 0;
      let den2 = 0;
      for (let i = 0; i < frameSize; i += 2) {
        const a = rawNorm[start + i];
        const b = rawNorm[start + i + lag];
        num += a * b;
        den1 += a * a;
        den2 += b * b;
      }
      const corr = num / (Math.sqrt(den1 * den2) + 1e-8);
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    if (bestCorr >= 0.45 && bestLag > 0) {
      const f0 = sampleRate / bestLag;
      if (f0 >= 65 && f0 <= 380) {
        pitches.push(f0);
        harmonicStrengths.push(bestCorr);
      }
    }

    // Compute Mel-spaced band energies via Goertzel resonator on pre-emphasized Hamming frame
    const bandLogE = new Array(numBands);
    let weightedFreqSum = 0;
    let powerSum = 0;
    for (let b = 0; b < numBands; b++) {
      const freq = bandFreqs[b];
      const k = (freq * frameSize) / sampleRate;
      const omega = (2 * Math.PI * k) / frameSize;
      const coeff = 2 * Math.cos(omega);
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < frameSize; i++) {
        s0 = sig[start + i] * hamming[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      const power = Math.max(1e-9, (s1 * s1 + s2 * s2 - coeff * s1 * s2) / frameSize);
      bandLogE[b] = Math.log(power + 1e-8);
      weightedFreqSum += freq * power;
      powerSum += power;
    }
    bandFrames.push(bandLogE);
    if (powerSum > 1e-8) {
      centroids.push(weightedFreqSum / powerSum);
    }
  }

  pitches.sort((a, b) => a - b);
  const meanOf = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const stdOf = (arr, m) => {
    if (arr.length < 2) return 0;
    const mu = m !== undefined ? m : meanOf(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - mu) * (v - mu), 0) / arr.length);
  };
  const quantile = (sorted, q) => {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
    return sorted[idx];
  };

  const pitchMean = meanOf(pitches);
  const pitchStd = stdOf(pitches, pitchMean);
  const pitchMedian = quantile(pitches, 0.5);
  const pitchP10 = quantile(pitches, 0.1);
  const pitchP90 = quantile(pitches, 0.9);
  const harmonicMean = meanOf(harmonicStrengths);
  const zcrMean = meanOf(zcrs);
  const zcrStd = stdOf(zcrs, zcrMean);
  const centroidMean = meanOf(centroids);
  const centroidStd = stdOf(centroids, centroidMean);

  // Mean & std of each of the 16 Mel bands
  const bandMeans = new Array(numBands).fill(0);
  const bandStds = new Array(numBands).fill(0);
  if (bandFrames.length > 0) {
    for (let b = 0; b < numBands; b++) {
      let s = 0;
      for (let f = 0; f < bandFrames.length; f++) s += bandFrames[f][b];
      bandMeans[b] = s / bandFrames.length;
    }
    // Cepstral mean subtraction (channel-invariant timbre profile)
    const globalBandMean = meanOf(bandMeans);
    for (let b = 0; b < numBands; b++) {
      let sq = 0;
      for (let f = 0; f < bandFrames.length; f++) {
        const d = bandFrames[f][b] - bandMeans[b];
        sq += d * d;
      }
      bandStds[b] = Math.sqrt(sq / bandFrames.length);
      bandMeans[b] -= globalBandMean;
    }
  }

  // 12 MFCCs via DCT-II over the 16 channel-normalized log-Mel band means
  const numMfcc = 12;
  const mfccs = new Array(numMfcc).fill(0);
  for (let c = 1; c <= numMfcc; c++) {
    let sum = 0;
    for (let b = 0; b < numBands; b++) {
      sum += bandMeans[b] * Math.cos((Math.PI * c * (b + 0.5)) / numBands);
    }
    mfccs[c - 1] = sum * Math.sqrt(2 / numBands);
  }

  // Assemble 48-dim feature vector (scaled so pitch, timbre, and MFCCs have balanced weight)
  const rawVec = [
    (pitchMean - 160) / 80,
    (pitchMedian - 160) / 80,
    pitchStd / 40,
    (pitchP10 - 140) / 80,
    (pitchP90 - 180) / 80,
    (pitchP90 - pitchP10) / 60,
    harmonicMean,
    zcrMean * 4,
    zcrStd * 6,
    (centroidMean - 1500) / 1200,
    centroidStd / 800,
    bandFrames.length / Math.max(1, totalFrames),
    ...mfccs.map((v) => v * 0.45),
    ...bandMeans.map((v) => v * 0.35),
    ...bandStds.slice(0, 8).map((v) => v * 0.35),
  ].slice(0, ACOUSTIC_VECTOR_DIM);

  while (rawVec.length < ACOUSTIC_VECTOR_DIM) rawVec.push(0);

  return {
    vector: l2Normalize(rawVec),
    stats: {
      pitchHz: Math.round(pitchMean * 10) / 10,
      pitchMedianHz: Math.round(pitchMedian * 10) / 10,
      pitchStdHz: Math.round(pitchStd * 10) / 10,
      centroidHz: Math.round(centroidMean),
      voicedFrames: bandFrames.length,
      voicedRatio: Math.round((bandFrames.length / Math.max(1, totalFrames)) * 100) / 100,
      durationSec: Math.round((N / sampleRate) * 100) / 100,
    },
  };
}

/**
 * RobOS Voice Identity & Speaker Onboarding Service
 *
 * Identifies which RobOS User is speaking using:
 *  1. 512-dim WavLM-Base-Plus-SV X-Vector neural speaker embeddings (`Xenova/wavlm-base-plus-sv`)
 *  2. 48-dim Acoustic/Spectral DSP voiceprint (F0 pitch contour + 16-band Mel + 12 MFCCs)
 *
 * Persists enrolled profiles to `~/.config/robos/voice-profiles.json` and writes the
 * active speaker metadata to `~/.config/robos/active-voice-context.json` so every
 * RobOS app receives `"robosUser"` metadata with every voice command.
 */
class VoiceIdentityService {
  constructor(options = {}) {
    this.configDir = options.configDir || process.env.ROBOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'robos');
    this.profilesFile = path.join(this.configDir, 'voice-profiles.json');
    this.activeContextFile = path.join(this.configDir, 'active-voice-context.json');
    this.samplesDir = path.join(this.configDir, 'voice-samples');
    this.useNeural = options.useNeural !== undefined ? Boolean(options.useNeural) : process.env.ROBOS_TEST !== '1';
    this.matchThreshold = Number(options.matchThreshold) || 0.68;
    this._neuralPipelinePromise = null;
  }

  getOnboardingPhrases() {
    return VOICE_ONBOARDING_PHRASES;
  }

  /**
   * Read local workstation default user from `~/.config/robos/identity.json` or OS user.
   */
  getDefaultWorkstationUser() {
    const idFile = path.join(this.configDir, 'identity.json');
    try {
      if (fs.existsSync(idFile)) {
        const data = JSON.parse(fs.readFileSync(idFile, 'utf8'));
        const username = os.userInfo().username || 'robos';
        return {
          userId: data.uid && data.uid !== 'admin' ? slugifyUserId(data.uid) : slugifyUserId(username),
          name: data.displayName || data.name || username,
          role: data.role || 'Owner / Admin',
          email: data.email || '',
          osUsername: username,
        };
      }
    } catch {}
    const username = os.userInfo().username || 'robos';
    return {
      userId: slugifyUserId(username),
      name: username,
      role: 'Owner / Admin',
      email: '',
      osUsername: username,
    };
  }

  _loadStore() {
    try {
      if (fs.existsSync(this.profilesFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.profilesFile, 'utf8'));
        if (parsed && Array.isArray(parsed.profiles)) {
          return parsed;
        }
      }
    } catch {}
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      profiles: [],
    };
  }

  _saveStore(store) {
    fs.mkdirSync(this.configDir, { recursive: true });
    store.updatedAt = new Date().toISOString();
    const tmp = `${this.profilesFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, this.profilesFile);
    return store;
  }

  /**
   * List all enrolled RobOS User voice profiles (without huge raw vectors unless includeVectors=true).
   */
  listProfiles({ includeVectors = false } = {}) {
    const store = this._loadStore();
    return store.profiles.map((p) => {
      const copy = {
        userId: p.userId,
        name: p.name,
        displayName: p.displayName || p.name,
        role: p.role || 'Member',
        email: p.email || '',
        avatarColor: p.avatarColor || '#00bcd4',
        preferredVoice: p.preferredVoice || 'af_heart',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        sampleCount: Array.isArray(p.samples) ? p.samples.length : 0,
        onboardingComplete: Array.isArray(p.samples) && p.samples.length >= 1,
        recommendedSamplesComplete: Array.isArray(p.samples) && p.samples.length >= 3,
        hasNeuralVoiceprint: Array.isArray(p.centroidXVector) && p.centroidXVector.length === XVECTOR_DIM,
        hasAcousticVoiceprint: Array.isArray(p.centroidAcoustic) && p.centroidAcoustic.length === ACOUSTIC_VECTOR_DIM,
        voiceStats: p.voiceStats || null,
        samples: (p.samples || []).map((s) => ({
          id: s.id,
          step: s.step || null,
          phrase: s.phrase || '',
          transcript: s.transcript || '',
          source: s.source || 'speaker',
          createdAt: s.createdAt,
          durationSec: s.durationSec || 0,
          wavPath: s.wavPath || null,
          stats: s.stats || null,
        })),
      };
      if (includeVectors) {
        copy.centroidXVector = p.centroidXVector || [];
        copy.centroidAcoustic = p.centroidAcoustic || [];
      }
      return copy;
    });
  }

  /**
   * Create or update a RobOS User profile before or during voice onboarding.
   */
  upsertUserProfile(userData = {}) {
    const store = this._loadStore();
    const name = String(userData.name || userData.displayName || '').trim() || 'RobOS User';
    const userId = slugifyUserId(userData.userId || name);
    let profile = store.profiles.find((p) => p.userId === userId);
    const now = new Date().toISOString();

    if (!profile) {
      const colorIdx = store.profiles.length % AVATAR_PALETTE.length;
      profile = {
        userId,
        name,
        displayName: userData.displayName || name,
        role: String(userData.role || 'Owner').trim(),
        email: String(userData.email || '').trim(),
        avatarColor: userData.avatarColor || AVATAR_PALETTE[colorIdx],
        preferredVoice: userData.preferredVoice || 'af_heart',
        createdAt: now,
        updatedAt: now,
        samples: [],
        centroidXVector: [],
        centroidAcoustic: [],
        voiceStats: null,
      };
      store.profiles.push(profile);
    } else {
      if (userData.name) {
        profile.name = String(userData.name).trim();
        profile.displayName = String(userData.displayName || userData.name).trim();
      }
      if (userData.role !== undefined) profile.role = String(userData.role).trim();
      if (userData.email !== undefined) profile.email = String(userData.email).trim();
      if (userData.avatarColor) profile.avatarColor = userData.avatarColor;
      if (userData.preferredVoice) profile.preferredVoice = userData.preferredVoice;
      profile.updatedAt = now;
    }

    this._saveStore(store);
    return this.listProfiles().find((p) => p.userId === userId);
  }

  /**
   * Remove a user voice profile (or a single sample if sampleId is passed).
   */
  removeUserProfile(userId, sampleId = null) {
    const targetId = slugifyUserId(userId);
    const store = this._loadStore();
    const idx = store.profiles.findIndex((p) => p.userId === targetId);
    if (idx === -1) return { ok: false, error: `Profile not found: ${targetId}` };

    if (sampleId) {
      const prof = store.profiles[idx];
      prof.samples = (prof.samples || []).filter((s) => s.id !== sampleId);
      this._recomputeProfileCentroids(prof);
      prof.updatedAt = new Date().toISOString();
      this._saveStore(store);
      return { ok: true, profiles: this.listProfiles() };
    }

    store.profiles.splice(idx, 1);
    this._saveStore(store);
    return { ok: true, profiles: this.listProfiles() };
  }

  _recomputeProfileCentroids(profile) {
    const samples = Array.isArray(profile.samples) ? profile.samples : [];
    const xvectors = samples.map((s) => s.xvector).filter((v) => Array.isArray(v) && v.length === XVECTOR_DIM);
    const acoustics = samples.map((s) => s.acousticVector).filter((v) => Array.isArray(v) && v.length === ACOUSTIC_VECTOR_DIM);

    profile.centroidXVector = computeCentroid(xvectors);
    profile.centroidAcoustic = computeCentroid(acoustics);

    const pitchVals = samples.map((s) => s.stats?.pitchHz).filter((v) => Number(v) > 0);
    if (pitchVals.length > 0) {
      const avgPitch = pitchVals.reduce((a, b) => a + b, 0) / pitchVals.length;
      profile.voiceStats = {
        averagePitchHz: Math.round(avgPitch * 10) / 10,
        sampleCount: samples.length,
      };
    } else {
      profile.voiceStats = { sampleCount: samples.length };
    }
  }

  /**
   * Lazy-load `Xenova/wavlm-base-plus-sv` (512-dim X-Vector Speaker Verification model).
   */
  async _getNeuralExtractor() {
    if (!this.useNeural) return null;
    if (!this._neuralPipelinePromise) {
      this._neuralPipelinePromise = (async () => {
        try {
          const localTransformers = path.resolve(
            __dirname,
            '../../voice-prompt/node_modules/@xenova/transformers/src/transformers.js'
          );
          const mod = fs.existsSync(localTransformers)
            ? await import(localTransformers)
            : await import('@xenova/transformers');
          const processor = await mod.AutoProcessor.from_pretrained('Xenova/wavlm-base-plus-sv');
          const model = await mod.AutoModel.from_pretrained('Xenova/wavlm-base-plus-sv');
          return { processor, model };
        } catch (err) {
          console.warn('[VoiceIdentityService] WavLM-SV load notice:', err.message);
          return null;
        }
      })();
    }
    return this._neuralPipelinePromise;
  }

  /**
   * Extract both the 512-dim Neural X-Vector (if enabled) and 48-dim Acoustic DSP voiceprint
   * from a Float32Array (16kHz), PCM16 Buffer, or WAV file path.
   */
  async extractVoiceEmbeddings({ float32 = null, pcmBuffer = null, wavPath = null } = {}) {
    let audioFloat = float32;
    let rawPcm = pcmBuffer;

    if (!audioFloat && rawPcm) {
      audioFloat = pcm16leToFloat32(rawPcm);
    } else if (!audioFloat && wavPath) {
      const parsed = readWavFile(wavPath);
      if (parsed) {
        audioFloat = parsed.float32;
        rawPcm = parsed.pcmBuffer;
      }
    }

    if (!audioFloat || audioFloat.length < 800) {
      return {
        ok: false,
        error: 'Audio sample is too short for voiceprint extraction (minimum 0.1s required).',
      };
    }

    const acoustic = extractAcousticVoiceprint(audioFloat, DEFAULT_SAMPLE_RATE);
    let xvector = [];

    const neural = await this._getNeuralExtractor();
    if (neural && neural.processor && neural.model) {
      try {
        const inputs = await neural.processor(audioFloat);
        const outputs = await neural.model(inputs);
        if (outputs && outputs.embeddings && outputs.embeddings.data) {
          xvector = l2Normalize(Array.from(outputs.embeddings.data));
        }
      } catch (err) {
        console.warn('[VoiceIdentityService] XVector inference notice:', err.message);
      }
    }

    return {
      ok: true,
      xvector,
      acousticVector: acoustic.vector,
      stats: acoustic.stats,
      method: xvector.length === XVECTOR_DIM ? 'wavlm-xvector+acoustic' : 'acoustic-dsp',
    };
  }

  /**
   * Enroll a recorded voice sample into a RobOS User's voice profile.
   */
  async enrollVoiceSample({
    userId,
    name,
    role = 'Owner',
    email = '',
    step = null,
    phrase = '',
    transcript = '',
    source = 'speaker',
    pcmBuffer = null,
    float32 = null,
    wavPath = null,
  } = {}) {
    if (!userId && !name) {
      return { ok: false, error: 'A RobOS User name or userId is required for voice enrollment.' };
    }

    const resolvedName = String(name || userId).trim();
    const resolvedUserId = slugifyUserId(userId || resolvedName);

    // Ensure profile exists
    this.upsertUserProfile({ userId: resolvedUserId, name: resolvedName, role, email });

    let savedWavPath = wavPath;
    if (!savedWavPath && (pcmBuffer || float32)) {
      const rawBuf = pcmBuffer || float32ToPcm16le(float32);
      const userDir = path.join(this.samplesDir, resolvedUserId);
      fs.mkdirSync(userDir, { recursive: true });
      savedWavPath = path.join(userDir, `sample-${Date.now()}.wav`);
      writePcmToWavFile(rawBuf, savedWavPath, DEFAULT_SAMPLE_RATE);
    }

    const extracted = await this.extractVoiceEmbeddings({
      float32,
      pcmBuffer,
      wavPath: savedWavPath,
    });

    if (!extracted.ok) {
      return extracted;
    }

    const store = this._loadStore();
    const profile = store.profiles.find((p) => p.userId === resolvedUserId);
    if (!profile) {
      return { ok: false, error: 'Failed to locate created user profile.' };
    }

    const sampleEntry = {
      id: `smp_${crypto.randomBytes(6).toString('hex')}`,
      step: step || (profile.samples.length + 1),
      phrase: String(phrase || '').trim(),
      transcript: String(transcript || '').trim(),
      source,
      createdAt: new Date().toISOString(),
      durationSec: extracted.stats?.durationSec || 0,
      wavPath: savedWavPath || null,
      stats: extracted.stats,
      xvector: extracted.xvector,
      acousticVector: extracted.acousticVector,
    };

    // If re-recording the same onboarding step (1..3), replace that step's sample or append
    if (step && step >= 1 && step <= 3) {
      const existingIdx = profile.samples.findIndex((s) => Number(s.step) === Number(step));
      if (existingIdx >= 0) {
        profile.samples[existingIdx] = sampleEntry;
      } else {
        profile.samples.push(sampleEntry);
      }
    } else {
      profile.samples.push(sampleEntry);
    }

    this._recomputeProfileCentroids(profile);
    profile.updatedAt = new Date().toISOString();
    this._saveStore(store);

    const updatedProfile = this.listProfiles().find((p) => p.userId === resolvedUserId);
    return {
      ok: true,
      userId: resolvedUserId,
      profile: updatedProfile,
      sample: {
        id: sampleEntry.id,
        step: sampleEntry.step,
        phrase: sampleEntry.phrase,
        transcript: sampleEntry.transcript,
        durationSec: sampleEntry.durationSec,
        stats: sampleEntry.stats,
        method: extracted.method,
      },
      profiles: this.listProfiles(),
    };
  }

  /**
   * Compare extracted query embeddings against a single profile.
   */
  _scoreProfileMatch(queryEmb, profile) {
    const hasQueryX = Array.isArray(queryEmb.xvector) && queryEmb.xvector.length === XVECTOR_DIM;
    const hasProfX = Array.isArray(profile.centroidXVector) && profile.centroidXVector.length === XVECTOR_DIM;

    // 1. Centroid similarity
    let centroidXSim = 0;
    if (hasQueryX && hasProfX) {
      centroidXSim = cosineSimilarity(queryEmb.xvector, profile.centroidXVector);
    }
    const centroidAcSim = cosineSimilarity(queryEmb.acousticVector, profile.centroidAcoustic || []);

    // 2. Best individual enrolled sample similarity
    let maxSampleXSim = centroidXSim;
    let maxSampleAcSim = centroidAcSim;
    for (const s of profile.samples || []) {
      if (hasQueryX && Array.isArray(s.xvector) && s.xvector.length === XVECTOR_DIM) {
        const sim = cosineSimilarity(queryEmb.xvector, s.xvector);
        if (sim > maxSampleXSim) maxSampleXSim = sim;
      }
      if (Array.isArray(s.acousticVector) && s.acousticVector.length === ACOUSTIC_VECTOR_DIM) {
        const sim = cosineSimilarity(queryEmb.acousticVector, s.acousticVector);
        if (sim > maxSampleAcSim) maxSampleAcSim = sim;
      }
    }

    const blendedX = 0.65 * maxSampleXSim + 0.35 * centroidXSim;
    const blendedAc = 0.65 * maxSampleAcSim + 0.35 * centroidAcSim;

    // Pitch proximity bonus/penalty if both have voiced pitch estimates
    let pitchFactor = 0;
    const qPitch = queryEmb.stats?.pitchHz || 0;
    const pPitch = profile.voiceStats?.averagePitchHz || 0;
    if (qPitch > 55 && pPitch > 55) {
      const relDiff = Math.abs(qPitch - pPitch) / Math.max(qPitch, pPitch);
      // Within 12% pitch is a strong biological match; >35% pitch divergence is penalized
      if (relDiff <= 0.12) pitchFactor = 0.04;
      else if (relDiff >= 0.32) pitchFactor = -0.12;
    }

    let rawSimilarity;
    let method;
    if (hasQueryX && hasProfX) {
      rawSimilarity = 0.78 * blendedX + 0.22 * blendedAc + pitchFactor;
      method = 'wavlm-xvector+acoustic';
    } else {
      rawSimilarity = blendedAc + pitchFactor;
      method = 'acoustic-dsp';
    }

    return {
      similarity: Math.max(0, Math.min(0.99, rawSimilarity)),
      xvectorSim: Math.round(blendedX * 1000) / 1000,
      acousticSim: Math.round(blendedAc * 1000) / 1000,
      method,
    };
  }

  /**
   * Identify which enrolled RobOS User is speaking from a 16kHz PCM buffer, Float32Array, or WAV file.
   */
  async identifySpeaker({
    pcmBuffer = null,
    float32 = null,
    wavPath = null,
    speakerIp = null,
    source = 'home-assistant-voice-pe',
    threshold = this.matchThreshold,
  } = {}) {
    const store = this._loadStore();
    const enrolledProfiles = store.profiles.filter(
      (p) => Array.isArray(p.samples) && p.samples.length > 0
    );

    if (enrolledProfiles.length === 0) {
      const fallbackUser = this.getDefaultWorkstationUser();
      return {
        ok: true,
        identified: false,
        reason: 'no_enrolled_profiles',
        userId: fallbackUser.userId,
        name: fallbackUser.name,
        displayName: fallbackUser.name,
        role: fallbackUser.role,
        confidence: 0,
        similarity: 0,
        robosUser: {
          userId: fallbackUser.userId,
          name: fallbackUser.name,
          displayName: fallbackUser.name,
          role: fallbackUser.role,
          email: fallbackUser.email || '',
          identified: false,
          enrolled: false,
          confidence: 0,
          source,
          speakerIp: speakerIp || null,
          identifiedAt: new Date().toISOString(),
        },
      };
    }

    const extracted = await this.extractVoiceEmbeddings({ pcmBuffer, float32, wavPath });
    if (!extracted.ok) {
      return {
        ok: false,
        identified: false,
        reason: 'audio_too_short',
        error: extracted.error,
        robosUser: null,
      };
    }

    const candidates = enrolledProfiles.map((prof) => {
      const scoreInfo = this._scoreProfileMatch(extracted, prof);
      return {
        userId: prof.userId,
        name: prof.name,
        displayName: prof.displayName || prof.name,
        role: prof.role || 'Member',
        email: prof.email || '',
        avatarColor: prof.avatarColor || '#00bcd4',
        preferredVoice: prof.preferredVoice || 'af_heart',
        similarity: scoreInfo.similarity,
        xvectorSim: scoreInfo.xvectorSim,
        acousticSim: scoreInfo.acousticSim,
        method: scoreInfo.method,
      };
    });

    candidates.sort((a, b) => b.similarity - a.similarity);
    const best = candidates[0];
    const second = candidates[1] || null;
    const margin = second ? best.similarity - second.similarity : best.similarity;

    const effectiveThreshold = best.method === 'wavlm-xvector+acoustic'
      ? threshold
      : Math.max(0.62, threshold - 0.04);

    const isIdentified = best.similarity >= effectiveThreshold;
    const confidence = Math.round(best.similarity * 100) / 100;

    const robosUser = isIdentified
      ? {
          userId: best.userId,
          name: best.name,
          displayName: best.displayName,
          role: best.role,
          email: best.email,
          avatarColor: best.avatarColor,
          preferredVoice: best.preferredVoice,
          identified: true,
          enrolled: true,
          confidence,
          similarity: confidence,
          method: best.method,
          voicePitchHz: extracted.stats?.pitchHz || null,
          source,
          speakerIp: speakerIp || null,
          identifiedAt: new Date().toISOString(),
        }
      : {
          userId: 'unknown',
          name: 'Unknown Speaker',
          displayName: 'Unknown Speaker',
          role: 'Guest',
          email: '',
          avatarColor: '#8b949e',
          identified: false,
          enrolled: false,
          closestCandidate: best.name,
          confidence,
          similarity: confidence,
          method: best.method,
          voicePitchHz: extracted.stats?.pitchHz || null,
          source,
          speakerIp: speakerIp || null,
          identifiedAt: new Date().toISOString(),
        };

    try {
      this.writeActiveVoiceContext(robosUser, { candidates });
    } catch {}

    return {
      ok: true,
      identified: isIdentified,
      userId: robosUser.userId,
      name: robosUser.name,
      displayName: robosUser.displayName,
      role: robosUser.role,
      avatarColor: robosUser.avatarColor,
      confidence,
      similarity: confidence,
      margin: Math.round(margin * 1000) / 1000,
      method: best.method,
      voiceStats: extracted.stats,
      candidates,
      robosUser,
    };
  }

  /**
   * Persist the most recent identified speaker to `~/.config/robos/active-voice-context.json`
   * so any RobOS application can inspect who issued the latest voice command.
   */
  writeActiveVoiceContext(robosUser, extra = {}) {
    if (!robosUser) return null;
    fs.mkdirSync(this.configDir, { recursive: true });
    const payload = {
      robosUser,
      ...extra,
      updatedAt: new Date().toISOString(),
    };
    const tmp = `${this.activeContextFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, this.activeContextFile);
    return payload;
  }

  readActiveVoiceContext() {
    try {
      if (fs.existsSync(this.activeContextFile)) {
        return JSON.parse(fs.readFileSync(this.activeContextFile, 'utf8'));
      }
    } catch {}
    return null;
  }
}

module.exports = {
  VOICE_ONBOARDING_PHRASES,
  ACOUSTIC_VECTOR_DIM,
  XVECTOR_DIM,
  slugifyUserId,
  l2Normalize,
  cosineSimilarity,
  computeCentroid,
  pcm16leToFloat32,
  float32ToPcm16le,
  readWavFile,
  writePcmToWavFile,
  extractAcousticVoiceprint,
  VoiceIdentityService,
};

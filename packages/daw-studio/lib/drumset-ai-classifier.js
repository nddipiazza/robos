'use strict';

/**
 * RobOS DAW Studio — DrumSet AI Soundcheck Recorder & Multimodal Gemini Classifier
 *
 * Workflow:
 *   1. Enables all selected capture inputs simultaneously ("Arm All Mics").
 *   2. Prompts the drummer/musician to play around the entire kit & room mics.
 *   3. Extracts per-channel acoustic/spectral/transient features + compact WAV previews.
 *   4. Sends the recordings & acoustic summary to the RobOS Agent (preferring Gemini /
 *      Antigravity `antigravity` provider) to determine what each track is (Bass Drum,
 *      Snare Top/Bottom, Rack/Floor Toms, Hi-Hat/Ride/Overhead Cymbals, Room, Guitar/Bass/Vocal).
 *   5. Automatically applies the proper mic profile's Open-Source LV2/VST chain,
 *      Parametric EQ, Compressor, Phase Ø, Stereo Pan, and Drum Sound Replacement!
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { MIC_PROFILES, getMicProfile } = require('./mic-profiles');
const { decodeWavMono, computeWaveformPeaks, detectDrumTransients } = require('./drum-instruments');
const { buildTrackFromWizard } = require('./session-manager');
const { startDiscreteCaptureSession } = require('./pcm-capture');

function getSoundchecksRoot() {
  if (process.env.ROBOS_DAW_PROJECTS_DIR) {
    return path.join(path.dirname(process.env.ROBOS_DAW_PROJECTS_DIR), 'soundchecks');
  }
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.local', 'share', 'robos', 'daw-studio', 'soundchecks');
}

function slug(str) {
  return String(str || 'ch')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'ch';
}

function encodeMonoWav16(samples, sampleRate = 16000) {
  const count = samples.length;
  const dataBytes = count * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < count; i++) {
    const v = Math.max(-0.99, Math.min(0.99, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/**
 * Downsamples & trims an active window (up to `maxDurationSec`) around peak signal
 * so multimodal Gemini `read_file` reads crisp, compact WAV files quickly.
 */
function writeCompactPreviewWav(srcWavBuffer, destPath, { maxDurationSec = 4.8, targetRate = 16000 } = {}) {
  const { samples, sampleRate } = decodeWavMono(srcWavBuffer);
  if (!samples.length) return null;

  // Find loudest 0.5s block so we center this channel's preview WAV right on when THIS drum/mic was struck loudest!
  const blockLen = Math.max(1, Math.floor(sampleRate * 0.5));
  let bestIdx = 0;
  let bestEnergy = -1;
  for (let i = 0; i < samples.length; i += blockLen) {
    let e = 0;
    const end = Math.min(samples.length, i + blockLen);
    for (let j = i; j < end; j += 4) e += samples[j] * samples[j];
    if (e > bestEnergy) {
      bestEnergy = e;
      bestIdx = i;
    }
  }

  const winSamples = Math.min(samples.length, Math.floor(maxDurationSec * sampleRate));
  const half = Math.floor(winSamples / 2);
  const start = Math.max(0, Math.min(samples.length - winSamples, bestIdx - Math.floor(half * 0.4)));
  const previewWindowStartSec = Number((start / sampleRate).toFixed(2));

  const ratio = sampleRate / targetRate;
  const outLen = Math.max(1, Math.floor(winSamples / ratio));
  const down = new Float32Array(outLen);

  let peak = 0;
  for (let i = 0; i < outLen; i++) {
    const srcIdx = Math.min(samples.length - 1, Math.floor(start + i * ratio));
    const s = samples[srcIdx];
    down[i] = s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }

  // Gentle normalize only if signal is active but quiet (-38 dB .. -6 dB) so Gemini hears timbre clearly
  if (peak > 0.012 && peak < 0.5) {
    const gain = Math.min(8, 0.72 / peak);
    for (let i = 0; i < outLen; i++) down[i] *= gain;
  }

  const outBuf = encodeMonoWav16(down, targetRate);
  fs.writeFileSync(destPath, outBuf);
  return { destPath, previewWindowStartSec };
}

/**
 * Goertzel single-frequency power estimator on a Float32Array slice.
 */
function goertzelPower(samples, start, length, freqHz, sampleRate) {
  const n = Math.min(length, samples.length - start);
  if (n <= 8 || freqHz >= sampleRate * 0.48) return 0;
  const k = Math.round((n * freqHz) / sampleRate);
  const w = (2 * Math.PI * k) / n;
  const cosine = Math.cos(w);
  const coeff = 2 * cosine;
  let q0 = 0, q1 = 0, q2 = 0;
  for (let i = 0; i < n; i++) {
    // Hann window
    const win = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    q0 = coeff * q1 - q2 + samples[start + i] * win;
    q2 = q1;
    q1 = q0;
  }
  const magSq = q1 * q1 + q2 * q2 - q1 * q2 * coeff;
  return Math.max(0, magSq / (n * n));
}

/**
 * Extract rich studio acoustic features from a mono WAV buffer:
 *   - peakDb, rmsDb, crestDb, isSilent
 *   - zeroCrossingRateHz
 *   - medianDecayMs (-20 dB decay after transient peaks)
 *   - dominantFundamentalHz (42 Hz .. 340 Hz)
 *   - spectralCentroidHz & 6-band spectral energy distribution
 *   - transient hit count & timestamps
 */
function extractChannelAcousticFeatures(wavBuffer) {
  const { samples, sampleRate, durationSec } = decodeWavMono(wavBuffer);
  if (!samples.length) {
    return {
      isSilent: true,
      durationSec: 0,
      peakDb: -96,
      rmsDb: -96,
      crestDb: 0,
      transientCount: 0,
      hitTimesSec: [],
      zeroCrossingRateHz: 0,
      medianDecayMs: 0,
      dominantFundamentalHz: 0,
      spectralCentroidHz: 0,
      bandShare: { subBass: 0, lowBody: 0, midTone: 0, attackCrack: 0, wireSizzle: 0, cymbalAir: 0 },
    };
  }

  let peak = 0;
  let sumSq = 0;
  let zeroCrossings = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const a = Math.abs(s);
    if (a > peak) peak = a;
    sumSq += s * s;
    if (i > 0 && ((samples[i - 1] >= 0 && s < 0) || (samples[i - 1] < 0 && s >= 0))) {
      zeroCrossings++;
    }
  }

  const rms = Math.sqrt(sumSq / samples.length);
  const peakDb = peak <= 0.000015 ? -96 : Number((20 * Math.log10(peak)).toFixed(1));
  const rmsDb = rms <= 0.000015 ? -96 : Number((20 * Math.log10(rms)).toFixed(1));
  const crestDb = Number(Math.max(0, peakDb - rmsDb).toFixed(1));

  // Adaptive transient detection threshold relative to channel peak
  const adaptiveThreshDb = Math.max(-44, Math.min(-18, peakDb - 14));
  const transients = peakDb >= -48
    ? detectDrumTransients(wavBuffer, { thresholdDb: adaptiveThreshDb, minIntervalMs: 60 })
    : [];

  const isSilent = peakDb < -48 || (peakDb < -42 && transients.length === 0 && rmsDb < -56);
  if (isSilent) {
    return {
      isSilent: true,
      durationSec: Number(durationSec.toFixed(2)),
      peakDb,
      rmsDb,
      crestDb,
      transientCount: 0,
      hitTimesSec: [],
      zeroCrossingRateHz: 0,
      medianDecayMs: 0,
      dominantFundamentalHz: 0,
      spectralCentroidHz: 0,
      bandShare: { subBass: 0, lowBody: 0, midTone: 0, attackCrack: 0, wireSizzle: 0, cymbalAir: 0 },
    };
  }

  // Focus spectral & decay analysis on the STRONGEST hits (within 10 dB of channel peak)
  // so quiet bleed from adjacent drums never dilutes this mic's true drum timbre!
  const strongHitFloorDb = peakDb - 10;
  const strongestHits = [...transients]
    .filter(t => t.peakDb >= strongHitFloorDb)
    .sort((a, b) => b.peakDb - a.peakDb);
  const primaryHits = strongestHits.length ? strongestHits : [...transients].sort((a, b) => b.peakDb - a.peakDb);

  // Zero-crossing rate computed over strong active frames (> -20 dB below channel peak)
  const frameLen = Math.max(64, Math.floor(sampleRate * 0.02));
  let activeFrames = 0;
  let activeZcrSum = 0;
  for (let f = 0; f + frameLen <= samples.length; f += frameLen) {
    let fPeak = 0;
    let fZc = 0;
    for (let j = f; j < f + frameLen; j++) {
      const a = Math.abs(samples[j]);
      if (a > fPeak) fPeak = a;
      if (j > f && ((samples[j - 1] >= 0 && samples[j] < 0) || (samples[j - 1] < 0 && samples[j] >= 0))) fZc++;
    }
    if (fPeak > peak * 0.14) {
      activeFrames++;
      activeZcrSum += (fZc / (frameLen / sampleRate)) * 0.5;
    }
  }
  const zeroCrossingRateHz = Math.round(activeFrames > 0 ? activeZcrSum / activeFrames : (zeroCrossings / Math.max(0.1, durationSec)) * 0.5);

  // Decay time (-18.5 dB drop after strongest direct transient hits)
  const decayList = [];
  const envWin = Math.max(32, Math.floor(sampleRate * 0.008));
  for (const hit of primaryHits.slice(0, 10)) {
    const startSample = Math.floor(hit.timeSec * sampleRate);
    const hitPeakLin = Math.pow(10, hit.peakDb / 20);
    const targetLin = hitPeakLin * 0.12; // ~ -18.5 dB decay
    const maxLook = Math.min(samples.length, startSample + Math.floor(sampleRate * 0.85));
    let decayedAt = maxLook;
    for (let p = startSample + envWin; p + envWin <= maxLook; p += envWin) {
      let localMax = 0;
      for (let k = p; k < p + envWin; k++) {
        const a = Math.abs(samples[k]);
        if (a > localMax) localMax = a;
      }
      if (localMax <= targetLin) {
        decayedAt = p;
        break;
      }
    }
    decayList.push(((decayedAt - startSample) / sampleRate) * 1000);
  }
  decayList.sort((a, b) => a - b);
  const medianDecayMs = decayList.length ? Math.round(decayList[Math.floor(decayList.length / 2)]) : 380;

  // Spectral analysis across up to 10 strongest direct hits on this channel
  const analysisCenters = primaryHits.length
    ? primaryHits.slice(0, 10).map(h => Math.floor(h.timeSec * sampleRate))
    : [Math.floor(samples.length * 0.25), Math.floor(samples.length * 0.5), Math.floor(samples.length * 0.75)];

  const probeBins = [
    { hz: 48, band: 'subBass' },
    { hz: 62, band: 'subBass' },
    { hz: 82, band: 'subBass' },
    { hz: 108, band: 'lowBody' },
    { hz: 140, band: 'lowBody' },
    { hz: 185, band: 'lowBody' },
    { hz: 235, band: 'lowBody' },
    { hz: 340, band: 'midTone' },
    { hz: 520, band: 'midTone' },
    { hz: 820, band: 'midTone' },
    { hz: 1450, band: 'attackCrack' },
    { hz: 2600, band: 'attackCrack' },
    { hz: 3800, band: 'attackCrack' },
    { hz: 5200, band: 'wireSizzle' },
    { hz: 7000, band: 'wireSizzle' },
    { hz: 9800, band: 'cymbalAir' },
    { hz: 13200, band: 'cymbalAir' },
  ];

  const bandEnergy = { subBass: 0, lowBody: 0, midTone: 0, attackCrack: 0, wireSizzle: 0, cymbalAir: 0 };
  const binTotals = new Array(probeBins.length).fill(0);
  const specWin = Math.min(4096, Math.max(1024, Math.floor(sampleRate * 0.065)));

  for (const c of analysisCenters) {
    // Offset start slightly before transient so the stick/beater attack sits inside the Hann window peak (not at win[0] === 0)
    const s0 = Math.max(0, Math.min(samples.length - specWin, c - Math.floor(specWin * 0.15)));
    if (s0 < 0 || samples.length < 256) continue;
    for (let b = 0; b < probeBins.length; b++) {
      const pwr = goertzelPower(samples, s0, Math.min(specWin, samples.length - s0), probeBins[b].hz, sampleRate);
      binTotals[b] += pwr;
      // Weight PSD by proportional octave bandwidth (df ~ f) for true constant-Q band energy integration
      bandEnergy[probeBins[b].band] += pwr * (probeBins[b].hz / 100);
    }
  }

  // Find dominant fundamental pitch among subBass + lowBody + low-mid (48 Hz .. 340 Hz)
  let domHz = 120;
  let domMax = -1;
  for (let b = 0; b <= 7; b++) {
    if (binTotals[b] > domMax) {
      domMax = binTotals[b];
      domHz = probeBins[b].hz;
    }
  }

  let totalSpec = Object.values(bandEnergy).reduce((a, b) => a + b, 0) || 1e-12;
  let centroidNum = 0;
  let centroidDen = 0;
  for (let b = 0; b < probeBins.length; b++) {
    const mag = Math.sqrt(binTotals[b]);
    centroidNum += probeBins[b].hz * mag;
    centroidDen += mag;
  }

  const bandShare = {};
  for (const [k, v] of Object.entries(bandEnergy)) {
    bandShare[k] = Number((v / totalSpec).toFixed(3));
  }

  return {
    isSilent: false,
    durationSec: Number(durationSec.toFixed(2)),
    peakDb,
    rmsDb,
    crestDb,
    transientCount: transients.length,
    strongHitCount: primaryHits.length,
    hitTimesSec: primaryHits
      .slice(0, 18)
      .sort((a, b) => a.timeSec - b.timeSec)
      .map(t => Number(t.timeSec.toFixed(3))),
    zeroCrossingRateHz,
    medianDecayMs,
    dominantFundamentalHz: domHz,
    spectralCentroidHz: centroidDen > 0 ? Math.round(centroidNum / centroidDen) : 0,
    bandShare,
  };
}

/**
 * Compute hit-time coincidence AND synchronous 30ms frame dominance across all active channels.
 * Distinguishes direct close-mic strikes (`dominantFrames > 0`, `maxLeadOverOthersDb > 0`) from
 * acoustic room/adjacent-drum bleed (`dominantFrames === 0`, `maxLeadOverOthersDb < -8 dB`).
 */
function computeCrossChannelCorrelations(channelRecords) {
  for (const ch of channelRecords) {
    ch.coincidentChannels = [];
    ch.dominantFrames = 0;
    ch.maxLeadOverOthersDb = -96;
  }

  // 1. Coincident hit timestamps (Kick In + Out, Snare Top + Bottom, Overhead L + R)
  for (let i = 0; i < channelRecords.length; i++) {
    const a = channelRecords[i];
    if (a.features.isSilent || a.features.hitTimesSec.length < 2) continue;
    for (let j = i + 1; j < channelRecords.length; j++) {
      const b = channelRecords[j];
      if (b.features.isSilent || b.features.hitTimesSec.length < 2) continue;
      let matches = 0;
      for (const ta of a.features.hitTimesSec) {
        if (b.features.hitTimesSec.some(tb => Math.abs(ta - tb) <= 0.025)) matches++;
      }
      const overlap = matches / Math.min(a.features.hitTimesSec.length, b.features.hitTimesSec.length);
      if (overlap >= 0.65) {
        a.coincidentChannels.push({ channelIndex: b.channelIndex, overlap: Number(overlap.toFixed(2)) });
        b.coincidentChannels.push({ channelIndex: a.channelIndex, overlap: Number(overlap.toFixed(2)) });
      }
    }
  }

  // 2. Synchronous 30ms frame dominance across WAVs (bleed vs close-mic direct hit detector)
  const active = channelRecords.filter(c => !c.features.isSilent && c.wavFile && fs.existsSync(c.wavFile));
  if (active.length <= 1) {
    if (active[0]) {
      active[0].dominantFrames = Math.max(1, active[0].features.strongHitCount || 1);
      active[0].maxLeadOverOthersDb = 24;
    }
    return;
  }

  const envelopes = active.map(c => {
    const { samples, sampleRate } = decodeWavMono(fs.readFileSync(c.wavFile));
    const win = Math.max(128, Math.floor(sampleRate * 0.03)); // 30ms window
    const frames = Math.floor(samples.length / win);
    const dbArr = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let pk = 0;
      const base = f * win;
      for (let k = base; k < base + win; k += 2) {
        const a = Math.abs(samples[k]);
        if (a > pk) pk = a;
      }
      dbArr[f] = pk <= 0.000015 ? -96 : 20 * Math.log10(pk);
    }
    return { rec: c, dbArr };
  });

  const minFrames = Math.min(...envelopes.map(e => e.dbArr.length));
  for (let f = 0; f < minFrames; f++) {
    let bestDb = -96;
    let secondDb = -96;
    for (const e of envelopes) {
      const v = e.dbArr[f];
      if (v > bestDb) {
        secondDb = bestDb;
        bestDb = v;
      } else if (v > secondDb) {
        secondDb = v;
      }
    }
    if (bestDb < -40) continue;

    for (const e of envelopes) {
      const v = e.dbArr[f];
      const otherBest = (v === bestDb) ? secondDb : bestDb;
      const lead = Number((v - otherBest).toFixed(1));
      if (lead > e.rec.maxLeadOverOthersDb) e.rec.maxLeadOverOthersDb = lead;
      // Count frame as dominant if loudest or co-leading within 3.5 dB (e.g. dual snare/kick/overhead mics)
      if (v >= bestDb - 3.5) {
        e.rec.dominantFrames++;
      }
    }
  }
}

/**
 * Synthesize a realistic multi-channel drumset + studio soundcheck recording
 * for automated testing or trying the AI Soundcheck Wizard without striking physical drums.
 */
function synthesizeRealisticSoundcheckRoleWav(roleId, durationSec = 5.0, sampleRate = 48000) {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  if (roleId === 'silent') {
    for (let i = 0; i < n; i++) out[i] = (((Math.sin(i * 12.9898) * 43758.5453) % 1) - 0.5) * 0.0004;
    return encodeMonoWav16(out, sampleRate);
  }

  const addDrumHit = (timeSec, fn, lenSec = 0.35, gain = 0.85) => {
    const s0 = Math.floor(timeSec * sampleRate);
    const len = Math.floor(lenSec * sampleRate);
    for (let i = 0; i < len && s0 + i < n; i++) {
      out[s0 + i] += fn(i / sampleRate, i) * gain;
    }
  };

  const noiseAt = (idx) => (((Math.sin((idx + 17) * 78.233) * 43758.5453) % 1) * 2 - 1);

  if (roleId === 'kick-in') {
    for (const t of [0.3, 1.1, 1.9, 2.5, 3.3, 4.1]) {
      addDrumHit(t, (sec) => {
        const f = 54 + 110 * Math.exp(-42 * sec);
        const click = Math.sin(2 * Math.PI * 3600 * sec) * Math.exp(-95 * sec) * 0.38;
        return Math.sin(2 * Math.PI * f * sec) * Math.exp(-10 * sec) + click;
      }, 0.28, 0.88);
    }
  } else if (roleId === 'kick-out') {
    for (const t of [0.3, 1.1, 1.9, 2.5, 3.3, 4.1]) {
      addDrumHit(t, (sec) => Math.sin(2 * Math.PI * (48 + 30 * Math.exp(-20 * sec)) * sec) * Math.exp(-6.5 * sec), 0.38, 0.82);
    }
  } else if (roleId === 'snare-top') {
    for (const t of [0.7, 1.5, 2.3, 3.1, 3.9, 4.45]) {
      addDrumHit(t, (sec, idx) =>
        0.62 * Math.sin(2 * Math.PI * 188 * sec) * Math.exp(-16 * sec) +
        0.48 * Math.sin(2 * Math.PI * 1950 * sec) * Math.exp(-26 * sec) +
        0.42 * noiseAt(idx) * Math.exp(-13 * sec), 0.26, 0.86);
    }
  } else if (roleId === 'snare-bottom') {
    for (const t of [0.7, 1.5, 2.3, 3.1, 3.9, 4.45]) {
      addDrumHit(t, (sec, idx) =>
        0.15 * Math.sin(2 * Math.PI * 188 * sec) * Math.exp(-20 * sec) +
        0.85 * noiseAt(idx) * Math.sin(2 * Math.PI * 5600 * sec) * Math.exp(-11 * sec), 0.28, 0.78);
    }
  } else if (roleId === 'tom-rack-1') {
    for (const t of [2.75, 2.92, 4.55]) {
      addDrumHit(t, (sec) => Math.sin(2 * Math.PI * (146 + 32 * Math.exp(-18 * sec)) * sec) * Math.exp(-7.2 * sec), 0.36, 0.84);
    }
  } else if (roleId === 'tom-rack-2') {
    for (const t of [3.08, 3.24, 4.68]) {
      addDrumHit(t, (sec) => Math.sin(2 * Math.PI * (110 + 26 * Math.exp(-18 * sec)) * sec) * Math.exp(-6.8 * sec), 0.38, 0.84);
    }
  } else if (roleId === 'tom-floor-1') {
    for (const t of [3.42, 3.62, 4.80]) {
      addDrumHit(t, (sec) => Math.sin(2 * Math.PI * (80 + 22 * Math.exp(-16 * sec)) * sec) * Math.exp(-5.8 * sec), 0.44, 0.86);
    }
  } else if (roleId === 'hihat-mic') {
    for (let t = 0.3; t < durationSec - 0.2; t += 0.4) {
      addDrumHit(t, (sec, idx) => noiseAt(idx) * Math.sin(2 * Math.PI * 10200 * sec) * Math.exp(-22 * sec), 0.14, 0.65);
    }
  } else if (roleId === 'cymbal-overhead') {
    for (const t of [0.3, 1.9, 3.5]) {
      addDrumHit(t, (sec, idx) =>
        (noiseAt(idx) * Math.sin(2 * Math.PI * 9600 * sec) * 0.7 +
         noiseAt(idx + 5) * Math.sin(2 * Math.PI * 12800 * sec) * 0.5) * Math.exp(-2.6 * sec), 0.82, 0.72);
    }
  } else if (roleId === 'guitar-cab') {
    for (const t of [0.3, 1.3, 2.3, 3.3]) {
      addDrumHit(t, (sec) => {
        const raw = Math.sin(2 * Math.PI * 330 * sec) + 0.75 * Math.sin(2 * Math.PI * 660 * sec) + 0.55 * Math.sin(2 * Math.PI * 1320 * sec);
        return Math.tanh(raw * 2.2) * Math.exp(-2.1 * sec);
      }, 0.9, 0.55);
    }
  } else {
    // Room / Vocal ambience
    for (const t of [0.5, 2.1, 3.7]) {
      addDrumHit(t, (sec) => Math.sin(2 * Math.PI * 440 * sec) * Math.exp(-3.0 * sec), 0.6, 0.5);
    }
  }

  return encodeMonoWav16(out, sampleRate);
}

/**
 * Deterministic physics & spectral classifier (baseline + offline fallback).
 */
function classifySoundcheckHeuristic(channelRecords) {
  const results = [];
  const kickCandidates = [];
  const tomCandidates = [];
  let overheadAssigned = 0;

  for (const ch of channelRecords) {
    const f = ch.features;
    if (f.isSilent) {
      results.push({
        channelIndex: ch.channelIndex,
        inputNodeName: ch.inputNodeName,
        inputLabel: ch.inputLabel,
        active: false,
        profileId: 'unused',
        suggestedTrackName: `${ch.inputLabel} (Silent / Unplugged)`,
        confidence: 0.98,
        reasoning: `Peak ${f.peakDb} dBFS with 0 transients — no active microphone signal detected.`,
        pan: 0,
      });
      continue;
    }

    const bs = f.bandShare;
    const upperRatio = (bs.attackCrack || 0) + (bs.wireSizzle || 0) + (bs.cymbalAir || 0);
    const highRatio = (bs.wireSizzle || 0) + (bs.cymbalAir || 0);
    const lowRatio = (bs.subBass || 0) + (bs.lowBody || 0);
    const hasCoincidentDrum = Array.isArray(ch.coincidentChannels) && ch.coincidentChannels.length > 0;

    // 1. Snare Bottom vs Cymbals & Hi-Hat (dominant >1.4kHz high-frequency energy & high ZCR)
    if (upperRatio >= 0.65 && lowRatio < 0.25 && f.zeroCrossingRateHz >= 1800) {
      if (hasCoincidentDrum && f.medianDecayMs >= 165 && f.medianDecayMs <= 330) {
        results.push({
          channelIndex: ch.channelIndex,
          inputNodeName: ch.inputNodeName,
          inputLabel: ch.inputLabel,
          active: true,
          profileId: 'snare-bottom',
          suggestedTrackName: 'Snare Bottom Ø',
          confidence: 0.91,
          reasoning: `High snare-wire rattle (${Math.round(upperRatio * 100)}% >1.5kHz, ZCR ${f.zeroCrossingRateHz} Hz) synchronous with Snare Top — auto Ø polarity inverted.`,
          pan: 0,
        });
      } else if (f.medianDecayMs <= 220) {
        results.push({
          channelIndex: ch.channelIndex,
          inputNodeName: ch.inputNodeName,
          inputLabel: ch.inputLabel,
          active: true,
          profileId: 'hihat-mic',
          suggestedTrackName: 'Hi-Hat',
          confidence: 0.9,
          reasoning: `Crisp metallic sizzle (${Math.round(upperRatio * 100)}% >1.5kHz), ZCR ${f.zeroCrossingRateHz} Hz, tight ${f.medianDecayMs} ms chink decay.`,
          pan: -0.40,
        });
      } else if (f.medianDecayMs >= 420) {
        overheadAssigned++;
        const isPair = overheadAssigned <= 2;
        results.push({
          channelIndex: ch.channelIndex,
          inputNodeName: ch.inputNodeName,
          inputLabel: ch.inputLabel,
          active: true,
          profileId: 'cymbal-overhead',
          suggestedTrackName: isPair ? (overheadAssigned === 1 ? 'Overhead L' : 'Overhead R') : `Cymbal Mic ${overheadAssigned}`,
          confidence: 0.89,
          reasoning: `Sustained bronze cymbal shimmer (${f.medianDecayMs} ms decay, ${Math.round(highRatio * 100)}% >4kHz air).`,
          pan: overheadAssigned === 1 ? -0.65 : overheadAssigned === 2 ? 0.65 : 0,
        });
      } else {
        results.push({
          channelIndex: ch.channelIndex,
          inputNodeName: ch.inputNodeName,
          inputLabel: ch.inputLabel,
          active: true,
          profileId: 'ride-mic',
          suggestedTrackName: 'Ride Cymbal',
          confidence: 0.84,
          reasoning: `Articulate metallic ping (ZCR ${f.zeroCrossingRateHz} Hz, ${f.medianDecayMs} ms decay).`,
          pan: 0.48,
        });
      }
      continue;
    }

    // 2. Bass Drum / Kick (dominant sub-bass <= 72 Hz & fast/punchy decay)
    if (bs.subBass >= 0.45 && f.dominantFundamentalHz <= 72 && f.zeroCrossingRateHz < 550 && f.medianDecayMs <= 380) {
      const clickScore = (bs.lowBody || 0) + (bs.attackCrack || 0) * 4 + (f.zeroCrossingRateHz / 1000);
      const kickEntry = {
        channelIndex: ch.channelIndex,
        inputNodeName: ch.inputNodeName,
        inputLabel: ch.inputLabel,
        active: true,
        clickScore,
        dominantFundamentalHz: f.dominantFundamentalHz,
        subBass: bs.subBass,
        profileId: 'kick-in',
        suggestedTrackName: 'Kick Inside',
        confidence: 0.93,
        reasoning: `Deep ${f.dominantFundamentalHz} Hz sub-bass punch (${Math.round(bs.subBass * 100)}% sub energy, ${f.medianDecayMs} ms punch).`,
        pan: 0,
      };
      kickCandidates.push(kickEntry);
      results.push(kickEntry);
      continue;
    }

    // 3. Snare Top (strong 135–250 Hz drum body + high ZCR from snare wires & stick crack)
    if (lowRatio >= 0.25 && f.dominantFundamentalHz >= 135 && f.zeroCrossingRateHz >= 900 && f.medianDecayMs <= 340) {
      results.push({
        channelIndex: ch.channelIndex,
        inputNodeName: ch.inputNodeName,
        inputLabel: ch.inputLabel,
        active: true,
        profileId: 'snare-top',
        suggestedTrackName: 'Snare Top',
        confidence: 0.92,
        reasoning: `${f.dominantFundamentalHz} Hz batter body + broadband snare crack (ZCR ${f.zeroCrossingRateHz} Hz, ${f.medianDecayMs} ms decay).`,
        pan: 0,
      });
      continue;
    }

    // 4. Toms (tonal percussive shell resonance 75–200 Hz with low ZCR < 650 Hz and resonant decay)
    if (lowRatio >= 0.55 && f.dominantFundamentalHz >= 75 && f.zeroCrossingRateHz < 650 && f.medianDecayMs <= 680 && f.transientCount >= 1) {
      const entry = {
        channelIndex: ch.channelIndex,
        inputNodeName: ch.inputNodeName,
        inputLabel: ch.inputLabel,
        active: true,
        fundamentalHz: f.dominantFundamentalHz,
        profileId: 'tom-rack-1',
        suggestedTrackName: 'Tom',
        confidence: 0.88,
        reasoning: `Tonal percussive shell resonance at ~${f.dominantFundamentalHz} Hz (${f.medianDecayMs} ms decay).`,
        pan: 0,
      };
      tomCandidates.push(entry);
      results.push(entry);
      continue;
    }

    // 6. Sustained Harmonic Instruments (Guitar / Bass / Room / Vocal)
    if (bs.subBass >= 0.38 && f.medianDecayMs > 340) {
      results.push({
        channelIndex: ch.channelIndex,
        inputNodeName: ch.inputNodeName,
        inputLabel: ch.inputLabel,
        active: true,
        profileId: 'bass-cab',
        suggestedTrackName: 'Bass Guitar',
        confidence: 0.82,
        reasoning: `Sustained low-frequency fundamental (${f.dominantFundamentalHz} Hz, ${f.medianDecayMs} ms sustain).`,
        pan: 0,
      });
    } else if ((bs.midTone + bs.attackCrack) >= 0.45) {
      results.push({
        channelIndex: ch.channelIndex,
        inputNodeName: ch.inputNodeName,
        inputLabel: ch.inputLabel,
        active: true,
        profileId: 'guitar-cab',
        suggestedTrackName: 'Guitar Amp / Cab',
        confidence: 0.8,
        reasoning: `Harmonic midrange sustain (${Math.round((bs.midTone + bs.attackCrack) * 100)}% 300Hz–4kHz, ${f.medianDecayMs} ms decay).`,
        pan: -0.35,
      });
    } else {
      results.push({
        channelIndex: ch.channelIndex,
        inputNodeName: ch.inputNodeName,
        inputLabel: ch.inputLabel,
        active: true,
        profileId: 'drum-room',
        suggestedTrackName: 'Drum Room / Ambient Mic',
        confidence: 0.76,
        reasoning: `Full-range ambient signal (${f.medianDecayMs} ms room decay, centroid ${f.spectralCentroidHz} Hz).`,
        pan: 0,
      });
    }
  }

  // Order multiple kick mics by beater click (primary = Kick Inside, secondary = Kick Outside Sub)
  if (kickCandidates.length > 1) {
    kickCandidates.sort((a, b) => b.clickScore - a.clickScore);
    kickCandidates.forEach((k, idx) => {
      if (idx >= 1) {
        k.profileId = 'kick-out';
        k.suggestedTrackName = idx === 1 ? 'Kick Outside Sub' : `Kick Sub ${idx}`;
        k.reasoning = `Deep ${k.dominantFundamentalHz} Hz resonant front-head sub (${Math.round(k.subBass * 100)}% sub energy).`;
      }
    });
  }

  // Order detected toms from highest pitch -> lowest pitch (Rack Tom 1 -> Rack Tom 2 -> Rack Tom 3 -> Floor Tom 1 -> Floor Tom 2)
  tomCandidates.sort((a, b) => b.fundamentalHz - a.fundamentalHz);
  const tomOrder = [
    { profileId: 'tom-rack-1', name: 'Rack Tom 1', pan: -0.25 },
    { profileId: 'tom-rack-2', name: 'Rack Tom 2', pan: 0.05 },
    { profileId: 'tom-floor-1', name: 'Floor Tom 1', pan: 0.38 },
    { profileId: 'tom-floor-2', name: 'Floor Tom 2', pan: 0.50 },
    { profileId: 'tom-rack-3', name: 'Rack Tom 3', pan: 0.20 },
  ];
  tomCandidates.forEach((tom, idx) => {
    const isLowFloor = tom.fundamentalHz <= 92;
    const spec = (tomCandidates.length === 1 && isLowFloor)
      ? { profileId: 'tom-floor-1', name: 'Floor Tom 1', pan: 0.38 }
      : (tomOrder[idx] || tomOrder[tomOrder.length - 1]);
    tom.profileId = spec.profileId;
    tom.suggestedTrackName = spec.name;
    tom.pan = spec.pan;
  });

  return results.sort((a, b) => a.channelIndex - b.channelIndex);
}

/**
 * Extract first valid JSON array or object from an AI agent response string.
 */
function parseJsonFromAgentText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try { return JSON.parse(candidate); } catch {}
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)); } catch {}
  }
  const firstBracket = candidate.indexOf('[');
  const lastBracket = candidate.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try { return JSON.parse(candidate.slice(firstBracket, lastBracket + 1)); } catch {}
  }
  return null;
}

/**
 * Enrich classification items with full `MIC_PROFILES` metadata (image, LV2 plugins, EQ, Sound Replacement).
 */
function hydrateClassifications(items, channelRecords) {
  const validIds = new Set(MIC_PROFILES.map(p => p.id));
  return channelRecords.map((ch) => {
    const match = (items || []).find(x => Number(x.channelIndex) === ch.channelIndex) || null;
    const isUnused = !ch.features.isSilent ? (match?.profileId === 'unused') : (!match || match.profileId === 'unused');
    const profileId = (!isUnused && match && validIds.has(match.profileId))
      ? match.profileId
      : (isUnused ? 'unused' : 'drum-room');

    if (profileId === 'unused') {
      return {
        channelIndex: ch.channelIndex,
        inputNodeName: ch.inputNodeName,
        inputLabel: ch.inputLabel,
        wavFile: ch.wavFile,
        previewWavFile: ch.previewWavFile,
        features: ch.features,
        includeTrack: false,
        profileId: 'unused',
        suggestedTrackName: match?.suggestedTrackName || `${ch.inputLabel} (Unused)`,
        confidence: Number(match?.confidence ?? 0.95),
        reasoning: match?.reasoning || 'Silent / unplugged channel.',
        pan: 0,
        soundReplacementEnabled: false,
        replacementPieceId: 'snare',
        openSourcePlugins: [],
        image: 'assets/mics/vocal-mic.webp',
      };
    }

    const profile = getMicProfile(profileId);
    const srEnabled = match?.enableSoundReplacement !== undefined
      ? Boolean(match.enableSoundReplacement)
      : Boolean(profile.soundReplacement?.enabled);
    const pieceId = match?.replacementPieceId || profile.soundReplacement?.pieceId || 'snare';

    return {
      channelIndex: ch.channelIndex,
      inputNodeName: ch.inputNodeName,
      inputLabel: ch.inputLabel,
      wavFile: ch.wavFile,
      previewWavFile: ch.previewWavFile,
      features: ch.features,
      includeTrack: true,
      profileId: profile.id,
      suggestedTrackName: match?.suggestedTrackName || profile.shortLabel,
      confidence: Number(match?.confidence ?? 0.88),
      reasoning: match?.reasoning || `Matched ${profile.name}`,
      pan: match?.pan !== undefined ? Number(match.pan) : 0,
      soundReplacementEnabled: srEnabled,
      replacementPieceId: pieceId,
      openSourcePlugins: profile.fx?.openSourcePlugins || [],
      phaseInvert: Boolean(profile.fx?.phaseInvert),
      image: profile.image,
      color: profile.color,
    };
  });
}

/**
 * Send the recorded multi-channel soundcheck WAVs + acoustic telemetry to the RobOS Agent,
 * explicitly preferring Gemini (`antigravity` provider -> `gemini` / `agy` CLI) first!
 */
async function classifySoundcheckWithAgent(soundcheckSession, {
  preferredProvider = 'antigravity',
  aiAgentModule = null,
  onProgress = null,
  cliTimeoutMs = 75000,
} = {}) {
  const channelRecords = soundcheckSession?.channels || [];
  if (!channelRecords.length) {
    return { ok: false, error: 'No soundcheck channels recorded.' };
  }

  const heuristicBaseline = classifySoundcheckHeuristic(channelRecords);
  const activeChannels = channelRecords.filter(c => !c.features.isSilent);

  // If every single channel was completely silent, return immediately without wasting an LLM call
  if (activeChannels.length === 0) {
    return {
      ok: true,
      via: 'acoustic-silence-gate',
      provider: 'dsp',
      classifications: hydrateClassifications(heuristicBaseline, channelRecords),
    };
  }

  // Write acoustic summary JSON in `soundcheckSession.dir` so Gemini can inspect both audio WAVs & exact spectral numbers
  const validProfilesSummary = MIC_PROFILES.map(p => ({
    profileId: p.id,
    name: p.name,
    category: p.category,
    defaultReplacementPiece: p.soundReplacement?.supported ? p.soundReplacement.pieceId : null,
  }));

  const summaryDoc = {
    instructions: [
      'Each active channel below has a compact 16kHz mono WAV recording centered on that channel\'s loudest playing window (`previewWindowStartSec`), plus measured spectral/transient physics.',
      'Close mics struck directly have `dominantFrames > 0` and `maxLeadOverOthersDb >= -3.5`. Channels with `dominantFrames === 0` and negative `maxLeadOverOthersDb` are either Overhead/Room mics capturing the whole kit OR unhit mics picking up bleed.',
    ].join(' '),
    availableMicProfiles: validProfilesSummary,
    channels: channelRecords.map(c => ({
      channelIndex: c.channelIndex,
      hardwareInput: c.inputLabel,
      audioFile: c.previewFileName || null,
      previewWindowStartSec: c.previewWindowStartSec ?? 0,
      isSilent: c.features.isSilent,
      peakDb: c.features.peakDb,
      rmsDb: c.features.rmsDb,
      transientCount: c.features.transientCount,
      strongHitCount: c.features.strongHitCount || 0,
      dominantFrames: c.dominantFrames || 0,
      maxLeadOverOthersDb: c.maxLeadOverOthersDb ?? -96,
      dominantFundamentalHz: c.features.dominantFundamentalHz,
      zeroCrossingRateHz: c.features.zeroCrossingRateHz,
      medianDecayMs: c.features.medianDecayMs,
      bandShare: c.features.bandShare,
      coincidentChannels: c.coincidentChannels,
    })),
  };

  const summaryPath = path.join(soundcheckSession.dir, 'soundcheck-features.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summaryDoc, null, 2), 'utf8');

  let aiAgent = aiAgentModule;
  if (!aiAgent) {
    try { aiAgent = require('../../robos-lib/ai-agent'); } catch {}
  }

  if (aiAgent && typeof aiAgent.ask === 'function') {
    // Build provider priority order: prefer Gemini (`antigravity`) FIRST!
    const candidateProviders = [];
    const pushUnique = (id) => { if (id && !candidateProviders.includes(id)) candidateProviders.push(id); };
    pushUnique(preferredProvider || 'antigravity');
    pushUnique('antigravity');
    if (typeof aiAgent.getActiveProviderId === 'function') pushUnique(aiAgent.getActiveProviderId());
    for (const p of (aiAgent.PROVIDERS || [])) pushUnique(p.id);

    const activeAudioFiles = activeChannels
      .map(c => c.previewFileName ? `Ch ${c.channelIndex} (${c.inputLabel}): ${c.previewFileName}` : null)
      .filter(Boolean);

    const prompt = [
      'You are an expert studio drum & band recording engineer.',
      'A drummer/musician just played a multi-microphone soundcheck across their audio interface.',
      'In the current workspace directory you have:',
      '  1. `soundcheck-features.json` (measured fundamental Hz, 6-band spectral shares, ZCR, decay ms, synchronous `dominantFrames` / `maxLeadOverOthersDb` bleed-vs-direct-hit telemetry, and coincident hit pairs).',
      `  2. Compact WAV recordings centered on each active channel's loudest hits: ${activeAudioFiles.join(', ')}.`,
      '',
      'Read `soundcheck-features.json` and read/listen to the active `.wav` files in the current directory (do NOT run shell commands).',
      'Determine what microphone / instrument each channel is: find the bass drum (`kick-in`, `kick-out`), snare (`snare-top`, `snare-bottom`), tom mics (`tom-rack-1`, `tom-rack-2`, `tom-rack-3`, `tom-floor-1`, `tom-floor-2` ordered high pitch to low pitch), cymbal mics (`hihat-mic`, `ride-mic`, `cymbal-spot`, `cymbal-overhead`), room mic (`drum-room`), or other mics (`guitar-cab`, `guitar-hiz`, `bass-cab`, `vocal-studio`), and mark silent/unplugged or pure-bleed unhit inputs as `"unused"`.',
      '',
      `Valid profileId values ONLY: ${MIC_PROFILES.map(p => `"${p.id}"`).join(', ')}, "unused".`,
      '',
      'Reply ONLY with a single raw JSON object (no markdown commentary) matching this exact structure:',
      '{"channels":[{"channelIndex":1,"profileId":"kick-in","suggestedTrackName":"Kick Inside","pan":0,"enableSoundReplacement":true,"replacementPieceId":"kick","confidence":0.95,"reasoning":"concise 1-sentence acoustic explanation"}]}',
    ].join('\n');

    for (const providerId of candidateProviders) {
      const provDef = aiAgent.PROVIDER_MAP?.[providerId];
      if (provDef && typeof aiAgent.resolveBin === 'function') {
        const bin = aiAgent.resolveBin(provDef);
        const exists = (process.env.PATH || '').split(path.delimiter).some(d => {
          try { fs.accessSync(path.join(d, bin), fs.constants.X_OK); return true; } catch { return false; }
        });
        if (!exists) continue;
      }

      if (onProgress) {
        onProgress({ stage: 'agent', providerId, message: `Analyzing ${activeChannels.length} recorded mic channel(s) with ${provDef?.name || providerId}…` });
      }

      const res = await aiAgent.ask(prompt, {
        providerId,
        allowApi: providerId !== 'antigravity',
        cwd: soundcheckSession.dir,
        skipWritingPreamble: true,
        effort: 'low',
        cliTimeoutMs,
      });

      if (res?.ok && res.text) {
        const parsed = parseJsonFromAgentText(res.text);
        const arr = Array.isArray(parsed) ? parsed : parsed?.channels;
        if (Array.isArray(arr) && arr.length > 0) {
          return {
            ok: true,
            via: res.via || 'cli',
            provider: res.provider || providerId,
            providerLabel: provDef?.name || providerId,
            classifications: hydrateClassifications(arr, channelRecords),
          };
        }
      }
    }
  }

  // Graceful fallback to local spectral/transient physics classifier if offline/no CLI available
  return {
    ok: true,
    via: 'acoustic-dsp-fallback',
    provider: 'local-spectral-dsp',
    providerLabel: 'Local Acoustic Spectral Classifier (Offline Fallback)',
    classifications: hydrateClassifications(heuristicBaseline, channelRecords),
  };
}

/**
 * Multi-Channel All-Inputs Soundcheck Recorder
 */
class SoundcheckSessionRecorder {
  constructor() {
    this.active = null;
  }

  isRecording() {
    return Boolean(this.active);
  }

  start(inputs, { sampleRate = 48000, onMeter } = {}) {
    if (this.active) throw new Error('Soundcheck recording is already running');
    if (!Array.isArray(inputs) || !inputs.length) {
      throw new Error('Select at least one capture input channel for soundcheck.');
    }

    const sessionId = `soundcheck-${Date.now()}`;
    const dir = path.join(getSoundchecksRoot(), sessionId);
    fs.mkdirSync(dir, { recursive: true });

    const items = inputs.map((inp, i) => {
      const channelIndex = i + 1;
      const wavName = `ch-${String(channelIndex).padStart(2, '0')}-${slug(inp.description || inp.name)}.wav`;
      const wavFile = path.join(dir, wavName);
      return {
        id: `sc-${channelIndex}`,
        channelIndex,
        inputNodeName: inp.name || '',
        inputLabel: inp.description || inp.name || `Channel ${channelIndex}`,
        isFocusrite: Boolean(inp.isFocusrite),
        wavName,
        wavFile,
      };
    });

    const capture = startDiscreteCaptureSession(items, {
      sampleRate,
      meterIntervalMs: 140,
      onMeter: ({ elapsedSec, tracks }) => {
        if (!onMeter) return;
        const channels = tracks.map((m, idx) => ({
          channelIndex: items[idx].channelIndex,
          inputNodeName: items[idx].inputNodeName,
          inputLabel: items[idx].inputLabel,
          peakDb: m.peakDb,
          maxPeakDb: m.maxPeakDb,
          bytes: m.bytes,
        }));
        try { onMeter({ elapsedSec, channels }); } catch {}
      },
    });

    this.active = { sessionId, dir, sampleRate, startedAtMs: capture.startedAtMs, items, capture };
    return { ok: true, sessionId, dir, channelCount: items.length };
  }

  async cancel() {
    if (!this.active) return { ok: true };
    const session = this.active;
    this.active = null;
    await session.capture.stop();
    try { fs.rmSync(session.dir, { recursive: true, force: true }); } catch {}
    return { ok: true };
  }

  async stop({ simulateKitGroove = false } = {}) {
    if (!this.active) return { ok: false, error: 'Soundcheck is not currently recording' };
    const session = this.active;
    this.active = null;

    const wallSec = Math.max(2.5, (Date.now() - session.startedAtMs) / 1000);
    await session.capture.stop();

    const demoRoles = [
      'kick-in',
      'snare-top',
      'snare-bottom',
      'tom-rack-1',
      'tom-rack-2',
      'tom-floor-1',
      'hihat-mic',
      'cymbal-overhead',
      'guitar-cab',
      'silent',
    ];

    const channelRecords = [];
    for (let i = 0; i < session.items.length; i++) {
      const e = session.items[i];
      const hasFile = fs.existsSync(e.wavFile) && fs.statSync(e.wavFile).size > 200;
      if (simulateKitGroove || !hasFile) {
        const role = demoRoles[i] || 'silent';
        fs.writeFileSync(e.wavFile, synthesizeRealisticSoundcheckRoleWav(role, Math.min(6.0, Math.max(4.2, wallSec)), session.sampleRate));
      }

      const buf = fs.readFileSync(e.wavFile);
      const features = extractChannelAcousticFeatures(buf);
      let previewFileName = null;
      let previewWavFile = null;
      let previewWindowStartSec = 0;
      if (!features.isSilent) {
        previewFileName = `ai-ch-${String(e.channelIndex).padStart(2, '0')}.wav`;
        previewWavFile = path.join(session.dir, previewFileName);
        const pv = writeCompactPreviewWav(buf, previewWavFile, { maxDurationSec: 4.8, targetRate: 16000 });
        if (pv && typeof pv === 'object') previewWindowStartSec = pv.previewWindowStartSec;
      }

      channelRecords.push({
        channelIndex: e.channelIndex,
        inputNodeName: e.inputNodeName,
        inputLabel: e.inputLabel,
        wavFile: e.wavFile,
        previewFileName,
        previewWavFile,
        previewWindowStartSec,
        features,
      });
    }

    computeCrossChannelCorrelations(channelRecords);
    return {
      ok: true,
      sessionId: session.sessionId,
      dir: session.dir,
      sampleRate: session.sampleRate,
      durationSec: Number(wallSec.toFixed(2)),
      channels: channelRecords,
    };
  }
}

/**
 * Turn user-reviewed AI classifications into armed DAW tracks with proper LV2/EQ/Sound Replacement settings
 * (and optionally import the soundcheck WAV takes directly onto the tracks!).
 */
function applyClassifiedDrumsetToProject(project, classifications, { importSoundcheckTakes = false, replaceExistingTracks = false } = {}) {
  if (replaceExistingTracks) {
    project.tracks = [];
  }

  const addedTracks = [];
  for (const item of (classifications || [])) {
    if (!item.includeTrack || item.profileId === 'unused') continue;
    const profile = getMicProfile(item.profileId);
    const track = buildTrackFromWizard({
      profileId: profile.id,
      name: item.suggestedTrackName || profile.shortLabel,
      inputNodeName: item.inputNodeName,
      inputLabel: item.inputLabel,
      armed: true,
      pan: Number(item.pan) || 0,
      soundReplacement: {
        supported: true,
        enabled: Boolean(item.soundReplacementEnabled),
        kitId: item.kitId || profile.soundReplacement?.kitId || 'gm-rock-kit',
        pieceId: item.replacementPieceId || profile.soundReplacement?.pieceId || 'snare',
        blend: profile.soundReplacement?.blend ?? 0.75,
        thresholdDb: profile.soundReplacement?.thresholdDb ?? -28,
        minIntervalMs: profile.soundReplacement?.minIntervalMs ?? 65,
      },
    });

    if (importSoundcheckTakes && item.wavFile && fs.existsSync(item.wavFile)) {
      const buf = fs.readFileSync(item.wavFile);
      const waveInfo = computeWaveformPeaks(buf);
      const transients = detectDrumTransients(buf, {
        thresholdDb: track.soundReplacement.thresholdDb ?? -28,
        minIntervalMs: track.soundReplacement.minIntervalMs ?? 65,
      });
      track.clips.push({
        id: `sc-${item.channelIndex}-${Date.now().toString(36)}`,
        name: `${track.name} Soundcheck`,
        wavFile: item.wavFile,
        fileExists: true,
        startSec: 0,
        durationSec: waveInfo.durationSec,
        peakDb: waveInfo.peakDb,
        peaks: waveInfo.peaks,
        transients,
        recordedAt: new Date().toISOString(),
      });
    }

    project.tracks.push(track);
    addedTracks.push(track);
  }

  return { addedCount: addedTracks.length, addedTracks, project };
}

module.exports = {
  getSoundchecksRoot,
  writeCompactPreviewWav,
  extractChannelAcousticFeatures,
  computeCrossChannelCorrelations,
  synthesizeRealisticSoundcheckRoleWav,
  classifySoundcheckHeuristic,
  classifySoundcheckWithAgent,
  applyClassifiedDrumsetToProject,
  SoundcheckSessionRecorder,
};

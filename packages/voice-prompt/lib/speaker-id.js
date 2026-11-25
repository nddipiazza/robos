'use strict';

/**
 * RobOS Speaker Identification & Neural Voiceprint Engine
 * -------------------------------------------------------
 * Identifies *who* is talking from raw 16kHz PCM/WAV speech audio and links voiceprints
 * directly to RobOS Users (`~/.config/robos/people/*.json`).
 *
 * Primary Engine:
 *   - Native C++ `sherpa-onnx-node` `SpeakerEmbeddingExtractor` running the open-source
 *     WeSpeaker VoxCeleb CAM++ 512-dim speaker verification ONNX model
 *     (`~/.local/share/robos/asr-fast/wespeaker_en_voxceleb_cam++.onnx`, ~44ms on CPU).
 *
 * Deterministic Acoustic Fallback (when ONNX binary/model is absent or in unit tests):
 *   - 32-dim L2-normalized fundamental-frequency + log-band spectral envelope + ZCR vector
 *     so hermetic unit tests can enroll, distinguish, and verify speakers offline.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { readWavToFloat32, decodeWavBufferToFloat32, trimSilenceFloat32 } = require('./stt-engine');

const MAX_SAMPLES_PER_SPEAKER = 8;
const CAMPP_DEFAULT_THRESHOLD = 0.50;
const FALLBACK_DEFAULT_THRESHOLD = 0.86;

let _cachedExtractor = null;
let _extractorLoadAttempted = false;

function getCamPlusPlusExtractor() {
  if (process.env.ROBOS_TEST === '1' && process.env.ROBOS_ENABLE_CAMPP_IN_TEST !== '1') {
    return null;
  }
  if (_cachedExtractor) return _cachedExtractor;
  if (_extractorLoadAttempted) return null;
  _extractorLoadAttempted = true;

  const home = os.homedir();
  const baseDirs = [
    path.join(home, '.local/share/robos/asr-fast'),
    '/usr/local/share/robos/asr-fast',
  ];

  for (const base of baseDirs) {
    const addonDir = path.join(base, 'node_modules/sherpa-onnx-node');
    const modelPath = path.join(base, 'wespeaker_en_voxceleb_cam++.onnx');
    if (fs.existsSync(addonDir) && fs.existsSync(modelPath)) {
      try {
        const sherpa = require(addonDir);
        const numThreads = Math.min(4, Math.max(2, Math.floor((os.cpus()?.length || 4) / 2)));
        _cachedExtractor = new sherpa.SpeakerEmbeddingExtractor({
          model: modelPath,
          numThreads,
          debug: 0,
          provider: 'cpu',
        });
        console.log(`[speaker-id] Loaded C++ CAM++ speaker model (dim=${_cachedExtractor.dim})`);
        return _cachedExtractor;
      } catch (err) {
        console.warn('[speaker-id] Failed to load CAM++ extractor, using spectral fallback:', err.message);
      }
    }
  }
  return null;
}

function l2Normalize(vec) {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm < 1e-9) return Array.from(vec, () => 0);
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = Math.round((vec[i] / norm) * 1e6) / 1e6;
  }
  return out;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom < 1e-9 ? 0 : dot / denom;
}

function computeCentroid(vectors) {
  if (!Array.isArray(vectors) || vectors.length === 0) return [];
  const dim = vectors[0].length;
  const sum = new Float64Array(dim);
  for (const v of vectors) {
    if (!v || v.length !== dim) continue;
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  return l2Normalize(sum);
}

/**
 * Deterministic 32-dim spectral/pitch fallback embedding when CAM++ ONNX is not installed.
 */
function computeSpectralFallbackEmbedding(samples, sampleRate = 16000) {
  const dim = 32;
  const feat = new Float64Array(dim);
  const n = samples.length;
  if (n < 320) return l2Normalize(feat);

  // 1. Zero-crossing rate & RMS profile (dims 0..3)
  let zc = 0;
  let sumSq = 0;
  for (let i = 1; i < n; i++) {
    if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) zc++;
    sumSq += samples[i] * samples[i];
  }
  const zcr = zc / n;
  const rms = Math.sqrt(sumSq / n);
  feat[0] = zcr * 10;
  feat[1] = Math.log1p(rms * 20);

  // 2. Autocorrelation pitch lag histogram across 75Hz..400Hz (dims 2..17)
  const minLag = Math.max(20, Math.floor(sampleRate / 400));
  const maxLag = Math.min(Math.floor(sampleRate / 75), 240);
  const frameLen = Math.min(1024, n);
  const step = Math.max(256, Math.floor((n - frameLen) / 12));
  let bestLagSum = 0;
  let voicedFrames = 0;
  for (let start = 0; start + frameLen <= n; start += step) {
    let bestLag = minLag;
    let bestCorr = -1;
    for (let lag = minLag; lag <= maxLag; lag += 2) {
      let c = 0;
      for (let j = 0; j < frameLen - lag; j += 2) {
        c += samples[start + j] * samples[start + j + lag];
      }
      if (c > bestCorr) {
        bestCorr = c;
        bestLag = lag;
      }
      const bin = 2 + Math.min(15, Math.floor(((lag - minLag) / Math.max(1, maxLag - minLag)) * 16));
      feat[bin] += Math.max(0, c);
    }
    if (bestCorr > 0.001) {
      bestLagSum += sampleRate / bestLag;
      voicedFrames++;
    }
  }
  const meanPitchHz = voicedFrames > 0 ? bestLagSum / voicedFrames : 150;
  feat[18] = meanPitchHz / 300;

  // 3. Goertzel-style log energy across 13 formant/vocal-tract frequency probes (dims 19..31)
  const freqs = [110, 165, 220, 300, 420, 580, 800, 1100, 1500, 2000, 2600, 3300, 4100];
  const probeLen = Math.min(4096, n);
  const probeOffset = Math.floor((n - probeLen) / 2);
  for (let fi = 0; fi < freqs.length; fi++) {
    const omega = (2 * Math.PI * freqs[fi]) / sampleRate;
    const coeff = 2 * Math.cos(omega);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < probeLen; i++) {
      const s0 = samples[probeOffset + i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const power = Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2) / probeLen;
    feat[19 + fi] = Math.log1p(power * 100);
  }

  return l2Normalize(feat);
}

function slugifySpeakerId(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'speaker';
}

function cleanPersonDisplayShortName(person) {
  if (!person) return '';
  if (person.nickname && String(person.nickname).trim()) return String(person.nickname).trim();
  const rawName = String(person.name || '').trim();
  const quoted = rawName.match(/"([^"]+)"/);
  if (quoted) return quoted[1].trim();
  return rawName.split(/\s+/)[0] || rawName;
}

class SpeakerIdentifier {
  constructor(options = {}) {
    this.homeDir = options.homeDir || process.env.HOME || os.homedir();
    this._configDirOverride = options.configDir || null;
    this._storeFileOverride = options.storeFile || null;
    this._peopleDirOverride = options.peopleDir || null;
    this._cache = null;
    this._cachePath = '';
    this._lastMtimeMs = 0;
  }

  get configDir() {
    return this._configDirOverride || process.env.ROBOS_CONFIG_DIR || path.join(this.homeDir, '.config', 'robos');
  }

  get storeFile() {
    return this._storeFileOverride || process.env.ROBOS_SPEAKERS_FILE || path.join(this.configDir, 'voice-speakers.json');
  }

  get peopleDir() {
    return this._peopleDirOverride || process.env.ROBOS_PEOPLE_DIR || path.join(this.configDir, 'people');
  }

  getEngineName() {
    return getCamPlusPlusExtractor() ? 'wespeaker-cam++' : 'spectral-fallback';
  }

  _loadStore() {
    const activeStoreFile = this.storeFile;
    let mtime = 0;
    try { mtime = fs.statSync(activeStoreFile).mtimeMs; } catch {}
    if (this._cache && this._cachePath === activeStoreFile && (mtime === 0 || mtime === this._lastMtimeMs)) {
      return this._cache;
    }
    if (fs.existsSync(activeStoreFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(activeStoreFile, 'utf8'));
        if (parsed && Array.isArray(parsed.speakers)) {
          this._cache = parsed;
          this._cachePath = activeStoreFile;
          this._lastMtimeMs = mtime;
          return this._cache;
        }
      } catch {}
    }
    this._cache = { schema: 1, speakers: [], updatedAt: new Date().toISOString() };
    this._cachePath = activeStoreFile;
    return this._cache;
  }

  _saveStore(storeObj) {
    const activeStoreFile = this.storeFile;
    storeObj.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(activeStoreFile), { recursive: true });
    const tmp = `${activeStoreFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(storeObj, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, activeStoreFile);
    this._cache = storeObj;
    this._cachePath = activeStoreFile;
    try { this._lastMtimeMs = fs.statSync(activeStoreFile).mtimeMs; } catch {}
    return storeObj;
  }

  /**
   * Load RobOS Users from `~/.config/robos/people/*.json` so speaker profiles link directly to RobOS Users.
   */
  listRobosPeople() {
    const out = [];
    if (!fs.existsSync(this.peopleDir)) return out;
    try {
      const files = fs.readdirSync(this.peopleDir).filter((f) => f.endsWith('.json') && f !== 'config.json');
      for (const f of files) {
        try {
          const p = JSON.parse(fs.readFileSync(path.join(this.peopleDir, f), 'utf8'));
          if (p && (p.uid || p.name)) {
            const uid = String(p.uid || f.replace(/\.json$/, ''));
            const fullName = String(p.name || uid).trim();
            const shortName = cleanPersonDisplayShortName(p);
            out.push({ uid, name: fullName, shortName });
          }
        } catch {}
      }
    } catch {}
    return out.sort((a, b) => a.shortName.localeCompare(b.shortName));
  }

  resolveRobosPerson(nameOrUid) {
    const q = String(nameOrUid || '').trim().toLowerCase().replace(/['".!?]+/g, '');
    if (!q) return null;
    const people = this.listRobosPeople();
    for (const p of people) {
      const firstName = p.name.replace(/"[^"]*"/g, '').trim().split(/\s+/)[0].toLowerCase();
      if (
        p.uid.toLowerCase() === q ||
        p.name.toLowerCase() === q ||
        p.shortName.toLowerCase() === q ||
        firstName === q
      ) {
        return p;
      }
    }
    return people.find((p) => p.name.toLowerCase().includes(q) || p.uid.toLowerCase().includes(q)) || null;
  }

  /**
   * Extract an L2-normalized voiceprint embedding from a WAV Buffer, file path, or Float32Array.
   */
  extractEmbeddingFromWav(wavBufferOrFloat32, sampleRate = 16000) {
    const rawSamples = wavBufferOrFloat32 instanceof Float32Array
      ? wavBufferOrFloat32
      : (typeof wavBufferOrFloat32 === 'string'
          ? readWavToFloat32(wavBufferOrFloat32)
          : decodeWavBufferToFloat32(wavBufferOrFloat32));
    if (!rawSamples || rawSamples.length === 0) {
      return { ok: false, error: 'Invalid or empty WAV audio buffer.', durationSec: 0 };
    }
    const trimmed = trimSilenceFloat32(rawSamples, sampleRate);
    const durationSec = trimmed.length / sampleRate;
    if (durationSec < 0.35) {
      return { ok: false, error: 'Speech clip is too short for voiceprint extraction (speak at least half a second).', durationSec };
    }

    const extractor = getCamPlusPlusExtractor();
    if (extractor) {
      try {
        const stream = extractor.createStream();
        stream.acceptWaveform({ sampleRate, samples: trimmed });
        stream.inputFinished();
        if (extractor.isReady(stream)) {
          const rawVec = extractor.compute(stream);
          if (rawVec && rawVec.length > 0) {
            return {
              ok: true,
              engine: 'wespeaker-cam++',
              dim: rawVec.length,
              embedding: l2Normalize(rawVec),
              durationSec,
            };
          }
        }
      } catch (err) {
        console.warn('[speaker-id] CAM++ compute error:', err.message);
      }
    }

    const fallbackVec = computeSpectralFallbackEmbedding(trimmed, sampleRate);
    return {
      ok: true,
      engine: 'spectral-fallback',
      dim: fallbackVec.length,
      embedding: fallbackVec,
      durationSec,
    };
  }

  listSpeakers() {
    const store = this._loadStore();
    return store.speakers.map((s) => ({
      speakerId: s.speakerId,
      name: s.name,
      shortName: s.shortName || s.name,
      robosUserUid: s.robosUserUid || '',
      engine: s.engine || 'wespeaker-cam++',
      dim: s.dim || (s.centroid ? s.centroid.length : 0),
      sampleCount: Array.isArray(s.embeddings) ? s.embeddings.length : 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  enrollWav(wavBuffer, rawName, options = {}) {
    const cleanRaw = String(rawName || '').trim().replace(/^[,.!?;:\s]+|[,.!?;:\s]+$/g, '');
    if (!cleanRaw) {
      return { ok: false, error: 'Please specify a name to enroll (for example, "Commander, remember my voice as Nick").' };
    }

    const ext = this.extractEmbeddingFromWav(wavBuffer, options.sampleRate || 16000);
    if (!ext.ok) return ext;

    const matchedPerson = this.resolveRobosPerson(cleanRaw);
    const speakerId = matchedPerson ? matchedPerson.uid : slugifySpeakerId(cleanRaw);
    const fullName = matchedPerson ? matchedPerson.name : cleanRaw.replace(/\b\w/g, (c) => c.toUpperCase());
    const shortName = matchedPerson ? matchedPerson.shortName : fullName.split(/\s+/)[0];
    const robosUserUid = matchedPerson ? matchedPerson.uid : '';

    const store = this._loadStore();
    const nowIso = new Date().toISOString();
    let record = store.speakers.find(
      (s) => s.speakerId === speakerId || s.shortName?.toLowerCase() === shortName.toLowerCase(),
    );
    let isNew = false;

    if (!record || record.dim !== ext.dim) {
      isNew = !record;
      if (record) {
        store.speakers = store.speakers.filter((s) => s !== record);
      }
      record = {
        speakerId,
        name: fullName,
        shortName,
        robosUserUid,
        engine: ext.engine,
        dim: ext.dim,
        embeddings: [ext.embedding],
        centroid: ext.embedding,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      store.speakers.push(record);
    } else {
      record.name = fullName;
      record.shortName = shortName;
      if (robosUserUid) record.robosUserUid = robosUserUid;
      record.engine = ext.engine;
      record.embeddings = [...(record.embeddings || []), ext.embedding].slice(-MAX_SAMPLES_PER_SPEAKER);
      record.centroid = computeCentroid(record.embeddings);
      record.updatedAt = nowIso;
    }

    this._saveStore(store);
    return {
      ok: true,
      isNew,
      speakerId: record.speakerId,
      speakerName: record.shortName,
      fullName: record.name,
      robosUserUid: record.robosUserUid,
      sampleCount: record.embeddings.length,
      engine: record.engine,
    };
  }

  identifyWav(wavBuffer, options = {}) {
    const store = this._loadStore();
    if (!store.speakers.length) {
      return {
        ok: true,
        identified: false,
        enrolledCount: 0,
        speakerId: '',
        speakerName: '',
        fullName: '',
        robosUserUid: '',
        similarity: 0,
        confidencePct: 0,
        candidates: [],
      };
    }

    const ext = this.extractEmbeddingFromWav(wavBuffer, options.sampleRate || 16000);
    if (!ext.ok) {
      return {
        ok: true,
        identified: false,
        enrolledCount: store.speakers.length,
        speakerId: '',
        speakerName: '',
        fullName: '',
        robosUserUid: '',
        similarity: 0,
        confidencePct: 0,
        reason: ext.error,
        candidates: [],
      };
    }

    const threshold = options.threshold !== undefined
      ? Number(options.threshold)
      : (ext.engine === 'wespeaker-cam++' ? CAMPP_DEFAULT_THRESHOLD : FALLBACK_DEFAULT_THRESHOLD);

    const candidates = [];
    for (const spk of store.speakers) {
      if (spk.dim !== ext.dim) continue;
      const samples = Array.isArray(spk.embeddings) && spk.embeddings.length ? spk.embeddings : [spk.centroid];
      let maxSampleCos = -1;
      for (const sVec of samples) {
        const c = cosineSimilarity(ext.embedding, sVec);
        if (c > maxSampleCos) maxSampleCos = c;
      }
      const centroidCos = spk.centroid ? cosineSimilarity(ext.embedding, spk.centroid) : maxSampleCos;
      const score = 0.6 * maxSampleCos + 0.4 * centroidCos;
      candidates.push({
        speakerId: spk.speakerId,
        speakerName: spk.shortName || spk.name,
        fullName: spk.name,
        robosUserUid: spk.robosUserUid || '',
        similarity: Math.round(score * 1000) / 1000,
        confidencePct: this._scoreToConfidencePct(score, ext.engine),
      });
    }

    candidates.sort((a, b) => b.similarity - a.similarity);
    const best = candidates[0] || null;
    if (!best || best.similarity < threshold) {
      return {
        ok: true,
        identified: false,
        enrolledCount: store.speakers.length,
        speakerId: '',
        speakerName: '',
        fullName: '',
        robosUserUid: '',
        similarity: best ? best.similarity : 0,
        confidencePct: best ? best.confidencePct : 0,
        closestSpeakerName: best ? best.speakerName : '',
        engine: ext.engine,
        candidates,
      };
    }

    return {
      ok: true,
      identified: true,
      enrolledCount: store.speakers.length,
      speakerId: best.speakerId,
      speakerName: best.speakerName,
      fullName: best.fullName,
      robosUserUid: best.robosUserUid,
      similarity: best.similarity,
      confidencePct: best.confidencePct,
      engine: ext.engine,
      candidates,
    };
  }

  _scoreToConfidencePct(score, engine) {
    if (engine === 'wespeaker-cam++') {
      // Map CAM++ cosine [0.25 .. 0.85] -> [25% .. 99%]
      if (score <= 0) return 0;
      const pct = Math.round(25 + ((score - 0.25) / 0.60) * 74);
      return Math.max(1, Math.min(99, pct));
    }
    return Math.max(0, Math.min(99, Math.round(score * 100)));
  }

  removeSpeaker(nameOrId) {
    const q = String(nameOrId || '').trim().toLowerCase().replace(/['"’]s?\b/g, '').trim();
    if (!q) return { ok: false, removed: false, error: 'Speaker name required' };
    const store = this._loadStore();
    const idx = store.speakers.findIndex(
      (s) =>
        s.speakerId.toLowerCase() === q ||
        s.name.toLowerCase() === q ||
        (s.shortName || '').toLowerCase() === q ||
        s.name.toLowerCase().includes(q),
    );
    if (idx === -1) {
      return { ok: false, removed: false, error: `No enrolled voiceprint found for "${nameOrId}".` };
    }
    const [removed] = store.speakers.splice(idx, 1);
    this._saveStore(store);
    return { ok: true, removed: true, speaker: removed };
  }

  /**
   * Detect if a spoken `"Commander, _____"` query is a Speaker ID / Voiceprint command.
   */
  parseVoiceCommand(rawQuery) {
    const q = String(rawQuery || '').trim().replace(/^[,.!?;:\s]+|[.!?]+$/g, '').trim();
    if (!q) return null;

    // 1. Enroll current speaker's voice:
    //    "remember my voice as Nick", "remember my voice is Nick", "enroll my voice as Diana",
    //    "learn my voice for Leo", "this is Bella speaking, remember my voice",
    //    "my name is Nick, remember my voice", "add a voice sample for Nick"
    const enrollAs = q.match(/^(?:(?:please\s+)?(?:remember|enroll|learn|register|save|train)\s+(?:my\s+|this\s+)?voice(?:\s*print)?\s+(?:as|is|for|under)|add\s+(?:a\s+|another\s+)?voice(?:\s*print)?\s+sample\s+(?:for|as))\s+([a-z][a-z\s'\-]{0,36})$/i)
      || q.match(/^(?:this\s+is|i\s+am|i'm|my\s+name\s+is)\s+([a-z][a-z\s'\-]{0,28}?)(?:\s+speaking|\s+talking)?[,;.\s]+(?:please\s+)?(?:remember|enroll|learn|save|register)\s+(?:my|this)\s+voice(?:\s*print)?$/i);
    if (enrollAs) {
      return { type: 'enroll', targetName: enrollAs[1].trim() };
    }

    // 2. Identify who is talking right now:
    //    "who is talking", "who's speaking", "whose voice is this", "do you recognize my voice",
    //    "can you tell who is talking", "do you know who is talking", "identify my voice", "who am I"
    if (/^(?:(?:can\s+you\s+tell\s+)?who(?:'s|\s+is)\s+(?:talking|speaking|this)(?:\s+right\s+now)?|whose\s+voice\s+is\s+this|do\s+you\s+(?:recognize|know)\s+(?:my\s+voice|me|who(?:'s|\s+is)\s+(?:talking|speaking)|who\s+i\s+am)|(?:identify|recognize)\s+(?:my\s+voice|me|speaker)|who\s+do\s+i\s+sound\s+like|who\s+am\s+i)$/i.test(q)) {
      return { type: 'identify', isBareWhoAmI: /^who\s+am\s+i$/i.test(q) };
    }

    // 3. List enrolled voiceprints:
    //    "whose voices do you know", "what voices do you know", "list enrolled voices", "who can you recognize"
    if (/^(?:(?:whose|what|which)\s+voices?\s+do\s+you\s+(?:know|recognize)|(?:list|show|what\s+are)\s+(?:the\s+|my\s+|our\s+)?(?:enrolled\s+|known\s+)?(?:voices?|voice\s*prints?|speakers?)|who\s+can\s+you\s+recognize(?:\s+by\s+voice)?)$/i.test(q)) {
      return { type: 'list' };
    }

    // 4. Forget / remove a speaker's voiceprint:
    //    "forget Nick's voice", "remove voiceprint for Sam", "delete Diana's voiceprint"
    const forgetMatch = q.match(/^(?:forget|remove|delete|erase|clear)\s+(?:the\s+)?(?:voice(?:\s*print)?\s+(?:for|of)\s+(.+)|(.+?)(?:'s|s')\s+voice(?:\s*print)?)$/i);
    if (forgetMatch) {
      const targetName = (forgetMatch[1] || forgetMatch[2] || '').trim();
      if (targetName) return { type: 'forget', targetName };
    }

    return null;
  }

  executeVoiceCommand(rawQuery, context = {}) {
    const parsed = this.parseVoiceCommand(rawQuery);
    if (!parsed) return null;

    if (parsed.type === 'list') {
      const list = this.listSpeakers();
      if (!list.length) {
        const msg = 'No voices are enrolled yet, Commander. Say "Commander, remember my voice as" followed by your name to enroll.';
        return { ok: true, skill: 'speaker-id:list', actionDone: msg, response: msg, data: { speakers: [] } };
      }
      const desc = list.map((s) => `${s.shortName} (${s.sampleCount} sample${s.sampleCount === 1 ? '' : 's'})`);
      const joined = desc.length === 1 ? desc[0] : `${desc.slice(0, -1).join(', ')} and ${desc[desc.length - 1]}`;
      const msg = `I know ${list.length} voice${list.length === 1 ? '' : 's'}: ${joined}.`;
      return { ok: true, skill: 'speaker-id:list', actionDone: msg, response: msg, data: { speakers: list } };
    }

    if (parsed.type === 'forget') {
      const rem = this.removeSpeaker(parsed.targetName);
      const msg = rem.removed
        ? `Forgot the voiceprint for ${rem.speaker.shortName || rem.speaker.name}.`
        : rem.error;
      return { ok: rem.ok, skill: 'speaker-id:forget', actionDone: msg, response: msg, data: rem };
    }

    if (parsed.type === 'enroll') {
      const wavBuf = context.utteranceWavBuffer;
      if (!wavBuf || !Buffer.isBuffer(wavBuf) || wavBuf.length <= 44) {
        const msg = `Speak aloud from your microphone or phone and say "Commander, remember my voice as ${parsed.targetName}" so I can capture your voiceprint.`;
        return { ok: false, skill: 'speaker-id:enroll', actionDone: msg, response: msg };
      }
      const enrolled = this.enrollWav(wavBuf, parsed.targetName);
      if (!enrolled.ok) {
        return { ok: false, skill: 'speaker-id:enroll', actionDone: enrolled.error, response: enrolled.error };
      }
      const linkedNote = enrolled.robosUserUid && enrolled.fullName !== enrolled.speakerName
        ? ` (${enrolled.fullName})`
        : '';
      const msg = enrolled.sampleCount === 1
        ? `Got it, ${enrolled.speakerName}${linkedNote}! I enrolled your voiceprint and will recognize when you are talking.`
        : `Saved voice sample ${enrolled.sampleCount} for ${enrolled.speakerName}${linkedNote} — voice recognition is even sharper now.`;
      return {
        ok: true,
        skill: 'speaker-id:enroll',
        actionDone: `Enrolled voiceprint for ${enrolled.speakerName} (sample #${enrolled.sampleCount})`,
        response: msg,
        data: enrolled,
      };
    }

    if (parsed.type === 'identify') {
      const wavBuf = context.utteranceWavBuffer;
      // If invoked via pure text (no audio buffer) for bare "who am I", let robos-users handle active desktop profile
      if ((!wavBuf || wavBuf.length <= 44) && !context.preIdentified && parsed.isBareWhoAmI) {
        return null;
      }
      const idRes = context.preIdentified || (wavBuf && wavBuf.length > 44 ? this.identifyWav(wavBuf) : null);
      if (!idRes || idRes.enrolledCount === 0) {
        const msg = 'I do not have any voiceprints enrolled yet. Say "Commander, remember my voice as" followed by your name to teach me your voice.';
        return { ok: true, skill: 'speaker-id:identify', actionDone: msg, response: msg, data: idRes };
      }
      if (idRes.identified) {
        const fullNote = idRes.fullName && idRes.fullName !== idRes.speakerName ? ` (${idRes.fullName})` : '';
        const msg = `You are ${idRes.speakerName}${fullNote} — ${idRes.confidencePct}% voice match.`;
        return { ok: true, skill: 'speaker-id:identify', actionDone: msg, response: msg, data: idRes };
      }
      const closestNote = idRes.closestSpeakerName ? ` (closest was ${idRes.closestSpeakerName} at ${idRes.confidencePct}%)` : '';
      const msg = `I don't recognize this voice yet${closestNote}. Say "Commander, remember my voice as" followed by your name to enroll.`;
      return { ok: true, skill: 'speaker-id:identify', actionDone: msg, response: msg, data: idRes };
    }

    return null;
  }
}

module.exports = {
  SpeakerIdentifier,
  getCamPlusPlusExtractor,
  cosineSimilarity,
  l2Normalize,
};

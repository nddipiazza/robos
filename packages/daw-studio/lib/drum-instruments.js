'use strict';

/**
 * RobOS DAW Studio — Open-Source Drum Instrument Manager & Transient Detector
 *
 * IMPORTANT: Never commit `.wav` or `.flac` sample libraries into git!
 * All open-source drum kits are downloaded on demand into the user's local
 * untracked store: `~/.local/share/robos/daw-studio/instruments/drumkits/<kit-id>/`
 * (or `$ROBOS_DAW_INSTRUMENTS_DIR/drumkits/<kit-id>/`).
 *
 * Default reliable open-source archives:
 *   1. `gm-rock-kit`    — Pearl DX 5-Piece Studio Acoustic Kit (Glen MacArthur / Hydrogen, GPL-3.0)
 *   2. `virtuosity-cc0` — Virtuosity Close-Miked Studio Drums (sfzinstruments/virtuosity_drums, CC0-1.0)
 *   3. `tr-808-kit`     — Roland TR-808 Studio Emulation Kit (Hydrogen, GPL-3.0)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');

const HYDROGEN_RAW_BASE = 'https://raw.githubusercontent.com/hydrogen-music/hydrogen/main/data/drumkits';
const VIRTUOSITY_RAW_BASE = 'https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/master/Samples';

const OPEN_DRUMKIT_CATALOG = [
  {
    id: 'gm-rock-kit',
    name: 'Pearl DX 5pc Acoustic Studio Kit (GM Rock)',
    author: 'Glen MacArthur (AVL) & Sebastian Moors / Hydrogen',
    license: 'GPL-3.0',
    sourceUrl: 'https://github.com/hydrogen-music/hydrogen/tree/main/data/drumkits/GMRockKit',
    description: 'Multi-velocity 5-piece acoustic studio drumkit (Kick, Snare, Rimshot, Toms 1/2/Floor, Hi-Hats, Crash, Splash, Ride).',
    defaultFor: ['kick', 'snare', 'tom-rack', 'tom-floor', 'hihat', 'cymbal'],
    pieces: {
      kick: {
        label: 'Pearl DX Studio Kick',
        layers: [
          { min: 0.0, max: 0.28, file: 'Kick-Soft.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Kick-Soft.wav` },
          { min: 0.28, max: 0.68, file: 'Kick-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Kick-Med.wav` },
          { min: 0.68, max: 0.86, file: 'Kick-Hard.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Kick-Hard.wav` },
          { min: 0.86, max: 1.0, file: 'Kick-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Kick-Hardest.wav` },
        ],
      },
      snare: {
        label: 'Pearl DX Studio Snare',
        layers: [
          { min: 0.0, max: 0.28, file: 'Snare-Soft.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Snare-Soft.wav` },
          { min: 0.28, max: 0.62, file: 'Snare-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Snare-Med.wav` },
          { min: 0.62, max: 0.84, file: 'Snare-Hard.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Snare-Hard.wav` },
          { min: 0.84, max: 1.0, file: 'Snare-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Snare-Hardest.wav` },
        ],
      },
      'snare-rimshot': {
        label: 'Pearl DX Snare Rimshot',
        layers: [
          { min: 0.0, max: 0.5, file: 'SnareRimshot-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/SnareRimshot-Med.wav` },
          { min: 0.5, max: 1.0, file: 'SnareRimshot-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/SnareRimshot-Hardest.wav` },
        ],
      },
      'tom-rack': {
        label: 'Pearl DX Rack Tom 1',
        layers: [
          { min: 0.0, max: 0.45, file: 'Tom1-Soft.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Tom1-Soft.wav` },
          { min: 0.45, max: 0.8, file: 'Tom1-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Tom1-Med.wav` },
          { min: 0.8, max: 1.0, file: 'Tom1-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Tom1-Hardest.wav` },
        ],
      },
      'tom-mid': {
        label: 'Pearl DX Rack Tom 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'Tom2-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Tom2-Med.wav` },
          { min: 0.5, max: 1.0, file: 'Tom2-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Tom2-Hardest.wav` },
        ],
      },
      'tom-floor': {
        label: 'Pearl DX Floor Tom',
        layers: [
          { min: 0.0, max: 0.45, file: 'TomFloor-Soft.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/TomFloor-Soft.wav` },
          { min: 0.45, max: 0.8, file: 'TomFloor-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/TomFloor-Med.wav` },
          { min: 0.8, max: 1.0, file: 'TomFloor-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/TomFloor-Hardest.wav` },
        ],
      },
      hihat: {
        label: 'Pearl DX Closed Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'HatClosed-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/HatClosed-Med.wav` },
          { min: 0.5, max: 1.0, file: 'HatClosed-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/HatClosed-Hardest.wav` },
        ],
      },
      'hihat-open': {
        label: 'Pearl DX Open Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'HatOpen-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/HatOpen-Med.wav` },
          { min: 0.5, max: 1.0, file: 'HatOpen-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/HatOpen-Hardest.wav` },
        ],
      },
      cymbal: {
        label: 'Studio Crash Cymbal',
        layers: [
          { min: 0.0, max: 0.55, file: 'Crash-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Crash-Med.wav` },
          { min: 0.55, max: 1.0, file: 'Crash-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Crash-Hardest.wav` },
        ],
      },
      ride: {
        label: '24" Studio Ride Cymbal',
        layers: [
          { min: 0.0, max: 0.55, file: 'Ride-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Ride-Med.wav` },
          { min: 0.55, max: 1.0, file: 'Ride-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Ride-Hardest.wav` },
        ],
      },
    },
  },
  {
    id: 'virtuosity-cc0',
    name: 'Virtuosity Close-Mic Studio Drums (CC0 Public Domain)',
    author: 'sfzinstruments / Virtuosity Drums',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/virtuosity_drums',
    description: 'Dedicated close-mic studio drum samples in lossless FLAC released under CC0 Public Domain.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'Virtuosity Close-Mic Kick',
        layers: [
          { min: 0.0, max: 0.5, file: 'kickmic_kick_snoff_vl2_rr1.flac', url: `${VIRTUOSITY_RAW_BASE}/kickmic/kick/kickmic_kick_snoff_vl2_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'kickmic_kick_snoff_vl4_rr1.flac', url: `${VIRTUOSITY_RAW_BASE}/kickmic/kick/kickmic_kick_snoff_vl4_rr1.flac` },
        ],
      },
      snare: {
        label: 'Virtuosity Close-Mic Snare',
        layers: [
          { min: 0.0, max: 0.5, file: 'snaremic_snare_buzz_vl6.flac', url: `${VIRTUOSITY_RAW_BASE}/snaremic/snare/snaremic_snare_buzz_vl6.flac` },
          { min: 0.5, max: 1.0, file: 'snaremic_snare_buzz_vl12.flac', url: `${VIRTUOSITY_RAW_BASE}/snaremic/snare/snaremic_snare_buzz_vl12.flac` },
        ],
      },
      'tom-rack': {
        label: 'Virtuosity Studio High Tom',
        layers: [
          { min: 0.0, max: 1.0, file: 'oh_htom_center_vl10.flac', url: `${VIRTUOSITY_RAW_BASE}/oh/htom/oh_htom_center_vl10.flac` },
        ],
      },
      cymbal: {
        label: 'Virtuosity Overhead Crash',
        layers: [
          { min: 0.0, max: 1.0, file: 'oh_crash_crash_vl2_rr1.flac', url: `${VIRTUOSITY_RAW_BASE}/oh/crash/oh_crash_crash_vl2_rr1.flac` },
        ],
      },
    },
  },
  {
    id: 'tr-808-kit',
    name: 'TR-808 Analog Studio Kit',
    author: 'Hydrogen Open Drumkits',
    license: 'GPL-3.0',
    sourceUrl: 'https://github.com/hydrogen-music/hydrogen/tree/main/data/drumkits/TR808EmulationKit',
    description: 'Punchy classic TR-808 sub kick, snappy analog snare, toms, hats, and cymbal for hybrid sound replacement.',
    defaultFor: [],
    pieces: {
      kick: {
        label: '808 Sub Kick (Long)',
        layers: [{ min: 0.0, max: 1.0, file: '808_Kick_Long.flac', url: `${HYDROGEN_RAW_BASE}/TR808EmulationKit/808_Kick_Long.flac` }],
      },
      'kick-tight': {
        label: '808 Punch Kick (Short)',
        layers: [{ min: 0.0, max: 1.0, file: '808_Kick_Short.flac', url: `${HYDROGEN_RAW_BASE}/TR808EmulationKit/808_Kick_Short.flac` }],
      },
      snare: {
        label: '808 Snare Crisp',
        layers: [{ min: 0.0, max: 1.0, file: '808_Snare_1.flac', url: `${HYDROGEN_RAW_BASE}/TR808EmulationKit/808_Snare_1.flac` }],
      },
      'tom-rack': {
        label: '808 Mid Tom',
        layers: [{ min: 0.0, max: 1.0, file: '808_Tom_Mid.flac', url: `${HYDROGEN_RAW_BASE}/TR808EmulationKit/808_Tom_Mid.flac` }],
      },
      'tom-floor': {
        label: '808 Low Tom',
        layers: [{ min: 0.0, max: 1.0, file: '808_Tom_Low.flac', url: `${HYDROGEN_RAW_BASE}/TR808EmulationKit/808_Tom_Low.flac` }],
      },
      hihat: {
        label: '808 Closed Hat',
        layers: [{ min: 0.0, max: 1.0, file: '808_Hat_Closed.flac', url: `${HYDROGEN_RAW_BASE}/TR808EmulationKit/808_Hat_Closed.flac` }],
      },
      cymbal: {
        label: '808 Cymbal',
        layers: [{ min: 0.0, max: 1.0, file: '808_Cymbal.flac', url: `${HYDROGEN_RAW_BASE}/TR808EmulationKit/808_Cymbal.flac` }],
      },
    },
  },
];

function getInstrumentsRoot() {
  if (process.env.ROBOS_DAW_INSTRUMENTS_DIR) return process.env.ROBOS_DAW_INSTRUMENTS_DIR;
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.local', 'share', 'robos', 'daw-studio', 'instruments');
}

function getDrumkitsRoot() {
  return path.join(getInstrumentsRoot(), 'drumkits');
}

function fetchUrlBuffer(url, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'RobOS-DAW-Studio/0.1' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(fetchUrlBuffer(nextUrl, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error(`Timeout downloading ${url}`));
    });
  });
}

function inspectInstalledKits() {
  const root = getDrumkitsRoot();
  const catalogIds = new Set(OPEN_DRUMKIT_CATALOG.map(k => k.id));
  const results = OPEN_DRUMKIT_CATALOG.map(kit => {
    const kitDir = path.join(root, kit.id);
    const manifestPath = path.join(kitDir, 'kit.json');
    let installed = false;
    let sampleCount = 0;
    const pieces = {};

    for (const [pieceId, piece] of Object.entries(kit.pieces)) {
      const resolvedLayers = piece.layers.map(layer => {
        const fullPath = path.join(kitDir, layer.file);
        const exists = fs.existsSync(fullPath);
        if (exists) sampleCount++;
        return {
          ...layer,
          localPath: exists ? fullPath : null,
          exists,
        };
      });
      pieces[pieceId] = {
        id: pieceId,
        label: piece.label,
        ready: resolvedLayers.some(l => l.exists),
        layers: resolvedLayers,
      };
    }

    installed = fs.existsSync(manifestPath) || sampleCount > 0;
    return {
      id: kit.id,
      name: kit.name,
      author: kit.author,
      license: kit.license,
      sourceUrl: kit.sourceUrl,
      description: kit.description,
      installed,
      sampleCount,
      kitDir,
      pieces,
    };
  });

  // Also discover any custom kits placed in ~/.local/share/robos/daw-studio/instruments/drumkits/<id>/
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || catalogIds.has(entry.name)) continue;
      const kitDir = path.join(root, entry.name);
      const audioFiles = fs.readdirSync(kitDir).filter(f => /\.(wav|flac|ogg|mp3)$/i.test(f));
      if (!audioFiles.length) continue;
      let meta = { name: entry.name, author: 'Custom Open Archive', license: 'User Installed', description: 'Custom local drumkit' };
      const manifestPath = path.join(kitDir, 'kit.json');
      if (fs.existsSync(manifestPath)) {
        try { meta = { ...meta, ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')) }; } catch {}
      }
      const pieces = {};
      for (const f of audioFiles) {
        const slug = path.basename(f, path.extname(f)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        pieces[slug] = {
          id: slug,
          label: path.basename(f, path.extname(f)),
          ready: true,
          layers: [{ min: 0, max: 1, file: f, localPath: path.join(kitDir, f), exists: true }],
        };
      }
      results.push({
        id: entry.name,
        name: meta.name,
        author: meta.author,
        license: meta.license,
        sourceUrl: meta.sourceUrl || kitDir,
        description: meta.description,
        installed: true,
        sampleCount: audioFiles.length,
        kitDir,
        pieces,
      });
    }
  }

  return {
    instrumentsRoot: getInstrumentsRoot(),
    drumkitsRoot: root,
    kits: results,
    anyInstalled: results.some(k => k.installed && k.sampleCount > 0),
  };
}

async function downloadOpenDrumkit(kitId = 'gm-rock-kit', { onProgress } = {}) {
  const kit = OPEN_DRUMKIT_CATALOG.find(k => k.id === kitId);
  if (!kit) {
    throw new Error(`Unknown drumkit "${kitId}". Available kits: ${OPEN_DRUMKIT_CATALOG.map(k => k.id).join(', ')}`);
  }

  const kitDir = path.join(getDrumkitsRoot(), kit.id);
  fs.mkdirSync(kitDir, { recursive: true });

  const downloads = [];
  const seenFiles = new Set();
  for (const [pieceId, piece] of Object.entries(kit.pieces)) {
    for (const layer of piece.layers) {
      if (seenFiles.has(layer.file)) continue;
      seenFiles.add(layer.file);
      downloads.push({ pieceId, ...layer });
    }
  }

  const hashes = {};
  let completed = 0;
  for (const item of downloads) {
    const dest = path.join(kitDir, item.file);
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 64) {
      const buf = await fetchUrlBuffer(item.url);
      fs.writeFileSync(dest, buf);
      hashes[item.file] = crypto.createHash('sha256').update(buf).digest('hex');
    } else {
      const buf = fs.readFileSync(dest);
      hashes[item.file] = crypto.createHash('sha256').update(buf).digest('hex');
    }
    completed++;
    if (onProgress) {
      onProgress({ kitId: kit.id, completed, total: downloads.length, file: item.file });
    }
  }

  const manifest = {
    schema: 1,
    id: kit.id,
    name: kit.name,
    author: kit.author,
    license: kit.license,
    sourceUrl: kit.sourceUrl,
    installedAt: new Date().toISOString(),
    files: hashes,
  };
  fs.writeFileSync(path.join(kitDir, 'kit.json'), JSON.stringify(manifest, null, 2), 'utf8');

  return {
    ok: true,
    kitId: kit.id,
    kitDir,
    downloadedFiles: completed,
    status: inspectInstalledKits(),
  };
}

async function downloadDefaultOpenDrumkits({ onProgress } = {}) {
  const results = [];
  for (const id of ['gm-rock-kit', 'tr-808-kit']) {
    results.push(await downloadOpenDrumkit(id, { onProgress }));
  }
  return {
    ok: true,
    results,
    status: inspectInstalledKits(),
  };
}

/**
 * Parse RIFF WAV buffer and extract normalized mono samples + sampleRate.
 */
function decodeWavMono(buffer) {
  if (!buffer || buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    return { sampleRate: 48000, samples: new Float32Array(0) };
  }
  let offset = 12;
  let sampleRate = 48000;
  let channels = 1;
  let bitsPerSample = 16;
  let audioFormat = 1;
  let dataStart = 44;
  let dataLen = Math.max(0, buffer.length - 44);

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ' && offset + 24 <= buffer.length) {
      audioFormat = buffer.readUInt16LE(offset + 8);
      channels = Math.max(1, buffer.readUInt16LE(offset + 10));
      sampleRate = buffer.readUInt32LE(offset + 12) || 48000;
      bitsPerSample = buffer.readUInt16LE(offset + 22) || 16;
    } else if (chunkId === 'data') {
      dataStart = offset + 8;
      dataLen = Math.min(chunkSize, buffer.length - dataStart);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const bytesPerSample = Math.max(2, Math.floor(bitsPerSample / 8));
  const frameBytes = bytesPerSample * channels;
  const totalFrames = Math.floor(dataLen / frameBytes);
  const out = new Float32Array(totalFrames);

  for (let i = 0; i < totalFrames; i++) {
    const base = dataStart + i * frameBytes;
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const p = base + ch * bytesPerSample;
      let v = 0;
      if (audioFormat === 3 && bytesPerSample === 4) v = buffer.readFloatLE(p);
      else if (bytesPerSample === 2) v = buffer.readInt16LE(p) / 32768;
      else if (bytesPerSample === 3) {
        const b0 = buffer[p], b1 = buffer[p + 1], b2 = buffer[p + 2];
        const int24 = (b2 & 0x80) ? ((b2 << 16) | (b1 << 8) | b0) - 0x1000000 : ((b2 << 16) | (b1 << 8) | b0);
        v = int24 / 8388608;
      } else if (bytesPerSample === 4) v = buffer.readInt32LE(p) / 2147483648;
      sum += v;
    }
    out[i] = sum / channels;
  }

  return { sampleRate, channels, bitsPerSample, samples: out, durationSec: totalFrames / sampleRate };
}

/**
 * Downsample mono samples into compact peak envelope array for fast canvas rendering & project JSON persistence.
 */
function computeWaveformPeaks(buffer, numBuckets = 240) {
  const { samples, durationSec, sampleRate } = decodeWavMono(buffer);
  if (!samples.length) return { peaks: [], peakDb: -96, durationSec: 0, sampleRate };
  const bucketSize = Math.max(1, Math.floor(samples.length / numBuckets));
  const peaks = [];
  let globalPeak = 0;
  for (let b = 0; b < numBuckets; b++) {
    const start = b * bucketSize;
    if (start >= samples.length) break;
    const end = Math.min(samples.length, start + bucketSize);
    let max = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(samples[i]);
      if (a > max) max = a;
    }
    if (max > globalPeak) globalPeak = max;
    peaks.push(Number(max.toFixed(4)));
  }
  const peakDb = globalPeak <= 0.000015 ? -96 : Number((20 * Math.log10(globalPeak)).toFixed(1));
  return { peaks, peakDb, durationSec: Number(durationSec.toFixed(3)), sampleRate };
}

/**
 * Detect drum strike transients in a recorded WAV stem for Sound Replacement triggering.
 */
function detectDrumTransients(buffer, { thresholdDb = -28, minIntervalMs = 65 } = {}) {
  const { samples, sampleRate } = decodeWavMono(buffer);
  if (!samples.length) return [];

  const thresholdLin = Math.pow(10, thresholdDb / 20);
  const windowSamples = Math.max(32, Math.floor(sampleRate * 0.004)); // 4ms attack window
  const minGapSamples = Math.max(windowSamples, Math.floor((sampleRate * minIntervalMs) / 1000));

  const hits = [];
  let lastHitSample = -minGapSamples;
  let prevEnv = 0;

  for (let i = 0; i < samples.length; i += windowSamples) {
    const end = Math.min(samples.length, i + windowSamples);
    let peak = 0;
    let peakIdx = i;
    for (let j = i; j < end; j++) {
      const a = Math.abs(samples[j]);
      if (a > peak) {
        peak = a;
        peakIdx = j;
      }
    }
    // Rising edge onset above threshold outside refractory window
    if (peak >= thresholdLin && peak > prevEnv * 1.25 && (peakIdx - lastHitSample) >= minGapSamples) {
      const peakDb = Number((20 * Math.log10(peak)).toFixed(1));
      // Map [-42 dB .. -2 dB] to velocity [0.15 .. 1.0]
      const normVel = Math.max(0.15, Math.min(1.0, (peakDb + 42) / 40));
      hits.push({
        timeSec: Number((peakIdx / sampleRate).toFixed(4)),
        peakDb,
        velocity: Number(normVel.toFixed(3)),
      });
      lastHitSample = peakIdx;
    }
    prevEnv = peak * 0.7 + prevEnv * 0.3;
  }

  return hits;
}

module.exports = {
  OPEN_DRUMKIT_CATALOG,
  getInstrumentsRoot,
  getDrumkitsRoot,
  inspectInstalledKits,
  downloadOpenDrumkit,
  downloadDefaultOpenDrumkits,
  decodeWavMono,
  computeWaveformPeaks,
  detectDrumTransients,
};

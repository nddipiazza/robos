'use strict';

/**
 * RobOS DAW Studio — Gemini-Preferred AI + Neural MDX-Net ONNX Drum Remover
 *
 * Analyzes a track's audio stem with the RobOS Agent (preferring Gemini / `antigravity` first),
 * extracts and subtracts the drum kit using the open-source MIT `kuielab_b_drums.onnx`
 * MDX-Net separator via ONNX Runtime (with automatic 2D STFT HPSS Wiener fallback offline),
 * and inserts a new `<Track> (No Drums)` track directly underneath with 100% sample-locked
 * `startSec`, `offsetSec`, `durationSec`, and fades.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { decodeWavMono, computeWaveformPeaks, detectDrumTransients } = require('./drum-instruments');
const { makeWavHeader } = require('./pcm-capture');
const { buildTrackFromWizard } = require('./session-manager');

const MDX_DRUM_MODEL_URL = 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/kuielab_b_drums.onnx';
const MDX_DRUM_MODEL_FILENAME = 'kuielab_b_drums.onnx';
const MDX_MIN_VALID_BYTES = 20 * 1024 * 1024;

function getModelsRoot() {
  if (process.env.ROBOS_DAW_MODELS_DIR) return process.env.ROBOS_DAW_MODELS_DIR;
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.local', 'share', 'robos', 'daw-studio', 'models');
}

function getDrumRemovalWorkRoot() {
  if (process.env.ROBOS_DAW_DRUMRM_DIR) return process.env.ROBOS_DAW_DRUMRM_DIR;
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.local', 'share', 'robos', 'daw-studio', 'drum-removal');
}

function clamp(min, max, val) {
  return Math.max(min, Math.min(max, val));
}

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
  return null;
}

function downloadFileWithRedirects(url, destPath, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    const fetchUrl = (targetUrl, hops) => {
      if (hops > maxRedirects) {
        reject(new Error('Too many redirects downloading drum separation model'));
        return;
      }
      https.get(targetUrl, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          fetchUrl(nextUrl, hops + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} downloading ONNX drum model`));
          return;
        }
        const tmpPath = `${destPath}.part-${process.pid}`;
        const ws = fs.createWriteStream(tmpPath);
        res.pipe(ws);
        ws.on('finish', () => {
          ws.close(() => {
            try {
              fs.renameSync(tmpPath, destPath);
              resolve(destPath);
            } catch (e) {
              reject(e);
            }
          });
        });
        ws.on('error', (err) => {
          try { fs.unlinkSync(tmpPath); } catch {}
          reject(err);
        });
      }).on('error', reject);
    };
    fetchUrl(url, 0);
  });
}

async function ensureMdxDrumModelCached({ onProgress } = {}) {
  const modelsDir = getModelsRoot();
  fs.mkdirSync(modelsDir, { recursive: true });
  const modelPath = path.join(modelsDir, MDX_DRUM_MODEL_FILENAME);
  try {
    if (fs.existsSync(modelPath) && fs.statSync(modelPath).size >= MDX_MIN_VALID_BYTES) {
      return modelPath;
    }
  } catch {}

  if (process.env.ROBOS_TEST === '1') {
    return '';
  }

  try {
    if (onProgress) {
      onProgress({
        stage: 'model-download',
        message: 'Downloading open-source MDX-Net neural drum separator (20.9 MB one-time cache)...',
      });
    }
    await downloadFileWithRedirects(MDX_DRUM_MODEL_URL, modelPath);
    if (fs.existsSync(modelPath) && fs.statSync(modelPath).size >= MDX_MIN_VALID_BYTES) {
      return modelPath;
    }
  } catch {}
  return '';
}

function encodeExcerpt16kWav(wavBuf, maxSeconds = 12) {
  const decoded = decodeWavMono(wavBuf);
  if (!decoded.samples.length) return Buffer.alloc(0);
  const srcSr = decoded.sampleRate || 48000;
  const outSr = 16000;
  const ratio = srcSr / outSr;
  // Pick active window up to 20% into track so intro silence doesn't dominate
  const skipSec = decoded.durationSec > 18 ? Math.min(8, decoded.durationSec * 0.15) : 0;
  const startSrc = Math.floor(skipSec * srcSr);
  const outFrames = Math.min(Math.floor(maxSeconds * outSr), Math.max(160, Math.floor((decoded.samples.length - startSrc) / ratio)));
  const pcm = Buffer.allocUnsafe(outFrames * 2);
  for (let i = 0; i < outFrames; i++) {
    const idx = Math.min(decoded.samples.length - 1, Math.floor(startSrc + i * ratio));
    const s = clamp(-0.98, 0.98, decoded.samples[idx] || 0);
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  return Buffer.concat([makeWavHeader(pcm.length, outSr), pcm]);
}

function runPythonDrumSeparator({ srcWav, dstWav, modelPath, compensation = 1.028, forceHpss = false }) {
  const scriptPath = path.join(__dirname, 'mdx_drum_remove.py');
  const payload = JSON.stringify({ srcWav, dstWav, modelPath, compensation, forceHpss });
  return new Promise((resolve, reject) => {
    execFile('python3', [scriptPath, payload], { timeout: 600000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message || '').trim().split('\n').slice(-4).join(' ');
        reject(new Error(msg || err.message));
        return;
      }
      try {
        resolve(JSON.parse(String(stdout || '').trim()));
      } catch {
        resolve({ ok: true, method: modelPath ? 'mdx-net-onnx' : 'hpss-stft' });
      }
    });
  });
}

async function consultGeminiForDrumRemovalPlan(sourceTrack, primaryClip, {
  preferredProvider = 'antigravity',
  aiAgentModule = null,
  onProgress = null,
  cliTimeoutMs = 28000,
} = {}) {
  const defaultName = `${String(sourceTrack.name || 'Stem').replace(/\s*\(No Drums\)$/i, '').slice(0, 26)} (No Drums)`;
  const fallback = {
    compensation: 1.028,
    suggestedTrackName: defaultName,
    provider: 'mdx-net-onnx',
    reasoning: 'Neural MDX-Net phase-inverted drum subtraction preserving full-range bass, guitars, and vocals.',
  };

  let aiAgent = aiAgentModule;
  if (!aiAgent && process.env.ROBOS_TEST !== '1') {
    try { aiAgent = require('../../robos-lib/ai-agent'); } catch {}
  }
  if (!aiAgent || typeof aiAgent.ask !== 'function') {
    return fallback;
  }

  const workDir = path.join(getDrumRemovalWorkRoot(), `rm-${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const rawBuf = fs.readFileSync(primaryClip.wavFile);
    const waveInfo = computeWaveformPeaks(rawBuf, 120);
    const hits = detectDrumTransients(rawBuf, { thresholdDb: -26, minIntervalMs: 70 });
    const excerptBuf = encodeExcerpt16kWav(rawBuf, 12);
    if (excerptBuf.length > 44) {
      fs.writeFileSync(path.join(workDir, 'stem-excerpt.wav'), excerptBuf);
    }

    const telemetry = {
      trackName: sourceTrack.name,
      clipName: primaryClip.name,
      durationSec: waveInfo.durationSec,
      peakDb: waveInfo.peakDb,
      detectedTransientCount: hits.length,
      transientsPerSecond: Number((hits.length / Math.max(0.5, waveInfo.durationSec)).toFixed(2)),
    };
    fs.writeFileSync(path.join(workDir, 'stem-drum-telemetry.json'), JSON.stringify(telemetry, null, 2), 'utf8');

    const candidateProviders = [];
    const pushUnique = (id) => { if (id && !candidateProviders.includes(id)) candidateProviders.push(id); };
    pushUnique(preferredProvider || 'antigravity');
    pushUnique('antigravity');
    if (typeof aiAgent.getActiveProviderId === 'function') pushUnique(aiAgent.getActiveProviderId());
    for (const p of (aiAgent.PROVIDERS || [])) pushUnique(p.id);

    const prompt = [
      'You are an expert studio audio stem-separation engineer.',
      `We are removing the drum kit from "${sourceTrack.name}" (${primaryClip.name || 'stem'}) using Kuielab MDX-Net ONNX phase subtraction (\`drumless = mix - compensation * predicted_drums\`) to create a clean drumless backing track directly underneath.`,
      'Read `stem-drum-telemetry.json` in the current directory (do NOT run shell commands) and tune:',
      '  - `compensation`: float between `1.00` and `1.08` (`1.02` preserves heavy sub-bass guitar; `1.05` strips aggressive rock/metal drums harder).',
      `  - \`suggestedTrackName\`: concise track name ending in \`(No Drums)\` (default "${defaultName}").`,
      'Reply ONLY with raw JSON (no markdown):',
      `{"compensation":1.03,"suggestedTrackName":${JSON.stringify(defaultName)},"reasoning":"1 short sentence"}`,
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
        onProgress({
          stage: 'agent',
          providerId,
          message: `Analyzing drum transients in "${sourceTrack.name}" with ${provDef?.name || providerId}...`,
        });
      }

      const res = await aiAgent.ask(prompt, {
        providerId,
        allowApi: providerId !== 'antigravity',
        cwd: workDir,
        skipWritingPreamble: true,
        effort: 'low',
        cliTimeoutMs,
      });

      if (res?.ok && res.text) {
        const parsed = parseJsonFromAgentText(res.text);
        if (parsed && typeof parsed === 'object') {
          const comp = clamp(0.95, 1.12, Number(parsed.compensation) || 1.028);
          const name = String(parsed.suggestedTrackName || defaultName).trim().slice(0, 38) || defaultName;
          return {
            compensation: comp,
            suggestedTrackName: name,
            provider: provDef?.name || res.provider || providerId,
            reasoning: parsed.reasoning ? String(parsed.reasoning) : fallback.reasoning,
          };
        }
      }
    }
  } catch {
    // Fall back cleanly if CLI unavailable
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }

  return fallback;
}

/**
 * Remove drums from all audible clips on `sourceTrackId` and insert a new `<Track> (No Drums)`
 * track directly underneath (`sourceIdx + 1`) with 100% matching `startSec`, `offsetSec`,
 * `durationSec`, and fades. Mutes the original drum-containing track so playback immediately
 * plays the clean drumless stem.
 */
async function removeDrumsFromTrackInProject(project, sourceTrackId, {
  preferredProvider = 'antigravity',
  aiAgentModule = null,
  onProgress = null,
  takesDir,
  forceHpss = false,
} = {}) {
  const tracks = project?.tracks || [];
  const sourceIdx = tracks.findIndex(t => t.id === sourceTrackId);
  if (sourceIdx === -1) {
    throw new Error('Source track not found in session.');
  }
  const sourceTrack = tracks[sourceIdx];
  const validClips = (sourceTrack.clips || []).filter(c => !c.muted && c.wavFile && fs.existsSync(c.wavFile));
  if (!validClips.length) {
    throw new Error(`Track "${sourceTrack.name}" has no audible audio regions to remove drums from.`);
  }

  const plan = await consultGeminiForDrumRemovalPlan(sourceTrack, validClips[0], {
    preferredProvider,
    aiAgentModule,
    onProgress,
  });

  const modelPath = forceHpss ? '' : await ensureMdxDrumModelCached({ onProgress });

  fs.mkdirSync(takesDir, { recursive: true });
  const newClips = [];
  let separationMethod = modelPath ? 'mdx-net-onnx' : 'hpss-stft';

  for (let i = 0; i < validClips.length; i++) {
    const srcClip = validClips[i];
    if (onProgress) {
      onProgress({
        stage: 'separating',
        message: `Removing drums from "${srcClip.name || sourceTrack.name}" (${i + 1}/${validClips.length}) via ${modelPath ? 'MDX-Net Neural ONNX' : 'STFT Harmonic Separator'}...`,
      });
    }

    const newClipId = `nodrums-${crypto.randomBytes(4).toString('hex')}`;
    const safeStem = String(srcClip.name || sourceTrack.name || 'stem')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 38) || 'stem';
    const destFileName = `${newClipId}-${safeStem}-no-drums.wav`;
    const destWavPath = path.join(takesDir, destFileName);

    const sepRes = await runPythonDrumSeparator({
      srcWav: srcClip.wavFile,
      dstWav: destWavPath,
      modelPath,
      compensation: plan.compensation,
      forceHpss,
    });
    if (sepRes?.method) separationMethod = sepRes.method;

    const outBuf = fs.readFileSync(destWavPath);
    const numBuckets = Math.min(1200, Math.max(240, Math.round((Number(srcClip.durationSec) || 4) * 8)));
    const peakInfo = computeWaveformPeaks(outBuf, numBuckets);

    const baseClipTitle = String(srcClip.name || 'Stem').replace(/\s*\(No Drums\)$/i, '');
    newClips.push({
      id: newClipId,
      name: `${baseClipTitle} (No Drums)`,
      sourceFile: destWavPath,
      mediaKind: 'drumless',
      wavFile: destWavPath,
      relativeWavPath: path.join('takes', destFileName),
      fileExists: true,
      // Exact 1:1 timeline & trim lock with the source clip above!
      startSec: Number(srcClip.startSec) || 0,
      offsetSec: Number(srcClip.offsetSec) || 0,
      durationSec: Number(srcClip.durationSec) || peakInfo.durationSec,
      sourceDurationSec: peakInfo.durationSec || Number(srcClip.sourceDurationSec) || Number(srcClip.durationSec) || 1,
      peakDb: peakInfo.peakDb,
      gainDb: Number(srcClip.gainDb) || 0,
      fadeInSec: Number(srcClip.fadeInSec) || 0,
      fadeOutSec: Number(srcClip.fadeOutSec) || 0,
      muted: false,
      peaks: peakInfo.peaks,
      transients: [],
    });
  }

  const drumlessTrack = buildTrackFromWizard({
    profileId: 'acoustic-inst',
    name: plan.suggestedTrackName,
    inputNodeName: '',
    inputLabel: `Drumless Stem (${plan.provider} · ${separationMethod === 'mdx-net-onnx' ? 'MDX-Net' : 'HPSS'})`,
    armed: false,
  });
  drumlessTrack.shortLabel = 'No Drums';
  drumlessTrack.color = '#10b981';
  drumlessTrack.volume = Number.isFinite(Number(sourceTrack.volume)) ? Number(sourceTrack.volume) : 0.88;
  drumlessTrack.pan = Number(sourceTrack.pan) || 0;
  drumlessTrack.gainDb = Number(sourceTrack.gainDb) || 0;
  if (tracks.some(t => t.soloed)) {
    drumlessTrack.soloed = true;
  }
  drumlessTrack.fx = {
    ...(drumlessTrack.fx || {}),
    openSourcePlugins: ['Kuielab MDX-Net Drumless Stem', 'x42 Parametric EQ4 (LV2)'],
    phaseInvert: false,
    gate: { enabled: false, thresholdDb: -60 },
    eq: { enabled: false, hpfHz: 25, lowFreqHz: 80, lowGainDb: 0, midFreqHz: 800, midGainDb: 0, midQ: 1.2, highFreqHz: 8000, highGainDb: 0 },
    compressor: { enabled: false, thresholdDb: -18, ratio: 2.5, attackMs: 12, releaseMs: 120, makeupDb: 0 },
    drive: { enabled: false, amount: 0 },
    reverb: { enabled: false, type: 'room', mix: 0, decaySec: 0.8, preDelayMs: 18, dampHz: 7000 },
  };
  drumlessTrack.soundReplacement = {
    ...(drumlessTrack.soundReplacement || {}),
    supported: false,
    enabled: false,
  };
  drumlessTrack.clips = newClips;

  // Mute the original drum-containing track so pressing Play/Record plays the clean drumless stem immediately!
  sourceTrack.muted = true;

  // Insert directly underneath `sourceTrack` (`sourceIdx + 1`)
  tracks.splice(sourceIdx + 1, 0, drumlessTrack);

  return {
    ok: true,
    project,
    drumlessTrack,
    createdClipIds: newClips.map(c => c.id),
    separationMethod,
    compensation: plan.compensation,
    provider: plan.provider,
    reasoning: plan.reasoning,
  };
}

module.exports = {
  getModelsRoot,
  ensureMdxDrumModelCached,
  runPythonDrumSeparator,
  removeDrumsFromTrackInProject,
};

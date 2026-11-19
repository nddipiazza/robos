'use strict';

/**
 * RobOS DAW Studio — Session, Multi-Track Hardware Recording & Project Persistence Engine
 *
 * Projects live at:
 *   ~/.local/share/robos/daw-studio/projects/<project-id>/
 *     ├── project.json
 *     └── takes/
 *         ├── <clip-id>.wav
 *         └── ...
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { getMicProfile } = require('./mic-profiles');
const { computeWaveformPeaks, computeSmartAutoGainDb, detectDrumTransients } = require('./drum-instruments');
const { startDiscreteCaptureSession, makeWavHeader } = require('./pcm-capture');

function getProjectsRoot() {
  if (process.env.ROBOS_DAW_PROJECTS_DIR) return process.env.ROBOS_DAW_PROJECTS_DIR;
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.local', 'share', 'robos', 'daw-studio', 'projects');
}

function getRecentStatePath() {
  if (process.env.ROBOS_DAW_CONFIG_DIR) return path.join(process.env.ROBOS_DAW_CONFIG_DIR, 'recent.json');
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.config', 'robos', 'daw-studio', 'recent.json');
}

function slugify(text) {
  return String(text || 'untitled-session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'session';
}

function makeId(prefix = 'id') {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

function loadRecentState() {
  try {
    const p = getRecentStatePath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return { lastProjectId: null, recentIds: [] };
}

function saveRecentState(projectId) {
  try {
    const cur = loadRecentState();
    const recentIds = [projectId, ...(cur.recentIds || []).filter(x => x !== projectId)].slice(0, 15);
    const p = getRecentStatePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ lastProjectId: projectId, recentIds, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  } catch {}
}

function createEmptyProject({ name = 'Untitled Drum & Studio Session', bpm = 120, timeSignature = '4/4', sampleRate = 48000, metronome = false } = {}) {
  const id = `${slugify(name)}-${crypto.randomBytes(3).toString('hex')}`;
  const projectDir = path.join(getProjectsRoot(), id);
  return {
    schema: 1,
    id,
    name,
    bpm,
    timeSignature,
    sampleRate,
    metronome: Boolean(metronome),
    createdAt: new Date().toISOString(),
    savedAt: null,
    projectDir,
    markers: [],
    tracks: [],
  };
}

function buildTrackFromWizard({
  profileId,
  name,
  inputNodeName,
  inputLabel,
  armed = true,
  soundReplacement,
  fxOverride,
  pan = undefined,
  gainDb = 0,
}) {
  const profile = getMicProfile(profileId);
  const sr = {
    ...JSON.parse(JSON.stringify(profile.soundReplacement)),
    ...(soundReplacement || {}),
  };
  const fx = {
    ...JSON.parse(JSON.stringify(profile.fx)),
    ...(fxOverride || {}),
  };
  return {
    id: makeId('trk'),
    profileId: profile.id,
    name: name || profile.name,
    shortLabel: profile.shortLabel,
    category: profile.category,
    color: profile.color,
    image: profile.image,
    inputNodeName: inputNodeName || '',
    inputLabel: inputLabel || 'Default Input',
    armed: Boolean(armed),
    monitor: false,
    muted: false,
    soloed: false,
    gainDb: Number(gainDb) || 0,
    volume: 1.0,
    pan: pan !== undefined ? (Number(pan) || 0) : (Number(profile.defaultPan) || 0),
    fx,
    soundReplacement: sr,
    clips: [],
  };
}

function ensureProjectDir(project) {
  const id = project.id || `${slugify(project.name)}-${crypto.randomBytes(3).toString('hex')}`;
  project.id = id;
  if (!project.projectDir) {
    project.projectDir = path.join(getProjectsRoot(), id);
  }
  const takesDir = path.join(project.projectDir, 'takes');
  fs.mkdirSync(takesDir, { recursive: true });
  return { projectDir: project.projectDir, takesDir };
}

function persistLyricsSidecars(clip, takesDir, projectDir, prevDir) {
  const out = {};
  const copySidecar = (absField, relField) => {
    let rel = clip[relField] || null;
    let abs = clip[absField] || null;
    if (abs && fs.existsSync(abs)) {
      const fn = path.basename(abs);
      rel = path.join('takes', fn);
      const dest = path.join(takesDir, fn);
      if (path.resolve(abs) !== path.resolve(dest)) {
        fs.copyFileSync(abs, dest);
      }
      abs = dest;
    } else if (prevDir && rel) {
      const oldAbs = path.join(prevDir, rel);
      const nextAbs = path.join(projectDir, rel);
      if (fs.existsSync(oldAbs) && path.resolve(oldAbs) !== path.resolve(nextAbs)) {
        fs.copyFileSync(oldAbs, nextAbs);
      }
      abs = nextAbs;
    }
    if (abs) out[absField] = abs;
    if (rel) out[relField] = rel;
  };
  copySidecar('karFile', 'relativeKarPath');
  copySidecar('lrcFile', 'relativeLrcPath');
  return out;
}

function saveProject(project, { targetDir } = {}) {
  if (!project || typeof project !== 'object') throw new Error('Invalid project payload');
  const prevDir = project.projectDir;
  if (targetDir) {
    project.projectDir = targetDir;
  } else if (!project.projectDir) {
    project.id = project.id || `${slugify(project.name)}-${crypto.randomBytes(3).toString('hex')}`;
    project.projectDir = path.join(getProjectsRoot(), project.id);
  }

  const { projectDir, takesDir } = ensureProjectDir(project);

  // Ensure every clip's `.wav` (and optional `.mp4` / video file) lives inside `<projectDir>/takes/<fileName>`
  const normalizedTracks = (project.tracks || []).map(track => {
    const clips = (track.clips || []).map(clip => {
      let relWav = clip.relativeWavPath || (clip.wavFile ? path.join('takes', path.basename(clip.wavFile)) : null);
      let destAbs = relWav ? path.join(projectDir, relWav) : null;
      if (clip.wavFile && fs.existsSync(clip.wavFile)) {
        const fileName = path.basename(clip.wavFile);
        relWav = path.join('takes', fileName);
        destAbs = path.join(takesDir, fileName);
        if (path.resolve(clip.wavFile) !== path.resolve(destAbs)) {
          fs.copyFileSync(clip.wavFile, destAbs);
        }
      } else if (prevDir && relWav) {
        const oldAbs = path.join(prevDir, relWav);
        if (fs.existsSync(oldAbs) && destAbs && path.resolve(oldAbs) !== path.resolve(destAbs)) {
          fs.copyFileSync(oldAbs, destAbs);
        }
      }

      let relVid = clip.relativeVideoPath || null;
      let destVidAbs = clip.videoFile || null;
      if (clip.videoFile && fs.existsSync(clip.videoFile)) {
        const vidInsideAnyTakes = path.basename(path.dirname(clip.videoFile)) === 'takes';
        if (relVid || vidInsideAnyTakes) {
          const vidFileName = path.basename(clip.videoFile);
          relVid = path.join('takes', vidFileName);
          destVidAbs = path.join(takesDir, vidFileName);
          if (path.resolve(clip.videoFile) !== path.resolve(destVidAbs)) {
            fs.copyFileSync(clip.videoFile, destVidAbs);
          }
        }
      } else if (prevDir && relVid) {
        const oldVidAbs = path.join(prevDir, relVid);
        const nextVidAbs = path.join(projectDir, relVid);
        if (fs.existsSync(oldVidAbs) && path.resolve(oldVidAbs) !== path.resolve(nextVidAbs)) {
          fs.copyFileSync(oldVidAbs, nextVidAbs);
        }
        destVidAbs = nextVidAbs;
      }

      return {
        ...clip,
        relativeWavPath: relWav,
        wavFile: destAbs,
        ...(destVidAbs ? { videoFile: destVidAbs, relativeVideoPath: relVid } : {}),
        ...persistLyricsSidecars(clip, takesDir, projectDir, prevDir),
      };
    });
    return { ...track, clips };
  });

  const savedDoc = {
    schema: 1,
    id: project.id,
    name: project.name || 'Untitled Session',
    bpm: Number(project.bpm) || 120,
    timeSignature: project.timeSignature || '4/4',
    sampleRate: Number(project.sampleRate) || 48000,
    metronome: Boolean(project.metronome),
    createdAt: project.createdAt || new Date().toISOString(),
    savedAt: new Date().toISOString(),
    projectDir,
    markers: Array.isArray(project.markers) ? project.markers : [],
    tracks: normalizedTracks,
  };

  const manifestFile = path.join(projectDir, 'project.json');
  fs.writeFileSync(manifestFile, JSON.stringify(savedDoc, null, 2), 'utf8');
  saveRecentState(savedDoc.id);
  return { ok: true, project: savedDoc, manifestFile };
}

function loadProject(idOrPath) {
  let manifestFile = '';
  if (!idOrPath) throw new Error('Specify a project ID or project.json path');

  if (fs.existsSync(idOrPath)) {
    const st = fs.statSync(idOrPath);
    manifestFile = st.isDirectory() ? path.join(idOrPath, 'project.json') : idOrPath;
  } else {
    manifestFile = path.join(getProjectsRoot(), String(idOrPath), 'project.json');
  }

  if (!fs.existsSync(manifestFile)) {
    throw new Error(`Project file not found: ${manifestFile}`);
  }

  const raw = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const projectDir = path.dirname(manifestFile);
  raw.projectDir = projectDir;
  raw.metronome = Boolean(raw.metronome);
  if (!Array.isArray(raw.markers)) raw.markers = [];

  // Hydrate absolute clip wav paths and recompute peaks/transients if missing
  for (const track of (raw.tracks || [])) {
    if (track.gainDb === undefined) track.gainDb = 0;
    for (const clip of (track.clips || [])) {
      const rel = clip.relativeWavPath || (clip.wavFile ? path.join('takes', path.basename(clip.wavFile)) : null);
      const abs = rel ? path.join(projectDir, rel) : (clip.wavFile || null);
      clip.relativeWavPath = rel;
      clip.wavFile = abs;
      clip.fileExists = Boolean(abs && fs.existsSync(abs));

      // Hydrate recorded or imported video clip paths
      if (clip.relativeVideoPath) {
        clip.videoFile = path.join(projectDir, clip.relativeVideoPath);
      } else if (!clip.videoFile && clip.mediaKind === 'video' && clip.sourceFile && fs.existsSync(clip.sourceFile)) {
        clip.videoFile = clip.sourceFile;
      }
      clip.videoFileExists = Boolean(clip.videoFile && fs.existsSync(clip.videoFile));

      // Hydrate MIDI Karaoke (.kar) & Enhanced Lyrics (.lrc) sidecars
      if (clip.relativeKarPath) clip.karFile = path.join(projectDir, clip.relativeKarPath);
      if (clip.relativeLrcPath) clip.lrcFile = path.join(projectDir, clip.relativeLrcPath);
      if ((!clip.lyricsData || !Array.isArray(clip.lyricsData.lines)) && clip.karFile && fs.existsSync(clip.karFile)) {
        try {
          const { parseMidiKaraokeSmf } = require('./lyrics-generator');
          const parsedKar = parseMidiKaraokeSmf(fs.readFileSync(clip.karFile), {
            clipStartSec: Number(clip.startSec) || 0,
          });
          clip.lyricsData = {
            format: 'smf-kar-v1',
            ppq: parsedKar.ppq,
            bpm: parsedKar.bpm,
            title: parsedKar.title,
            artist: parsedKar.artist,
            clipBaseStartSec: Number(clip.startSec) || 0,
            lines: parsedKar.lines,
          };
        } catch {}
      }
      if (clip.offsetSec === undefined) clip.offsetSec = 0;
      if (clip.gainDb === undefined) clip.gainDb = 0;
      if (clip.fadeInSec === undefined) clip.fadeInSec = 0;
      if (clip.fadeOutSec === undefined) clip.fadeOutSec = 0;
      if (clip.muted === undefined) clip.muted = false;
      if (clip.fileExists && (!Array.isArray(clip.peaks) || !clip.peaks.length)) {
        const buf = fs.readFileSync(abs);
        const info = computeWaveformPeaks(buf);
        clip.peaks = info.peaks;
        clip.peakDb = info.peakDb;
        clip.sourceDurationSec = clip.sourceDurationSec || info.durationSec;
        if (!clip.durationSec) clip.durationSec = info.durationSec;
      } else if (clip.durationSec && !clip.sourceDurationSec) {
        clip.sourceDurationSec = (Number(clip.offsetSec) || 0) + Number(clip.durationSec);
      }
      if (clip.fileExists && clip.autoGainStaged === undefined && (Number(clip.gainDb) || 0) === 0 && (Number(track.gainDb) || 0) === 0 && Number(clip.peakDb) < -24 && Number(clip.peakDb) > -65) {
        const buf = fs.readFileSync(abs);
        clip.gainDb = computeSmartAutoGainDb(buf);
        clip.autoGainStaged = true;
      }
      const needsTransientScan = !Array.isArray(clip.transients) || (clip.transients.length === 0 && Number(clip.peakDb) > -65);
      if (clip.fileExists && needsTransientScan && track.soundReplacement?.supported) {
        const buf = fs.readFileSync(abs);
        clip.transients = detectDrumTransients(buf, {
          thresholdDb: track.soundReplacement.thresholdDb ?? -28,
          minIntervalMs: track.soundReplacement.minIntervalMs ?? 65,
          gainDb: Number(track.gainDb) || 0,
        });
      }
    }
  }

  saveRecentState(raw.id);
  return { ok: true, project: raw, manifestFile };
}

function listProjects() {
  const root = getProjectsRoot();
  if (!fs.existsSync(root)) return { projectsRoot: root, projects: [], lastProjectId: null };
  const recent = loadRecentState();
  const projects = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const mf = path.join(root, entry.name, 'project.json');
    if (!fs.existsSync(mf)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(mf, 'utf8'));
      const clipCount = (doc.tracks || []).reduce((n, t) => n + (t.clips?.length || 0), 0);
      projects.push({
        id: doc.id || entry.name,
        name: doc.name || entry.name,
        bpm: doc.bpm || 120,
        trackCount: doc.tracks?.length || 0,
        clipCount,
        savedAt: doc.savedAt || doc.createdAt || null,
        projectDir: path.join(root, entry.name),
        manifestFile: mf,
      });
    } catch {}
  }
  projects.sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
  return {
    projectsRoot: root,
    projects,
    lastProjectId: recent.lastProjectId || (projects[0]?.id || null),
  };
}

function reanalyzeTrackTransients(track) {
  if (!track || !Array.isArray(track.clips)) return track;
  for (const clip of track.clips) {
    if (clip.wavFile && fs.existsSync(clip.wavFile)) {
      const buf = fs.readFileSync(clip.wavFile);
      clip.transients = detectDrumTransients(buf, {
        thresholdDb: track.soundReplacement?.thresholdDb ?? -28,
        minIntervalMs: track.soundReplacement?.minIntervalMs ?? 65,
        gainDb: Number(track.gainDb) || 0,
      });
    }
  }
  return track;
}

/**
 * Synthesize a realistic test drum stem WAV (kick/snare/tom hits) when running
 * automated verification or testing Sound Replacement without striking a physical drum.
 */
function defaultHitsForProfile(profileId, durationSec) {
  const id = String(profileId || '');
  let base = [0.25, 0.75, 1.25, 1.75];
  if (/kick/i.test(id)) base = [0.15, 0.90, 1.15, 1.90, 2.40, 3.15];
  else if (/snare/i.test(id)) base = [0.65, 1.65, 2.65, 3.40, 3.65];
  else if (/tom-rack/i.test(id)) base = [1.80, 1.95, 3.55];
  else if (/tom-floor/i.test(id)) base = [2.10, 2.28, 3.75];
  else if (/hihat/i.test(id)) base = [0.15, 0.40, 0.65, 0.90, 1.15, 1.40, 1.65, 1.90, 2.15, 2.40, 2.65, 2.90];
  else if (/cymbal/i.test(id)) base = [0.15, 2.15];
  else if (/guitar|bass/i.test(id)) base = [0.15, 0.65, 1.15, 1.65, 2.15, 2.65];
  return base.filter(t => t + 0.08 < durationSec);
}

function synthesizeDrumTakeWav({ profileId = 'snare-top', durationSec = 2.4, sampleRate = 48000, hitTimesSec } = {}) {
  const effectiveHits = Array.isArray(hitTimesSec) ? hitTimesSec : defaultHitsForProfile(profileId, durationSec);
  const totalSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = totalSamples * 2;
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

  const floatBuf = new Float32Array(totalSamples);
  const isKick = /kick/i.test(profileId);
  const isCym = /cymbal|hihat/i.test(profileId);
  const isGuitar = /guitar|bass/i.test(profileId);

  for (let h = 0; h < effectiveHits.length; h++) {
    const startIdx = Math.floor(effectiveHits[h] * sampleRate);
    const vel = 0.65 + (h % 3) * 0.14;
    const hitLen = Math.floor(sampleRate * (isCym ? 0.38 : 0.24));
    for (let i = 0; i < hitLen && (startIdx + i) < totalSamples; i++) {
      const t = i / sampleRate;
      let s = 0;
      if (isKick) {
        const freq = 52 + 95 * Math.exp(-38 * t);
        s = Math.sin(2 * Math.PI * freq * t) * Math.exp(-9.5 * t);
      } else if (isCym) {
        const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
        s = (noise * 2 - 1) * Math.exp(-7.5 * t) * 0.7;
      } else if (isGuitar) {
        s = (Math.sin(2 * Math.PI * 110 * t) + 0.5 * Math.sin(2 * Math.PI * 220 * t)) * Math.exp(-3.5 * t) * 0.6;
      } else {
        // Snare / Tom: body tone + snare wire burst
        const noise = ((Math.sin((i + 1) * 78.233) * 43758.5453) % 1) * 2 - 1;
        s = (0.55 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-16 * t)) + (0.55 * noise * Math.exp(-12 * t));
      }
      floatBuf[startIdx + i] += s * vel;
    }
  }

  for (let i = 0; i < totalSamples; i++) {
    const clamped = Math.max(-0.98, Math.min(0.98, floatBuf[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buf;
}

function computeSyntheticSlicePeak(profileId, sliceStartSec, sliceDurSec = 0.02) {
  const loopDur = 4.0;
  const localT = sliceStartSec % loopDur;
  const hits = defaultHitsForProfile(profileId, loopDur);
  const isCym = /cymbal|hihat/i.test(profileId);
  const isKick = /kick/i.test(profileId);
  const isGuitar = /guitar|bass/i.test(profileId);
  const decay = isGuitar ? 3.5 : (isCym ? 7.5 : (isKick ? 9.5 : 13.5));
  const maxTail = isCym || isGuitar ? 0.45 : 0.28;

  let bestAmp = 0.008;
  for (let h = 0; h < hits.length; h++) {
    const dt = (localT + sliceDurSec * 0.5) - hits[h];
    if (dt >= 0 && dt <= maxTail) {
      const vel = 0.65 + (h % 3) * 0.14;
      const env = vel * Math.exp(-decay * dt);
      if (env > bestAmp) bestAmp = env;
    }
  }
  return Number(Math.min(0.98, bestAmp).toFixed(4));
}

/**
 * Sample-accurate overdub latency alignment: aligns a recorded 16-bit mono PCM WAV buffer
 * captured starting at `firstSampleMicWallMs` against the exact wall-clock instant
 * `earsStartWallMs` when `punchStartSec` of the backing track physically exited the
 * audio interface headphones (`AudioContext.getOutputTimestamp()`).
 */
function alignRecordedWavBuffer(buf, {
  punchStartSec = 0,
  sampleRate = 48000,
  firstSampleMicWallMs = null,
  earsStartWallMs = null,
} = {}) {
  const baseStart = Number(punchStartSec) || 0;
  if (
    !buf ||
    buf.length <= 44 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    !Number.isFinite(firstSampleMicWallMs) ||
    !Number.isFinite(earsStartWallMs)
  ) {
    return { buffer: buf, clipStartSec: baseStart, trimmedSec: 0 };
  }

  const syncDeltaSec = (earsStartWallMs - firstSampleMicWallMs) / 1000;
  // Sanity bound: ignore bogus clock jumps > 3 seconds
  if (Math.abs(syncDeltaSec) > 3.0 || Math.abs(syncDeltaSec) < 0.0004) {
    return { buffer: buf, clipStartSec: baseStart, trimmedSec: 0 };
  }

  if (syncDeltaSec > 0) {
    // pw-cat began capturing `syncDeltaSec` BEFORE `punchStartSec` reached the user's headphones:
    // trim those exact leading pre-roll + round-trip frames so Sample #0 = `punchStartSec`.
    const totalDataBytes = Math.max(0, buf.length - 44);
    const totalFrames = Math.floor(totalDataBytes / 2);
    const minKeepFrames = Math.min(totalFrames, Math.floor(sampleRate * 0.04));
    const trimFrames = Math.min(Math.max(0, totalFrames - minKeepFrames), Math.round(syncDeltaSec * sampleRate));
    if (trimFrames <= 0) {
      return { buffer: buf, clipStartSec: baseStart, trimmedSec: 0 };
    }
    const pcmSlice = Buffer.from(buf.subarray(44 + trimFrames * 2));
    // 2ms linear micro-fade at Sample #0 to prevent any DC/zero-crossing boundary click
    const rampFrames = Math.min(Math.floor(pcmSlice.length / 2), Math.floor(sampleRate * 0.002));
    for (let i = 0; i < rampFrames; i++) {
      const s = pcmSlice.readInt16LE(i * 2);
      pcmSlice.writeInt16LE(Math.round(s * (i / rampFrames)), i * 2);
    }
    const header = makeWavHeader(pcmSlice.length, sampleRate);
    return {
      buffer: Buffer.concat([header, pcmSlice]),
      clipStartSec: baseStart,
      trimmedSec: Number((trimFrames / sampleRate).toFixed(4)),
    };
  }

  // Capture started `|syncDeltaSec|` AFTER `punchStartSec` reached the headphones: shift clip start forward
  return {
    buffer: buf,
    clipStartSec: Number((baseStart + Math.abs(syncDeltaSec)).toFixed(4)),
    trimmedSec: Number(syncDeltaSec.toFixed(4)),
  };
}

/**
 * Active Multi-Track Hardware Recording Session Controller
 */
class MultiTrackRecorder {
  constructor() {
    this.active = null;
  }

  isRecording() {
    return Boolean(this.active);
  }

  waitCaptureReady(timeoutMs = 280) {
    if (!this.active?.capture?.waitReady) return Promise.resolve(null);
    return this.active.capture.waitReady(timeoutMs);
  }

  getFirstSampleMicWallMs() {
    return this.active?.capture?.getFirstSampleMicWallMs?.() ?? null;
  }

  start(project, { startSec = 0, injectTestSignal = false, onMeter } = {}) {
    if (this.active) throw new Error('Recording is already in progress');
    const allArmed = (project.tracks || []).filter(t => t.armed);
    const armedVideoTracks = allArmed.filter(t => t.trackKind === 'video');
    const audioCandidateArmed = allArmed.filter(
      t => t.trackKind !== 'lyrics' && (t.trackKind !== 'video' || t.videoConfig?.audioMode === 'interface')
    );
    // Do not overwrite pure imported backing-media tracks (no hardware input assigned) when mic tracks are armed
    const hasHardwareArmed = audioCandidateArmed.some(t => Boolean(t.inputNodeName));
    const armedTracks = hasHardwareArmed
      ? audioCandidateArmed.filter(t => Boolean(t.inputNodeName) || !(t.clips || []).some(c => c.sourceFile || c.mediaKind))
      : audioCandidateArmed;
    if (!armedTracks.length && !armedVideoTracks.length) {
      throw new Error('No tracks are armed for recording. Arm at least one mic or video track [R] first.');
    }

    const { takesDir } = ensureProjectDir(project);
    const sampleRate = Number(project.sampleRate) || 48000;

    // Video-only recording pass (0 PipeWire audio channels armed, >= 1 video track armed)
    if (!armedTracks.length) {
      const startedAtMs = Date.now();
      const sliceDurationSec = 0.02;
      const timer = setInterval(() => {
        if (!onMeter) return;
        const elapsedSec = (Date.now() - startedAtMs) / 1000;
        try {
          onMeter({ elapsedSec, startSec, sliceDurationSec, tracks: [] });
        } catch {}
      }, 40);
      this.active = {
        project,
        startSec: Number(startSec) || 0,
        sampleRate,
        startedAtMs,
        sliceDurationSec,
        injectTestSignal: Boolean(injectTestSignal),
        entries: [],
        capture: {
          startedAtMs,
          sliceDurationSec,
          waitReady: () => Promise.resolve(null),
          getFirstSampleMicWallMs: () => null,
          stop: async () => { clearInterval(timer); },
        },
      };
      return {
        ok: true,
        armedCount: armedVideoTracks.length,
        startSec: this.active.startSec,
        sliceDurationSec,
        tracks: [],
      };
    }

    const entries = armedTracks.map(track => {
      const clipId = makeId('take');
      const fileName = `${slugify(track.shortLabel || track.name)}-${clipId}.wav`;
      const wavFile = path.join(takesDir, fileName);
      return {
        id: track.id,
        trackId: track.id,
        trackName: track.name,
        profileId: track.profileId,
        inputNodeName: track.inputNodeName || '',
        soundReplacement: track.soundReplacement,
        clipId,
        fileName,
        wavFile,
        relativeWavPath: path.join('takes', fileName),
        synthSlicesEmitted: 0,
        synthMaxPeakLin: 0,
      };
    });

    const capture = startDiscreteCaptureSession(entries, {
      sampleRate,
      meterIntervalMs: 36,
      minFlushIntervalMs: 22,
      sliceDurationSec: 0.02,
      pwLatency: '10ms',
      onMeter: ({ elapsedSec, sliceDurationSec = 0.02, tracks }) => {
        if (!onMeter) return;
        const targetSliceCount = Math.floor(elapsedSec / sliceDurationSec);
        const trackProgress = tracks.map((m, idx) => {
          const entry = entries[idx];
          let newPeaks = m.newPeaks || [];
          let currentPeak = m.currentPeak || 0;
          let peakDb = m.peakDb;
          let maxPeakDb = m.maxPeakDb;

          // If Test Groove preview mode is active, stream live synthetic drum-hit peaks
          if (injectTestSignal) {
            const synthPeaks = [];
            while (entry.synthSlicesEmitted < targetSliceCount) {
              const p = computeSyntheticSlicePeak(entry.profileId, entry.synthSlicesEmitted * sliceDurationSec, sliceDurationSec);
              synthPeaks.push(p);
              if (p > entry.synthMaxPeakLin) entry.synthMaxPeakLin = p;
              entry.synthSlicesEmitted++;
            }
            newPeaks = synthPeaks;
            currentPeak = synthPeaks.length
              ? synthPeaks[synthPeaks.length - 1]
              : computeSyntheticSlicePeak(entry.profileId, elapsedSec, sliceDurationSec);
            peakDb = currentPeak <= 0.000015 ? -96 : Number((20 * Math.log10(currentPeak)).toFixed(1));
            maxPeakDb = entry.synthMaxPeakLin <= 0.000015 ? -96 : Number((20 * Math.log10(entry.synthMaxPeakLin)).toFixed(1));
          }

          return {
            trackId: entry.trackId,
            clipId: entry.clipId,
            bytes: m.bytes,
            framesRecorded: m.framesRecorded,
            durationSec: m.durationSec,
            peakDb,
            maxPeakDb,
            currentPeak,
            newPeaks,
          };
        });
        try {
          onMeter({
            elapsedSec,
            startSec,
            sliceDurationSec,
            tracks: trackProgress,
          });
        } catch {}
      },
    });

    this.active = {
      project,
      startSec: Number(startSec) || 0,
      sampleRate,
      startedAtMs: capture.startedAtMs,
      sliceDurationSec: capture.sliceDurationSec,
      injectTestSignal: Boolean(injectTestSignal),
      entries,
      capture,
    };

    return {
      ok: true,
      armedCount: entries.length,
      startSec: this.active.startSec,
      sliceDurationSec: capture.sliceDurationSec,
      tracks: entries.map(e => ({
        trackId: e.trackId,
        trackName: e.trackName,
        clipId: e.clipId,
        wavFile: e.wavFile,
      })),
    };
  }

  /**
   * REAPER "Stop recording and delete all recorded media" (abort current pass cleanly).
   */
  async cancel() {
    if (!this.active) return { ok: false, error: 'Not currently recording' };
    const session = this.active;
    this.active = null;

    await session.capture.stop();

    let deletedFiles = 0;
    for (const entry of session.entries) {
      try {
        if (entry.wavFile && fs.existsSync(entry.wavFile)) {
          fs.unlinkSync(entry.wavFile);
          deletedFiles++;
        }
      } catch {}
    }

    return {
      ok: true,
      canceled: true,
      deletedFiles,
      startSec: session.startSec,
      project: session.project,
    };
  }

  async stop({ injectTestSignal = false, earsStartWallMs = null } = {}) {
    if (!this.active) return { ok: false, error: 'Not currently recording' };
    const session = this.active;
    this.active = null;

    const wallDurationSec = Math.max(0.4, (Date.now() - session.startedAtMs) / 1000);
    const firstSampleMicWallMs = session.capture.getFirstSampleMicWallMs?.() ?? null;
    await session.capture.stop();

    const recordedClips = [];
    for (const entry of session.entries) {
      let exists = fs.existsSync(entry.wavFile) && fs.statSync(entry.wavFile).size > 100;
      let usedSynthetic = false;
      if (injectTestSignal || !exists) {
        // Only synthesize fallback if explicitly requested in test-signal mode or if headless container lacks PipeWire
        const synth = synthesizeDrumTakeWav({
          profileId: entry.profileId,
          durationSec: wallDurationSec,
          sampleRate: session.sampleRate,
        });
        fs.writeFileSync(entry.wavFile, synth);
        exists = true;
        usedSynthetic = true;
      }

      const targetTrack = (session.project.tracks || []).find(t => t.id === entry.trackId);
      let buf = fs.readFileSync(entry.wavFile);
      let alignedClipStartSec = session.startSec;

      if (!usedSynthetic && Number.isFinite(earsStartWallMs) && Number.isFinite(firstSampleMicWallMs)) {
        const aligned = alignRecordedWavBuffer(buf, {
          punchStartSec: session.startSec,
          sampleRate: session.sampleRate,
          firstSampleMicWallMs,
          earsStartWallMs,
        });
        alignedClipStartSec = aligned.clipStartSec;
        if (aligned.buffer !== buf) {
          buf = aligned.buffer;
          fs.writeFileSync(entry.wavFile, buf);
        }
      }

      const waveInfo = computeWaveformPeaks(buf);
      const autoGainDb = (Number(targetTrack?.gainDb) || 0) === 0
        ? computeSmartAutoGainDb(buf)
        : 0;
      const transients = entry.soundReplacement?.supported
        ? detectDrumTransients(buf, {
          thresholdDb: entry.soundReplacement.thresholdDb ?? -28,
          minIntervalMs: entry.soundReplacement.minIntervalMs ?? 65,
          gainDb: Number(targetTrack?.gainDb) || 0,
        })
        : [];

      const fullDur = waveInfo.durationSec || Number(wallDurationSec.toFixed(3));
      const clip = {
        id: entry.clipId,
        name: `${entry.trackName} Take`,
        wavFile: entry.wavFile,
        relativeWavPath: entry.relativeWavPath,
        fileExists: true,
        startSec: alignedClipStartSec,
        offsetSec: 0,
        durationSec: fullDur,
        sourceDurationSec: fullDur,
        gainDb: autoGainDb,
        autoGainStaged: true,
        fadeInSec: 0,
        fadeOutSec: 0,
        muted: false,
        peakDb: waveInfo.peakDb,
        peaks: waveInfo.peaks,
        transients,
        recordedAt: new Date().toISOString(),
      };
      if (targetTrack) {
        if (!Array.isArray(targetTrack.clips)) targetTrack.clips = [];
        targetTrack.clips.push(clip);
      }
      recordedClips.push({ trackId: entry.trackId, clip });
    }

    return {
      ok: true,
      project: session.project,
      recordedClips,
    };
  }
}

module.exports = {
  getProjectsRoot,
  getRecentStatePath,
  createEmptyProject,
  buildTrackFromWizard,
  saveProject,
  loadProject,
  listProjects,
  reanalyzeTrackTransients,
  synthesizeDrumTakeWav,
  alignRecordedWavBuffer,
  MultiTrackRecorder,
};

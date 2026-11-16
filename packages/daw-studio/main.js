'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const {
  MIC_PROFILES,
  getMicProfile,
  discoverSystemLinuxPlugins,
} = require('./lib/mic-profiles');
const {
  getInstrumentsRoot,
  inspectInstalledKits,
  downloadOpenDrumkit,
  downloadAllOpenDrumkits,
  downloadDefaultOpenDrumkits,
  computeWaveformPeaks,
  detectDrumTransients,
} = require('./lib/drum-instruments');
const { MultiChannelTapDetector } = require('./lib/channel-detector');
const {
  getProjectsRoot,
  createEmptyProject,
  buildTrackFromWizard,
  saveProject,
  loadProject,
  listProjects,
  reanalyzeTrackTransients,
  MultiTrackRecorder,
} = require('./lib/session-manager');
const {
  getSoundchecksRoot,
  classifySoundcheckWithAgent,
  applyClassifiedDrumsetToProject,
  SoundcheckSessionRecorder,
} = require('./lib/drumset-ai-classifier');
const {
  getConfiguredVstDirectoryPaths,
  addVstDirectory,
  removeVstDirectory,
  getVstDirectoriesSnapshot,
} = require('./lib/vst-directories');

// Ensure user CLI bin directories (where `agy`, `gemini`, `claude`, `copilot` live) are in PATH
for (const extraBin of [
  path.join(process.env.HOME || os.homedir(), '.local', 'bin'),
  path.join(process.env.HOME || os.homedir(), '.npm-global', 'bin'),
]) {
  if (fs.existsSync(extraBin) && !(process.env.PATH || '').split(path.delimiter).includes(extraBin)) {
    process.env.PATH = `${extraBin}${path.delimiter}${process.env.PATH || ''}`;
  }
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const APP_ID = 'daw-studio';
const DEBUG_PORT = 19232;

let audioDevices = null;
for (const p of [
  process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'audio-devices'),
  path.resolve(__dirname, '..', 'robos-lib', 'audio-devices'),
  '/usr/local/share/robos/robos-lib/audio-devices',
].filter(Boolean)) {
  try { audioDevices = require(p); break; } catch {}
}

let aiAgent = null;
for (const p of [
  process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ai-agent'),
  path.resolve(__dirname, '..', 'robos-lib', 'ai-agent'),
  '/usr/local/share/robos/robos-lib/ai-agent',
].filter(Boolean)) {
  try { aiAgent = require(p); break; } catch {}
}

let _debugServer = null;
for (const p of [
  process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
  path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
  '/usr/local/share/robos/robos-lib/dom-snapshot',
].filter(Boolean)) {
  try { _debugServer = require(p); break; } catch {}
}

app.setName(`robos-${APP_ID}`);
app.setPath('userData', path.join(process.env.HOME || os.homedir(), '.config', 'robos', 'electron', APP_ID));

if (process.env.ROBOS_TEST !== '1' && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let hotplugTimer = null;
let lastUsbSignature = '';
let lastProcCardsSignature = '';
let currentProject = null;

function readProcCardsSignature() {
  try {
    return fs.readFileSync('/proc/asound/cards', 'utf8').trim();
  } catch {
    return '';
  }
}

const tapDetector = new MultiChannelTapDetector();
const recorder = new MultiTrackRecorder();
const soundcheckRecorder = new SoundcheckSessionRecorder();
let lastSoundcheckSession = null;

function computeSignature(snap) {
  if (!snap || !snap.ok) return 'err';
  return JSON.stringify({
    fr: snap.focusrite?.connected ? `${snap.focusrite.usbId}:${snap.focusrite.alsaCardIndex}` : 'none',
    inCount: snap.inputs?.length || 0,
    outCount: snap.outputs?.length || 0,
  });
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send(channel, payload); } catch {}
  }
}

function inputTier(node) {
  if (!node?.isFocusrite) return 3;
  const desc = String(node.description || '');
  if (/s\/pdif|spdif/i.test(desc)) return 2;
  if (/adat|direct/i.test(desc)) return 1;
  return 0; // Analog Mic/Line Inputs 1..8 first
}

function getOrderedCaptureInputs(snap) {
  const inputs = Array.isArray(snap?.inputs) ? [...snap.inputs] : [];
  inputs.sort((a, b) => {
    const ta = inputTier(a);
    const tb = inputTier(b);
    if (ta !== tb) return ta - tb;
    const ma = String(a.description || '').match(/(\d+)/g);
    const mb = String(b.description || '').match(/(\d+)/g);
    const na = ma ? Number(ma[ma.length - 1]) : 999;
    const nb = mb ? Number(mb[mb.length - 1]) : 999;
    return na - nb;
  });
  return inputs;
}

function maybeApplyFocusriteHints(snap, inputLabel, profile) {
  if (!snap?.focusrite?.connected || !profile?.hardwareHints) return;
  const cardIndex = snap.focusrite.alsaCardIndex;
  if (cardIndex == null) return;
  const chMatch = String(inputLabel || '').match(/Input\s+(\d+)/i);
  if (!chMatch) return;
  const ch = Number(chMatch[1]);
  const hints = profile.hardwareHints;

  try {
    if ((ch === 1 || ch === 2) && hints.level) {
      audioDevices.setFocusriteHardwareControl({ cardIndex, control: `Line In ${ch} Level`, value: hints.level });
    }
    if (ch >= 1 && ch <= 8 && typeof hints.air === 'boolean') {
      audioDevices.setFocusriteHardwareControl({ cardIndex, control: `Line In ${ch} Air`, value: hints.air });
    }
    if (ch >= 1 && ch <= 8 && typeof hints.pad === 'boolean') {
      audioDevices.setFocusriteHardwareControl({ cardIndex, control: `Line In ${ch} Pad`, value: hints.pad });
    }
  } catch {}
}

function ensureCurrentProject(snap) {
  if (currentProject) return currentProject;
  const listed = listProjects();
  if (listed.lastProjectId) {
    try {
      const loaded = loadProject(listed.lastProjectId);
      if (loaded?.ok && loaded.project) {
        currentProject = loaded.project;
        return currentProject;
      }
    } catch {}
  }
  currentProject = createEmptyProject({
    name: 'Studio Drum & Band Session',
    bpm: 120,
    sampleRate: snap?.clock?.effectiveRate || 48000,
  });
  return currentProject;
}

function createWindow() {
  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'RobOS DAW Studio',
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'midi' || permission === 'midiSysex');
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    try {
      _debugServer.registerSnapshotIPC(mainWindow);
      _debugServer.startDebugServer(mainWindow, Number(process.env.ROBOS_SNAPSHOT_PORT) || DEBUG_PORT, APP_ID);
    } catch {}
  }

  mainWindow.on('closed', () => {
    tapDetector.stop();
    if (recorder.isRecording()) {
      recorder.stop().catch(() => {});
    }
    if (soundcheckRecorder.isRecording()) {
      soundcheckRecorder.cancel().catch(() => {});
    }
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── Audio Devices & Hardware IPC ───────────────────────────────────────────

ipcMain.handle('daw:audio-snapshot', async () => {
  try {
    const snap = audioDevices.getAudioDevicesSnapshot();
    lastUsbSignature = computeSignature(snap);
    return snap;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:save-audio-engine', async (_e, payload) => {
  try {
    const { sampleRate, quantum, defaultInputId, defaultOutputId, preferredInputNodeName, preferredOutputNodeName } = payload || {};
    if (preferredInputNodeName !== undefined || preferredOutputNodeName !== undefined) {
      audioDevices.saveAudioConfig({
        ...(preferredInputNodeName !== undefined ? { preferredInputNodeName } : {}),
        ...(preferredOutputNodeName !== undefined ? { preferredOutputNodeName } : {}),
      });
    }
    return audioDevices.setPipeWireEngineSettings({ sampleRate, quantum, defaultInputId, defaultOutputId });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:set-focusrite-control', async (_e, payload) => {
  try {
    const mixer = audioDevices.setFocusriteHardwareControl(payload || {});
    return { ok: true, mixer, snapshot: audioDevices.getAudioDevicesSnapshot() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:test-input', async (_e, payload) => {
  try {
    return await audioDevices.testInputCapture(payload || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:play-test-tone', async (_e, payload) => {
  try {
    return await audioDevices.playTestTone(payload || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── Studio Init, Add Mic Wizard & Drum Instruments IPC ─────────────────────

ipcMain.handle('daw:get-studio-init', async () => {
  try {
    const audioSnapshot = audioDevices.getAudioDevicesSnapshot();
    lastUsbSignature = computeSignature(audioSnapshot);
    const project = ensureCurrentProject(audioSnapshot);
    const providers = (aiAgent?.PROVIDERS || []).map(p => ({ id: p.id, name: p.name }));
    return {
      ok: true,
      audioSnapshot,
      micProfiles: MIC_PROFILES,
      drumkitsStatus: inspectInstalledKits(),
      vstDirsStatus: getVstDirectoriesSnapshot(),
      systemPlugins: discoverSystemLinuxPlugins(),
      aiProviders: providers,
      preferredAiProvider: 'antigravity',
      currentProject: project,
      savedProjects: listProjects(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:wizard-start-tap-detect', async (_e, payload) => {
  try {
    const snap = audioDevices.getAudioDevicesSnapshot();
    const orderedInputs = getOrderedCaptureInputs(snap);
    const strikeThresholdDb = Number(payload?.strikeThresholdDb ?? -26);
    const res = tapDetector.start(orderedInputs, {
      strikeThresholdDb,
      windowMs: 260,
      onLevels: (data) => sendToRenderer('daw:tap-levels', data),
    });
    return { ...res, inputs: orderedInputs };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:wizard-stop-tap-detect', async () => {
  return tapDetector.stop();
});

ipcMain.handle('daw:add-mic-track', async (_e, payload) => {
  try {
    tapDetector.stop();
    const snap = audioDevices.getAudioDevicesSnapshot();
    const proj = ensureCurrentProject(snap);
    const {
      profileId,
      name,
      inputNodeName,
      inputLabel,
      armed = true,
      pan = 0,
      soundReplacement,
      fxOverride,
      applyHardwareHints = false,
    } = payload || {};

    const orderedInputs = getOrderedCaptureInputs(snap);
    let resolvedNodeName = inputNodeName;
    let resolvedLabel = inputLabel;
    if (!resolvedNodeName && orderedInputs.length) {
      const nextIdx = proj.tracks.length % orderedInputs.length;
      resolvedNodeName = orderedInputs[nextIdx].name;
      resolvedLabel = orderedInputs[nextIdx].description;
    } else if (resolvedNodeName && !resolvedLabel) {
      const found = orderedInputs.find(n => n.name === resolvedNodeName);
      resolvedLabel = found ? found.description : resolvedNodeName;
    }

    const profile = getMicProfile(profileId);
    if (applyHardwareHints) {
      maybeApplyFocusriteHints(snap, resolvedLabel, profile);
    }

    const track = buildTrackFromWizard({
      profileId: profile.id,
      name: name || profile.name,
      inputNodeName: resolvedNodeName,
      inputLabel: resolvedLabel,
      armed,
      pan,
      soundReplacement,
      fxOverride,
    });

    proj.tracks.push(track);
    const updatedSnap = applyHardwareHints ? audioDevices.getAudioDevicesSnapshot() : snap;
    return { ok: true, track, project: proj, audioSnapshot: updatedSnap };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:update-project-meta', async (_e, payload) => {
  try {
    const proj = ensureCurrentProject();
    if (payload?.name !== undefined) proj.name = String(payload.name || 'Untitled Session');
    if (payload?.bpm !== undefined) proj.bpm = Math.max(30, Math.min(300, Number(payload.bpm) || 120));
    if (payload?.timeSignature !== undefined) proj.timeSignature = String(payload.timeSignature || '4/4');
    if (payload?.metronome !== undefined) proj.metronome = Boolean(payload.metronome);
    return { ok: true, project: proj };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:update-track', async (_e, payload) => {
  try {
    const proj = ensureCurrentProject();
    const { trackId, patch, reanalyze } = payload || {};
    const track = (proj.tracks || []).find(t => t.id === trackId);
    if (!track) return { ok: false, error: `Track not found: ${trackId}` };

    if (patch && typeof patch === 'object') {
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'fx' && v && typeof v === 'object') {
          track.fx = {
            ...track.fx,
            ...v,
            gate: { ...(track.fx?.gate || {}), ...(v.gate || {}) },
            eq: { ...(track.fx?.eq || {}), ...(v.eq || {}) },
            compressor: { ...(track.fx?.compressor || {}), ...(v.compressor || {}) },
            drive: { ...(track.fx?.drive || {}), ...(v.drive || {}) },
          };
        } else if (k === 'soundReplacement' && v && typeof v === 'object') {
          track.soundReplacement = { ...(track.soundReplacement || {}), ...v };
        } else if (k !== 'id') {
          track[k] = v;
        }
      }
    }
    if (reanalyze) {
      reanalyzeTrackTransients(track);
    }
    return { ok: true, track, project: proj };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:sync-project', async (_e, payload) => {
  try {
    const incoming = payload?.project;
    if (!incoming || typeof incoming !== 'object') {
      return { ok: false, error: 'Missing project payload' };
    }
    const cur = ensureCurrentProject();
    currentProject = {
      ...cur,
      ...incoming,
      tracks: Array.isArray(incoming.tracks) ? incoming.tracks : cur.tracks,
    };
    if (payload?.reanalyzeTrackIds && Array.isArray(payload.reanalyzeTrackIds)) {
      for (const tid of payload.reanalyzeTrackIds) {
        const t = (currentProject.tracks || []).find(x => x.id === tid);
        if (t) reanalyzeTrackTransients(t);
      }
    }
    return { ok: true, project: currentProject };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:delete-track', async (_e, payload) => {
  try {
    const proj = ensureCurrentProject();
    const { trackId } = payload || {};
    proj.tracks = (proj.tracks || []).filter(t => t.id !== trackId);
    return { ok: true, project: proj };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:clear-track-clips', async (_e, payload) => {
  try {
    const proj = ensureCurrentProject();
    const { trackId } = payload || {};
    const track = (proj.tracks || []).find(t => t.id === trackId);
    if (track) track.clips = [];
    return { ok: true, project: proj };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:drumkits-status', async () => {
  try {
    return { ok: true, status: inspectInstalledKits() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:download-drumkit', async (_e, payload) => {
  try {
    const kitId = payload?.kitId || 'defaults';
    const onProgress = (prog) => sendToRenderer('daw:drumkit-progress', prog);
    if (kitId === 'defaults') {
      const res = await downloadDefaultOpenDrumkits({ onProgress });
      return { ok: true, ...res };
    }
    if (kitId === 'all') {
      const res = await downloadAllOpenDrumkits({ onProgress });
      return { ok: true, ...res };
    }
    const res = await downloadOpenDrumkit(kitId, { onProgress });
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:read-audio-file', async (_e, payload) => {
  try {
    const filePath = String(payload?.filePath || '');
    if (!filePath) return { ok: false, error: 'Missing filePath' };
    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    if (!['.wav', '.flac', '.ogg', '.mp3'].includes(ext)) {
      return { ok: false, error: `Unsupported audio extension: ${ext}` };
    }
    const allowedRoots = [
      path.resolve(getInstrumentsRoot()),
      path.resolve(getProjectsRoot()),
      path.resolve(getSoundchecksRoot()),
      path.resolve(os.tmpdir()),
      currentProject?.projectDir ? path.resolve(currentProject.projectDir) : null,
      ...getConfiguredVstDirectoryPaths().map(d => path.resolve(d)),
    ].filter(Boolean);

    if (!allowedRoots.some(r => resolved.startsWith(r + path.sep) || resolved === r)) {
      return { ok: false, error: 'Audio path outside permitted DAW Studio directories' };
    }
    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `Audio file missing: ${resolved}` };
    }
    const buf = fs.readFileSync(resolved);
    return {
      ok: true,
      base64: buf.toString('base64'),
      byteLength: buf.length,
      ext,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── Custom VST / LV2 / CLAP & Sample Library Directory Manager IPC ─────────

ipcMain.handle('daw:vst-dirs-get', async () => {
  try {
    return {
      ok: true,
      vstDirsStatus: getVstDirectoriesSnapshot(),
      drumkitsStatus: inspectInstalledKits(),
      systemPlugins: discoverSystemLinuxPlugins(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:vst-dirs-add', async (_e, payload) => {
  try {
    const requestedPaths = [];
    if (Array.isArray(payload?.dirPaths)) {
      for (const p of payload.dirPaths) {
        if (String(p || '').trim()) requestedPaths.push(String(p).trim());
      }
    }
    if (payload?.dirPath && String(payload.dirPath).trim()) {
      requestedPaths.push(String(payload.dirPath).trim());
    }

    if ((payload?.browseDialog || requestedPaths.length === 0) && mainWindow && !mainWindow.isDestroyed()) {
      const home = process.env.HOME || os.homedir();
      const res = await dialog.showOpenDialog(mainWindow, {
        title: 'Add VST / LV2 / CLAP Plugin or Sample Library Directory',
        defaultPath: home,
        buttonLabel: 'Add Directory',
        properties: ['openDirectory', 'multiSelections'],
      });
      if (res.canceled || !res.filePaths?.length) {
        return { ok: false, canceled: true };
      }
      requestedPaths.push(...res.filePaths);
    }

    if (!requestedPaths.length) {
      return { ok: false, error: 'No directory path provided.' };
    }

    const addedEntries = [];
    for (const rawPath of requestedPaths) {
      addedEntries.push(addVstDirectory(rawPath, { label: payload?.label }));
    }

    return {
      ok: true,
      addedEntries,
      vstDirsStatus: getVstDirectoriesSnapshot(),
      drumkitsStatus: inspectInstalledKits(),
      systemPlugins: discoverSystemLinuxPlugins(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:vst-dirs-remove', async (_e, payload) => {
  try {
    const dirPath = String(payload?.dirPath || '').trim();
    if (!dirPath) return { ok: false, error: 'Missing dirPath' };
    const removed = removeVstDirectory(dirPath);
    return {
      ok: true,
      removed: removed.removed,
      vstDirsStatus: getVstDirectoriesSnapshot(),
      drumkitsStatus: inspectInstalledKits(),
      systemPlugins: discoverSystemLinuxPlugins(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:open-folder-path', async (_e, payload) => {
  try {
    const dirPath = String(payload?.dirPath || '').trim();
    if (!dirPath) return { ok: false, error: 'Missing dirPath' };
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) return { ok: false, error: `Directory does not exist: ${resolved}` };
    await shell.openPath(resolved);
    return { ok: true, dirPath: resolved };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── DrumSet AI All-Mic Soundcheck Wizard IPC ───────────────────────────────

ipcMain.handle('daw:soundcheck-start', async (_e, payload) => {
  try {
    tapDetector.stop();
    if (recorder.isRecording()) await recorder.stop();
    if (soundcheckRecorder.isRecording()) await soundcheckRecorder.cancel();

    const snap = audioDevices.getAudioDevicesSnapshot();
    const orderedInputs = getOrderedCaptureInputs(snap);
    const requestedNames = Array.isArray(payload?.inputNodeNames) && payload.inputNodeNames.length
      ? new Set(payload.inputNodeNames)
      : null;

    let selectedInputs = requestedNames
      ? orderedInputs.filter(n => requestedNames.has(n.name))
      : orderedInputs.filter(n => n.isFocusrite);
    if (!selectedInputs.length) selectedInputs = orderedInputs;

    const sampleRate = Number(snap?.clock?.effectiveRate) || 48000;
    const started = soundcheckRecorder.start(selectedInputs, {
      sampleRate,
      onMeter: (m) => sendToRenderer('daw:soundcheck-levels', m),
    });
    return {
      ...started,
      inputs: selectedInputs,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:soundcheck-cancel', async () => {
  try {
    return await soundcheckRecorder.cancel();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:soundcheck-stop-and-classify', async (_e, payload) => {
  try {
    const simulateKitGroove = Boolean(payload?.simulateKitGroove);
    const preferredProvider = String(payload?.preferredProvider || 'antigravity');

    sendToRenderer('daw:soundcheck-status', {
      stage: 'dsp',
      message: 'Finalizing multi-channel WAV stems & extracting spectral/transient signatures…',
    });

    const stopped = await soundcheckRecorder.stop({ simulateKitGroove });
    if (!stopped?.ok) return stopped;
    lastSoundcheckSession = stopped;

    const classified = await classifySoundcheckWithAgent(stopped, {
      preferredProvider,
      aiAgentModule: aiAgent,
      onProgress: (st) => sendToRenderer('daw:soundcheck-status', st),
    });
    if (!classified?.ok) return classified;

    return {
      ok: true,
      sessionId: stopped.sessionId,
      dir: stopped.dir,
      durationSec: stopped.durationSec,
      via: classified.via,
      provider: classified.provider,
      providerLabel: classified.providerLabel,
      classifications: classified.classifications,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:soundcheck-apply', async (_e, payload) => {
  try {
    const snap = audioDevices.getAudioDevicesSnapshot();
    const proj = ensureCurrentProject(snap);
    const {
      classifications = [],
      importSoundcheckTakes = false,
      replaceExistingTracks = true,
      applyHardwareHints = false,
    } = payload || {};

    if (applyHardwareHints) {
      for (const item of classifications) {
        if (!item.includeTrack || item.profileId === 'unused') continue;
        const prof = getMicProfile(item.profileId);
        maybeApplyFocusriteHints(snap, item.inputLabel, prof);
      }
    }

    const applied = applyClassifiedDrumsetToProject(proj, classifications, {
      importSoundcheckTakes: Boolean(importSoundcheckTakes),
      replaceExistingTracks: Boolean(replaceExistingTracks),
    });
    currentProject = applied.project;
    const updatedSnap = applyHardwareHints ? audioDevices.getAudioDevicesSnapshot() : snap;
    return {
      ok: true,
      addedCount: applied.addedCount,
      project: currentProject,
      audioSnapshot: updatedSnap,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── Multi-Track Recording & Session Save/Open IPC ──────────────────────────

ipcMain.handle('daw:record-start', async (_e, payload) => {
  try {
    tapDetector.stop();
    const proj = ensureCurrentProject();
    if (payload?.projectMeta) {
      if (payload.projectMeta.name) proj.name = payload.projectMeta.name;
      if (payload.projectMeta.bpm) proj.bpm = Number(payload.projectMeta.bpm) || proj.bpm;
    }
    const startSec = Number(payload?.startSec || 0);
    const started = recorder.start(proj, {
      startSec,
      injectTestSignal: Boolean(payload?.injectTestSignal),
      onMeter: (m) => sendToRenderer('daw:record-progress', m),
    });
    return started;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:record-stop', async (_e, payload) => {
  try {
    const res = await recorder.stop({
      injectTestSignal: Boolean(payload?.injectTestSignal),
    });
    if (res.ok && res.project) {
      currentProject = res.project;
    }
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:record-cancel', async () => {
  try {
    const res = await recorder.cancel();
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:project-new', async (_e, payload) => {
  try {
    tapDetector.stop();
    if (recorder.isRecording()) await recorder.stop();
    const snap = audioDevices?.getAudioDevicesSnapshot?.() || null;
    currentProject = createEmptyProject({
      name: payload?.name || 'Untitled Drum & Studio Session',
      bpm: Number(payload?.bpm) || 120,
      sampleRate: snap?.clock?.effectiveRate || 48000,
    });
    return { ok: true, project: currentProject, savedProjects: listProjects() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:project-save', async (_e, payload) => {
  try {
    const proj = ensureCurrentProject();
    if (payload?.name) proj.name = String(payload.name);
    if (payload?.bpm) proj.bpm = Number(payload.bpm) || proj.bpm;

    let targetDir = payload?.targetDir || undefined;
    if (payload?.saveAsDialog && mainWindow && !mainWindow.isDestroyed()) {
      const defaultPath = path.join(getProjectsRoot(), proj.id || 'my-studio-session');
      fs.mkdirSync(getProjectsRoot(), { recursive: true });
      const res = await dialog.showSaveDialog(mainWindow, {
        title: 'Save RobOS DAW Studio Session Folder',
        defaultPath,
        buttonLabel: 'Save Session Here',
      });
      if (res.canceled || !res.filePath) {
        return { ok: false, canceled: true };
      }
      targetDir = res.filePath.endsWith('.json') ? path.dirname(res.filePath) : res.filePath;
    }

    const saved = saveProject(proj, { targetDir });
    currentProject = saved.project;
    return {
      ok: true,
      project: currentProject,
      manifestFile: saved.manifestFile,
      savedProjects: listProjects(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:project-open', async (_e, payload) => {
  try {
    tapDetector.stop();
    if (recorder.isRecording()) await recorder.stop();

    let idOrPath = payload?.idOrPath || '';
    if (payload?.openDialog && mainWindow && !mainWindow.isDestroyed()) {
      fs.mkdirSync(getProjectsRoot(), { recursive: true });
      const res = await dialog.showOpenDialog(mainWindow, {
        title: 'Open RobOS DAW Studio Project (project.json)',
        defaultPath: getProjectsRoot(),
        properties: ['openFile'],
        filters: [{ name: 'RobOS DAW Project', extensions: ['json'] }],
      });
      if (res.canceled || !res.filePaths?.length) {
        return { ok: false, canceled: true };
      }
      idOrPath = res.filePaths[0];
    }

    const loaded = loadProject(idOrPath);
    currentProject = loaded.project;
    return {
      ok: true,
      project: currentProject,
      manifestFile: loaded.manifestFile,
      savedProjects: listProjects(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:project-list', async () => {
  try {
    return { ok: true, ...listProjects() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:add-blank-tracks', async (_e, payload) => {
  try {
    const snap = audioDevices?.getAudioDevicesSnapshot?.() || null;
    const proj = ensureCurrentProject(snap);
    const count = Math.max(1, Math.min(32, Number(payload?.count) || 1));
    const profileId = payload?.profileId || 'acoustic-inst';
    const isBlank = payload?.blank !== false && !payload?.profileId;
    const armed = payload?.armed !== false;
    const afterTrackId = payload?.afterTrackId || null;

    const orderedInputs = getOrderedCaptureInputs(snap);
    const usedInputs = new Set((proj.tracks || []).map(t => t.inputNodeName).filter(Boolean));
    const addedTracks = [];
    const palette = ['#06b6d4', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#ec4899'];

    let insertIdx = proj.tracks.length;
    if (afterTrackId) {
      const foundIdx = proj.tracks.findIndex(t => t.id === afterTrackId);
      if (foundIdx !== -1) insertIdx = foundIdx + 1;
    }

    for (let i = 0; i < count; i++) {
      let chosenInp = orderedInputs.find(inp => !usedInputs.has(inp.name));
      if (!chosenInp && orderedInputs.length) {
        chosenInp = orderedInputs[(proj.tracks.length + i) % orderedInputs.length];
      }
      if (chosenInp) usedInputs.add(chosenInp.name);

      const trackNumber = proj.tracks.length + i + 1;
      const trk = buildTrackFromWizard({
        profileId,
        name: isBlank ? `Audio ${trackNumber}` : undefined,
        inputNodeName: chosenInp?.name || '',
        inputLabel: chosenInp?.description || 'Default PipeWire Input',
        armed,
        pan: 0,
        fxOverride: isBlank ? {
          openSourcePlugins: ['LSP Parametric Equalizer x8 Mono (LV2)', 'Calf Compressor (LV2)'],
          phaseInvert: false,
          gate: { enabled: false, thresholdDb: -45 },
          eq: { enabled: false, hpfHz: 40, lowFreqHz: 100, lowGainDb: 0, midFreqHz: 800, midGainDb: 0, midQ: 1.2, highFreqHz: 6000, highGainDb: 0 },
          compressor: { enabled: false, thresholdDb: -18, ratio: 2.5, attackMs: 12, releaseMs: 120 },
          drive: { enabled: false, amount: 0 },
        } : undefined,
        soundReplacement: isBlank ? {
          supported: true,
          enabled: false,
          kitId: 'gm-rock-kit',
          pieceId: 'snare',
          thresholdDb: -28,
          blend: 0.75,
          minIntervalMs: 65,
        } : undefined,
      });
      if (isBlank) {
        trk.color = palette[(trackNumber - 1) % palette.length];
      }
      addedTracks.push(trk);
    }

    proj.tracks.splice(insertIdx, 0, ...addedTracks);
    return {
      ok: true,
      project: proj,
      addedTracks,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:import-audio-files', async (_e, payload) => {
  try {
    const snap = audioDevices?.getAudioDevicesSnapshot?.() || null;
    const proj = ensureCurrentProject(snap);
    let filePaths = Array.isArray(payload?.filePaths) ? payload.filePaths : null;

    if (!filePaths && mainWindow && !mainWindow.isDestroyed()) {
      const res = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Audio WAV File(s) into Session',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'WAV Audio Stems', extensions: ['wav'] }],
      });
      if (res.canceled || !res.filePaths?.length) {
        return { ok: false, canceled: true };
      }
      filePaths = res.filePaths;
    }

    if (!filePaths?.length) return { ok: false, canceled: true };

    const projDir = proj.projectDir || path.join(getProjectsRoot(), proj.id);
    const takesDir = path.join(projDir, 'takes');
    fs.mkdirSync(takesDir, { recursive: true });
    proj.projectDir = projDir;

    const startSec = Math.max(0, Number(payload?.startSec) || 0);
    const targetTrackId = payload?.targetTrackId || null;
    const importedClipIds = [];
    const createdTrackIds = [];

    for (let i = 0; i < filePaths.length; i++) {
      const srcPath = filePaths[i];
      if (!fs.existsSync(srcPath)) continue;
      const baseTitle = path.basename(srcPath, path.extname(srcPath));
      const clipId = `clip-${crypto.randomBytes(4).toString('hex')}`;
      const destFileName = `${clipId}-${path.basename(srcPath).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const destPath = path.join(takesDir, destFileName);
      fs.copyFileSync(srcPath, destPath);

      const wavBuf = fs.readFileSync(destPath);
      const peakInfo = computeWaveformPeaks(wavBuf, 160);
      const transients = detectDrumTransients(wavBuf, { thresholdDb: -28, minIntervalMs: 65 });

      let destTrack = (filePaths.length === 1 && targetTrackId)
        ? proj.tracks.find(t => t.id === targetTrackId)
        : null;
      if (!destTrack) {
        destTrack = buildTrackFromWizard({
          profileId: 'acoustic-inst',
          name: baseTitle.slice(0, 32) || `Imported ${proj.tracks.length + 1}`,
          armed: false,
        });
        proj.tracks.push(destTrack);
        createdTrackIds.push(destTrack.id);
      }

      const clip = {
        id: clipId,
        name: baseTitle,
        wavFile: destPath,
        relativeWavPath: path.join('takes', destFileName),
        fileExists: true,
        startSec,
        offsetSec: 0,
        durationSec: Number((peakInfo.durationSec || 1).toFixed(3)),
        sourceDurationSec: Number((peakInfo.durationSec || 1).toFixed(3)),
        peakDb: peakInfo.peakDb,
        gainDb: 0,
        fadeInSec: 0,
        fadeOutSec: 0,
        muted: false,
        peaks: peakInfo.peaks,
        transients,
      };
      destTrack.clips.push(clip);
      importedClipIds.push(clip.id);
    }

    return {
      ok: true,
      project: proj,
      importedClipIds,
      createdTrackIds,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:export-mixdown-wav', async (_e, payload) => {
  try {
    const { wavBase64, defaultName = 'mixdown.wav', targetFile } = payload || {};
    if (!wavBase64) throw new Error('Missing mixdown WAV buffer');

    let outPath = targetFile || '';
    if (!outPath && mainWindow && !mainWindow.isDestroyed()) {
      const home = process.env.HOME || os.homedir();
      const res = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Stereo Mixdown (.wav)',
        defaultPath: path.join(home, defaultName),
        filters: [{ name: 'WAV Audio', extensions: ['wav'] }],
      });
      if (res.canceled || !res.filePath) {
        return { ok: false, canceled: true };
      }
      outPath = res.filePath.endsWith('.wav') ? res.filePath : `${res.filePath}.wav`;
    }
    if (!outPath) return { ok: false, canceled: true };

    const bytes = Buffer.from(wavBase64, 'base64');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, bytes);
    return { ok: true, filePath: outPath, bytes: bytes.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('daw:open-session-folder', async () => {
  try {
    const proj = ensureCurrentProject();
    const projDir = proj.projectDir || path.join(getProjectsRoot(), proj.id);
    fs.mkdirSync(projDir, { recursive: true });
    await shell.openPath(projDir);
    return { ok: true, projectDir: projDir };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  // Watch USB ALSA card hotplug via 0.02ms /proc/asound/cards kernel read (never block main thread during recording!)
  lastProcCardsSignature = readProcCardsSignature();
  hotplugTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !audioDevices) return;
    if (recorder.isRecording() || soundcheckRecorder.isRecording()) return;
    try {
      const procSig = readProcCardsSignature();
      if (procSig === lastProcCardsSignature) return;
      lastProcCardsSignature = procSig;
      const snap = audioDevices.getAudioDevicesSnapshot();
      const sig = computeSignature(snap);
      if (lastUsbSignature && sig !== lastUsbSignature) {
        lastUsbSignature = sig;
        mainWindow.webContents.send('daw:hardware-changed', snap);
      } else if (!lastUsbSignature) {
        lastUsbSignature = sig;
      }
    } catch {}
  }, 2500);
});

app.on('window-all-closed', () => {
  tapDetector.stop();
  if (hotplugTimer) clearInterval(hotplugTimer);
  app.quit();
});

'use strict';

// RobOS Personality: an AI character you talk to. It is built from parts:
//
//   face    an animated face whose mouth moves when it talks, shown in the app,
//           in a desktop window on any monitor, or cast to a TV (lib/cast.js)
//   voice   RobOS Voice's speech engines (Kokoro, Piper, Edge TTS), played on
//           the chosen sound device, with captions on the face
//   ears    a microphone; RobOS Voice's Whisper turns speech into words, which
//           show on the face as they are heard
//   eyes    a RobOS Camera Watch camera; the face shows a picture-in-picture of
//           what it sees and the model gets the latest picture (lib/eyes.js)
//   model   the AI agent that thinks for it (<robos-agent-selector>)

let app, BrowserWindow, ipcMain, dialog, screen;
try {
  ({ app, BrowserWindow, ipcMain, dialog, screen } = require('electron'));
} catch (error) {
  if (process.versions.electron) throw error;
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const { createStore } = require('./lib/store');
const { buildPrompt, parseReply, testReply } = require('./lib/brain');
const { createEyes } = require('./lib/eyes');
const { createStageServer } = require('./lib/stage-server');
const { createCast } = require('./lib/cast');

const APP_ID = 'personality';
const DEBUG_PORT = 19222;
const STAGE_PORT = Number(process.env.PERSONALITY_STAGE_PORT ?? 19223);
const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');
const TEST = process.env.ROBOS_TEST === '1';
// The stand-in model answers without an agent CLI (tests and demos).
const TEST_BRAIN = process.env.PERSONALITY_TEST_BRAIN === '1';
const MODEL_TIMEOUT_MS = 120000;

// Shared RobOS modules: the repo checkout in development, the installed copy on the VM.
function requireShared(...relPaths) {
  for (const rel of relPaths) {
    const candidates = [
      process.env.ROBOS_LIB_PATH && rel.startsWith('robos-lib/') && path.join(process.env.ROBOS_LIB_PATH, rel.slice('robos-lib/'.length)),
      path.resolve(__dirname, '..', rel),
      path.join('/usr/local/share/robos', rel),
    ].filter(Boolean);
    for (const p of candidates) {
      try {
        return require(p);
      } catch {}
    }
  }
  return null;
}

const logger = requireShared('robos-lib/logger');
try {
  logger?.setupGlobalErrorHandlers?.('robos-personality', dialog);
} catch {}
const log = (obj) => {
  try { console.log(JSON.stringify({ app: APP_ID, time: new Date().toISOString(), ...obj })); } catch {}
};

const domSnapshot = requireShared('robos-lib/dom-snapshot');
const tvEngineModule = requireShared('robos-lib/tv-engine');
const agentProviders = requireShared('robos-agent-client/providers');
const agentOneShot = requireShared('robos-agent-client/one-shot');
const aiAgent = requireShared('robos-lib/ai-agent');
const ttsModule = requireShared('voice-prompt/lib/tts-engine');
const sttModule = requireShared('voice-prompt/lib/stt-engine');

const tvEngine = tvEngineModule
  ? tvEngineModule.createTvEngine({ configDir: CONFIG_DIR, portalPort: tvEngineModule.DEFAULT_PORTAL_PORT })
  : null;
const lanIp = () => (tvEngineModule ? tvEngineModule.detectLanIp() : '127.0.0.1');

const store = createStore({ configDir: CONFIG_DIR });
const eyes = createEyes({ configDir: CONFIG_DIR, requireShared });

let tts;
function getTts() {
  if (tts === undefined) tts = ttsModule && ttsModule.TTSEngine ? new ttsModule.TTSEngine() : null;
  return tts;
}
let stt;
function getStt() {
  if (stt === undefined) stt = sttModule && sttModule.STTEngine ? new sttModule.STTEngine({ backgroundMode: false }) : null;
  return stt;
}

// ── Live stage: what every face display shows ──────────────────────────────

const stageState = {
  activity: 'idle',
  mood: 'happy',
  caption: null,
  heard: null,
  sight: null,
};
let listening = false;

function stageSnapshot() {
  const p = store.active();
  return {
    name: p.name,
    face: p.face,
    captions: p.voice.captions,
    pip: p.eyes.pip,
    ...stageState,
  };
}

const stage = createStageServer({
  port: STAGE_PORT,
  getState: stageSnapshot,
  getSight: () => eyes.frame(),
  log,
});

const cast = createCast({
  BrowserWindow,
  screen: null, // set once Electron is ready
  stage,
  tvEngine,
  getLanIp: lanIp,
  getName: () => store.active().name,
  iconPath: path.join(__dirname, 'icon.svg'),
  log,
});

let mainWindow = null;
function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function setActivity(activity) {
  if (stageState.activity === activity) return;
  stageState.activity = activity;
  stage.broadcast('activity', { activity });
  sendToRenderer('personality:activity', { activity });
}

function restingActivity() {
  return listening ? 'listening' : 'idle';
}

function setMood(mood) {
  stageState.mood = mood;
  stage.broadcast('mood', { mood });
}

function publishStage() {
  stage.broadcast('state', stageSnapshot());
}

let lastSightBroadcast = 0;
function publishSight(force = false) {
  const p = store.active();
  const frame = eyes.frame();
  const at = eyes.frameAt();
  const next = frame && p.eyes.pip ? { at, cameraName: eyes.cameraName() } : null;
  if (!force && next && Date.now() - lastSightBroadcast < 500) return;
  lastSightBroadcast = Date.now();
  stageState.sight = next;
  stage.broadcast('sight', next || { at: 0 });
  sendToRenderer('personality:sight', next);
}

eyes.on('frame', () => publishSight());
eyes.on('status', (status) => {
  sendToRenderer('personality:eyes', status);
  if (status.state !== 'live') publishSight(true);
});

// ── Voice ──────────────────────────────────────────────────────────────────

function enginesInstalled() {
  const home = HOME_DIR;
  const onPath = (bin) => (process.env.PATH || '').split(path.delimiter).some((d) => {
    try { fs.accessSync(path.join(d, bin), fs.constants.X_OK); return true; } catch { return false; }
  });
  return {
    kokoro: fs.existsSync(path.join(home, '.local/share/kokoro/kokoro-v1.0.onnx')),
    piper: fs.existsSync(path.join(home, '.local/share/piper/voices/en_US-lessac-medium/en_US-lessac-medium.onnx')),
    'edge-tts': onPath('edge-tts') || fs.existsSync(path.join(home, '.local/bin/edge-tts')),
  };
}

let currentSpeech = null; // { id, text, words }

async function speak(text, mood = 'happy') {
  const p = store.active();
  const id = crypto.randomBytes(6).toString('hex');
  let audioUrl = null;
  let durationMs = 0;
  let engine = 'captions';
  let voiceNote = '';
  const engineMod = TEST ? null : getTts();
  const testVoice = TEST && process.env.PERSONALITY_TEST_VOICE_WAV;
  if (testVoice) {
    // Tests play a fixed recording so the audio-driven lip sync runs without a speech engine.
    stage.addVoice(id, testVoice);
    audioUrl = `http://127.0.0.1:${stage.port}${stage.voiceUrl(id)}`;
    engine = 'test-voice';
  } else if (engineMod) {
    try {
      const res = await engineMod.synthesize(text, { engine: p.voice.engine, voice: p.voice.voice, speed: p.voice.speed });
      if (res && res.ok && res.engine !== 'fallback' && res.filePath) {
        stage.addVoice(id, res.filePath);
        audioUrl = `http://127.0.0.1:${stage.port}${stage.voiceUrl(id)}`;
        durationMs = res.durationMs || 0;
        engine = res.engine;
      } else {
        voiceNote = (res && res.errors || []).map((e) => `${e.engine}: ${e.error}`).join('; ') || 'No speech engine produced audio.';
      }
    } catch (err) {
      voiceNote = err.message;
    }
  } else if (!TEST) {
    voiceNote = 'RobOS Voice is not installed, so the personality shows captions only.';
  }
  currentSpeech = { id, text, words: 0 };
  setMood(mood);
  stageState.caption = { id, text, words: 0, done: false };
  stage.broadcast('caption', stageState.caption);
  setActivity('speaking');
  sendToRenderer('personality:speak', { id, text, mood, audioUrl, durationMs, engine, voiceNote });
  return { id, engine };
}

function speechProgress({ id, mouth, words }) {
  if (!currentSpeech || currentSpeech.id !== id) return;
  stage.broadcast('mouth', { v: Math.round((Number(mouth) || 0) * 100) / 100 });
  if (Number.isFinite(words) && words !== currentSpeech.words) {
    currentSpeech.words = words;
    stageState.caption = { id, text: currentSpeech.text, words, done: false };
    stage.broadcast('caption', stageState.caption);
  }
}

function speechDone({ id }) {
  if (!currentSpeech || currentSpeech.id !== id) return;
  stageState.caption = { id, text: currentSpeech.text, done: true };
  stage.broadcast('caption', stageState.caption);
  stage.broadcast('mouth', { v: 0 });
  currentSpeech = null;
  setActivity(restingActivity());
}

// ── Model ──────────────────────────────────────────────────────────────────

let thinking = false;

async function askModel(personality, prompt, cwd, ctx) {
  if (TEST_BRAIN) {
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true, text: testReply(ctx) };
  }
  const m = personality.model || {};
  if (agentOneShot && m.provider) {
    return agentOneShot.ask({ provider: m.provider, model: m.model || '', effort: m.effort || '', prompt, timeoutMs: MODEL_TIMEOUT_MS, cwd });
  }
  if (aiAgent) return aiAgent.ask(prompt, { timeoutMs: MODEL_TIMEOUT_MS, cwd });
  return { ok: false, error: 'No AI agent is set up. Pick one under Model.' };
}

async function talk(text, { viaEars = false } = {}) {
  const message = String(text || '').trim().slice(0, 2000);
  if (!message) throw new Error('Say or type something first.');
  if (thinking) throw new Error('Still thinking about the last thing you said.');
  thinking = true;
  const p = store.active();
  const history = store.history(p.id);
  const userTurn = { role: 'user', text: message, viaEars };
  store.appendHistory(p.id, userTurn);
  sendToRenderer('personality:turn', { personalityId: p.id, ...userTurn, at: new Date().toISOString() });
  setActivity('thinking');
  setMood('thinking');

  // The model reads the eyes' latest picture from its working directory.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-personality-'));
  let sight = null;
  const frame = eyes.frame();
  if (frame) {
    try {
      fs.writeFileSync(path.join(cwd, 'sight.jpg'), frame);
      sight = { cameraName: eyes.cameraName() || 'camera', file: 'sight.jpg' };
    } catch {}
  }
  const prompt = buildPrompt({ personality: p, history, message, viaEars, sight });
  const started = Date.now();
  let res;
  try {
    res = await askModel(p, prompt, cwd, { personality: p, message, sight });
  } catch (err) {
    res = { ok: false, error: err.message };
  } finally {
    thinking = false;
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {}
  }
  log({ msg: 'model answered', ok: res.ok, ms: Date.now() - started, provider: p.model.provider || 'default', sight: Boolean(sight) });

  if (!res.ok || !res.text) {
    const error = res.error || 'The AI agent gave no answer.';
    sendToRenderer('personality:turn', { personalityId: p.id, role: 'error', text: error, at: new Date().toISOString() });
    await speak("Sorry, I couldn't think of an answer just now.", 'sad');
    return { ok: false, error };
  }
  const reply = parseReply(res.text, p.name);
  if (!reply.say) reply.say = 'Hmm.';
  const turn = { role: 'assistant', text: reply.say, mood: reply.mood, saw: Boolean(sight) };
  store.appendHistory(p.id, turn);
  sendToRenderer('personality:turn', { personalityId: p.id, ...turn, at: new Date().toISOString() });
  await speak(reply.say, reply.mood);
  return { ok: true, reply };
}

// ── Ears ───────────────────────────────────────────────────────────────────

let earsBusy = false;
async function hear({ samples, final }) {
  const engine = getStt();
  if (!engine) throw new Error('RobOS Voice is not installed, so there is no speech recognition.');
  // Skip a live update while the last one is still being worked on.
  if (!final && earsBusy) return { text: null, skipped: true };
  earsBusy = true;
  let text = '';
  try {
    const data = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
    const res = await engine.transcribeAsync(data, {});
    text = String(res?.text || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  } finally {
    earsBusy = false;
  }
  return heardText(text, final);
}

function heardText(text, final) {
  if (text || final) {
    stageState.heard = text ? { text, final: Boolean(final) } : null;
    stage.broadcast('heard', stageState.heard || { text: '' });
  }
  if (final && text && !thinking && stageState.activity !== 'speaking') {
    talk(text, { viaEars: true }).catch((err) => sendToRenderer('personality:turn', { role: 'error', text: err.message, at: new Date().toISOString() }));
  }
  return { text };
}

// ── State for the app window ───────────────────────────────────────────────

async function appState() {
  const p = store.active();
  let voices = {};
  try { voices = getTts() ? await getTts().listVoices() : {}; } catch {}
  return {
    personalities: store.list().map(({ id, name }) => ({ id, name })),
    active: p,
    history: store.history(p.id),
    faceUrl: stage.port ? stage.localUrl('mode=embed') : '',
    stagePort: stage.port,
    cameras: eyes.listCameras(),
    cameraWatchInstalled: eyes.available,
    eyes: eyes.status(),
    sight: stageState.sight,
    voices,
    engines: enginesInstalled(),
    voiceInstalled: Boolean(ttsModule),
    earsInstalled: Boolean(sttModule),
    tvs: cast.listTvs(),
    tvStudioInstalled: Boolean(tvEngine),
    displays: cast.listDisplays(),
    faceWindowOpen: cast.windowOpen(),
    activity: stageState.activity,
    agentToolsInstalled: Boolean(agentOneShot || aiAgent),
    testBrain: TEST_BRAIN,
  };
}

function applyPersonality(p) {
  eyes.open(p.eyes.cameraId);
  publishStage();
  publishSight(true);
}

// ── IPC ────────────────────────────────────────────────────────────────────

function wrap(fn) {
  return async (_e, ...args) => {
    try {
      return { ok: true, result: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };
}

function registerIpc() {
  ipcMain.handle('personality:getState', () => appState());
  ipcMain.handle('personality:update', wrap((patch) => {
    const before = store.active();
    const p = store.update(patch || {});
    if (p.eyes.cameraId !== before.eyes.cameraId) eyes.open(p.eyes.cameraId);
    publishStage();
    if (p.eyes.pip !== before.eyes.pip) publishSight(true);
    return p;
  }));
  ipcMain.handle('personality:select', wrap((id) => {
    const p = store.setActive(id);
    applyPersonality(p);
    return p;
  }));
  ipcMain.handle('personality:create', wrap((name) => {
    const p = store.create(name);
    applyPersonality(p);
    return p;
  }));
  ipcMain.handle('personality:remove', wrap((id) => {
    const p = store.remove(id);
    applyPersonality(p);
    return p;
  }));
  ipcMain.handle('personality:talk', wrap((text) => talk(text)));
  ipcMain.handle('personality:clearHistory', wrap(() => store.clearHistory()));
  ipcMain.handle('personality:hear', wrap((payload) => hear(payload || {})));
  ipcMain.on('personality:ears', (_e, { listening: on, level }) => {
    if (on !== undefined && on !== listening) {
      listening = Boolean(on);
      if (stageState.activity === 'idle' || stageState.activity === 'listening' || stageState.activity === 'hearing') {
        setActivity(restingActivity());
      }
    }
    if (level !== undefined) stage.broadcast('ear-level', { v: Math.round(level * 1000) / 1000 });
  });
  ipcMain.on('personality:hearing', (_e, on) => {
    if (stageState.activity === 'listening' && on) setActivity('hearing');
    else if (stageState.activity === 'hearing' && !on) setActivity(restingActivity());
  });
  ipcMain.on('personality:speechProgress', (_e, msg) => speechProgress(msg || {}));
  ipcMain.on('personality:speechDone', (_e, msg) => speechDone(msg || {}));
  ipcMain.handle('personality:say', wrap((text) => speak(String(text || '').slice(0, 700) || 'Hello!', 'happy')));
  ipcMain.handle('personality:refreshCameras', () => eyes.listCameras());
  ipcMain.handle('personality:openFaceWindow', wrap((opts) => cast.openWindow(opts || {})));
  ipcMain.handle('personality:closeFaceWindow', wrap(() => cast.closeWindow()));
  ipcMain.handle('personality:listTvs', () => cast.listTvs());
  ipcMain.handle('personality:castTv', wrap((tvId) => cast.castToTv(tvId)));
  ipcMain.handle('personality:stopTv', wrap((tvId) => cast.stopTv(tvId)));
  ipcMain.handle('personality:agentProviders', async (_e, options) => {
    if (!agentProviders) return [];
    return agentProviders.options({ refresh: options?.refresh === true });
  });
  if (TEST) {
    // Tests stand in for the microphone and the camera.
    ipcMain.handle('personality:testHeard', wrap(({ text, final }) => heardText(String(text || ''), final !== false)));
    ipcMain.handle('personality:testSight', wrap(({ jpgBase64, cameraName }) => {
      eyes.inject(jpgBase64 ? Buffer.from(jpgBase64, 'base64') : null, cameraName);
      publishSight(true);
      return { injected: Boolean(jpgBase64) };
    }));
  }
}

// ── Window ─────────────────────────────────────────────────────────────────

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    title: 'RobOS Personality',
    width: 1380,
    height: 880,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
    // The face window and TV casts go with the app window.
    cast.stopAll();
  });
  // The microphone is the only permission the app asks for.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media' || permission === 'speaker-selection');
  });
  // Lets the device lists show microphone and speaker names.
  mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission) => permission === 'media' || permission === 'speaker-selection');
  if (domSnapshot) {
    try {
      domSnapshot.registerSnapshotIPC?.(mainWindow);
      domSnapshot.startDebugServer(mainWindow, DEBUG_PORT, APP_ID);
    } catch {}
  }
}

if (app) {
  app.setName('robos-personality');
  app.setPath('userData', path.join(CONFIG_DIR, 'electron', APP_ID));
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  // The voice plays as soon as the answer is ready, without a click first.
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  if (TEST) {
    app.commandLine.appendSwitch('use-fake-device-for-media-stream');
    // Tests never make sound; audio still plays through a silent output, so lip sync runs.
    app.commandLine.appendSwitch('disable-audio-output');
  }

  if (!TEST && app.requestSingleInstanceLock() === false) {
    app.quit();
  } else {
    app.on('second-instance', createWindow);
    app.whenReady().then(async () => {
      cast.setScreen(screen);
      registerIpc();
      try {
        await stage.start();
        log({ msg: 'face display ready', port: stage.port });
      } catch (err) {
        log({ msg: 'face display could not start', err: err.message });
      }
      eyes.open(store.active().eyes.cameraId);
      createWindow();
    });
    app.on('window-all-closed', async () => {
      eyes.close();
      await cast.shutdown();
      await stage.stop();
      app.quit();
    });
  }
}

module.exports = { store, stage, eyes };

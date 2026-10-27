'use strict';

let app, BrowserWindow, ipcMain, shell, dialog;
try {
  ({ app, BrowserWindow, ipcMain, shell, dialog } = require('electron'));
} catch (error) {
  if (process.versions.electron) throw error;
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { createPartyEngine, normalizeSettings, DEFAULT_SETTINGS } = require('./lib/game-engine');
const { createGameServer } = require('./lib/game-server');
const { createTvBridge } = require('./lib/tv-bridge');
const { createNarrationRouter } = require('./lib/narration-outputs');

const APP_ID = 'party-game';
const DEBUG_PORT = 19212;
const GAME_PORT = Number(process.env.ROBOS_PARTY_PORT || 19213);
const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');
const DATA_DIR = path.join(CONFIG_DIR, 'party-game');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const HISTORY_DIR = path.join(DATA_DIR, 'history');

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
  logger?.setupGlobalErrorHandlers?.('robos-party-game', dialog);
} catch {}
const log = (obj) => {
  try {
    console.log(JSON.stringify({ app: APP_ID, time: new Date().toISOString(), ...obj }));
  } catch {}
};

const domSnapshot = requireShared('robos-lib/dom-snapshot');
const tvEngineModule = requireShared('robos-lib/tv-engine');
const agentProviders = requireShared('robos-agent-client/providers');
const agentOneShot = requireShared('robos-agent-client/one-shot');
const aiAgent = requireShared('robos-lib/ai-agent');

const tvEngine = tvEngineModule
  ? tvEngineModule.createTvEngine({ configDir: CONFIG_DIR, portalPort: tvEngineModule.DEFAULT_PORTAL_PORT })
  : null;
const lanIp = () => (tvEngineModule ? tvEngineModule.detectLanIp() : '127.0.0.1');

// ── Settings ───────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
  } catch {
    return normalizeSettings({});
  }
}

function saveSettings(settings) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (err) {
    log({ msg: 'could not save settings', err: err.message });
  }
}

// ── AI host (required) ─────────────────────────────────────────────────────
// The host picks the agent in <robos-agent-selector>; every AI call runs that
// agent's CLI through robos-agent-client (which applies the Prompt Security
// Guard). robos-lib/ai-agent (the user's active agent) is the fallback when the
// agent client is not installed.

// Every call runs in the background ahead of when it is needed, so the
// timeout is generous: the show script is a long answer.
const AGENT_TIMEOUT_MS = 150000;

async function askAgent(prompt) {
  const agent = engine.state.settings.agent || {};
  const started = Date.now();
  let res = null;
  if (agentOneShot && agent.provider) {
    res = await agentOneShot.ask({ provider: agent.provider, model: agent.model || '', effort: agent.effort || '', prompt, timeoutMs: AGENT_TIMEOUT_MS });
  } else if (aiAgent) {
    res = await aiAgent.ask(prompt, { timeoutMs: AGENT_TIMEOUT_MS });
  }
  const ms = Date.now() - started;
  if (!res || !res.ok) log({ msg: 'agent call failed', provider: agent.provider, ms, err: res?.error || 'no agent', prompt: prompt.slice(0, 80) });
  else log({ msg: 'agent call', provider: agent.provider, ms, chars: (res.text || '').length });
  return res && res.ok ? res.text : null;
}

async function checkAgent(agent) {
  if (!agent || !agent.provider) return { ok: false, reason: 'Pick an AI agent to host the party' };
  if (!agentProviders) {
    return aiAgent ? { ok: true } : { ok: false, reason: 'RobOS agent tools are not installed (robos-agent-client)' };
  }
  const list = await agentProviders.options({ refresh: false });
  const provider = (list || []).find((p) => p.id === agent.provider);
  if (!provider) return { ok: false, reason: `AI agent "${agent.provider}" is not installed` };
  if (!provider.available) return { ok: false, reason: provider.error || `${provider.label || agent.provider} is not signed in` };
  return { ok: true };
}

// ── Narration audio (RobOS Voice) ──────────────────────────────────────────

let ttsEngine;
function getTts() {
  if (ttsEngine === undefined) {
    const mod = requireShared('voice-prompt/lib/tts-engine');
    ttsEngine = mod && mod.TTSEngine ? new mod.TTSEngine() : null;
  }
  return ttsEngine;
}

// ── Engine, server, TVs ────────────────────────────────────────────────────

let gamePort = GAME_PORT;
let portalPort = tvEngineModule ? tvEngineModule.DEFAULT_PORTAL_PORT : 19210;
const engine = createPartyEngine({ settings: loadSettings(), ai: askAgent, checkAgent });
const server = createGameServer({
  engine,
  port: GAME_PORT,
  log,
  getNarrationAudio: (id, format) => narration.clip(id, format),
});
// The host's voice goes to this computer, the TVs and/or an Audio Player speaker.
const narration = createNarrationRouter({
  engine,
  getTts,
  tvEngine,
  castModule: requireShared('audio-player/lib/cast-service'),
  audioPlayer: (() => {
    const control = requireShared('audio-player/lib/control-server');
    return control ? control.createAudioPlayerClient({ configDir: CONFIG_DIR }) : null;
  })(),
  configDir: CONFIG_DIR,
  getLanIp: lanIp,
  getGamePort: () => gamePort,
  log,
});
const bridge = createTvBridge({
  tvEngine,
  BrowserWindow,
  getGamePort: () => gamePort,
  getLanIp: lanIp,
  getPortalPort: () => portalPort,
  log,
});

let mainWindow = null;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function hostState() {
  return {
    ...engine.hostView(),
    gamePort,
    joinUrl: engine.state.joinUrl,
    tvPreviewBase: `http://127.0.0.1:${gamePort}/tv`,
    availableTvs: bridge.listTvs(),
    framesStreaming: bridge.streaming(),
    voiceAvailable: Boolean(getTts()),
    speakers: narration.listSpeakers(),
    speakersAvailable: narration.speakersAvailable(),
    agentToolsInstalled: Boolean(agentOneShot || aiAgent),
  };
}

let statePending = null;
engine.events.on('change', () => {
  if (statePending) return;
  statePending = setImmediate(() => {
    statePending = null;
    sendToRenderer('party:state', hostState());
  });
});

engine.events.on('log', log);

engine.events.on('narration', (n) => {
  narration.handle(n);
  sendToRenderer('party:narration', n);
});

engine.events.on('change', (state) => {
  if (state.phase === 'finale' && !state.savedAt) {
    state.savedAt = new Date().toISOString();
    try {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
      fs.writeFileSync(path.join(HISTORY_DIR, `${state.id}.json`), JSON.stringify(engine.summary(), null, 2));
    } catch {}
  }
});

// ── IPC ────────────────────────────────────────────────────────────────────

function wrap(fn) {
  return async (_e, ...args) => {
    try {
      const result = await fn(...args);
      return { ok: true, result, state: hostState() };
    } catch (err) {
      return { ok: false, error: err.message, state: hostState() };
    }
  };
}

function registerIpc() {
  ipcMain.handle('party:getState', async () => hostState());
  ipcMain.handle('party:updateSettings', wrap((patch) => {
    const s = engine.updateSettings(patch || {});
    saveSettings(s);
    return s;
  }));
  ipcMain.handle('party:resetSettings', wrap(() => {
    const s = engine.updateSettings({ ...DEFAULT_SETTINGS });
    saveSettings(s);
    return s;
  }));
  ipcMain.handle('party:selectTvs', wrap((selection) => {
    const tvs = bridge.listTvs();
    return engine.selectTvs((selection || []).map((sel) => {
      const tv = tvs.find((t) => t.id === sel.tvId) || {};
      return { tvId: sel.tvId, screen: sel.screen, name: tv.name, platformId: tv.platformId };
    }));
  }));
  ipcMain.handle('party:openLobby', wrap(async () => {
    await engine.openLobby();
    return bridge.castAll(engine.state.tvs);
  }));
  ipcMain.handle('party:recast', wrap(() => bridge.castAll(engine.state.tvs)));
  ipcMain.handle('party:addGuest', wrap((name) => {
    return engine.addGuest({ name }).then((g) => ({ id: g.id, name: g.name }));
  }));
  ipcMain.handle('party:removeGuest', wrap((id) => engine.removeGuest(id)));
  ipcMain.handle('party:getGuestSurvey', wrap((id) => {
    const g = engine.state.guests.find((x) => x.id === id);
    if (!g) throw new Error('Unknown guest');
    return { questions: engine.questions(), answers: g.answers, name: g.name };
  }));
  ipcMain.handle('party:submitSurvey', wrap((id, answers) => engine.submitSurvey(id, answers)));
  ipcMain.handle('party:setPartyHost', wrap((id) => engine.setPartyHost(id)));
  ipcMain.handle('party:submitHouse', wrap((answers) => engine.submitHouse(engine.state.partyHostId, answers)));
  ipcMain.handle('party:next', wrap(() => engine.next().then(() => null)));
  ipcMain.handle('party:skipRound', wrap(() => engine.skipRound()));
  ipcMain.handle('party:reset', wrap(() => engine.resetGame({ keepGuests: true })));
  ipcMain.handle('party:endParty', wrap(() => {
    bridge.stopAll();
    engine.resetGame({ keepGuests: false });
    engine.state.phase = 'setup';
    return null;
  }));
  ipcMain.handle('party:openExternal', wrap((url) => {
    if (!/^http:\/\/(127\.0\.0\.1|localhost|[\d.]+):\d+\//.test(String(url))) throw new Error('Only party URLs can be opened');
    return shell.openExternal(url);
  }));
  ipcMain.handle('party:scanSpeakers', wrap(() => narration.scanSpeakers()));
  ipcMain.handle('party:agentProviders', async (_e, options) => {
    if (!agentProviders) return [];
    return agentProviders.options({ refresh: options?.refresh === true });
  });
}

// ── Window ─────────────────────────────────────────────────────────────────

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'RobOS Party Game',
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
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
  });
  if (domSnapshot) {
    try {
      domSnapshot.registerSnapshotIPC?.(mainWindow);
      domSnapshot.startDebugServer(mainWindow, DEBUG_PORT, APP_ID);
    } catch {}
  }
}

if (app) {
  const userDataDir = path.join(CONFIG_DIR, 'electron', APP_ID);
  app.setName('robos-party-game');
  app.setPath('userData', userDataDir);
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  // Narration plays on the host speakers without a click first.
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  if (process.env.ROBOS_TEST !== '1' && app.requestSingleInstanceLock() === false) {
    app.quit();
  } else {
    app.on('second-instance', createWindow);
    app.whenReady().then(async () => {
      registerIpc();
      try {
        // Reuses :19210 when Smart TV Studio or Dashboards already serves the portal.
        const portal = tvEngine ? await tvEngine.startPortalServer() : null;
        if (portal && portal.port) portalPort = portal.port;
      } catch (err) {
        log({ msg: 'TV portal unavailable', err: err.message });
      }
      gamePort = await server.start();
      engine.setJoinUrl(`http://${lanIp()}:${gamePort}/join`);
      log({ msg: 'party server listening', port: gamePort, joinUrl: engine.state.joinUrl });
      createWindow();
    });
    app.on('window-all-closed', async () => {
      bridge.stopAll();
      narration.stop();
      await server.stop();
      try {
        await tvEngine?.stopPortalServer();
      } catch {}
      app.quit();
    });
  }
}

module.exports = { engine, server, bridge };

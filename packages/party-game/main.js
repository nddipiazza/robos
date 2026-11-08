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
const { spawn } = require('node:child_process');

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
const TVS_FILE = path.join(DATA_DIR, 'tvs.json');
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
const peopleStore = requireShared('robos-lib/people-store');

const tvEngine = tvEngineModule
  ? tvEngineModule.createTvEngine({ configDir: CONFIG_DIR, portalPort: tvEngineModule.DEFAULT_PORTAL_PORT })
  : null;
const lanIp = () => (tvEngineModule ? tvEngineModule.detectLanIp() : '127.0.0.1');

// ── Settings ───────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    const legacyIds = new Set(['who-said-that', 'most-likely-to', 'house-quest', 'interest-trivia', 'truth-or-bot']);
    if (Array.isArray(raw.miniGames) && raw.miniGames.every((id) => legacyIds.has(id))) {
      raw.miniGames = [...DEFAULT_SETTINGS.miniGames];
    }
    return normalizeSettings(raw);
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

function loadSelectedTvs() {
  try {
    const raw = JSON.parse(fs.readFileSync(TVS_FILE, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveSelectedTvs(tvs) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TVS_FILE, JSON.stringify(tvs || [], null, 2));
  } catch {}
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
// Pre-warm the persistent Kokoro-82M neural worker immediately on app launch
if (process.env.ROBOS_TEST !== '1') {
  try { getTts(); } catch {}
}

// ── Engine, server, TVs ────────────────────────────────────────────────────

let gamePort = GAME_PORT;
let portalPort = tvEngineModule ? tvEngineModule.DEFAULT_PORTAL_PORT : 19210;
const engine = createPartyEngine({ settings: loadSettings(), ai: askAgent, checkAgent });
const server = createGameServer({
  engine,
  port: GAME_PORT,
  log,
  peopleStore,
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
const controllerWindows = new Map(); // guestId -> BrowserWindow

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function listRobosUsers() {
  if (!peopleStore) return [];
  try {
    const people = peopleStore.loadAllPeople();
    return people.map((p) => {
      const gp = peopleStore.buildPartyGuestProfile(p);
      const existing = engine.state.guests.find((g) => g.userId === p.uid || g.name.toLowerCase() === String(p.name || '').toLowerCase());
      return {
        uid: p.uid,
        name: p.name,
        title: p.title || '',
        gamerTag: gp.gamerTag || '',
        archetype: gp.archetype || '',
        rpgCharacter: gp.rpgCharacter || '',
        avatar: gp.avatar,
        color: gp.color,
        photoUrl: p.photo ? `http://127.0.0.1:${gamePort}/api/user-photo/${encodeURIComponent(p.uid)}` : null,
        preferredRole: gp.preferredRole || null,
        surveyAnsweredCount: Object.keys(gp.surveyAnswers || {}).length,
        customFactsCount: (gp.customFacts || []).length,
        hasHouseDefaults: Boolean(gp.houseDefaults && Object.keys(gp.houseDefaults).length),
        joinedGuestId: existing ? existing.id : null,
        isPartyHost: Boolean(existing && engine.state.partyHostId === existing.id),
      };
    });
  } catch (err) {
    log({ msg: 'listRobosUsers failed', err: err.message });
    return [];
  }
}

async function onboardUserByUid(uid, { setAsPartyHost = false, applyHouse = true } = {}) {
  if (!peopleStore) throw new Error('RobOS Users library is not available');
  const person = peopleStore.getPerson(uid);
  if (!person) throw new Error(`RobOS user "${uid}" not found`);
  const profile = peopleStore.buildPartyGuestProfile(person);
  const g = await engine.onboardUser(profile, { setAsPartyHost, applyHouse });
  return { id: g.id, userId: g.userId, name: g.name };
}

async function onboardGameNight({ openControllers = false } = {}) {
  if (!peopleStore) throw new Error('RobOS Users library is not available');
  peopleStore.ensureDefaultProfiles?.();
  // Ensure 2-player settings and AI agent are ready
  const curSettings = engine.state.settings;
  let agent = curSettings.agent;
  if (!agent || !agent.provider) {
    if (agentProviders) {
      const list = await agentProviders.options({ refresh: false }).catch(() => []);
      const avail = (list || []).find((p) => p.available) || (list || [])[0];
      if (avail) agent = { provider: avail.id, model: avail.defaultModel || '', effort: '' };
    }
    if (!agent || !agent.provider) agent = { provider: 'agy', model: '', effort: '' };
  }
  const nextSettings = engine.updateSettings({
    minGuests: 2,
    miniGames: [...DEFAULT_SETTINGS.miniGames],
    title: curSettings.title === 'RobOS Party Game' ? "Nick & Diana's Game Night" : curSettings.title,
    agent,
  });
  saveSettings(nextSettings);

  // Ensure at least one TV is selected so the lobby can open
  if (!engine.state.tvs.length) {
    const tvs = bridge.listTvs();
    const saved = loadSelectedTvs().filter((s) => tvs.some((t) => t.id === s.tvId));
    if (saved.length) {
      engine.selectTvs(saved.map((s) => {
        const tv = tvs.find((t) => t.id === s.tvId) || {};
        return { tvId: s.tvId, screen: s.screen || 'stage', name: tv.name, platformId: tv.platformId };
      }));
    } else {
      const pickTv = tvs.find((t) => t.id === 'tv-livingroom-tcl-roku') || tvs[0] || {
        id: 'preview-stage',
        name: 'Living Room Stage (Desktop Preview)',
        platformId: 'webos',
      };
      engine.selectTvs([{ tvId: pickTv.id, screen: 'stage', name: pickTv.name, platformId: pickTv.platformId }]);
    }
  }

  // Open lobby if currently in setup
  if (engine.state.phase === 'setup') {
    await engine.openLobby();
    await bridge.castAll(engine.state.tvs).catch(() => {});
  }

  // Onboard Nicholas (as Party Host with house survey defaults) and Diana
  const nick = await onboardUserByUid('nicholas-dipiazza', { setAsPartyHost: true, applyHouse: true });
  const diana = await onboardUserByUid('diana-arrington', { setAsPartyHost: false, applyHouse: false });

  if (openControllers) {
    openGuestControllerWindow(nick.id);
    openGuestControllerWindow(diana.id);
  }
  return { nick, diana };
}

function openGuestControllerWindow(guestId) {
  if (!BrowserWindow) throw new Error('Electron BrowserWindow unavailable');
  const g = engine.state.guests.find((x) => x.id === guestId);
  if (!g) throw new Error('Unknown guest');
  const existing = controllerWindows.get(g.id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { guestId: g.id, name: g.name };
  }
  const idx = engine.state.guests.findIndex((x) => x.id === g.id);
  const iconPng = path.join(__dirname, 'icon.png');
  const win = new BrowserWindow({
    title: `${g.name} — RobOS Party Game Controller`,
    width: 430,
    height: 820,
    x: 60 + (idx >= 0 ? idx * 450 : 0),
    y: 80,
    minWidth: 340,
    minHeight: 560,
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  const url = `http://127.0.0.1:${gamePort}/join?guest=${encodeURIComponent(g.id)}&token=${encodeURIComponent(g.token)}`;
  win.loadURL(url);
  controllerWindows.set(g.id, win);
  win.on('closed', () => controllerWindows.delete(g.id));
  return { guestId: g.id, name: g.name, url };
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
    robosUsers: listRobosUsers(),
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
  ipcMain.handle('party:selectTvs', wrap(async (selection) => {
    bridge.stopAll();
    const tvs = bridge.listTvs();
    const nextTvs = engine.selectTvs((selection || []).map((sel) => {
      const tv = tvs.find((t) => t.id === sel.tvId) || {};
      return { tvId: sel.tvId, screen: sel.screen, name: tv.name, platformId: tv.platformId };
    }));
    saveSelectedTvs(nextTvs);
    let castResults = [];
    if (engine.state.phase !== 'setup' && nextTvs.length) {
      castResults = await bridge.castAll(nextTvs);
    }
    return { tvs: nextTvs, castResults };
  }));
  ipcMain.handle('party:openLobby', wrap(async () => {
    await engine.openLobby();
    return bridge.castAll(engine.state.tvs);
  }));
  ipcMain.handle('party:recast', wrap(() => bridge.castAll(engine.state.tvs)));
  ipcMain.handle('party:addGuest', wrap((name) => {
    return engine.addGuest({ name }).then((g) => ({ id: g.id, name: g.name }));
  }));
  ipcMain.handle('party:onboardUser', wrap((opts) => {
    const uid = typeof opts === 'string' ? opts : opts?.uid;
    return onboardUserByUid(uid, {
      setAsPartyHost: Boolean(opts?.setAsPartyHost),
      applyHouse: opts?.applyHouse !== false,
    });
  }));
  ipcMain.handle('party:onboardGameNight', wrap((opts) => onboardGameNight(opts || {})));
  ipcMain.handle('party:openController', wrap((guestId) => openGuestControllerWindow(guestId)));
  ipcMain.handle('party:saveGuestToUserProfile', wrap((guestId) => {
    if (!peopleStore) throw new Error('RobOS Users library is not available');
    const g = engine.state.guests.find((x) => x.id === guestId);
    if (!g) throw new Error('Unknown guest');
    const uid = g.userId || g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = peopleStore.getPerson(uid) || { uid, name: g.name, avatar: g.avatar, color: g.color };
    existing.gameProfile = existing.gameProfile || {};
    existing.gameProfile.partyGame = existing.gameProfile.partyGame || {};
    existing.gameProfile.partyGame.surveyAnswers = { ...(existing.gameProfile.partyGame.surveyAnswers || {}), ...(g.answers || {}) };
    if (g.id === engine.state.partyHostId && engine.state.house && Object.keys(engine.state.house).length) {
      existing.gameProfile.partyGame.houseDefaults = { ...(existing.gameProfile.partyGame.houseDefaults || {}), ...engine.state.house };
    }
    peopleStore.savePerson(existing);
    g.userId = existing.uid;
    return { uid: existing.uid, name: existing.name };
  }));
  ipcMain.handle('party:openPeopleDirectory', wrap(() => {
    const { spawn } = require('node:child_process');
    const electronBin = path.resolve(__dirname, '..', '..', 'scripts', 'source-shortcuts', 'node_modules', 'electron', 'dist', 'electron');
    const sourceHost = path.resolve(__dirname, '..', '..', 'scripts', 'source-shortcuts', 'source-host.cjs');
    const pdDir = path.resolve(__dirname, '..', 'people-directory');
    if (fs.existsSync(electronBin) && fs.existsSync(sourceHost)) {
      const child = spawn(electronBin, ['--no-sandbox', '--class=robos-source-people-directory', sourceHost, '--app=people-directory'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return { launched: true };
    }
    const child = spawn(process.execPath, [pdDir, '--no-sandbox'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { launched: true };
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
      const localJoinUrl = `http://${lanIp()}:${gamePort}/join`;
      engine.setJoinUrl(localJoinUrl);
      log({ msg: 'party server listening', port: gamePort, joinUrl: engine.state.joinUrl });
      let tunnelProc = null;
      if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_PARTY_DISABLE_TUNNEL !== '1') {
        try {
          tunnelProc = spawn('ssh', [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'UserKnownHostsFile=/dev/null',
            '-o', 'ServerAliveInterval=25',
            '-o', 'ExitOnForwardFailure=yes',
            '-T', '-R', `80:127.0.0.1:${gamePort}`,
            'nokey@localhost.run', '--', '--output', 'json',
          ], { stdio: ['ignore', 'pipe', 'pipe'] });
          tunnelProc.unref?.();
          let buf = '';
          tunnelProc.stdout.on('data', (chunk) => {
            buf += chunk.toString();
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
              const m = line.match(/https:\/\/[a-z0-9-]+\.lhr\.life/i);
              if (m) {
                const publicJoinUrl = `${m[0]}/join`;
                if (engine.state.joinUrl !== publicJoinUrl) {
                  engine.setJoinUrl(publicJoinUrl);
                  log({ msg: 'public HTTPS tunnel ready', joinUrl: publicJoinUrl, lanJoinUrl: localJoinUrl });
                  sendToRenderer('party:state', hostSnapshot());
                }
              }
            }
          });
          tunnelProc.stderr?.on('data', () => {});
        } catch {}
      }
      if (process.env.ROBOS_PARTY_AUTO_ONBOARD === '1') {
        try {
          await onboardGameNight({ openControllers: process.env.ROBOS_PARTY_OPEN_CONTROLLERS === '1' });
        } catch (err) {
          log({ msg: 'auto-onboard failed', err: err.message });
        }
      }
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

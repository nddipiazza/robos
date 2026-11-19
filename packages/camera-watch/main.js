'use strict';

// RobOS Camera Watch — watch and record the IP cameras on your network.
// Finds ONVIF cameras with WS-Discovery (the open-source `onvif` package),
// shows live video, detects motion, records clips and drives PTZ cameras.
// Video goes through ffmpeg; nothing is sent to any cloud.

let app, BrowserWindow, ipcMain, dialog, shell, Notification;
try {
  ({ app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron'));
} catch (error) {
  if (process.versions.electron) throw error;
  app = {
    requestSingleInstanceLock: () => true,
    commandLine: { appendSwitch: () => {} },
    setName: () => {},
    setPath: () => {},
    whenReady: () => new Promise(() => {}),
    on: () => {},
    quit: () => {},
  };
  BrowserWindow = class {};
  ipcMain = { handle: () => {} };
  dialog = {};
  shell = {};
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const APP_ID = 'camera-watch';
const SNAPSHOT_PORT = 19220;
const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');

try {
  const { setupGlobalErrorHandlers } = require('../robos-lib/logger');
  setupGlobalErrorHandlers(APP_ID, dialog);
} catch {
  try {
    const { setupGlobalErrorHandlers } = require('/usr/local/share/robos/robos-lib/logger');
    setupGlobalErrorHandlers(APP_ID, dialog);
  } catch {}
}

function requireShared(modName) {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, modName),
    path.resolve(__dirname, '..', 'robos-lib', modName),
    `/usr/local/share/robos/robos-lib/${modName}`,
  ].filter(Boolean)) {
    try {
      return require(p);
    } catch {}
  }
  throw new Error(`RobOS shared module "${modName}" not found.`);
}

let _debugServer = null;
try {
  _debugServer = requireShared('dom-snapshot');
} catch {}

const { createCameraManager } = require('./lib/camera-manager');
const { createWebShareStore, createCameraWebServer } = require('./lib/web-viewer');
const {
  syncCameraGoogleDoc,
  listRobosUsersWithShareStatus,
  shareWithRobosUser,
  revokeRobosUserShare,
} = require('./lib/google-doc-share');
const { startCloudflareTunnel } = require('./serve-web');

const manager = createCameraManager({
  configDir: CONFIG_DIR,
  homeDir: HOME_DIR,
  // Sharing cameras between RobOS machines uses the App Mesh / Private Networks engine.
  loadMesh: () => requireShared('app-mesh-engine'),
});
const webShareStore = createWebShareStore({ configDir: CONFIG_DIR });
let _webServer = null;
let _webInfo = null;
let _webTunnel = null;

async function ensureWebShareRunning() {
  if (_webInfo) return _webInfo;
  const ws = webShareStore.load();
  try {
    _webServer = createCameraWebServer({ cameraStore: manager.store, webShareStore });
    _webInfo = await _webServer.listen(ws.webPort, '0.0.0.0');
    _webTunnel = startCloudflareTunnel({
      localUrl: _webInfo.localUrl,
      lanUrl: _webInfo.lanUrl,
      cameraStore: manager.store,
      webShareStore,
      onReady: () => send('camera:sharing-changed'),
    });
    return _webInfo;
  } catch {
    // Port 19227 is already served by background serve-web.js daemon — reuse its state cleanly.
    return { port: ws.webPort, localUrl: `http://127.0.0.1:${ws.webPort}`, lanUrl: `http://127.0.0.1:${ws.webPort}` };
  }
}

const userDataDir = path.join(CONFIG_DIR, 'electron', APP_ID);
app.setName?.(`robos-${APP_ID}`);
app.setPath?.('userData', userDataDir);

if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock?.();
  if (gotLock === false) {
    app.quit();
    process.exit(0);
  }
}

app.commandLine?.appendSwitch('no-sandbox');
app.commandLine?.appendSwitch('disable-gpu');
app.commandLine?.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed?.()) mainWindow.webContents.send(channel, payload);
}

manager.on('status', (s) => send('camera:status', s));
manager.on('score', (s) => send('camera:score', s));
manager.on('log', (line) => send('camera:log', line));
manager.on('recordings-changed', () => send('camera:recordings-changed'));
manager.on('sharing-changed', () => send('camera:sharing-changed'));
manager.on('event', (evt) => {
  send('camera:event', { ...evt, thumbUrl: manager.mediaUrl(evt.thumb), videoUrl: manager.mediaUrl(evt.video) });
  maybeNotifyMotion(evt);
});

// A desktop notification when motion starts, only for cameras with "Notify me"
// turned on, never while the window is in front, and at most once per camera
// every NOTIFY_GAP_MS so a busy room does not flood the desktop.
const NOTIFY_GAP_MS = 10 * 60 * 1000;
const lastNotifiedAt = new Map();
function maybeNotifyMotion(evt) {
  if (evt.type !== 'motion' || evt.endedAt || evt.notified) return;
  const cam = manager.store.getCamera(evt.cameraId);
  if (!cam?.motion?.notify || !Notification?.isSupported?.() || mainWindow?.isFocused?.()) return;
  const now = Date.now();
  if (now - (lastNotifiedAt.get(cam.id) || 0) < NOTIFY_GAP_MS) return;
  lastNotifiedAt.set(cam.id, now);
  try {
    new Notification({ title: 'Motion detected', body: `${cam.name} · ${new Date(evt.startedAt).toLocaleTimeString()}` }).show();
  } catch {}
}

function createWindow() {
  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'Camera Watch',
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility?.(false);

  if (_debugServer) {
    try {
      _debugServer.registerSnapshotIPC?.(mainWindow);
      _debugServer.startDebugServer?.(mainWindow, SNAPSHOT_PORT, APP_ID);
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady?.().then(async () => {
  try {
    await manager.init();
  } catch (err) {
    console.error('[camera-watch] could not start:', err);
  }
  createWindow();
});

let quitting = false;
app.on?.('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault?.();
  manager.shutdown().finally(() => app.quit());
});

app.on?.('window-all-closed', () => app.quit());

app.on?.('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    if (mainWindow.isMinimized?.()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// ── IPC ──────────────────────────────────────────────────────────────────────

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });
}

handle('camera:list', () => manager.listCameras());
handle('camera:save', (input) => manager.saveCamera(input));
handle('camera:remove', (id) => manager.removeCamera(id));
handle('camera:setEnabled', (id, enabled) => manager.setEnabled(id, enabled));
handle('camera:setMotion', (id, patch) => manager.setMotion(id, patch));
handle('camera:test', (input) => manager.testCamera(input));
handle('camera:discover', (opts) => manager.discover(opts));
handle('camera:listLocalDevices', () => manager.listLocalDevices());
handle('share:createInvite', (opts) => manager.createShareInvite(opts));
handle('share:status', () => manager.sharingStatus());
handle('share:revokeInvite', (inviteId) => manager.revokeShareInvite(inviteId));
handle('share:stopCamera', (id) => manager.stopSharingCamera(id));
handle('share:previewInvite', (text) => manager.previewInvite(text));
handle('share:addCameras', (text, opts) => manager.addSharedCameras(text, opts));
handle('share:copy', (text) => { require('electron').clipboard.writeText(String(text || '')); return true; });
handle('webShare:status', () => {
  const ws = webShareStore.load();
  const { authToken, ...pub } = ws;
  return { ...pub, hasToken: Boolean(authToken) };
});
handle('webShare:syncGoogleDoc', async ({ cameraIds = [], shareWithEmail = '' } = {}) => {
  const info = await ensureWebShareRunning();
  const chosenIds = Array.isArray(cameraIds) ? cameraIds.filter(Boolean) : [];
  const ws = webShareStore.save({ enabled: true, ...(chosenIds.length ? { sharedCameraIds: chosenIds } : {}) });
  // Wait briefly if cloudflared is still negotiating its Quick Tunnel URL
  for (let i = 0; i < 16 && !webShareStore.load().publicTunnelUrl; i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  const latest = webShareStore.load();
  const tunnelUrl = latest.publicTunnelUrl || '';
  const authedTunnelUrl = tunnelUrl ? `${tunnelUrl}/?auth=${latest.authToken}` : '';
  const authedLanUrl = `${info.lanUrl}/?auth=${latest.authToken}`;
  const all = manager.store.listCameras().filter((c) => c.enabled !== false);
  const cams = chosenIds.length ? all.filter((c) => chosenIds.includes(c.id)) : all.filter((c) => c.kind !== 'device');
  const synced = await syncCameraGoogleDoc({
    cameras: cams.length ? cams : all,
    webConfig: latest,
    authedTunnelUrl,
    publicTunnelUrl: tunnelUrl,
    authedLanUrl,
    shareWithEmail,
    homeDir: HOME_DIR,
  });
  const updated = webShareStore.save({
    accountId: synced.accountId,
    ownerEmail: synced.ownerEmail,
    folderId: synced.folderId,
    folderUrl: synced.folderUrl,
    docId: synced.docId,
    docUrl: synced.docUrl,
    docTitle: synced.docTitle,
    syncedAt: synced.syncedAt,
  });
  const { authToken, ...pub } = updated;
  return pub;
});
handle('webShare:rotateKey', async () => {
  const rotated = webShareStore.rotateToken();
  if (rotated.docId && rotated.publicTunnelUrl) {
    const cams = manager.store.listCameras().filter((c) => c.enabled !== false && c.kind !== 'device');
    await syncCameraGoogleDoc({
      cameras: cams,
      webConfig: rotated,
      authedTunnelUrl: `${rotated.publicTunnelUrl}/?auth=${rotated.authToken}`,
      publicTunnelUrl: rotated.publicTunnelUrl,
      homeDir: HOME_DIR,
    });
  }
  const { authToken, ...pub } = webShareStore.load();
  return pub;
});
handle('webShare:openExternal', (url) => {
  if (/^https?:\/\//i.test(String(url || ''))) shell.openExternal?.(String(url));
  return true;
});
handle('robosUsers:list', () => listRobosUsersWithShareStatus({
  webConfig: webShareStore.load(),
  configDir: CONFIG_DIR,
  homeDir: HOME_DIR,
}));
handle('robosUsers:share', async ({ uid = '', email = '', cameraIds = [] } = {}) => {
  const info = await ensureWebShareRunning();
  const chosenIds = Array.isArray(cameraIds) ? cameraIds.filter(Boolean) : [];
  webShareStore.save({ enabled: true, ...(chosenIds.length ? { sharedCameraIds: chosenIds } : {}) });
  for (let i = 0; i < 16 && !webShareStore.load().publicTunnelUrl; i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  const latest = webShareStore.load();
  const tunnelUrl = latest.publicTunnelUrl || '';
  const authedTunnelUrl = tunnelUrl ? `${tunnelUrl}/?auth=${latest.authToken}` : '';
  const authedLanUrl = `${info.lanUrl}/?auth=${latest.authToken}`;
  const all = manager.store.listCameras().filter((c) => c.enabled !== false);
  const cams = chosenIds.length ? all.filter((c) => chosenIds.includes(c.id)) : all.filter((c) => c.kind !== 'device');
  const sharedRes = await shareWithRobosUser({
    uid,
    email,
    cameras: cams.length ? cams : all,
    webConfig: latest,
    authedTunnelUrl,
    publicTunnelUrl: tunnelUrl,
    authedLanUrl,
    configDir: CONFIG_DIR,
    homeDir: HOME_DIR,
  });
  const prevUsers = Array.isArray(latest.sharedUsers) ? latest.sharedUsers : [];
  const sw = sharedRes.sharedWith;
  const nextSharedUsers = [
    ...prevUsers.filter((u) => String(u?.email || '').toLowerCase() !== String(sw.email || '').toLowerCase()),
    {
      uid: sw.uid,
      name: sw.name,
      email: sw.email,
      permissionId: sw.permissionId,
      role: sw.role || 'reader',
      sharedAt: new Date().toISOString(),
    },
  ];
  const saved = webShareStore.save({
    accountId: sharedRes.accountId,
    ownerEmail: sharedRes.ownerEmail,
    folderId: sharedRes.folderId,
    folderUrl: sharedRes.folderUrl,
    docId: sharedRes.docId,
    docUrl: sharedRes.docUrl,
    docTitle: sharedRes.docTitle,
    syncedAt: sharedRes.syncedAt,
    sharedUsers: nextSharedUsers,
  });
  const status = await listRobosUsersWithShareStatus({
    webConfig: saved,
    configDir: CONFIG_DIR,
    homeDir: HOME_DIR,
  });
  return { sharedWith: sw, ...status };
});
handle('robosUsers:revoke', async ({ uid = '', email = '', permissionId = '', rotateKey = true } = {}) => {
  const info = await ensureWebShareRunning();
  const nextState = rotateKey ? webShareStore.rotateToken() : webShareStore.load();
  const tunnelUrl = nextState.publicTunnelUrl || '';
  const authedTunnelUrl = tunnelUrl ? `${tunnelUrl}/?auth=${nextState.authToken}` : '';
  const authedLanUrl = `${info.lanUrl}/?auth=${nextState.authToken}`;
  const cams = manager.store.listCameras().filter((c) => c.enabled !== false && c.kind !== 'device');
  const rev = await revokeRobosUserShare({
    uid,
    email,
    permissionId,
    cameras: cams,
    webConfig: nextState,
    authedTunnelUrl,
    publicTunnelUrl: tunnelUrl,
    authedLanUrl,
    configDir: CONFIG_DIR,
    homeDir: HOME_DIR,
  });
  const prevUsers = Array.isArray(nextState.sharedUsers) ? nextState.sharedUsers : [];
  const filteredUsers = prevUsers.filter((u) => {
    if (rev.permissionId && u?.permissionId === rev.permissionId) return false;
    if (rev.email && String(u?.email || '').toLowerCase() === rev.email) return false;
    if (rev.uid && u?.uid === rev.uid) return false;
    return true;
  });
  const saved = webShareStore.save({
    ...(rev.docId ? { docId: rev.docId, docUrl: rev.docUrl, docTitle: rev.docTitle, syncedAt: rev.syncedAt } : {}),
    sharedUsers: filteredUsers,
  });
  const status = await listRobosUsersWithShareStatus({
    webConfig: saved,
    configDir: CONFIG_DIR,
    homeDir: HOME_DIR,
  });
  return { revoked: true, ...status };
});
handle('camera:ptzMove', (id, v) => manager.ptzMove(id, v));
handle('camera:ptzStop', (id) => manager.ptzStop(id));
handle('camera:ptzPresets', (id) => manager.ptzPresets(id));
handle('camera:ptzGoto', (id, token) => manager.ptzGoto(id, token));
handle('camera:startRecording', (id) => manager.startRecording(id));
handle('camera:stopRecording', (id) => manager.stopRecording(id));
handle('camera:snapshot', (id) => manager.takeSnapshot(id));
handle('events:list', (opts) => manager.listEvents(opts));
handle('events:clear', (cameraId) => manager.clearEvents(cameraId));
handle('recordings:list', (opts) => manager.listRecordings(opts));
handle('recordings:delete', (file) => manager.deleteRecording(file));
handle('recordings:reveal', (file) => shell.showItemInFolder?.(file));
handle('recordings:openFolder', () => {
  const dir = manager.getSettings().recordingsDir;
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath?.(dir);
});
handle('settings:get', () => manager.getSettings());
handle('settings:save', (patch) => manager.saveSettings(patch));
handle('settings:pickFolder', async () => {
  const r = await dialog.showOpenDialog?.(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return r && !r.canceled ? r.filePaths[0] : null;
});
handle('settings:checkFfmpeg', () => manager.checkFfmpeg());

module.exports = { manager };

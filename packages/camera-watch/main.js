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
const manager = createCameraManager({ configDir: CONFIG_DIR, homeDir: HOME_DIR });

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
manager.on('event', (evt) => {
  send('camera:event', { ...evt, thumbUrl: manager.mediaUrl(evt.thumb), videoUrl: manager.mediaUrl(evt.video) });
  // A desktop notification when motion starts and the window is not focused.
  if (evt.type === 'motion' && !evt.endedAt && Notification?.isSupported?.() && !mainWindow?.isFocused?.()) {
    try {
      new Notification({ title: 'Motion detected', body: `${evt.cameraName} · ${new Date(evt.startedAt).toLocaleTimeString()}` }).show();
    } catch {}
  }
});

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

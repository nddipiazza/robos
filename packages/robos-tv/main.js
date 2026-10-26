'use strict';

let app, BrowserWindow, ipcMain, shell;
try {
  ({ app, BrowserWindow, ipcMain, shell } = require('electron'));
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
  shell = { openExternal: async () => {} };
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');

let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try {
      _debugServer = require(p);
      break;
    } catch {}
  }
} catch {}

let tvEngineModule = null;
for (const base of [
  process.env.ROBOS_LIB_PATH,
  path.resolve(__dirname, '..', 'robos-lib'),
  '/usr/local/share/robos/robos-lib',
].filter(Boolean)) {
  try {
    tvEngineModule = require(path.join(base, 'tv-engine'));
    break;
  } catch {}
}

const tvEngine = tvEngineModule.createTvEngine({
  configDir: CONFIG_DIR,
  portalPort: Number(process.env.ROBOS_TV_PORTAL_PORT || tvEngineModule.DEFAULT_PORTAL_PORT),
});

app.setPath?.('userData', path.join(CONFIG_DIR, 'electron', 'robos-tv'));

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
app.setName?.('robos-tv');

app.whenReady?.().then(async () => {
  await tvEngine.startPortalServer();

  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'RobOS Smart TV Studio',
    width: 1180,
    height: 780,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  if (_debugServer) {
    try {
      if (typeof _debugServer.registerSnapshotIPC === 'function') {
        _debugServer.registerSnapshotIPC(mainWindow);
      }
      _debugServer.startDebugServer(mainWindow, 19206, 'robos-tv');
    } catch {}
  }
});

app.on?.('window-all-closed', async () => {
  await tvEngine.stopPortalServer();
  app.quit();
});

app.on?.('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle('tv:getOverview', async () => {
  return tvEngine.getOverview();
});

ipcMain.handle('tv:scanLan', async () => {
  return tvEngine.scanLanForTvs();
});

ipcMain.handle('tv:addOrUpdate', async (_e, tvInput) => {
  try {
    return tvEngine.addOrUpdateTv(tvInput);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('tv:remove', async (_e, tvId) => {
  return tvEngine.removeTv(tvId);
});

ipcMain.handle('tv:buildPackage', async (_e, options) => {
  try {
    return tvEngine.buildTvPackage(options);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('tv:renewWebos', async (_e, tvId) => {
  return tvEngine.renewWebosDevSession(tvId);
});

ipcMain.handle('tv:sendRemoteKey', async (_e, payload) => {
  return tvEngine.sendRemoteKey(payload);
});

ipcMain.handle('tv:launchTile', async (_e, payload) => {
  return tvEngine.launchTileOnTv(payload);
});

ipcMain.handle('tv:openPortalExternal', async () => {
  const info = tvEngine.getOverview();
  if (shell && typeof shell.openExternal === 'function') {
    await shell.openExternal(info.portalUrl);
  }
  return { ok: true, portalUrl: info.portalUrl };
});

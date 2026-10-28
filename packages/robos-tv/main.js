'use strict';

let app, BrowserWindow, ipcMain, shell, dialog;
try {
  ({ app, BrowserWindow, ipcMain, shell, dialog } = require('electron'));
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
  dialog = {};
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');

try {
  const { setupGlobalErrorHandlers } = require('../robos-lib/logger');
  setupGlobalErrorHandlers('robos-tv', dialog);
} catch {
  try {
    const { setupGlobalErrorHandlers } = require('/usr/local/share/robos/robos-lib/logger');
    setupGlobalErrorHandlers('robos-tv', dialog);
  } catch {}
}

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
  appName: 'robos-tv',
  // Smart TV Studio renders the live dashboard frames, so it should serve the
  // portal; reuse (and flag in the UI) only when another process holds it.
  reusePortal: process.env.ROBOS_TEST !== '1',
  onPortalReleased: () => notifyPortalChanged(),
});

function notifyPortalChanged() {
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    try { mainWindow.webContents.send('tv:portalChanged'); } catch {}
  }
}

const userDataDir = path.join(CONFIG_DIR, 'electron', 'robos-tv');
app.setName?.('robos-tv');
app.setPath?.('userData', userDataDir);

try {
  const lockFile = path.join(userDataDir, 'SingletonLock');
  if (fs.existsSync(lockFile)) {
    const target = fs.readlinkSync(lockFile);
    const m = target.match(/-(\d+)$/);
    if (m) {
      const pid = parseInt(m[1], 10);
      try {
        process.kill(pid, 0);
      } catch {
        try { fs.unlinkSync(lockFile); } catch {}
        try { fs.unlinkSync(path.join(userDataDir, 'SingletonCookie')); } catch {}
        try { fs.unlinkSync(path.join(userDataDir, 'SingletonSocket')); } catch {}
      }
    }
  }
} catch {}

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
let wallboardWindow = null;
let wallboardTimer = null;
let portalPortBound = 19210;

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    if (mainWindow.isMinimized?.()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

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
  mainWindow.setMenuBarVisibility?.(false);

  mainWindow.once?.('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed?.()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on?.('closed', () => {
    mainWindow = null;
    if (wallboardTimer) {
      clearInterval(wallboardTimer);
      wallboardTimer = null;
    }
    if (wallboardWindow && !wallboardWindow.isDestroyed?.()) {
      try { wallboardWindow.close(); } catch {}
    }
    wallboardWindow = null;
  });

  // Hidden 1920x1080 Chromium compositor window for streaming live JS <canvas> widgets to Roku / Smart TVs
  if (!wallboardWindow || wallboardWindow.isDestroyed?.()) {
    try {
      wallboardWindow = new BrowserWindow({
        title: 'RobOS TV 1080p Live JS Compositor',
        width: 1920,
        height: 1080,
        show: false,
        frame: false,
        paintWhenInitiallyHidden: true,
        backgroundColor: '#070b12',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      });
      wallboardWindow.on?.('closed', () => {
        wallboardWindow = null;
      });
      wallboardWindow.loadURL(`http://127.0.0.1:${portalPortBound || 19210}/dashboard`);
      let tick = 0;
      if (wallboardTimer) clearInterval(wallboardTimer);
      wallboardTimer = setInterval(async () => {
        if (!wallboardWindow || wallboardWindow.isDestroyed?.()) return;
        try {
          tick++;
          if (tick % 12 === 0) {
            wallboardWindow.webContents.reloadIgnoringCache();
          }
          const img = await wallboardWindow.webContents.capturePage();
          const jpg = img.toJPEG(90);
          if (jpg && jpg.length > 5000) {
            tvEngine.setLiveDashboardFrame?.(jpg);
          }
        } catch {}
      }, 1000);
    } catch {}
  }

  if (_debugServer) {
    try {
      if (typeof _debugServer.registerSnapshotIPC === 'function') {
        _debugServer.registerSnapshotIPC(mainWindow);
      }
      _debugServer.startDebugServer(mainWindow, 19206, 'robos-tv');
    } catch {}
  }

  return mainWindow;
}

app.whenReady?.().then(async () => {
  let srv = await tvEngine.startPortalServer();
  portalPortBound = srv?.port || 19210;
  if (srv?.reused) {
    try {
      const own = await tvEngine.getPortalOwnership(portalPortBound);
      if (own && own.stale && own.canRestart) {
        const restarted = await tvEngine.restartPortal({ port: portalPortBound });
        if (restarted && restarted.ok) {
          srv = restarted;
        }
      }
    } catch {}
  }
  createMainWindow();
});

app.on?.('window-all-closed', async () => {
  if (wallboardTimer) {
    clearInterval(wallboardTimer);
    wallboardTimer = null;
  }
  await tvEngine.stopPortalServer();
  app.quit();
});

app.on?.('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    if (mainWindow.isMinimized?.()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
});

app.on?.('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed?.()) {
    createMainWindow();
  }
});

ipcMain.handle('tv:getOverview', async () => {
  return tvEngine.getOverview();
});

ipcMain.handle('tv:getPortalOwnership', async () => {
  return tvEngine.getPortalOwnership(portalPortBound);
});

ipcMain.handle('tv:restartPortal', async () => {
  const res = await tvEngine.restartPortal({ port: portalPortBound });
  if (res.ok && wallboardWindow && !wallboardWindow.isDestroyed?.()) {
    try { wallboardWindow.webContents.reloadIgnoringCache(); } catch {}
  }
  return res;
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

ipcMain.handle('tv:diagnoseReadiness', async (_e, tvId) => {
  return tvEngine.diagnoseTvReadiness(tvId);
});

ipcMain.handle('tv:launchTile', async (_e, payload) => {
  return tvEngine.launchTileOnTv(payload);
});

ipcMain.handle('tv:castDashboard', async (_e, payload) => {
  return tvEngine.castDashboard(payload);
});

ipcMain.handle('tv:stopDashboardCast', async (_e, payload) => {
  return tvEngine.stopDashboardCast(payload);
});

ipcMain.handle('tv:openDashboardExternal', async () => {
  const info = tvEngine.getOverview();
  if (shell && typeof shell.openExternal === 'function') {
    await shell.openExternal(info.dashboardCastUrl || `${info.portalUrl}/dashboard`);
  }
  return { ok: true, dashboardCastUrl: info.dashboardCastUrl || `${info.portalUrl}/dashboard` };
});

ipcMain.handle('tv:openPortalExternal', async () => {
  const info = tvEngine.getOverview();
  if (shell && typeof shell.openExternal === 'function') {
    await shell.openExternal(info.portalUrl);
  }
  return { ok: true, portalUrl: info.portalUrl };
});

ipcMain.handle('tv:getTabloOverview', async (_e, opts) => {
  return tvEngine.getTabloOverview(opts || {});
});

ipcMain.handle('tv:getTabloChannels', async (_e, opts) => {
  return tvEngine.getTabloChannels(opts || {});
});

ipcMain.handle('tv:setTabloDevice', async (_e, opts) => {
  return tvEngine.setTabloDevice(opts || {});
});

ipcMain.handle('tv:openTabloExternal', async (_e, opts) => {
  return tvEngine.openTabloExternal(opts || {});
});

ipcMain.handle('tv:castTabloToTv', async (_e, opts) => {
  return tvEngine.castTabloToTv(opts || {});
});


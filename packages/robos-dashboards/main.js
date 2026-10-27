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
const { spawn } = require('node:child_process');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');

try {
  const { setupGlobalErrorHandlers } = require('../robos-lib/logger');
  setupGlobalErrorHandlers('robos-dashboards', dialog);
} catch {
  try {
    const { setupGlobalErrorHandlers } = require('/usr/local/share/robos/robos-lib/logger');
    setupGlobalErrorHandlers('robos-dashboards', dialog);
  } catch {}
}

function requireShared(modName) {
  for (const base of [
    process.env.ROBOS_LIB_PATH,
    path.resolve(__dirname, '..', 'robos-lib'),
    '/usr/local/share/robos/robos-lib',
  ].filter(Boolean)) {
    try {
      return require(path.join(base, modName));
    } catch {}
  }
  throw new Error(`RobOS shared module "${modName}" not found`);
}

let _debugServer = null;
try {
  _debugServer = requireShared('dom-snapshot');
} catch {}

const dashboardEngineModule = requireShared('dashboard-engine');
const tvEngineModule = requireShared('tv-engine');

const dashEngine = dashboardEngineModule.createDashboardEngine({
  configDir: CONFIG_DIR,
});

const tvEngine = tvEngineModule.createTvEngine({
  configDir: CONFIG_DIR,
  portalPort: Number(process.env.ROBOS_TV_PORTAL_PORT || tvEngineModule.DEFAULT_PORTAL_PORT),
});

const userDataDir = path.join(CONFIG_DIR, 'electron', 'robos-dashboards');
app.setName?.('robos-dashboards');
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

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    if (mainWindow.isMinimized?.()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'RobOS Dashboards',
    width: 1260,
    height: 820,
    minWidth: 920,
    minHeight: 620,
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
  });

  if (_debugServer) {
    try {
      if (typeof _debugServer.registerSnapshotIPC === 'function') {
        _debugServer.registerSnapshotIPC(mainWindow);
      }
      _debugServer.startDebugServer(mainWindow, 19211, 'robos-dashboards');
    } catch {}
  }

  return mainWindow;
}

app.whenReady?.().then(async () => {
  try {
    await tvEngine.startPortalServer();
  } catch {}
  createWindow();
});

app.on?.('window-all-closed', async () => {
  await tvEngine.stopPortalServer();
  app.quit();
});

app.on?.('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    if (mainWindow.isMinimized?.()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

app.on?.('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed?.()) {
    createWindow();
  }
});

ipcMain.handle('dashboards:getOverview', async (_e, dashboardId) => {
  const ov = dashEngine.getOverview(dashboardId);
  const tvOv = tvEngine.getOverview();
  return {
    ...ov,
    tvs: tvOv.tvs || ov.tvs || [],
    portalUrl: tvOv.portalUrl,
    dashboardCastUrl: tvOv.dashboardCastUrl || `${tvOv.portalUrl}/dashboard`,
    activeDashboardCast: tvOv.activeDashboardCast || null,
  };
});

ipcMain.handle('dashboards:setActive', async (_e, dashboardId) => {
  return dashEngine.setActiveDashboard(dashboardId);
});

ipcMain.handle('dashboards:configureSlideshow', async (_e, payload) => {
  return dashEngine.configureSlideshow(payload || {});
});

ipcMain.handle('dashboards:stepSlideshow', async (_e, payload) => {
  return dashEngine.stepSlideshow(payload || {});
});

ipcMain.handle('dashboards:setLayout', async (_e, payload) => {
  return dashEngine.setDashboardLayout(payload);
});

ipcMain.handle('dashboards:create', async (_e, payload) => {
  return dashEngine.createDashboard(payload);
});

ipcMain.handle('dashboards:delete', async (_e, dashboardId) => {
  return dashEngine.deleteDashboard(dashboardId);
});

ipcMain.handle('dashboards:addCard', async (_e, payload) => {
  return dashEngine.addCardToDashboard(payload);
});

ipcMain.handle('dashboards:removeCard', async (_e, payload) => {
  return dashEngine.removeCardFromDashboard(payload);
});

ipcMain.handle('dashboards:addCalendarEvent', async (_e, payload) => {
  return dashEngine.addCalendarEvent(payload);
});

ipcMain.handle('dashboards:appendAgentStatusLine', async (_e, payload) => {
  return dashEngine.appendAgentStatusLine(payload);
});

ipcMain.handle('dashboards:getKGraphNodes', async (_e, dashboardId) => {
  return {
    ok: true,
    ...dashEngine.toKGraphNodes(dashboardId),
  };
});

ipcMain.handle('dashboards:castToSmartTv', async (_e, payload = {}) => {
  const res = await tvEngine.castDashboard(payload);
  return res;
});

ipcMain.handle('dashboards:stopSmartTvCast', async (_e, payload = {}) => {
  return tvEngine.stopDashboardCast(payload);
});

ipcMain.handle('dashboards:openTvWallboardExternal', async () => {
  const tvOv = tvEngine.getOverview();
  const url = tvOv.dashboardCastUrl || `${tvOv.portalUrl}/dashboard`;
  if (shell && typeof shell.openExternal === 'function') {
    await shell.openExternal(url);
  }
  return { ok: true, url };
});

ipcMain.handle('dashboards:launchSmartTvApp', async () => {
  try {
    const tvAppMain = path.resolve(__dirname, '..', 'robos-tv', 'main.js');
    const child = spawn(
      process.execPath,
      [tvAppMain, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      }
    );
    child.unref();
    return { ok: true, message: 'Launched RobOS Smart TV Studio' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

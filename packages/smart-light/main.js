'use strict';

let app, BrowserWindow, ipcMain;
try {
  ({ app, BrowserWindow, ipcMain } = require('electron'));
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
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');

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

const lightEngineModule = requireShared('smart-light-engine');
const lightEngine = lightEngineModule.createSmartLightEngine({
  configDir: CONFIG_DIR,
  apiPort: Number(process.env.ROBOS_SMART_LIGHT_API_PORT || lightEngineModule.DEFAULT_API_PORT),
});

app.setPath?.('userData', path.join(CONFIG_DIR, 'electron', 'smart-light'));

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
app.setName?.('robos-smart-light');

function createWindow() {
  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'RobOS Smart Light Studio',
    width: 1220,
    height: 820,
    minWidth: 920,
    minHeight: 620,
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
      _debugServer.startDebugServer?.(mainWindow, 19209, 'smart-light');
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady?.().then(async () => {
  await lightEngine.startApiServer();
  createWindow();
});

app.on?.('window-all-closed', async () => {
  await lightEngine.stopApiServer();
  app.quit();
});

app.on?.('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('lights:getOverview', async () => {
  return lightEngine.getOverview();
});

ipcMain.handle('lights:updateLight', async (_e, lightId, patch) => {
  return lightEngine.updateLight(lightId, patch);
});

ipcMain.handle('lights:setRoomState', async (_e, roomId, patch) => {
  return lightEngine.setRoomState(roomId, patch);
});

ipcMain.handle('lights:addOrUpdateLight', async (_e, input) => {
  return lightEngine.addOrUpdateLight(input);
});

ipcMain.handle('lights:removeLight', async (_e, lightId) => {
  return lightEngine.removeLight(lightId);
});

ipcMain.handle('lights:applyScene', async (_e, sceneId, roomScope) => {
  return lightEngine.applyScene(sceneId, roomScope);
});

ipcMain.handle('lights:saveCustomScene', async (_e, input) => {
  return lightEngine.saveCustomScene(input);
});

ipcMain.handle('lights:designSceneWithAi', async (_e, payload) => {
  return lightEngine.designSceneWithAi(payload);
});

ipcMain.handle('lights:applyCircadianHour', async (_e, hourFloat, toggleAuto) => {
  return lightEngine.applyCircadianHour(hourFloat, toggleAuto);
});

ipcMain.handle('lights:addOrUpdateSchedule', async (_e, input) => {
  return lightEngine.addOrUpdateSchedule(input);
});

ipcMain.handle('lights:removeSchedule', async (_e, scheduleId) => {
  return lightEngine.removeSchedule(scheduleId);
});

ipcMain.handle('lights:triggerScheduleNow', async (_e, scheduleId) => {
  return lightEngine.triggerScheduleNow(scheduleId);
});

ipcMain.handle('lights:triggerCiStatusLight', async (_e, payload) => {
  return lightEngine.triggerCiStatusLight(payload);
});

ipcMain.handle('lights:scanLan', async () => {
  return lightEngine.scanLanForLights();
});

ipcMain.handle('lights:pairHueBridge', async (_e, payload) => {
  return lightEngine.pairHueBridge(payload);
});

ipcMain.handle('lights:launchApp', async (_e, appId) => {
  try {
    const wrapperCandidates = [
      path.join(HOME_DIR, '.local', 'bin', `robos-${appId}`),
      path.join(HOME_DIR, '.local', 'bin', appId),
    ];
    const wrapper = wrapperCandidates.find((w) => fs.existsSync(w));
    if (wrapper) {
      const child = spawn(wrapper, [], { detached: true, stdio: 'ignore', env: { ...process.env } });
      child.unref();
      return { ok: true, appId };
    }
    const candidates = [
      path.resolve(__dirname, '..', appId, 'main.js'),
      `/usr/local/share/robos/${appId}/main.js`,
    ];
    const mainJs = candidates.find((c) => fs.existsSync(c));
    if (!mainJs) throw new Error(`RobOS app "${appId}" not found.`);
    const electronBin = process.execPath || '/usr/bin/electron';
    const child = spawn(electronBin, [mainJs, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
    return { ok: true, appId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

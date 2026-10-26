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
  shell = { openExternal: () => {} };
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.config', 'robos');

function requireShared(modName) {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, modName),
    path.resolve(__dirname, '..', 'robos-lib', modName),
    `/usr/local/share/robos/robos-lib/${modName}`,
  ].filter(Boolean)) {
    try { return require(p); } catch {}
  }
  throw new Error(`RobOS shared module "${modName}" not found.`);
}

let _debugServer = null;
try { _debugServer = requireShared('dom-snapshot'); } catch {}

if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    process.exit(0);
  }
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setName('robos-cloud-accounts');
app.setPath?.('userData', path.join(CONFIG_DIR, 'electron', 'cloud-accounts'));

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'RobOS Cloud Accounts',
    width: 1120,
    height: 760,
    minWidth: 820,
    minHeight: 540,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    try {
      _debugServer.registerSnapshotIPC?.(mainWindow);
      _debugServer.startDebugServer?.(mainWindow, 19207, 'cloud-accounts');
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => app.quit());

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('ca:list', async () => {
  try {
    const ca = requireShared('cloud-accounts');
    const tb = requireShared('thunderbird-google');
    return {
      ok: true,
      ...ca.listAccounts(),
      thunderbird: tb.detectThunderbird(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ca:save', async (_, accountInput) => {
  try {
    const ca = requireShared('cloud-accounts');
    return { ok: true, ...ca.saveAccount(accountInput || {}) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ca:update-suites', async (_, { accountId, suites }) => {
  try {
    const ca = requireShared('cloud-accounts');
    return { ok: true, ...ca.updateAccountSuites(accountId, suites || {}) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ca:delete', async (_, accountId) => {
  try {
    const ca = requireShared('cloud-accounts');
    return { ok: true, ...ca.deleteAccount(accountId) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ca:set-default', async (_, accountId) => {
  try {
    const ca = requireShared('cloud-accounts');
    return { ok: true, ...ca.setDefaultAccount(accountId) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ca:verify', async (_, accountId) => {
  try {
    const ca = requireShared('cloud-accounts');
    return await ca.verifyCloudAccount(accountId);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ca:oauth-google', async (_, params) => {
  try {
    const ca = requireShared('cloud-accounts');
    return await ca.startGoogleBrowserOAuth({
      ...(params || {}),
      onOpenExternal: (url) => shell?.openExternal?.(url),
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ca:configure-thunderbird', async (_, payload) => {
  try {
    const tb = requireShared('thunderbird-google');
    const { accountId, enableCalendar, enableContacts, enableMail } = payload || {};
    return tb.configureThunderbirdForGoogleAccount(accountId, {
      enableCalendar,
      enableContacts,
      enableMail,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ca:launch-app', async (_, appId) => {
  try {
    const candidates = [
      path.resolve(__dirname, '..', appId, 'main.js'),
      `/usr/local/share/robos/${appId}/main.js`,
    ];
    const mainJs = candidates.find(c => fs.existsSync(c));
    if (!mainJs) throw new Error(`RobOS app "${appId}" is not installed.`);
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

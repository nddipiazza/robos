'use strict';

let app, BrowserWindow, ipcMain, dialog;
try {
  ({ app, BrowserWindow, ipcMain, dialog } = require('electron'));
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
  dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) };
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const cp = require('node:child_process');

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

let ovpnModule = null;
let sandboxModule = null;
for (const base of [
  process.env.ROBOS_LIB_PATH,
  path.resolve(__dirname, '..', 'robos-lib'),
  '/usr/local/share/robos/robos-lib',
].filter(Boolean)) {
  try {
    ovpnModule = require(path.join(base, 'ovpn-providers'));
    sandboxModule = require(path.join(base, 'vpn-sandbox-engine'));
    break;
  } catch {}
}

const ovpnManager = ovpnModule.createOvpnManager({ configDir: CONFIG_DIR });
const sandboxEngine = sandboxModule.createVpnSandboxEngine({
  configDir: CONFIG_DIR,
  ovpnManager,
});

app.setPath?.('userData', path.join(CONFIG_DIR, 'electron', 'vpn-sandbox'));

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
app.setName?.('robos-vpn-sandbox');

app.whenReady?.().then(() => {
  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'RobOS VPN Sandbox',
    width: 1020,
    height: 700,
    minWidth: 760,
    minHeight: 520,
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
      _debugServer.startDebugServer(mainWindow, 19204, 'vpn-sandbox');
    } catch {}
  }
});

app.on?.('window-all-closed', () => app.quit());
app.on?.('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle('get-initial-state', async () => {
  try {
    const accountsState = ovpnManager.listAccounts();
    const savedApps = sandboxEngine.listSavedAppProfiles();
    const sessions = sandboxEngine.listSessions();
    const hostNet = sandboxModule.detectHostNetworkInfo();
    const transmissionInstalled = Boolean(sandboxEngine.detectInstalledTransmission());
    return {
      ok: true,
      ...accountsState,
      savedApps,
      sessions,
      hostNet,
      transmissionInstalled,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('discover-executables', async (_, query) => {
  try {
    return { ok: true, executables: sandboxEngine.discoverSystemExecutables(query) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('browse-executable', async () => {
  try {
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Application Executable',
      defaultPath: '/usr/bin',
      properties: ['openFile'],
    });
    if (picked.canceled || !picked.filePaths?.[0]) return { ok: false, canceled: true };
    return { ok: true, executable: picked.filePaths[0] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('save-app-profile', async (_, profileInput) => {
  try {
    return sandboxEngine.saveAppProfile(profileInput);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('delete-app-profile', async (_, profileId) => {
  try {
    return sandboxEngine.deleteAppProfile(profileId);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('launch-sandboxed-app', async (_, launchInput) => {
  try {
    const session = await sandboxEngine.launchSandboxedExecutable(launchInput);
    const verification = await sandboxEngine.verifyVpnTraffic({ sessionId: session.id });
    return {
      ok: true,
      session: sandboxEngine.getSession(session.id),
      verification,
      sessions: sandboxEngine.listSessions(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('verify-vpn-traffic', async (_, opts) => {
  try {
    const verification = await sandboxEngine.verifyVpnTraffic(opts || {});
    return {
      ...verification,
      sessions: sandboxEngine.listSessions(),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('list-sessions', async () => {
  try {
    return { ok: true, sessions: sandboxEngine.listSessions() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('stop-session', async (_, sessionId) => {
  try {
    const session = sandboxEngine.stopSession(sessionId);
    return { ok: true, session, sessions: sandboxEngine.listSessions() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('delete-session', async (_, sessionId) => {
  try {
    return sandboxEngine.deleteSession(sessionId);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('clear-stopped-sessions', async () => {
  try {
    return sandboxEngine.clearStoppedSessions();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('emergency-kill-all', async () => {
  try {
    return sandboxEngine.emergencyKillAll();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('open-vpn-servers', async () => {
  try {
    const serversDir = [
      path.resolve(__dirname, '..', 'vpn-servers'),
      '/usr/local/share/robos/vpn-servers',
    ].find(d => fs.existsSync(path.join(d, 'main.js')));
    if (!serversDir) throw new Error('vpn-servers package not found.');
    const bin = [process.versions.electron && process.execPath, '/usr/bin/electron'].find(
      p => typeof p === 'string' && fs.existsSync(p)
    );
    if (bin) {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      cp.spawn(bin, [serversDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
        env,
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

module.exports = { ovpnManager, sandboxEngine };

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

// Optional DOM snapshot debug server
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

// Load ovpn-providers & vpn-sandbox-engine from robos-lib
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
    width: 1180,
    height: 780,
    minWidth: 840,
    minHeight: 560,
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

// ── IPC Handlers: OpenVPN Providers & Accounts ───────────────────────────────

ipcMain.handle('get-initial-state', async () => {
  try {
    const accountsState = ovpnManager.listAccounts();
    const savedApps = sandboxEngine.listSavedAppProfiles();
    const sessions = sandboxEngine.listSessions();
    const capabilities = sandboxEngine.checkSystemCapabilities();
    const hostNet = sandboxModule.detectHostNetworkInfo();
    const audit = await sandboxEngine.runLeakAudit({});
    return {
      ok: true,
      ...accountsState,
      savedApps,
      sessions,
      capabilities,
      hostNet,
      audit,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ovpn-list-accounts', async () => {
  try {
    return { ok: true, ...ovpnManager.listAccounts() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ovpn-save-account', async (_, input) => {
  try {
    return { ok: true, ...ovpnManager.saveAccount(input) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ovpn-delete-account', async (_, accountId) => {
  try {
    return { ok: true, ...ovpnManager.deleteAccount(accountId) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ovpn-set-default-account', async (_, accountId) => {
  try {
    return { ok: true, ...ovpnManager.setDefaultAccount(accountId) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ovpn-add-provider', async (_, providerInput) => {
  try {
    const provider = ovpnManager.addCustomProvider(providerInput);
    return { ok: true, provider, ...ovpnManager.listAccounts() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ovpn-sync-profiles', async (_, providerId) => {
  try {
    const syncRes = await ovpnManager.syncProviderProfiles(providerId || 'ipvanish');
    return { ...syncRes, ...ovpnManager.listAccounts() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('ovpn-import-profile', async (_, payload) => {
  try {
    let filePath = payload?.filePath;
    if (!filePath && !payload?.content && dialog?.showOpenDialog) {
      const picked = await dialog.showOpenDialog(mainWindow, {
        title: 'Import OpenVPN (.ovpn) Profile',
        filters: [
          { name: 'OpenVPN Profiles', extensions: ['ovpn', 'conf'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (picked.canceled || !picked.filePaths?.[0]) {
        return { ok: false, canceled: true };
      }
      filePath = picked.filePaths[0];
    }
    const imported = ovpnManager.importOvpnProfile({
      providerId: payload?.providerId || 'ipvanish',
      filePath,
      filename: payload?.filename,
      content: payload?.content,
    });
    return { ...imported, ...ovpnManager.listAccounts() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── IPC Handlers: Sandbox App Profiles & Executable Launcher ─────────────────

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
      title: 'Select Executable to Launch in OpenVPN Sandbox',
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
    return {
      ok: true,
      session,
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

ipcMain.handle('emergency-kill-all', async () => {
  try {
    return sandboxEngine.emergencyKillAll();
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('run-leak-audit', async (_, opts) => {
  try {
    return await sandboxEngine.runLeakAudit(opts || {});
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('open-preferences', async () => {
  try {
    const prefsDir = [
      path.resolve(__dirname, '..', 'robos-preferences'),
      '/usr/local/share/robos/robos-preferences',
    ].find(d => fs.existsSync(path.join(d, 'main.js')));
    if (!prefsDir) throw new Error('robos-preferences package not found.');
    const bin = [process.versions.electron && process.execPath, '/usr/bin/electron'].find(
      p => typeof p === 'string' && fs.existsSync(p)
    );
    if (bin) {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      cp.spawn(bin, [prefsDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
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

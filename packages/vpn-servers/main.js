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
for (const base of [
  process.env.ROBOS_LIB_PATH,
  path.resolve(__dirname, '..', 'robos-lib'),
  '/usr/local/share/robos/robos-lib',
].filter(Boolean)) {
  try {
    ovpnModule = require(path.join(base, 'ovpn-providers'));
    break;
  } catch {}
}

const ovpnManager = ovpnModule.createOvpnManager({ configDir: CONFIG_DIR });

app.setPath?.('userData', path.join(CONFIG_DIR, 'electron', 'vpn-servers'));

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
app.setName?.('robos-vpn-servers');

app.whenReady?.().then(() => {
  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'RobOS VPN Servers',
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
      _debugServer.startDebugServer(mainWindow, 19205, 'vpn-servers');
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

ipcMain.handle('get-state', async () => {
  try {
    return { ok: true, ...ovpnManager.listAccounts() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('save-account', async (_, input) => {
  try {
    return { ok: true, ...ovpnManager.saveAccount(input) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('delete-account', async (_, accountId) => {
  try {
    return { ok: true, ...ovpnManager.deleteAccount(accountId) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('set-default-account', async (_, accountId) => {
  try {
    return { ok: true, ...ovpnManager.setDefaultAccount(accountId) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('set-account-server', async (_, { accountId, profileId }) => {
  try {
    const { accounts, defaultAccountId } = ovpnManager.listAccounts();
    const target = accounts.find(a => a.id === (accountId || defaultAccountId)) || accounts[0];
    if (!target) throw new Error('Add a VPN account first.');
    return {
      ok: true,
      ...ovpnManager.saveAccount({
        id: target.id,
        providerId: target.providerId,
        label: target.label,
        username: target.username,
        defaultProfile: profileId,
      }),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('sync-profiles', async (_, providerId) => {
  try {
    const syncRes = await ovpnManager.syncProviderProfiles(providerId || 'ipvanish');
    return { ...syncRes, ...ovpnManager.listAccounts() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('import-profile', async (_, payload) => {
  try {
    let filePath = payload?.filePath;
    if (!filePath && !payload?.content && dialog?.showOpenDialog) {
      const picked = await dialog.showOpenDialog(mainWindow, {
        title: 'Import OpenVPN (.ovpn) File',
        filters: [
          { name: 'OpenVPN Profiles', extensions: ['ovpn', 'conf'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (picked.canceled || !picked.filePaths?.[0]) return { ok: false, canceled: true };
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

ipcMain.handle('add-provider', async (_, providerInput) => {
  try {
    const provider = ovpnManager.addCustomProvider(providerInput);
    return { ok: true, provider, ...ovpnManager.listAccounts() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('open-vpn-sandbox', async () => {
  try {
    const sandboxDir = [
      path.resolve(__dirname, '..', 'vpn-sandbox'),
      '/usr/local/share/robos/vpn-sandbox',
    ].find(d => fs.existsSync(path.join(d, 'main.js')));
    if (!sandboxDir) throw new Error('vpn-sandbox package not found.');
    const bin = [process.versions.electron && process.execPath, '/usr/bin/electron'].find(
      p => typeof p === 'string' && fs.existsSync(p)
    );
    if (bin) {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      cp.spawn(bin, [sandboxDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
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

module.exports = { ovpnManager };

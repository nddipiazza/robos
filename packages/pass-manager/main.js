'use strict';

const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let kdbx = null;
for (const p of [
  path.resolve(__dirname, '..', 'robos-lib', 'kdbx-vault'),
  '/usr/local/share/robos/robos-lib/kdbx-vault',
]) {
  try { kdbx = require(p); break; } catch {}
}

let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

let win = null;
let activeDbPath = kdbx ? kdbx.getDefaultKdbxPath() : path.join(os.homedir(), '.config', 'robos', 'vault', 'robos-passwords.kdbx');

function sendTouchStatus(payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('kdbx:touch-status', payload);
  }
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    win.moveTop();
  }
});

app.setName('pass-manager');
app.whenReady().then(() => {
  const iconPng = path.join(__dirname, 'icon.png');
  win = new BrowserWindow({
    width: 980,
    height: 660,
    minWidth: 780,
    minHeight: 520,
    title: 'RobOS Pass Manager (KeePassXC .kdbx + Physical Key Studio)',
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) {
    try {
      if (typeof _debugServer.registerSnapshotIPC === 'function') {
        _debugServer.registerSnapshotIPC(win);
      }
      _debugServer.startDebugServer(win, 19113, 'pass-manager');
    } catch {}
  }
});

app.on('window-all-closed', () => app.quit());

// ── KeePassXC (.kdbx) + Physical Key IPC Handlers ───────────────────────────

ipcMain.handle('get-vault-status', (_, opts = {}) => {
  const dbPath = opts.dbPath || activeDbPath;
  activeDbPath = dbPath;
  return kdbx.getVaultStatus({ dbPath });
});

ipcMain.handle('list-entries', (_, opts = {}) => {
  const dbPath = (opts && opts.dbPath) || activeDbPath;
  return kdbx.listEntries({ dbPath });
});

ipcMain.handle('init-store', async (_, opts = {}) => {
  const dbPath = opts.dbPath || activeDbPath;
  activeDbPath = path.resolve(dbPath);
  const res = await kdbx.initDatabase({
    dbPath: activeDbPath,
    masterPassword: opts.passphrase || opts.masterPassword || '',
    enrollHardwareKey: Boolean(opts.enrollHardwareKey),
    hardwareOnly: Boolean(opts.hardwareOnly),
    requireBoth2FA: Boolean(opts.requireBoth2FA),
    pin: opts.pin || '',
    simulateHardware: Boolean(opts.simulateHardware),
    onStatus: (st) => sendTouchStatus(st),
  });
  return res;
});

ipcMain.handle('unlock-password', async (_, opts = {}) => {
  const dbPath = opts.dbPath || activeDbPath;
  activeDbPath = path.resolve(dbPath);
  return kdbx.unlockWithPassword({
    dbPath: activeDbPath,
    masterPassword: opts.masterPassword || opts.passphrase || '',
  });
});

ipcMain.handle('unlock-hardware-key', async (_, opts = {}) => {
  const dbPath = opts.dbPath || activeDbPath;
  activeDbPath = path.resolve(dbPath);
  return kdbx.unlockWithHardwareKey({
    dbPath: activeDbPath,
    masterPassword: opts.masterPassword || '',
    pin: opts.pin || '',
    simulate: Boolean(opts.simulate),
    onStatus: (st) => sendTouchStatus(st),
  });
});

ipcMain.handle('enroll-hardware-key', async (_, opts = {}) => {
  const dbPath = opts.dbPath || activeDbPath;
  activeDbPath = path.resolve(dbPath);
  return kdbx.enrollHardwareKeyOnDatabase({
    dbPath: activeDbPath,
    masterPassword: opts.masterPassword || '',
    requireBoth2FA: Boolean(opts.requireBoth2FA),
    pin: opts.pin || '',
    simulate: Boolean(opts.simulate),
    onStatus: (st) => sendTouchStatus(st),
  });
});

ipcMain.handle('get-entry', async (_, entryPath) => {
  return kdbx.getEntry({ dbPath: activeDbPath, entryPath });
});

ipcMain.handle('copy-entry', async (_, entryPath) => {
  const res = kdbx.getEntry({ dbPath: activeDbPath, entryPath });
  if (!res.ok) return res;
  clipboard.writeText(res.password || '');
  return { ok: true };
});

ipcMain.handle('copy-text', async (_, text) => {
  clipboard.writeText(String(text || ''));
  return { ok: true };
});

ipcMain.handle('save-entry', async (_, opts = {}) => {
  return kdbx.saveEntry({
    dbPath: activeDbPath,
    entryPath: opts.entryPath,
    username: opts.username || '',
    password: opts.password || opts.value || '',
    url: opts.url || '',
    notes: opts.notes || '',
  });
});

// Backward-compatible IPC aliases
ipcMain.handle('add-entry', async (_, { entryPath, value, username, url, notes }) => {
  return kdbx.saveEntry({
    dbPath: activeDbPath,
    entryPath,
    username: username || '',
    password: value || '',
    url: url || '',
    notes: notes || '',
  });
});

ipcMain.handle('add-multiline', async (_, { entryPath, value }) => {
  const lines = String(value || '').split('\n');
  const password = lines[0] || '';
  let username = '';
  let url = '';
  const noteLines = [];
  for (const line of lines.slice(1)) {
    if (/^(login|user|username):\s*/i.test(line) && !username) {
      username = line.replace(/^(login|user|username):\s*/i, '').trim();
    } else if (/^url:\s*/i.test(line) && !url) {
      url = line.replace(/^url:\s*/i, '').trim();
    } else {
      noteLines.push(line);
    }
  }
  return kdbx.saveEntry({
    dbPath: activeDbPath,
    entryPath,
    username,
    password,
    url,
    notes: noteLines.join('\n').trim(),
  });
});

ipcMain.handle('delete-entry', async (_, entryPath) => {
  return kdbx.deleteEntry({ dbPath: activeDbPath, entryPath });
});

ipcMain.handle('rename-entry', async (_, { from, to }) => {
  return kdbx.moveEntry({ dbPath: activeDbPath, from, to });
});

ipcMain.handle('generate-password', async (_, opts = {}) => {
  return kdbx.generatePassword(opts);
});

ipcMain.handle('generate-entry', async (_, { entryPath, length, username, url, notes }) => {
  const gen = kdbx.generatePassword({ length: length || 32 });
  if (!gen.ok) return gen;
  return kdbx.saveEntry({
    dbPath: activeDbPath,
    entryPath,
    username: username || '',
    password: gen.password,
    url: url || '',
    notes: notes || '',
  });
});

ipcMain.handle('get-db-info', async () => {
  return kdbx.getDatabaseInfo({ dbPath: activeDbPath });
});

ipcMain.handle('get-lock-status', () => {
  const st = kdbx.getVaultStatus({ dbPath: activeDbPath });
  return { locked: st.locked, status: st };
});

ipcMain.handle('lock-store', () => {
  const res = kdbx.lockDatabase({ dbPath: activeDbPath });
  return res;
});

ipcMain.handle('open-unlock-dialog', () => {
  if (win) {
    win.show();
    win.focus();
  }
  return { ok: true };
});

ipcMain.handle('choose-kdbx-file', async (_, { mode = 'open' } = {}) => {
  if (mode === 'create') {
    const r = await dialog.showSaveDialog(win, {
      title: 'Create New KeePassXC (.kdbx) Keystore Archive',
      defaultPath: path.join(kdbx.getDefaultVaultDir(), 'my-keystore.kdbx'),
      filters: [{ name: 'KeePassXC Database (.kdbx)', extensions: ['kdbx'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    activeDbPath = r.filePath.endsWith('.kdbx') ? r.filePath : `${r.filePath}.kdbx`;
    return { ok: true, dbPath: activeDbPath, status: kdbx.getVaultStatus({ dbPath: activeDbPath }) };
  }
  const r = await dialog.showOpenDialog(win, {
    title: 'Open KeePassXC (.kdbx) Keystore Archive',
    defaultPath: kdbx.getDefaultVaultDir(),
    properties: ['openFile'],
    filters: [{ name: 'KeePassXC Database (.kdbx)', extensions: ['kdbx'] }],
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
  activeDbPath = r.filePaths[0];
  kdbx.setActiveKdbxPath(activeDbPath);
  return { ok: true, dbPath: activeDbPath, status: kdbx.getVaultStatus({ dbPath: activeDbPath }) };
});

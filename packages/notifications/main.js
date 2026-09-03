const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const net  = require('net');

// Debug server (optional)
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

// Single-instance lock (bypassed in test mode)
if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); process.exit(0); }
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win = null;

const HOME_DIR   = process.env.HOME || os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.config', 'robos');
const NOTIF_FILE = path.join(CONFIG_DIR, 'notifications.json');
const PREFS_FILE = path.join(CONFIG_DIR, 'notification-prefs.json');

function loadNotifications() {
  try {
    if (fs.existsSync(NOTIF_FILE)) return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
  } catch {}
  return [];
}

function saveNotifications(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(NOTIF_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_FILE)) return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
  } catch {}
  return {
    categoryOverrides: {},
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    dnd: false,
  };
}

function savePrefs(prefs) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf8');
}

function createWindow() {
  win = new BrowserWindow({
    title: 'RobOS Notifications',
    width: 900,
    height: 620,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#0d1117',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  if (_debugServer) _debugServer.startDebugServer(win, 19115);
}

function showWindow() {
  if (!win) return;
  if (!win.isVisible()) win.show();
  win.focus();
  win.moveTop();
}

app.on('second-instance', () => showWindow());
app.setName('notifications');
app.whenReady().then(createWindow);

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-notifications', () => loadNotifications());

ipcMain.handle('mark-read', (_, id) => {
  const data = loadNotifications();
  data.forEach(n => { if (!id || n.id === id) n.read = true; });
  saveNotifications(data);
  return true;
});

ipcMain.handle('mark-read-by-category', (_, category) => {
  const data = loadNotifications();
  data.forEach(n => { if (n.category === category) n.read = true; });
  saveNotifications(data);
  return true;
});

ipcMain.handle('delete-notification', (_, id) => {
  const data = loadNotifications().filter(n => n.id !== id);
  saveNotifications(data);
  return true;
});

ipcMain.handle('clear-read', () => {
  const data = loadNotifications().filter(n => !n.read);
  saveNotifications(data);
  return true;
});

ipcMain.handle('clear-all', () => {
  saveNotifications([]);
  return true;
});

ipcMain.handle('get-unread-count', () => {
  const data = loadNotifications();
  return data.filter(n => !n.read).length;
});

ipcMain.handle('get-unread-by-category', () => {
  const data = loadNotifications();
  const counts = {};
  data.forEach(n => {
    if (!n.read) {
      const cat = n.category || 'system';
      counts[cat] = (counts[cat] || 0) + 1;
    }
  });
  return counts;
});

ipcMain.handle('get-prefs', () => loadPrefs());
ipcMain.handle('save-prefs', (_, prefs) => {
  savePrefs(prefs);
  return { ok: true };
});

ipcMain.handle('open-app-context', (_, action) => {
  if (action && action.app) {
    const sockPath = process.env.ROBOS_DM_SOCKET || `/tmp/robos-dm-${process.getuid ? process.getuid() : 1000}.sock`;
    try {
      const client = net.connect(sockPath, () => {
        client.write(JSON.stringify({ launch: action.app }));
        client.end();
      });
    } catch {}
  }
  return { ok: true };
});

module.exports = { loadNotifications, saveNotifications, loadPrefs, savePrefs };

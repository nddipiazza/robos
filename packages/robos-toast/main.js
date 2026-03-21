const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// Debug server (optional)
var _debugServer = null;
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

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.setName('robos-toast');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const NOTIF_FILE = path.join(os.homedir(), '.config', 'robos', 'notifications.json');
const PREFS_FILE = path.join(os.homedir(), '.config', 'robos', 'notification-prefs.json');

// ── Notification categories and tiers ───────────────────────────────────────

const CATEGORIES = ['pr_review', 'ci_cd', 'task', 'agent', 'system'];
const TIERS = ['critical', 'warning', 'info'];

const TIER_DEFAULTS = {
  critical: { persistent: true, duration: 0, sound: true },
  warning:  { persistent: false, duration: 15000, sound: true },
  info:     { persistent: false, duration: 5000, sound: false },
};

function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_FILE)) return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
  } catch {}
  return { categoryOverrides: {}, quietHours: { enabled: false, start: '22:00', end: '07:00' }, dnd: false };
}

function isQuietHours() {
  const prefs = loadPrefs();
  if (!prefs.quietHours || !prefs.quietHours.enabled) return false;
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const current = hh * 60 + mm;
  const [sh, sm] = (prefs.quietHours.start || '22:00').split(':').map(Number);
  const [eh, em] = (prefs.quietHours.end || '07:00').split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) return current >= start && current < end;
  return current >= start || current < end;
}

function shouldPlaySound(category, tier) {
  const prefs = loadPrefs();
  if (isQuietHours() && tier !== 'critical') return false;
  const override = prefs.categoryOverrides?.[category]?.[tier];
  if (override && override.sound !== undefined) return !!override.sound;
  return TIER_DEFAULTS[tier]?.sound || false;
}

function getDuration(category, tier) {
  const prefs = loadPrefs();
  const override = prefs.categoryOverrides?.[category]?.[tier];
  if (override && override.duration !== undefined) return override.duration;
  if (override && override.persistent) return 0;
  return TIER_DEFAULTS[tier]?.duration || 5000;
}

function isPersistent(category, tier) {
  const prefs = loadPrefs();
  const override = prefs.categoryOverrides?.[category]?.[tier];
  if (override && override.persistent !== undefined) return override.persistent;
  return TIER_DEFAULTS[tier]?.persistent || false;
}

// Track last known notification IDs to detect new ones
let knownIds = new Set();
// Active toast windows (top-right stack)
const activeToasts = [];
const MAX_VISIBLE_TOASTS = 5;
const queuedToasts = [];
const TOAST_HEIGHT = 100;
const TOAST_GAP    = 8;
const TOAST_MARGIN = 20;
const TOAST_WIDTH  = 360;

function loadNotifications() {
  try {
    if (fs.existsSync(NOTIF_FILE)) return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
  } catch {}
  return [];
}

function initKnownIds() {
  const notifs = loadNotifications();
  notifs.forEach(n => {
    if (n.sticky && !n.read) {
      createToast(n);
    }
    knownIds.add(n.id);
  });
}

function getToastY(index) {
  const display = screen.getPrimaryDisplay();
  return TOAST_MARGIN + (TOAST_HEIGHT + TOAST_GAP) * index;
}

function repositionToasts() {
  activeToasts.forEach((win, i) => {
    if (!win.isDestroyed()) {
      win.setPosition(win.getBounds().x, getToastY(i));
    }
  });
}

function getTierBorderColor(tier) {
  switch (tier) {
    case 'critical': return '#f85149';
    case 'warning':  return '#d29922';
    case 'info':
    default:         return '#00bcd4';
  }
}

function createToast(notif) {
  const prefs = loadPrefs();

  // DND mode — queue critical, suppress everything else
  if (prefs.dnd) {
    if (notif.tier === 'critical' || notif.sticky) {
      queuedToasts.push(notif);
    }
    return;
  }

  // Max visible check
  if (activeToasts.length >= MAX_VISIBLE_TOASTS) {
    queuedToasts.push(notif);
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width } = display.workAreaSize;
  const index = activeToasts.length;

  const category = notif.category || 'system';
  const tier = notif.tier || 'info';
  const persistent = notif.sticky || isPersistent(category, tier);
  const duration = persistent ? 0 : getDuration(category, tier);

  const win = new BrowserWindow({
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    x: width - TOAST_WIDTH - TOAST_MARGIN,
    y: getToastY(index),
    frame: false,
    transparent: false,
    backgroundColor: '#161b22',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setIgnoreMouseEvents(false);
  win.loadFile(path.join(__dirname, 'toast.html'));

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('toast-data', {
      ...notif,
      _tierColor: getTierBorderColor(tier),
      _persistent: persistent,
      _duration: duration,
    });
  });

  activeToasts.push(win);

  // Auto-dismiss
  if (!persistent && duration > 0) {
    const timer = setTimeout(() => {
      dismissToast(win);
    }, duration);
    win.on('closed', () => clearTimeout(timer));
  }

  win.on('closed', () => {
    const idx = activeToasts.indexOf(win);
    if (idx !== -1) activeToasts.splice(idx, 1);
    repositionToasts();
    // Show queued toasts
    if (queuedToasts.length > 0 && activeToasts.length < MAX_VISIBLE_TOASTS) {
      createToast(queuedToasts.shift());
    }
  });
}

function dismissToast(win) {
  if (!win.isDestroyed()) win.close();
}

ipcMain.on('dismiss-toast', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) dismissToast(win);
});

ipcMain.on('toast-action', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (action && action.type === 'open-app') {
    const { spawn: spawnProc } = require('child_process');
    // Try launching via desktop-manager socket
    const net = require('net');
    const sockPath = `/run/user/${process.getuid()}/robos-dm.sock`;
    try {
      const sock = net.connect(sockPath);
      sock.write(JSON.stringify({ launch: action.app }));
      sock.end();
    } catch {
      // Fallback: launch directly
      const appBase = '/usr/local/share/robos';
      const script = path.join(appBase, action.app, `${action.app}.sh`);
      if (fs.existsSync(script)) {
        const { exec } = require('child_process');
        exec(`bash "${script}"`, { env: { ...process.env, DISPLAY: ':0' } });
      }
    }
  }
  if (win) dismissToast(win);
});

function checkForNewNotifications() {
  const notifs = loadNotifications();
  const newOnes = notifs.filter(n => !knownIds.has(n.id) && !n.read);
  newOnes.forEach(n => {
    knownIds.add(n.id);
    createToast(n);
  });
}

let debugWin = null;

app.on('ready', () => {
  if (app.dock) app.dock.hide();

  // Create a hidden window for debug server
  debugWin = new BrowserWindow({
    width: 1, height: 1,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  debugWin.loadFile(path.join(__dirname, 'toast.html'));

  if (_debugServer) _debugServer.startDebugServer(debugWin, 19126);

  initKnownIds();

  const dir = path.dirname(NOTIF_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(NOTIF_FILE)) fs.writeFileSync(NOTIF_FILE, '[]');

  fs.watch(NOTIF_FILE, { persistent: true }, (event) => {
    if (event === 'change') {
      setTimeout(checkForNewNotifications, 100);
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running even with no windows
});

// Export for testing
module.exports = {
  loadPrefs, isQuietHours, shouldPlaySound, getDuration, isPersistent,
  CATEGORIES, TIERS, TIER_DEFAULTS, getTierBorderColor,
};

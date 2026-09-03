const { app, BrowserWindow, ipcMain, screen } = require('electron');
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

app.setName('robos-toast');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const HOME_DIR   = process.env.HOME || os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.config', 'robos');
const NOTIF_FILE = path.join(CONFIG_DIR, 'notifications.json');
const PREFS_FILE = path.join(CONFIG_DIR, 'notification-prefs.json');

// ── Notification Categories, Events & Tiers ──────────────────────────────────

const CATEGORIES = ['pr_review', 'ci_cd', 'task', 'agent', 'system'];
const TIERS = ['critical', 'warning', 'info'];

const EVENT_CATEGORY_MAP = {
  pr_review_requested: 'pr_review',
  pr_review_received:  'pr_review',
  pr_merged:           'pr_review',
  ci_started:          'ci_cd',
  ci_completed:        'ci_cd',
  ci_failed:           'ci_cd',
  deploy:              'ci_cd',
  task_started:        'task',
  task_status_changed: 'task',
  agent_session:       'agent',
  disk_low:            'system',
  service_crash:       'system',
  update_available:    'system',
};

function normalizeCategory(catOrEvent) {
  if (!catOrEvent) return 'system';
  if (EVENT_CATEGORY_MAP[catOrEvent]) return EVENT_CATEGORY_MAP[catOrEvent];
  if (CATEGORIES.includes(catOrEvent)) return catOrEvent;
  return 'system';
}

const TIER_DEFAULTS = {
  critical: { persistent: true, duration: 0, sound: true },
  warning:  { persistent: false, duration: 15000, sound: true },
  info:     { persistent: false, duration: 5000, sound: false },
};

function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_FILE)) {
      return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    }
  } catch {}
  return {
    categoryOverrides: {},
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    dnd: false,
  };
}

function savePrefs(prefs) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
    return true;
  } catch { return false; }
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
  const normalized = normalizeCategory(category);
  const override = prefs.categoryOverrides?.[normalized]?.[tier];
  if (override && override.sound !== undefined) return !!override.sound;
  return TIER_DEFAULTS[tier]?.sound || false;
}

function getDuration(category, tier) {
  const prefs = loadPrefs();
  const normalized = normalizeCategory(category);
  const override = prefs.categoryOverrides?.[normalized]?.[tier];
  if (override && override.duration !== undefined) return override.duration;
  if (override && override.persistent) return 0;
  return TIER_DEFAULTS[tier]?.duration || 5000;
}

function isPersistent(category, tier) {
  const prefs = loadPrefs();
  const normalized = normalizeCategory(category);
  const override = prefs.categoryOverrides?.[normalized]?.[tier];
  if (override && override.persistent !== undefined) return override.persistent;
  return TIER_DEFAULTS[tier]?.persistent || false;
}

// ── Toast Stack Management ───────────────────────────────────────────────────

let knownIds = new Set();
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
  return TOAST_MARGIN + (TOAST_HEIGHT + TOAST_GAP) * index;
}

function repositionToasts() {
  activeToasts.forEach((item, i) => {
    if (item && item.win && !item.win.isDestroyed()) {
      item.win.setPosition(item.win.getBounds().x, getToastY(i));
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
  const category = normalizeCategory(notif.category || notif.eventType || notif.type);
  const tier = notif.tier || 'info';

  // DND mode — queue critical/sticky, suppress non-critical
  if (prefs.dnd) {
    if (tier === 'critical' || notif.sticky) {
      queuedToasts.push(notif);
    }
    return null;
  }

  // Max visible limit — queue excess
  if (activeToasts.length >= MAX_VISIBLE_TOASTS) {
    queuedToasts.push(notif);
    return null;
  }

  let width = 1920;
  try {
    const display = screen.getPrimaryDisplay();
    width = display.workAreaSize.width;
  } catch {}

  const index = activeToasts.length;
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
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'toast.html'));

  const toastItem = {
    id: notif.id || Date.now().toString(),
    win,
    notif: { ...notif, category, tier },
  };

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('toast-data', {
      ...notif,
      category,
      tier,
      _tierColor: getTierBorderColor(tier),
      _persistent: persistent,
      _duration: duration,
    });
  });

  activeToasts.push(toastItem);

  // Auto-dismiss timer
  if (!persistent && duration > 0) {
    const timer = setTimeout(() => {
      dismissToast(win);
    }, duration);
    win.on('closed', () => clearTimeout(timer));
  }

  win.on('closed', () => {
    const idx = activeToasts.findIndex(t => t.win === win);
    if (idx !== -1) activeToasts.splice(idx, 1);
    repositionToasts();
    // Dequeue next if available
    if (queuedToasts.length > 0 && activeToasts.length < MAX_VISIBLE_TOASTS) {
      createToast(queuedToasts.shift());
    }
  });

  return toastItem;
}

function dismissToast(win) {
  if (win && !win.isDestroyed()) win.close();
}

function dismissAll() {
  const copy = [...activeToasts];
  copy.forEach(t => dismissToast(t.win));
  queuedToasts.length = 0;
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.on('dismiss-toast', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) dismissToast(win);
});

ipcMain.on('toast-action', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (action && action.type === 'open-app') {
    // Dispatch app launch request to desktop-manager socket or fallback
    const sockPath = process.env.ROBOS_DM_SOCKET || `/tmp/robos-dm-${process.getuid ? process.getuid() : 1000}.sock`;
    try {
      const client = net.connect(sockPath, () => {
        client.write(JSON.stringify({ launch: action.app }));
        client.end();
      });
    } catch {}
  }
  if (win) dismissToast(win);
});

ipcMain.handle('get-active-toasts', () => {
  return activeToasts.map(t => ({
    id: t.id,
    category: t.notif.category,
    tier: t.notif.tier,
    title: t.notif.title,
  }));
});

ipcMain.handle('get-queued-toasts', () => {
  return queuedToasts.map(n => ({
    id: n.id,
    category: n.category,
    tier: n.tier,
    title: n.title,
  }));
});

ipcMain.handle('emit-toast', (_, notif) => {
  return createToast(notif) ? { ok: true } : { queued: true };
});

ipcMain.handle('get-prefs', () => loadPrefs());
ipcMain.handle('set-prefs', (_, prefs) => {
  savePrefs(prefs);
  if (!prefs.dnd && queuedToasts.length > 0) {
    while (queuedToasts.length > 0 && activeToasts.length < MAX_VISIBLE_TOASTS) {
      createToast(queuedToasts.shift());
    }
  }
  return { ok: true, prefs: loadPrefs() };
});

ipcMain.handle('dismiss-all', () => {
  dismissAll();
  return { ok: true };
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

  // Create dashboard/status window for demo and test assertions
  debugWin = new BrowserWindow({
    title: 'RobOS Toast Daemon',
    width: 900,
    height: 620,
    backgroundColor: '#0d1117',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  debugWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  debugWin.once('ready-to-show', () => {
    debugWin.show();
    debugWin.focus();
  });

  if (_debugServer) _debugServer.startDebugServer(debugWin, 19126);

  initKnownIds();

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(NOTIF_FILE)) fs.writeFileSync(NOTIF_FILE, '[]');

  try {
    fs.watch(NOTIF_FILE, { persistent: true }, (event) => {
      if (event === 'change') {
        setTimeout(checkForNewNotifications, 100);
      }
    });
  } catch {}
});

app.on('window-all-closed', (e) => e.preventDefault());

module.exports = {
  loadPrefs,
  savePrefs,
  isQuietHours,
  shouldPlaySound,
  getDuration,
  isPersistent,
  normalizeCategory,
  CATEGORIES,
  TIERS,
  TIER_DEFAULTS,
  EVENT_CATEGORY_MAP,
  getTierBorderColor,
  createToast,
  dismissAll,
};

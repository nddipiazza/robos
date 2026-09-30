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

const CATEGORIES = ['pr_review', 'ci_cd', 'task', 'agent', 'security', 'system'];
const TIERS = ['critical', 'warning', 'info', 'security'];

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
  security_auth:       'security',
  pass_locked:         'security',
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
  warning:  { persistent: false, duration: 12000, sound: true },
  info:     { persistent: false, duration: 5000, sound: false },
  security: { persistent: true, duration: 0, sound: true },
};

const DEFAULT_PREFS = {
  categoryOverrides: {},
  quietHours: { enabled: false, start: '22:00', end: '07:00' },
  dnd: false,
  deliveryMode: 'dual',
  enableGnomeNotifications: true,
  enableRobosToasts: true,
  antiSpam: {
    enabled: true,
    cooldownSeconds: 30,
    maxBurst: 4,
    burstWindowSeconds: 10,
    dedupExactContent: true,
    bypassForSecurityAndCritical: true,
  },
  fading: {
    enabled: true,
    fadeDurationMs: 350,
    pauseOnHover: true,
    showProgressBar: true,
    tierDurations: { critical: 0, warning: 12000, info: 5000, security: 0 },
    criticalAutoFade: false,
  },
  display: {
    position: 'top-right',
    maxVisible: 5,
    width: 380,
    margin: 20,
    gap: 10,
    soundEnabled: true,
    soundVolume: 80,
  },
};

function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
      return {
        ...DEFAULT_PREFS,
        ...parsed,
        antiSpam: { ...DEFAULT_PREFS.antiSpam, ...(parsed.antiSpam || {}) },
        fading: { ...DEFAULT_PREFS.fading, ...(parsed.fading || {}) },
        display: { ...DEFAULT_PREFS.display, ...(parsed.display || {}) },
        quietHours: { ...DEFAULT_PREFS.quietHours, ...(parsed.quietHours || {}) },
      };
    }
  } catch {}
  return { ...DEFAULT_PREFS };
}

function savePrefs(prefs) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
    return true;
  } catch { return false; }
}

function resetPrefs() {
  savePrefs(DEFAULT_PREFS);
  repositionToasts();
  return { ok: true, prefs: loadPrefs() };
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
  if (prefs.display && prefs.display.soundEnabled === false) return false;
  if (isQuietHours() && tier !== 'critical' && tier !== 'security') return false;
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
  if (prefs.fading?.tierDurations && prefs.fading.tierDurations[tier] !== undefined) {
    return prefs.fading.tierDurations[tier];
  }
  return TIER_DEFAULTS[tier]?.duration ?? 5000;
}

function isPersistent(category, tier) {
  const prefs = loadPrefs();
  const normalized = normalizeCategory(category);
  const override = prefs.categoryOverrides?.[normalized]?.[tier];
  if (override && override.persistent !== undefined) return override.persistent;
  if (prefs.fading?.criticalAutoFade && tier === 'critical') return false;
  return TIER_DEFAULTS[tier]?.persistent || false;
}

// ── Anti-Spam & Respam Control State ──────────────────────────────────────────

const antiSpamHistory = new Map();
const recentDispatches = [];

function isAntiSpamThrottled(key, tier, title, body) {
  const prefs = loadPrefs();
  const antiSpam = prefs.antiSpam || DEFAULT_PREFS.antiSpam;
  if (!antiSpam.enabled) return false;

  if (antiSpam.bypassForSecurityAndCritical && (tier === 'critical' || tier === 'security' || (key && key.startsWith('security-')))) {
    return false;
  }

  const now = Date.now();
  const burstWindowMs = (antiSpam.burstWindowSeconds || 10) * 1000;
  while (recentDispatches.length > 0 && recentDispatches[0] < now - burstWindowMs) {
    recentDispatches.shift();
  }
  const maxBurst = antiSpam.maxBurst || 4;
  if (recentDispatches.length >= maxBurst) return true;

  if (antiSpam.dedupExactContent && title && body) {
    const contentKey = `content:${title.trim()}:${body.trim()}`;
    const prevContent = antiSpamHistory.get(contentKey);
    const cooldownMs = (antiSpam.cooldownSeconds || 30) * 1000;
    if (prevContent && now - prevContent.lastNotifiedAt < cooldownMs) return true;
  }

  if (key) {
    const prev = antiSpamHistory.get(key);
    const cooldownMs = (antiSpam.cooldownSeconds || 30) * 1000;
    if (prev && now - prev.lastNotifiedAt < cooldownMs) return true;
  }

  return false;
}

function recordAntiSpamDispatch(key, title, body) {
  const now = Date.now();
  recentDispatches.push(now);
  if (key) antiSpamHistory.set(key, { lastNotifiedAt: now });
  if (title && body) antiSpamHistory.set(`content:${title.trim()}:${body.trim()}`, { lastNotifiedAt: now });
}

// ── Telemetry Audit Log ───────────────────────────────────────────────────────

const telemetryLog = [];

function logTelemetry(type, notif, outcome, detail = '') {
  const entry = {
    id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    title: notif?.title || 'Unknown',
    category: notif?.category || 'system',
    tier: notif?.tier || 'info',
    outcome,
    detail,
  };
  telemetryLog.unshift(entry);
  if (telemetryLog.length > 200) telemetryLog.length = 200;

  if (debugWin && !debugWin.isDestroyed() && debugWin.webContents) {
    debugWin.webContents.send('telemetry-event', entry);
  }
}

// ── Toast Stack Management & Positioning ──────────────────────────────────────

let knownIds = new Set();
const activeToasts = [];
const queuedToasts = [];

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

function getToastBounds(index, totalActive = 1, optionsCount = 0) {
  const prefs = loadPrefs();
  const pos = prefs.display?.position || 'top-right';
  const margin = prefs.display?.margin || 20;
  const gap = prefs.display?.gap || 10;
  const width = prefs.display?.width || 380;
  const height = optionsCount > 0 ? 135 : 100;

  let screenWidth = 1920, screenHeight = 1080;
  try {
    const display = screen.getPrimaryDisplay();
    screenWidth = display.workAreaSize.width;
    screenHeight = display.workAreaSize.height;
  } catch {}

  let x = screenWidth - width - margin;
  let y = margin + (height + gap) * index;

  if (pos === 'top-left') {
    x = margin;
    y = margin + (height + gap) * index;
  } else if (pos === 'top-center') {
    x = Math.round((screenWidth - width) / 2);
    y = margin + (height + gap) * index;
  } else if (pos === 'bottom-right') {
    x = screenWidth - width - margin;
    y = screenHeight - margin - height - (height + gap) * index;
  } else if (pos === 'bottom-left') {
    x = margin;
    y = screenHeight - margin - height - (height + gap) * index;
  }

  return { x, y, width, height };
}

function repositionToasts() {
  activeToasts.forEach((item, i) => {
    if (item && item.win && !item.win.isDestroyed()) {
      const optionsCount = (item.notif.actions || item.notif.options || []).length;
      const bounds = getToastBounds(i, activeToasts.length, optionsCount);
      item.win.setBounds(bounds);
    }
  });
}

function getTierBorderColor(tier) {
  switch (tier) {
    case 'critical': return '#f85149';
    case 'warning':  return '#d29922';
    case 'security': return '#a371f7';
    case 'info':
    default:         return '#00bcd4';
  }
}

function createToast(notif) {
  const prefs = loadPrefs();
  const category = normalizeCategory(notif.category || notif.eventType || notif.type);
  const tier = notif.tier || (category === 'security' ? 'security' : 'info');

  // Check delivery mode overrides
  if (prefs.enableRobosToasts === false || prefs.deliveryMode === 'native_only') {
    logTelemetry('TOAST_SUPPRESSED', notif, 'NATIVE_ONLY_MODE', 'RobOS overlay toasts disabled in delivery settings.');
    return null;
  }

  // DND mode — queue critical/security/sticky, suppress non-critical
  if (prefs.dnd) {
    if (tier === 'critical' || tier === 'security' || notif.sticky) {
      queuedToasts.push(notif);
      logTelemetry('TOAST_QUEUED', notif, 'DND_QUEUED', 'Critical alert queued due to active DND.');
    } else {
      logTelemetry('TOAST_SUPPRESSED', notif, 'DND_SUPPRESSED', 'Non-critical alert suppressed in DND mode.');
    }
    return null;
  }

  // Anti-Spam Throttle check
  const spamKey = notif.entityKey || notif.id || `${category}:${notif.title}`;
  if (!notif.bypassAntiSpam && isAntiSpamThrottled(spamKey, tier, notif.title, notif.body || notif.message)) {
    logTelemetry('TOAST_THROTTLED', notif, 'ANTI_SPAM_THROTTLED', `Repeated alert throttled within cooldown (${prefs.antiSpam.cooldownSeconds}s).`);
    return null;
  }
  recordAntiSpamDispatch(spamKey, notif.title, notif.body || notif.message);

  const maxVisible = prefs.display?.maxVisible || 5;
  if (activeToasts.length >= maxVisible) {
    queuedToasts.push(notif);
    logTelemetry('TOAST_QUEUED', notif, 'STACK_FULL', `Active stack limit reached (${maxVisible}). Queued.`);
    return null;
  }

  const optionsCount = (notif.actions || notif.options || []).length;
  const bounds = getToastBounds(activeToasts.length, activeToasts.length + 1, optionsCount);

  const persistent = notif.sticky || isPersistent(category, tier);
  const duration = persistent ? 0 : getDuration(category, tier);

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
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
    closing: false,
  };

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('toast-data', {
      ...notif,
      category,
      tier,
      _tierColor: getTierBorderColor(tier),
      _persistent: persistent,
      _duration: duration,
      _fading: prefs.fading,
    });
  });

  activeToasts.push(toastItem);
  logTelemetry('TOAST_DISPATCHED', notif, 'DELIVERED', `Rendered toast overlay in position ${prefs.display?.position || 'top-right'}.`);

  // Auto-dismiss timer with smooth fade-out
  if (!persistent && duration > 0) {
    const timer = setTimeout(() => {
      fadeAndDismissToast(win);
    }, duration);
    win.on('closed', () => clearTimeout(timer));
  }

  win.on('closed', () => {
    const idx = activeToasts.findIndex(t => t.win === win);
    if (idx !== -1) activeToasts.splice(idx, 1);
    repositionToasts();
    // Dequeue next if available
    if (queuedToasts.length > 0 && activeToasts.length < (prefs.display?.maxVisible || 5)) {
      createToast(queuedToasts.shift());
    }
  });

  return toastItem;
}

function fadeAndDismissToast(win) {
  if (!win || win.isDestroyed()) return;
  const item = activeToasts.find(t => t.win === win);
  if (item && item.closing) return;
  if (item) item.closing = true;

  try {
    win.webContents.send('start-fade-out');
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.close();
    }, 380);
  } catch {
    if (win && !win.isDestroyed()) win.close();
  }
}

function dismissToast(win) {
  fadeAndDismissToast(win);
}

function dismissAll() {
  const copy = [...activeToasts];
  copy.forEach(t => fadeAndDismissToast(t.win));
  queuedToasts.length = 0;
  logTelemetry('DISMISS_ALL', { title: 'All Toasts' }, 'DISMISSED_ALL', 'User cleared all active overlay toasts.');
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.on('dismiss-toast', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.on('toast-action', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  logTelemetry('TOAST_ACTION', { title: action?.label || 'Action Clicked' }, 'ACTION_EXECUTED', JSON.stringify(action));

  if (action && action.type === 'open-app') {
    const sockPath = process.env.ROBOS_DM_SOCKET || `/tmp/robos-dm-${process.getuid ? process.getuid() : 1000}.sock`;
    try {
      const client = net.connect(sockPath, () => {
        client.write(JSON.stringify({ launch: action.app }));
        client.end();
      });
    } catch {}
  }
  if (win && !win.isDestroyed()) win.close();
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
  repositionToasts();
  if (!prefs.dnd && queuedToasts.length > 0) {
    const maxVisible = prefs.display?.maxVisible || 5;
    while (queuedToasts.length > 0 && activeToasts.length < maxVisible) {
      createToast(queuedToasts.shift());
    }
  }
  return { ok: true, prefs: loadPrefs() };
});

ipcMain.handle('reset-prefs', () => resetPrefs());

ipcMain.handle('dismiss-all', () => {
  dismissAll();
  return { ok: true };
});

ipcMain.handle('get-telemetry-log', () => telemetryLog);
ipcMain.handle('clear-telemetry-log', () => {
  telemetryLog.length = 0;
  return { ok: true };
});

ipcMain.handle('simulate-toast', (_, notif) => {
  const result = createToast({ ...notif, bypassAntiSpam: notif.bypassAntiSpam ?? true });
  return result ? { ok: true, id: result.id } : { ok: false };
});

ipcMain.handle('get-system-info', () => {
  let notifySendAvailable = false;
  try {
    const cp = require('child_process');
    const res = cp.spawnSync('which', ['notify-send']);
    notifySendAvailable = res.status === 0;
  } catch {}

  return {
    notifySendAvailable,
    desktop: process.env.XDG_CURRENT_DESKTOP || 'GNOME',
    display: process.env.DISPLAY || ':0',
    platform: process.platform,
    version: 'RobOS 2026.1',
  };
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
    title: 'RobOS Toast Notification Console',
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 550,
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
  resetPrefs,
  isQuietHours,
  shouldPlaySound,
  getDuration,
  isPersistent,
  normalizeCategory,
  CATEGORIES,
  TIERS,
  TIER_DEFAULTS,
  DEFAULT_PREFS,
  EVENT_CATEGORY_MAP,
  getTierBorderColor,
  createToast,
  dismissAll,
  isAntiSpamThrottled,
  antiSpamHistory,
  recentDispatches,
  getToastBounds,
};

'use strict';

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

const activeOverlayToasts = new Map(); // key -> BrowserWindow
const lastToastTimeByDs = new Map();

function getHomeDir() {
  return process.env.HOME || os.homedir();
}

function getNotifFile() {
  return path.join(getHomeDir(), '.config', 'robos', 'notifications.json');
}

function getSocketPath() {
  if (process.env.ROBOS_DM_SOCKET) return process.env.ROBOS_DM_SOCKET;
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${uid}`;
  const runtimeSock = path.join(runtimeDir, 'robos-dm.sock');
  if (fs.existsSync(runtimeSock)) return runtimeSock;
  return `/tmp/robos-dm-${uid}.sock`;
}

function resolveToastAssets() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'robos-toast'),
    '/usr/local/share/robos/robos-toast',
  ];
  for (const dir of candidates) {
    const html = path.join(dir, 'toast.html');
    const preload = path.join(dir, 'preload.js');
    if (fs.existsSync(html) && fs.existsSync(preload)) {
      return { html, preload };
    }
  }
  return null;
}

function appendNotificationRecord(record) {
  try {
    const file = getNotifFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let list = [];
    if (fs.existsSync(file)) {
      try {
        list = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(list)) list = [];
      } catch {
        list = [];
      }
    }
    // Remove previous unread auth notifications for the same entityKey to avoid duplicates
    if (record.entityKey) {
      list = list.filter(n => !(n.entityKey === record.entityKey && !n.read));
    }
    list.unshift(record);
    if (list.length > 200) list.length = 200;
    fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
  } catch {}
}

function clearAuthNotificationRecords(dsId) {
  try {
    const file = getNotifFile();
    if (!fs.existsSync(file)) return;
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(list)) return;
    const entityKey = `datasource-auth:${dsId}`;
    let changed = false;
    for (const item of list) {
      if (item.entityKey === entityKey && !item.read) {
        item.read = true;
        item.sticky = false;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
    }
  } catch {}
}

function notifyDesktopManager(payload) {
  try {
    const sock = getSocketPath();
    if (!fs.existsSync(sock)) return;
    const client = net.connect(sock, () => {
      client.write(JSON.stringify({ notify: payload }));
      client.end();
    });
    client.on('error', () => {});
  } catch {}
}

function getTopRightBounds(electronScreen, index = 0, hasActions = true) {
  const width = 390;
  const height = hasActions ? 138 : 102;
  const margin = 20;
  const gap = 10;
  let workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  try {
    if (electronScreen && typeof electronScreen.getPrimaryDisplay === 'function') {
      const display = electronScreen.getPrimaryDisplay();
      if (display && display.workArea) {
        workArea = display.workArea;
      } else if (display && display.workAreaSize) {
        workArea = { x: 0, y: 0, ...display.workAreaSize };
      }
    }
  } catch {}
  return {
    x: workArea.x + workArea.width - width - margin,
    y: workArea.y + margin + (height + gap) * index,
    width,
    height,
  };
}

function dismissOverlayToast(key) {
  const win = activeOverlayToasts.get(key);
  if (!win) return;
  activeOverlayToasts.delete(key);
  try {
    if (!win.isDestroyed()) {
      win.webContents.send('start-fade-out');
      setTimeout(() => {
        try { if (!win.isDestroyed()) win.close(); } catch {}
      }, 360).unref?.();
    }
  } catch {
    try { if (!win.isDestroyed()) win.close(); } catch {}
  }
}

function getDataSourcesFile() {
  return path.join(getHomeDir(), '.config', 'robos', 'data-sources.json');
}

function isDsAuthenticatedOnDisk(dsId) {
  if (!dsId) return false;
  try {
    const f = getDataSourcesFile();
    if (!fs.existsSync(f)) return false;
    const list = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!Array.isArray(list)) return false;
    const ds = list.find(d => d && d.id === dsId);
    if (!ds) return false;
    if (ds.authStatus === 'logged_out' || ds.status === 'Login Required' || ds.loggedIn === false) {
      return false;
    }
    return Boolean(ds.refreshToken || ds.accessToken || ds.localMountPath || ds.serviceAccountKeyPath || ds.serviceAccountJson);
  } catch {
    return false;
  }
}

/**
 * Spawns a top-right overlay toast window (using robos-toast's toast.html)
 * directly from the current Electron process so the user always sees the
 * top-right login popup even if the background robos-toast daemon isn't running.
 */
function showOverlayToastWindow(electron, notif, { key, dsId, persistent = false, duration = 10000 } = {}) {
  try {
    if (!electron || !electron.BrowserWindow || typeof electron.BrowserWindow !== 'function') return null;
    if (process.env.ROBOS_GRAPH_ROOT !== undefined) return null;
    const assets = resolveToastAssets();
    if (!assets) return null;

    if (key && activeOverlayToasts.has(key)) {
      const existing = activeOverlayToasts.get(key);
      if (existing && !existing.isDestroyed()) {
        existing.moveTop();
        return existing;
      }
      activeOverlayToasts.delete(key);
    }

    const index = activeOverlayToasts.size;
    const hasActions = Array.isArray(notif.actions) && notif.actions.length > 0;
    const bounds = getTopRightBounds(electron.screen, index, hasActions);

    const win = new electron.BrowserWindow({
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
      hasShadow: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: assets.preload,
      },
    });

    if (key) activeOverlayToasts.set(key, win);

    win.loadFile(assets.html);
    win.webContents.once('did-finish-load', () => {
      try {
        if (win.isDestroyed()) return;
        win.showInactive();
        win.moveTop();
        const tierColor = notif.tier === 'critical' ? '#f85149'
          : notif.tier === 'warning' ? '#d29922'
          : notif.tier === 'security' ? '#a371f7'
          : '#00bcd4';
        win.webContents.send('toast-data', {
          ...notif,
          _tierColor: tierColor,
          _persistent: persistent,
          _duration: duration,
        });
      } catch {}
    });

    // Auto-dismiss timer so toast never stays stuck forever
    const effectiveDuration = duration > 0 ? duration : 12000;
    const timer = setTimeout(() => {
      if (key) dismissOverlayToast(key);
      else {
        try { if (!win.isDestroyed()) win.close(); } catch {}
      }
    }, effectiveDuration);
    timer.unref?.();

    // Also poll data-sources.json so if the user logs in from ANY process, the toast closes immediately
    let authWatchTimer = null;
    if (dsId) {
      authWatchTimer = setInterval(() => {
        if (win.isDestroyed()) {
          clearInterval(authWatchTimer);
          return;
        }
        if (isDsAuthenticatedOnDisk(dsId)) {
          clearInterval(authWatchTimer);
          clearAuthNotificationRecords(dsId);
          if (key) dismissOverlayToast(key);
          else {
            try { if (!win.isDestroyed()) win.close(); } catch {}
          }
        }
      }, 1200);
      authWatchTimer.unref?.();
    }

    win.on('closed', () => {
      clearTimeout(timer);
      if (authWatchTimer) clearInterval(authWatchTimer);
      if (key && activeOverlayToasts.get(key) === win) {
        activeOverlayToasts.delete(key);
      }
    });

    return win;
  } catch {
    return null;
  }
}

/**
 * Emits a top-right RobOS notification toast when a Google Drive (or cloud storage)
 * data source is accessed while logged out / unauthenticated / expired.
 */
function emitAuthRequiredToast(ds, { electron, reason, force = false } = {}) {
  if (!ds) return null;
  const dsId = ds.id || 'gdrive';

  // Never emit "Login Required" toast if data-sources.json on disk is already authenticated
  if (!force && isDsAuthenticatedOnDisk(dsId)) {
    clearAuthNotificationRecords(dsId);
    dismissOverlayToast(`datasource-auth:${dsId}`);
    return null;
  }

  const now = Date.now();
  const prev = lastToastTimeByDs.get(dsId) || 0;
  if (!force && now - prev < 15000) {
    return null;
  }
  lastToastTimeByDs.set(dsId, now);

  const providerLabel = ds.driverType === 'gdrive'
    ? 'Google Drive'
    : ds.driverType === 'onedrive'
      ? 'Microsoft OneDrive'
      : (ds.driverType || 'Cloud Storage').toUpperCase();
  const title = `${providerLabel} Login Required`;
  const message = reason || `RobOS tried to access "${ds.name || providerLabel}" but it is logged out. Sign in with your browser to continue.`;
  const entityKey = `datasource-auth:${dsId}`;

  const notif = {
    id: `ds-auth-${dsId}-${now}`,
    entityKey,
    title,
    message,
    body: message,
    category: 'security',
    tier: 'warning',
    source: 'RobOS Data Sources',
    timestamp: new Date(now).toISOString(),
    read: false,
    sticky: true,
    bypassAntiSpam: true,
    action: {
      type: 'open-app',
      app: 'data-sources',
      action: 'browser-login',
      dsId,
      label: '🌐 Log in with Browser',
    },
    actions: [
      {
        label: '🌐 Log in with Browser',
        variant: 'primary',
        type: 'open-app',
        app: 'data-sources',
        action: 'browser-login',
        dsId,
      },
      {
        label: 'Open Admin GUI',
        variant: 'secondary',
        type: 'open-app',
        app: 'data-sources',
        action: 'open-admin',
        dsId,
      },
    ],
  };

  appendNotificationRecord(notif);
  notifyDesktopManager(notif);
  showOverlayToastWindow(electron, notif, { key: entityKey, dsId, persistent: false, duration: 12000 });
  return notif;
}

/**
 * Dismisses any active auth-required toast for `ds.id` and shows a brief
 * confirmation toast at the top-right corner when login succeeds.
 */
function emitAuthSuccessToast(ds, { electron } = {}) {
  if (!ds) return null;
  const dsId = ds.id || 'gdrive';
  const entityKey = `datasource-auth:${dsId}`;
  clearAuthNotificationRecords(dsId);
  dismissOverlayToast(entityKey);

  const providerLabel = ds.driverType === 'gdrive'
    ? 'Google Drive'
    : ds.driverType === 'onedrive'
      ? 'Microsoft OneDrive'
      : (ds.driverType || 'Cloud Storage').toUpperCase();
  const accountText = ds.user ? ` as ${ds.user}` : '';
  const message = `"${ds.name || providerLabel}" is now authenticated${accountText} and ready for RobOS apps.`;

  const notif = {
    id: `ds-auth-ok-${dsId}-${Date.now()}`,
    entityKey: `datasource-auth-ok:${dsId}`,
    title: `${providerLabel} Connected`,
    message,
    body: message,
    category: 'security',
    tier: 'info',
    source: 'RobOS Data Sources',
    timestamp: new Date().toISOString(),
    read: false,
    sticky: false,
  };

  appendNotificationRecord(notif);
  showOverlayToastWindow(electron, notif, { key: `datasource-auth-ok:${dsId}`, persistent: false, duration: 5000 });
  return notif;
}

module.exports = {
  emitAuthRequiredToast,
  emitAuthSuccessToast,
  dismissOverlayToast,
  clearAuthNotificationRecords,
};

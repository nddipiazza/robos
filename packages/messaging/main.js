'use strict';

// RobOS Messaging: one window for Messenger, Instagram, Snapchat, Signal and SMS.
//
// Web sign-ins load each network's own web client in a <webview> with its own
// persistent session (persist:robos-messaging-<network>), so the networks never see
// each other's cookies and the window never runs their code with Node access.
// Connectors (Meta Page / Instagram APIs, signal-cli, KDE Connect) run here in the
// main process through robos-lib/messaging-hub; the window never sees a token.

let app, BrowserWindow, ipcMain, dialog, shell, session, Notification;
try {
  ({ app, BrowserWindow, ipcMain, dialog, shell, session, Notification } = require('electron'));
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
  dialog = {};
  shell = {};
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');
const TEST_MODE = process.env.ROBOS_TEST === '1' || process.env.ROBOS_TEST_MODE === '1';
const DEBUG_PORT = 19223;
const POLL_MS = Number(process.env.ROBOS_MESSAGING_POLL_MS || 60 * 1000);

try {
  const { setupGlobalErrorHandlers } = require('../robos-lib/logger');
  setupGlobalErrorHandlers('messaging', dialog);
} catch {
  try {
    const { setupGlobalErrorHandlers } = require('/usr/local/share/robos/robos-lib/logger');
    setupGlobalErrorHandlers('messaging', dialog);
  } catch {}
}

function requireShared(modName) {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, modName),
    path.resolve(__dirname, '..', 'robos-lib', modName),
    `/usr/local/share/robos/robos-lib/${modName}`,
  ].filter(Boolean)) {
    try {
      return require(p);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND' || !String(error.message).includes(modName)) throw error;
    }
  }
  throw new Error(`RobOS shared module "${modName}" not found.`);
}

let _debugServer = null;
try {
  _debugServer = requireShared('dom-snapshot');
} catch {}

let QRCode = null;
try {
  QRCode = require('qrcode');
} catch {}

const { createMessagingHub, NETWORKS } = requireShared('messaging-hub');
const hub = createMessagingHub({ configDir: CONFIG_DIR });

const userDataDir = path.join(CONFIG_DIR, 'electron', 'messaging');
app.setName?.('robos-messaging');
app.setPath?.('userData', userDataDir);

try {
  const lockFile = path.join(userDataDir, 'SingletonLock');
  if (fs.existsSync(lockFile)) {
    const target = fs.readlinkSync(lockFile);
    const m = target.match(/-(\d+)$/);
    if (m) {
      try {
        process.kill(parseInt(m[1], 10), 0);
      } catch {
        for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
          try { fs.unlinkSync(path.join(userDataDir, f)); } catch {}
        }
      }
    }
  }
} catch {}

if (!TEST_MODE) {
  const gotLock = app.requestSingleInstanceLock?.();
  if (gotLock === false) {
    app.quit();
    process.exit(0);
  }
}

app.commandLine?.appendSwitch('no-sandbox');
app.commandLine?.appendSwitch('disable-gpu');
app.commandLine?.appendSwitch('disable-dev-shm-usage');

// ── Web sign-ins ────────────────────────────────────────────────────────────

const WEB_NETWORKS = NETWORKS.filter((n) => n.web);
const PARTITIONS = new Map(WEB_NETWORKS.map((n) => [`persist:robos-messaging-${n.id}`, n]));
// Networks refuse browsers that announce themselves as Electron.
const CHROME_UA = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${(process.versions.chrome || '120.0.0.0')} Safari/537.36`;
// What the networks' pages may ask for. Camera and microphone stay off.
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-sanitized-write', 'fullscreen']);

function hostMatches(urlString, host) {
  try {
    const { hostname, protocol } = new URL(urlString);
    return protocol === 'https:' && (hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function prepareSessions() {
  for (const [partition] of PARTITIONS) {
    const ses = session.fromPartition(partition);
    ses.setUserAgent(CHROME_UA);
    ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
    ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
  }
}

app.on?.('web-contents-created', (_event, contents) => {
  // Only our own pages may embed a webview, only into one of the network partitions,
  // and never with a preload or Node.
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    const network = PARTITIONS.get(params.partition);
    const src = String(params.src || '');
    const srcOk = network && (src === 'about:blank' || hostMatches(src, network.web.host) || (TEST_MODE && src.startsWith('data:')));
    if (!srcOk) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
  });

  if (contents.getType?.() === 'webview') {
    // Pop-ups (links, calls, attachments) open in the person's browser.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) shell.openExternal?.(url);
      return { action: 'deny' };
    });
  }
});

// ── Window ──────────────────────────────────────────────────────────────────

let mainWindow = null;
let pollTimer = null;
const webUnread = {};

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed?.()) mainWindow.webContents.send(channel, payload);
}

function updateBadge() {
  const apiUnread = hub.getOverview().networks.reduce((sum, n) => sum + n.unread, 0);
  const total = apiUnread + Object.values(webUnread).reduce((a, b) => a + b, 0);
  try { app.setBadgeCount?.(total); } catch {}
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    mainWindow.setTitle(total ? `(${total}) RobOS Messaging` : 'RobOS Messaging');
  }
}

function createWindow() {
  const iconPng = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    title: 'RobOS Messaging',
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    icon: fs.existsSync(iconPng) ? iconPng : path.join(__dirname, 'icon.svg'),
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility?.(false);
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  if (_debugServer) {
    try {
      _debugServer.registerSnapshotIPC?.(mainWindow);
      _debugServer.startDebugServer?.(mainWindow, DEBUG_PORT, 'messaging');
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

hub.onEvent((event) => {
  send('messaging:event', event);
  if (event.type === 'messages' && !TEST_MODE && Notification?.isSupported?.()) {
    for (const m of event.messages.slice(-3)) {
      const conv = hub.getConversation(m.conversationId);
      const note = new Notification({
        title: `${conv?.title || m.from} · ${conv?.networkLabel || m.network}`,
        body: m.text.slice(0, 180),
        silent: false,
      });
      note.on('click', () => {
        if (!mainWindow) createWindow();
        mainWindow.show();
        mainWindow.focus();
        send('messaging:open-conversation', m.conversationId);
      });
      note.show();
    }
  }
  if (event.type === 'messages' || event.type === 'sent') updateBadge();
});

async function poll() {
  try {
    await hub.refresh();
  } catch {}
}

app.whenReady?.().then(() => {
  prepareSessions();
  createWindow();
  if (!TEST_MODE || process.env.ROBOS_MESSAGING_POLL_MS) {
    setTimeout(poll, 3000);
    pollTimer = setInterval(poll, POLL_MS);
  }
});

app.on?.('window-all-closed', () => {
  if (pollTimer) clearInterval(pollTimer);
  hub.cancelSignalLink();
  app.quit();
});

app.on?.('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed?.()) {
    if (mainWindow.isMinimized?.()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

app.on?.('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed?.()) createWindow();
});

// ── IPC ─────────────────────────────────────────────────────────────────────

function webUrlFor(network) {
  // Tests never load the real networks.
  if (TEST_MODE) {
    return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><title>${network.label}</title><body style="background:#0d1117;color:#8b949e;font:14px sans-serif;padding:24px">${network.label} for Web would load here.</body>`)}`;
  }
  return network.web.url;
}

function overview() {
  const data = hub.getOverview();
  for (const n of data.networks) {
    if (n.web) {
      n.web.partition = `persist:robos-messaging-${n.id}`;
      n.web.src = webUrlFor(NETWORKS.find((x) => x.id === n.id));
      n.web.userAgent = CHROME_UA;
      n.web.unread = webUnread[n.id] || 0;
    }
  }
  return data;
}

ipcMain.handle('messaging:getOverview', async () => overview());
ipcMain.handle('messaging:setWebEnabled', async (_e, id, enabled) => {
  hub.setWebEnabled(id, enabled);
  if (!enabled) delete webUnread[id];
  updateBadge();
  return overview();
});
ipcMain.handle('messaging:signOutWeb', async (_e, id) => {
  const partition = `persist:robos-messaging-${id}`;
  if (!PARTITIONS.has(partition)) return { ok: false, error: 'Unknown network.' };
  await session.fromPartition(partition).clearStorageData();
  delete webUnread[id];
  updateBadge();
  return { ok: true, overview: overview() };
});
ipcMain.handle('messaging:setWebUnread', async (_e, id, count) => {
  if (!PARTITIONS.has(`persist:robos-messaging-${id}`)) return;
  webUnread[id] = Math.max(0, Math.min(9999, Number(count) || 0));
  updateBadge();
});
ipcMain.handle('messaging:connectApi', async (_e, id, payload) => {
  const result = await hub.connectApi(id, payload || {});
  if (result.ok) await hub.refresh({ network: id });
  return { ...result, overview: overview() };
});
ipcMain.handle('messaging:disconnectApi', async (_e, id) => {
  hub.disconnectApi(id);
  updateBadge();
  return overview();
});
ipcMain.handle('messaging:refresh', async (_e, opts) => {
  const result = await hub.refresh(opts || {});
  updateBadge();
  return { results: result.results, overview: overview() };
});
ipcMain.handle('messaging:listConversations', async (_e, opts) => hub.listConversations(opts || {}));
ipcMain.handle('messaging:getConversation', async (_e, id) => {
  const conv = hub.getConversation(id);
  if (conv) {
    hub.markRead(id);
    updateBadge();
  }
  return conv;
});
ipcMain.handle('messaging:send', async (_e, payload) => hub.send(payload || {}));
ipcMain.handle('messaging:listKdeConnectDevices', async () => hub.listKdeConnectDevices());
ipcMain.handle('messaging:startSignalLink', async () => {
  const link = await hub.startSignalLink();
  let qr = null;
  if (link?.uri && QRCode) {
    try { qr = await QRCode.toDataURL(link.uri, { margin: 1, width: 240 }); } catch {}
  }
  return { ...link, qr };
});
ipcMain.handle('messaging:cancelSignalLink', async () => {
  hub.cancelSignalLink();
  return overview();
});

// Only these pages open from the setup steps.
const SETUP_PAGES = {
  'meta-apps': 'https://developers.facebook.com/apps/',
  'meta-messenger-docs': 'https://developers.facebook.com/docs/messenger-platform/get-started',
  'instagram-docs': 'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login',
  'signal-cli': 'https://github.com/AsamK/signal-cli',
  kdeconnect: 'https://kdeconnect.kde.org/',
};
ipcMain.handle('messaging:openSetupPage', async (_e, pageId) => {
  const url = SETUP_PAGES[pageId];
  if (url) await shell.openExternal?.(url);
});

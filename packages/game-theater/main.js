'use strict';

let app, BrowserWindow, ipcMain, shell, dialog, clipboard;
try {
  ({ app, BrowserWindow, ipcMain, shell, dialog, clipboard } = require('electron'));
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
  shell = { openExternal: () => {} };
  dialog = {};
  clipboard = { writeText: () => {} };
}

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');

const DEBUG_PORT = 19227;
const HTTP_PORT = Number(process.env.GAME_THEATER_PORT || 19228);
const HTTPS_PORT = Number(process.env.GAME_THEATER_HTTPS_PORT || 19229);
const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.config', 'robos');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('ignore-certificate-errors');

function requireShared(modName) {
  for (const p of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, modName),
    path.resolve(__dirname, '..', 'robos-lib', modName),
    `/usr/local/share/robos/robos-lib/${modName}`,
  ].filter(Boolean)) {
    try { return require(p); } catch {}
  }
  return null;
}

try {
  const logger = requireShared('logger');
  logger?.setupGlobalErrorHandlers?.('game-theater', dialog);
} catch {}

const _debugServer = requireShared('dom-snapshot');
const { createGameTheaterServer } = require('./lib/theater-server');
const { startPublicHttpsTunnel } = require('./serve');

const userDataDir = path.join(CONFIG_DIR, 'electron', 'game-theater');
app.setName('robos-game-theater');
app.setPath?.('userData', userDataDir);

let mainWindow = null;
let _theaterServer = null;
let _tunnelChild = null;
const _playerWindows = new Map();

function apiRequest(method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: HTTP_PORT,
        path: apiPath,
        method,
        headers: {
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': payload.length,
              }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({ ok: res.statusCode === 200, raw });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function ensureTheaterServerRunning() {
  if (_theaterServer) return;
  try {
    const srv = createGameTheaterServer();
    const info = await srv.listen({
      httpPort: HTTP_PORT,
      httpsPort: HTTPS_PORT,
      host: '0.0.0.0',
      enableHttps: true,
    });
    _theaterServer = srv;
    if (process.env.ROBOS_TEST !== '1' && process.env.GAME_THEATER_NO_TUNNEL !== '1') {
      _tunnelChild = startPublicHttpsTunnel(info.localHttpUrl, { autoSyncDocs: false });
    }
  } catch {
    // Already running via standalone serve.js daemon
  }
}

function openIsolatedPlayerClientWindow({ uid, name, url }) {
  const existing = _playerWindows.get(uid);
  if (existing && !existing.isDestroyed()) {
    existing.loadURL(url);
    existing.focus();
    return { ok: true, reused: true };
  }
  const win = new BrowserWindow({
    width: 1380,
    height: 860,
    title: `RobOS Game Theater — ${name} (Godot 4 HTTPS Client)`,
    backgroundColor: '#0d1117',
    webPreferences: {
      contextIsolation: true,
      partition: `persist:robos-theater-${uid}`,
    },
  });
  win.webContents.on('certificate-error', (event, _url, _err, _cert, callback) => {
    event.preventDefault();
    callback(true);
  });
  win.loadURL(url);
  win.on('closed', () => _playerWindows.delete(uid));
  _playerWindows.set(uid, win);
  return { ok: true, reused: false };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: '#0d1117',
    title: 'RobOS AI Multiplayer Game Theater',
    icon: fs.existsSync(path.join(__dirname, 'icon.png'))
      ? path.join(__dirname, 'icon.png')
      : path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  try {
    _debugServer?.registerSnapshotIPC?.(mainWindow);
    _debugServer?.startDebugServer?.(mainWindow, DEBUG_PORT, 'game-theater');
  } catch {}
}

ipcMain.handle('theater:get-state', () => apiRequest('GET', '/api/state'));
ipcMain.handle('theater:sync-docs', (_e, opts) => apiRequest('POST', '/api/docs/sync', opts || {}));
ipcMain.handle('theater:add-player', (_e, player) => apiRequest('POST', '/api/players', player || {}));
ipcMain.handle('theater:invite-player', (_e, { uid, email, message }) =>
  apiRequest('POST', `/api/players/${encodeURIComponent(uid)}/invite`, { email, message }),
);
ipcMain.handle('theater:generate-game', (_e, payload) => apiRequest('POST', '/api/games/generate', payload || {}));
ipcMain.handle('theater:modify-game', (_e, { gameId, prompt, providerId }) =>
  apiRequest('POST', `/api/games/${encodeURIComponent(gameId)}/modify`, { prompt, providerId }),
);
ipcMain.handle('theater:select-game', (_e, gameId) =>
  apiRequest('POST', `/api/games/${encodeURIComponent(gameId)}/select`, {}),
);
ipcMain.handle('theater:get-game', (_e, gameId) =>
  apiRequest('GET', `/api/games/${encodeURIComponent(gameId)}`),
);
ipcMain.handle('theater:save-game-source', (_e, { gameId, manifest, serverJs, clientGd }) =>
  apiRequest('POST', `/api/games/${encodeURIComponent(gameId)}/source`, { manifest, serverJs, clientGd }),
);
ipcMain.handle('theater:open-external', (_e, url) => {
  if (url) shell.openExternal(String(url));
  return { ok: true };
});
ipcMain.handle('theater:copy-text', (_e, text) => {
  clipboard?.writeText?.(String(text || ''));
  return { ok: true };
});
ipcMain.handle('theater:open-player-window', (_e, info) => openIsolatedPlayerClientWindow(info));
ipcMain.handle('theater:capture-player-window', async (_e, { uid, savePath }) => {
  const win = _playerWindows.get(uid);
  if (!win || win.isDestroyed()) return { ok: false, error: 'Player window not open' };
  const img = await win.webContents.capturePage();
  const png = img.toPNG();
  if (savePath) fs.writeFileSync(savePath, png);
  let state = null;
  try {
    state = await win.webContents.executeJavaScript('window.__robosGodotState || null');
  } catch {}
  return { ok: true, bytes: png.length, state };
});

app.whenReady().then(async () => {
  await ensureTheaterServerRunning();
  createWindow();
});

app.on('window-all-closed', () => {
  if (_tunnelChild) {
    try { _tunnelChild.kill(); } catch {}
  }
  if (process.platform !== 'darwin') app.quit();
});

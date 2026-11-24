'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { createMediaServer, DEFAULT_PORT } = require('./server');

let _debugServer = null;
for (const p of [
  process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
  path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
  '/usr/local/share/robos/robos-lib/dom-snapshot',
].filter(Boolean)) {
  try { _debugServer = require(p); break; } catch {}
}

if (process.env.ROBOS_TEST !== '1' && process.env.ROBOS_TEST_MODE !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); process.exit(0); }
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setName('robos-media-server');

let mainWindow = null;
let embeddedServer = null;
let activeUrl = process.env.ROBOS_MEDIA_SERVER_URL || `http://127.0.0.1:${DEFAULT_PORT}`;

function checkRunningServer(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url.replace(/\/+$/, '')}/api/health`, { timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(Boolean(parsed && parsed.service === 'robos-media-server'));
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function ensureServerRunning() {
  if (await checkRunningServer(activeUrl)) return activeUrl;
  embeddedServer = createMediaServer({ port: DEFAULT_PORT });
  try {
    const info = await embeddedServer.start();
    activeUrl = `http://127.0.0.1:${info.port}`;
  } catch {
    // Port busy or custom port fallback
    const fallback = createMediaServer({ port: 0 });
    const info = await fallback.start();
    embeddedServer = fallback;
    activeUrl = `http://127.0.0.1:${info.port}`;
  }
  return activeUrl;
}

ipcMain.handle('media-server:get-url', async () => ({ ok: true, url: activeUrl }));
ipcMain.handle('media-server:open-external', async (_e, url) => {
  if (/^https?:\/\//i.test(String(url || ''))) await shell.openExternal(url);
  return { ok: true };
});

app.whenReady().then(async () => {
  const targetUrl = await ensureServerRunning();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#0d1117',
    title: 'RobOS Media Server',
    icon: fs.existsSync(path.join(__dirname, 'icon.png')) ? path.join(__dirname, 'icon.png') : path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(targetUrl);

  if (_debugServer) {
    try {
      if (typeof _debugServer.registerSnapshotIPC === 'function') _debugServer.registerSnapshotIPC(mainWindow);
      if (typeof _debugServer.startDebugServer === 'function') _debugServer.startDebugServer(mainWindow, 19233, 'media-server');
    } catch {}
  }
});

app.on('before-quit', () => {
  if (embeddedServer) {
    embeddedServer.stop().catch(() => {});
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

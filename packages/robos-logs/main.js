'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

app.setName('robos-robos-logs');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'robos-logs'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Logger (load lib) ─────────────────────────────────────────────────────────
let _logLib = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'logger'),
    path.resolve(__dirname, '..', 'robos-lib', 'logger'),
    '/usr/local/share/robos/robos-lib/logger',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _logLib = require(p); break; } catch {}
  }
} catch {}

const log     = _logLib ? _logLib.createLogger('robos-logs') : { info: () => {}, warn: () => {}, error: () => {} };
const readLogs   = _logLib ? _logLib.readLogs   : () => [];
const listLogApps = _logLib ? _logLib.listLogApps : () => [];
const LOG_DIR = _logLib ? _logLib.LOG_DIR : path.join(os.homedir(), '.config', 'robos', 'logs');

// ── Debug server ──────────────────────────────────────────────────────────────
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

// ── Window ────────────────────────────────────────────────────────────────────
let win;
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 800,
    minHeight: 500,
    title: 'RobOS Logs',
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    try { _debugServer.startDebugServer(win, 19136); } catch {}
  }
  log.info('app-started', 'RobOS Logs opened');
});

app.on('window-all-closed', () => app.quit());

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('logs-list-apps', () => {
  return listLogApps();
});

ipcMain.handle('logs-read', (_, opts = {}) => {
  return readLogs(opts);
});

ipcMain.handle('logs-search', (_, { query, appId, level, limit = 200 }) => {
  return readLogs({ search: query, appId, level, limit });
});

ipcMain.handle('logs-tail', (_, { appId, limit = 100 }) => {
  return readLogs({ appId, limit });
});

ipcMain.handle('logs-clear', (_, { appId }) => {
  try {
    const filePath = path.join(LOG_DIR, `${appId}.ndjson`);
    if (fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '');
      log.info('log-cleared', `Cleared logs for ${appId}`, { appId });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('logs-get-stats', () => {
  const apps = listLogApps();
  const stats = apps.map(appId => {
    try {
      const filePath = path.join(LOG_DIR, `${appId}.ndjson`);
      const stat = fs.statSync(filePath);
      const entries = readLogs({ appId, limit: 5000 });
      const errors = entries.filter(e => e.level === 'error').length;
      const warns  = entries.filter(e => e.level === 'warn').length;
      const latest = entries[0] ? entries[0].ts : null;
      return { appId, fileSize: stat.size, total: entries.length, errors, warns, latest };
    } catch {
      return { appId, fileSize: 0, total: 0, errors: 0, warns: 0, latest: null };
    }
  });
  return stats;
});

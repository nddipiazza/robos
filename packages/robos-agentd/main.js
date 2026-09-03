'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { AgentDaemon } = require('./daemon');

let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

const daemon = new AgentDaemon();
daemon.startSocketServer();

// Single instance lock bypass in test mode
const isTestMode = !!(process.env.ROBOS_TEST || process.env.ROBOS_DEMO_SHOW);
if (!isTestMode) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    process.exit(0);
  }
}

let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 960,
    height: 640,
    title: 'RobOS Desktop Agents Manager',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  if (_debugServer) _debugServer.startDebugServer(win, 19145);
});

app.on('window-all-closed', () => {
  daemon.stop();
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('list-agents', () => daemon.listAgents());
ipcMain.handle('spawn-agent', (_, { taskId, options }) => daemon.spawnAgent(taskId, options));
ipcMain.handle('inspect-agent', (_, taskId) => daemon.inspectAgent(taskId));
ipcMain.handle('terminate-agent', (_, taskId) => daemon.terminateAgent(taskId));
ipcMain.handle('wipe-all', () => daemon.wipeAll());
ipcMain.handle('append-log', (_, { taskId, line }) => daemon.appendLog(taskId, line));

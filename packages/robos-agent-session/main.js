'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { RobOSAgentSession } = require('./index');
const { AgentDaemon } = require('../robos-agentd/daemon');

let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

const daemon = new AgentDaemon();
const sessionClient = new RobOSAgentSession({ daemon });

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
    title: 'RobOS Agent Session Client Demo',
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

  if (_debugServer) _debugServer.startDebugServer(win, 19148);
});

app.on('window-all-closed', () => {
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('session-spawn', async (_, { taskId, options }) => {
  return sessionClient.spawnAgentSession(taskId, options);
});

ipcMain.handle('session-list', async () => {
  return sessionClient.listAgentSessions();
});

ipcMain.handle('session-inspect', async (_, taskId) => {
  return sessionClient.inspectAgentSession(taskId);
});

ipcMain.handle('session-command', async (_, { taskId, command }) => {
  return sessionClient.sendAgentCommand(taskId, command);
});

ipcMain.handle('session-terminate', async (_, taskId) => {
  return sessionClient.terminateAgentSession(taskId);
});

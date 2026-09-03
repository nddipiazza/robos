'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createTaskMCPServer } = require('./server');

let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

const { server, service } = createTaskMCPServer();

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
    width: 1040,
    height: 680,
    title: 'RobOS Task Manager MCP Server Console',
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

  if (_debugServer) _debugServer.startDebugServer(win, 19152);
});

app.on('window-all-closed', () => {
  server.stop();
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('task-list', async (_, filters) => service.list(filters));
ipcMain.handle('task-get', async (_, id) => service.get(id));
ipcMain.handle('task-create', async (_, data) => service.create(data));
ipcMain.handle('task-advance', async (_, id) => service.advanceWorkflow(id));
ipcMain.handle('task-comment', async (_, { id, comment }) => service.addComment(id, comment));
ipcMain.handle('task-mcp-rpc', async (_, request) => server.handleJsonRpc(request));

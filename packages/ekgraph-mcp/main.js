'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createEKGraphMCPServer } = require('./server');

let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

const { server, service } = createEKGraphMCPServer();

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
    title: 'RobOS EKGraph MCP Server Console',
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

  if (_debugServer) _debugServer.startDebugServer(win, 19154);
});

app.on('window-all-closed', () => {
  server.stop();
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('ekg-search', async (_, query) => service.search(query));
ipcMain.handle('ekg-get-node', async (_, nodePath) => service.getNode(nodePath));
ipcMain.handle('ekg-get-linked', async (_, nodePath) => service.getLinked(nodePath));
ipcMain.handle('ekg-create-node', async (_, data) => service.createNode(data));
ipcMain.handle('ekg-mcp-rpc', async (_, request) => server.handleJsonRpc(request));

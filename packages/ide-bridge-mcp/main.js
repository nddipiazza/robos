'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createIDEBridgeMCPServer } = require('./server');

let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

const { server, service } = createIDEBridgeMCPServer();

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
    title: 'RobOS IDE Bridge MCP Server Console',
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

  if (_debugServer) _debugServer.startDebugServer(win, 19156);
});

app.on('window-all-closed', () => {
  server.stop();
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('ide-get-status', async () => service.getStatus());
ipcMain.handle('ide-get-open-files', async () => service.getOpenFiles());
ipcMain.handle('ide-open-file', async (_, { file, line, col }) => service.openFile(file, line, col));
ipcMain.handle('ide-set-breakpoint', async (_, { file, line }) => service.setBreakpoint(file, line));
ipcMain.handle('ide-run-config', async (_, { name, mode }) => service.runConfig(name, mode));
ipcMain.handle('ide-mcp-rpc', async (_, request) => server.handleJsonRpc(request));

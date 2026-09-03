'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createCIMonitorMCPServer } = require('./server');

let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

const { server, service } = createCIMonitorMCPServer();

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
    title: 'RobOS CI Monitor MCP Server Console',
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

  if (_debugServer) _debugServer.startDebugServer(win, 19155);
});

app.on('window-all-closed', () => {
  server.stop();
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('ci-list-runs', async (_, filters) => service.listRuns(filters));
ipcMain.handle('ci-get-failures', async (_, runId) => service.getFailures(runId));
ipcMain.handle('ci-get-logs', async (_, runId) => service.getLogs(runId));
ipcMain.handle('ci-retry-run', async (_, runId) => service.retryRun(runId));
ipcMain.handle('ci-get-deployments', async () => service.getDeployments());
ipcMain.handle('ci-mcp-rpc', async (_, request) => server.handleJsonRpc(request));

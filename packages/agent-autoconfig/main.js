'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { AgentAutoconfigService } = require('./autoconfig');

let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

const service = new AgentAutoconfigService();

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
    title: 'RobOS Universal AI Agent Auto-Configuration Console',
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

  if (_debugServer) _debugServer.startDebugServer(win, 19159);
});

app.on('window-all-closed', () => {
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('agent-get-supported', async () => service.getSupportedAgents());
ipcMain.handle('agent-get-mcp-config', async (_, agentId) => service.getMCPConfig(agentId));
ipcMain.handle('agent-get-markdown', async (_, agentId) => service.getAgentMarkdown(agentId));
ipcMain.handle('agent-sync', async () => service.sync());

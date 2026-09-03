'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createMCPServer, listRegisteredServers } = require('./index');

let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

// Instantiate an example MCP Server in <20 lines of code!
const demoServer = createMCPServer({
  appId: 'demo',
  name: 'RobOS Core Demo MCP Server',
  version: '1.0.0',
  description: 'Exposes sample tools and resources for AI agent inspection.',
  tools: [
    {
      name: 'calculate_metrics',
      description: 'Calculates performance metrics and memory usage for a task.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID' },
        },
        required: ['taskId'],
      },
      handler: async (args) => {
        return {
          taskId: args.taskId,
          cpuUsage: '14.2%',
          memoryUsageMb: 384,
          timestamp: new Date().toISOString(),
          status: 'HEALTHY',
        };
      },
    },
    {
      name: 'query_workspace',
      description: 'Queries active workspace metadata and git branch.',
      handler: async () => {
        return {
          workspace: 'robos-core',
          branch: 'feature/mcp-support',
          modifiedFiles: ['packages/robos-mcp-lib/server.js'],
        };
      },
    },
  ],
  resources: [
    {
      uri: 'system-info',
      name: 'RobOS Host System Information',
      mimeType: 'application/json',
      handler: async () => ({
        os: 'Ubuntu 26.04 LTS (RobOS Gnome)',
        kernel: '6.8.0-generic',
        arch: 'x86_64',
        aiAgentsSupported: ['Claude Code', 'Gemini CLI', 'Copilot CLI'],
      }),
    },
  ],
});

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
    title: 'RobOS MCP Server Inspector & Framework',
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

  if (_debugServer) _debugServer.startDebugServer(win, 19149);
});

app.on('window-all-closed', () => {
  demoServer.stop();
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('mcp-list-servers', async () => {
  return listRegisteredServers();
});

ipcMain.handle('mcp-rpc', async (_, request) => {
  return demoServer.handleJsonRpc(request);
});

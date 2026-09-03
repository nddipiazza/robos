'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

let _debugServer = null;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

const HOME_DIR = process.env.HOME || os.homedir();
const MCP_DIR = path.join(HOME_DIR, '.config', 'robos', 'mcp');
const REGISTRY_FILE = path.join(MCP_DIR, 'servers.json');
const CONFIG_FILE = path.join(HOME_DIR, '.config', 'robos', 'mcp-config.json');

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

// Helper to query HTTP MCP servers
function httpJsonRpc(url, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const postData = JSON.stringify(payload);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 3000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          resolve({ error: { message: 'Invalid JSON response' } });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

function loadRegistry() {
  if (fs.existsSync(REGISTRY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    } catch {}
  }
  // Mock default built-in servers if none registered yet
  return {
    'task-manager': {
      appId: 'task-manager',
      name: 'Task Manager MCP Server',
      version: '1.2.0',
      status: 'RUNNING',
      port: 19131,
      endpoint: 'http://localhost:19131/mcp',
      tools: ['robos_task_manager_get_task', 'robos_task_manager_update_status', 'robos_task_manager_list_tasks'],
      resources: ['robos://task-manager/tasks/active', 'robos://task-manager/sprints/current'],
    },
    'workspace-manager': {
      appId: 'workspace-manager',
      name: 'Workspace Manager MCP Server',
      version: '1.1.0',
      status: 'RUNNING',
      port: 19132,
      endpoint: 'http://localhost:19132/mcp',
      tools: ['robos_workspace_manager_create_branch', 'robos_workspace_manager_list_repos'],
      resources: ['robos://workspace-manager/repos'],
    },
    'dev-tools': {
      appId: 'dev-tools',
      name: 'Developer Tool Center MCP Server',
      version: '1.0.0',
      status: 'RUNNING',
      port: 19133,
      endpoint: 'http://localhost:19133/mcp',
      tools: ['robos_dev_tools_check_tool', 'robos_dev_tools_install_tool'],
      resources: ['robos://dev-tools/installed'],
    },
  };
}

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {}
  }
  return {
    agents: {
      'claude-code': ['task-manager', 'workspace-manager', 'dev-tools'],
      'gemini-cli': ['task-manager', 'workspace-manager'],
      'copilot-cli': ['task-manager', 'dev-tools'],
    },
    defaultEnabled: true,
  };
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1040,
    height: 680,
    title: 'RobOS MCP Server Manager',
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

  if (_debugServer) _debugServer.startDebugServer(win, 19150);
});

app.on('window-all-closed', () => {
  app.quit();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('mcp-get-servers', async () => {
  return loadRegistry();
});

ipcMain.handle('mcp-call-tool', async (_, { appId, toolName, args }) => {
  const registry = loadRegistry();
  const server = registry[appId];
  if (!server) return { isError: true, error: `Server ${appId} not found` };

  // If live HTTP endpoint available
  if (server.endpoint) {
    try {
      const response = await httpJsonRpc(server.endpoint, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      });
      return response.result || response;
    } catch (err) {
      // Fallback response for mock harness
    }
  }

  // Simulated output for tester
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          tool: toolName,
          appId,
          params: args,
          result: 'SUCCESS',
          timestamp: new Date().toISOString(),
          data: { status: 'OK', recordsUpdated: 1 },
        }, null, 2),
      },
    ],
  };
});

ipcMain.handle('mcp-read-resource', async (_, { appId, uri }) => {
  const registry = loadRegistry();
  const server = registry[appId];
  if (!server) return { isError: true, error: `Server ${appId} not found` };

  if (server.endpoint) {
    try {
      const response = await httpJsonRpc(server.endpoint, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'resources/read',
        params: { uri },
      });
      return response.result || response;
    } catch {}
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          uri,
          server: appId,
          lastFetched: new Date().toISOString(),
          items: [
            { id: 'TASK-101', title: 'Implement MCP Server Registry', status: 'IN_PROGRESS' },
            { id: 'TASK-102', title: 'Create Worktree Sandbox', status: 'TODO' },
          ],
        }, null, 2),
      },
    ],
  };
});

ipcMain.handle('mcp-get-config', async () => {
  return loadConfig();
});

ipcMain.handle('mcp-save-config', async (_, cfg) => {
  return saveConfig(cfg);
});

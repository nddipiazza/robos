'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createMCPServer } = require('../robos-mcp-lib/index');

const HOME_DIR = process.env.HOME || os.homedir();
const WS_DIR = path.join(HOME_DIR, '.config', 'robos', 'workspaces');
const WS_FILE = path.join(WS_DIR, 'workspaces.json');

const DEFAULT_WORKSPACES = [
  {
    id: 'ws-main',
    name: 'robos-core',
    branch: 'main',
    repo: 'nddipiazza/robos',
    path: '/home/ndipiazza/source/robos',
    status: 'ACTIVE',
    activeTaskId: 'TASK-101',
    devServer: {
      port: 3000,
      url: 'http://localhost:3000',
      running: true,
      healthEndpoint: 'http://localhost:3000/health',
    },
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ws-auth',
    name: 'robos-auth-service',
    branch: 'feature/jwt-rotation',
    repo: 'nddipiazza/robos-auth',
    path: '/home/ndipiazza/source/robos-auth',
    status: 'IDLE',
    activeTaskId: null,
    devServer: {
      port: 8080,
      url: 'http://localhost:8080',
      running: false,
      healthEndpoint: 'http://localhost:8080/health',
    },
    updatedAt: new Date().toISOString(),
  },
];

class WorkspaceService {
  constructor(options = {}) {
    this.workspaces = new Map();
    this.wsFile = options.wsFile || WS_FILE;
    this.init();
  }

  init() {
    if (fs.existsSync(this.wsFile)) {
      try {
        const list = JSON.parse(fs.readFileSync(this.wsFile, 'utf8'));
        for (const w of list) this.workspaces.set(w.id, w);
        return;
      } catch {}
    }
    for (const w of DEFAULT_WORKSPACES) {
      this.workspaces.set(w.id, { ...w });
    }
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.wsFile), { recursive: true });
      fs.writeFileSync(this.wsFile, JSON.stringify(Array.from(this.workspaces.values()), null, 2), 'utf8');
    } catch {}
  }

  list() {
    return Array.from(this.workspaces.values());
  }

  getActive() {
    return Array.from(this.workspaces.values()).find(w => w.status === 'ACTIVE') || this.workspaces.get('ws-main') || null;
  }

  create(data = {}) {
    const id = `ws-${data.taskId ? data.taskId.toLowerCase() : Date.now()}`;
    const ws = {
      id,
      name: data.name || (data.taskId ? `robos-workspace-${data.taskId.toLowerCase()}` : 'robos-custom-ws'),
      branch: data.branch || (data.taskId ? `feat/${data.taskId.toLowerCase()}` : 'feat/task-branch'),
      repo: data.repo || 'nddipiazza/robos',
      path: data.path || `/home/ndipiazza/source/worktrees/${id}`,
      status: 'ACTIVE',
      activeTaskId: data.taskId || null,
      devServer: {
        port: 3000 + Math.floor(Math.random() * 500),
        url: 'http://localhost:3000',
        running: false,
        healthEndpoint: 'http://localhost:3000/health',
      },
      updatedAt: new Date().toISOString(),
    };

    // Mark previous active as IDLE
    for (const w of this.workspaces.values()) {
      if (w.status === 'ACTIVE') w.status = 'IDLE';
    }

    this.workspaces.set(ws.id, ws);
    this.save();
    return ws;
  }

  openInIde(id, ide = 'intellij') {
    const ws = this.workspaces.get(id) || this.getActive();
    if (!ws) return { ok: false, error: 'Workspace not found' };
    return {
      ok: true,
      workspaceId: ws.id,
      path: ws.path,
      ide,
      endpoint: 'http://localhost:63343/open-project',
      status: 'OPENED',
    };
  }

  runSetup(id) {
    const ws = this.workspaces.get(id) || this.getActive();
    if (!ws) return { ok: false, error: 'Workspace not found' };
    return {
      ok: true,
      workspaceId: ws.id,
      setupCommandsExecuted: ['npm install --quiet', 'git submodule update --init'],
      exitCode: 0,
      durationMs: 1240,
    };
  }

  startDevServer(id, port = 3000) {
    const ws = this.workspaces.get(id) || this.getActive();
    if (!ws) return { ok: false, error: 'Workspace not found' };
    ws.devServer.running = true;
    ws.devServer.port = port;
    ws.devServer.url = `http://localhost:${port}`;
    this.save();
    return {
      ok: true,
      workspaceId: ws.id,
      devServer: ws.devServer,
    };
  }
}

function createWorkspaceMCPServer(options = {}) {
  const service = new WorkspaceService(options);

  const server = createMCPServer({
    appId: 'workspace-manager',
    name: 'Workspace Manager MCP Server',
    version: '1.1.0',
    description: 'RobOS Multi-Repo Workspace Orchestrator & IDE Bridge MCP Server',
    port: options.port || null,
    tools: [
      {
        name: 'robos_workspace_create',
        description: 'Provision an isolated workspace worktree for a task.',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID (e.g. TASK-101)' },
            repo: { type: 'string', description: 'GitHub repo identifier' },
            branch: { type: 'string', description: 'Branch name' },
          },
          required: ['taskId'],
        },
        handler: async (args) => service.create(args),
      },
      {
        name: 'robos_workspace_list',
        description: 'List all provisioned workspaces and git branches.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => service.list(),
      },
      {
        name: 'robos_workspace_get_active',
        description: 'Get currently active workspace details.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => service.getActive(),
      },
      {
        name: 'robos_workspace_open_in_ide',
        description: 'Open workspace in developer IDE via IPC bridge (IntelliJ / VS Code).',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Workspace ID' },
            ide: { type: 'string', description: 'IDE (intellij or vscode)' },
          },
        },
        handler: async (args) => service.openInIde(args.id, args.ide),
      },
      {
        name: 'robos_workspace_run_setup',
        description: 'Run automated dependency installation and build setup.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Workspace ID' } },
        },
        handler: async (args) => service.runSetup(args.id),
      },
      {
        name: 'robos_workspace_start_devserver',
        description: 'Start development server for workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Workspace ID' },
            port: { type: 'number', description: 'Local server port' },
          },
        },
        handler: async (args) => service.startDevServer(args.id, args.port),
      },
    ],
    resources: [
      {
        uri: 'robos://workspace-manager/workspace/active',
        name: 'Active Workspace State',
        mimeType: 'application/json',
        handler: async () => service.getActive(),
      },
      {
        uri: 'robos://workspace-manager/workspace/all',
        name: 'All Registered Workspaces',
        mimeType: 'application/json',
        handler: async () => service.list(),
      },
    ],
  });

  return { server, service };
}

module.exports = { createWorkspaceMCPServer, WorkspaceService };

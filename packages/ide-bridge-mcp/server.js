'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { exec } = require('child_process');
const { createMCPServer } = require('../robos-mcp-lib/index');

const HOME_DIR = process.env.HOME || os.homedir();
const IDE_DIR = path.join(HOME_DIR, '.config', 'robos', 'ide');
const IDE_FILE = path.join(IDE_DIR, 'state.json');

const DEFAULT_STATE = {
  ide: {
    name: 'IntelliJ IDEA Ultimate 2026.1',
    version: '2026.1.0',
    port: 63343,
    activeProject: 'robos',
    connected: true,
  },
  openFiles: [
    { file: 'src/main/java/com/robos/HelloWorld.java', line: 6, column: 9, focused: true },
    { file: 'pom.xml', line: 1, column: 1, focused: false },
  ],
  breakpoints: [
    { file: 'src/main/java/com/robos/HelloWorld.java', line: 6, enabled: true },
  ],
  runConfigs: [
    {
      name: 'Debug HelloWorld.main()',
      type: 'Application',
      status: 'RUNNING',
      pid: 14201,
      env: {},
    },
    {
      name: 'Maven Build & Test',
      type: 'Maven',
      status: 'READY',
      env: {},
    },
  ],
  webhooks: [],
  ephemeralWorkspaces: [],
  threadState: {
    threadId: 'thread-exec-1',
    threadName: 'http-nio-8080-exec-1',
    status: 'SUSPENDED',
    suspendedAtFile: 'PetService.java',
    suspendedAtLine: 48,
    frames: [
      { file: 'PetService.java', className: 'com.acme.petshop.service.PetService', methodName: 'adoptPet', line: 48 },
      { file: 'PetController.java', className: 'com.acme.petshop.web.PetController', methodName: 'processAdoption', line: 104 },
      { file: 'SecurityFilterChain.java', className: 'org.springframework.security.web.SecurityFilterChain', methodName: 'doFilterInternal', line: 221 },
    ],
    variables: {
      pet: '{Pet@1402} "id=a81b2c-91, species=Canine, ageMonths=4, status=PENDING"',
      tagId: '"VAX-2026-9814"',
      vaccineGateway: '{VaccineGatewayClient@1499} (mTLS target: https://localhost:8443)',
      stateCompliant: 'false',
    },
  },
};

class IDEBridgeService {
  constructor(options = {}) {
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.stateFile = options.stateFile || IDE_FILE;
    this.init();
  }

  init() {
    if (fs.existsSync(this.stateFile)) {
      try {
        this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        if (!this.state.ephemeralWorkspaces) this.state.ephemeralWorkspaces = [];
        if (!this.state.webhooks) this.state.webhooks = [];
        if (!this.state.threadState) this.state.threadState = DEFAULT_STATE.threadState;
        return;
      } catch {}
    }
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {}
  }

  getStatus() {
    return this.state.ide;
  }

  getOpenFiles() {
    return this.state.openFiles;
  }

  getBreakpoints() {
    return this.state.breakpoints;
  }

  async dispatchJetBrainsIPC(endpoint, params = {}) {
    return new Promise((resolve) => {
      const qs = new URLSearchParams(params).toString();
      const url = `http://127.0.0.1:${this.state.ide.port}/robos/${endpoint}?${qs}`;
      const req = http.get(url, { timeout: 1500 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, data }));
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message, url }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'IPC request timed out', url }); });
    });
  }

  async postJetBrainsIPC(endpoint, body = {}) {
    return new Promise((resolve) => {
      const payload = JSON.stringify(body);
      const options = {
        hostname: '127.0.0.1',
        port: this.state.ide.port,
        path: `/robos/${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 1500,
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed });
        });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'IPC request timed out' }); });
      req.write(payload);
      req.end();
    });
  }

  async openFile(file, line = 1, column = 1) {
    let existing = this.state.openFiles.find(f => f.file === file);
    this.state.openFiles.forEach(f => f.focused = false);

    if (existing) {
      existing.line = line;
      existing.column = column;
      existing.focused = true;
    } else {
      existing = { file, line, column, focused: true };
      this.state.openFiles.push(existing);
    }
    this.save();

    // Dispatch real IPC to IntelliJ HTTP server
    const ipcResult = await this.dispatchJetBrainsIPC('open-file', { file, line, col: column });

    // Also support VS Code CLI if available
    try {
      exec(`code -g "${file}:${line}:${column}" 2>/dev/null`, () => {});
    } catch {}

    return {
      ok: true,
      file,
      line,
      column,
      ipcDispatched: `http://localhost:${this.state.ide.port}/robos/open-file?file=${encodeURIComponent(file)}&line=${line}&col=${column}`,
      ipcResult,
    };
  }

  async setBreakpoint(file, line = 1, enabled = true) {
    const existingIdx = this.state.breakpoints.findIndex(b => b.file === file && b.line === line);
    if (existingIdx >= 0) {
      if (!enabled) {
        this.state.breakpoints.splice(existingIdx, 1);
      } else {
        this.state.breakpoints[existingIdx].enabled = enabled;
      }
    } else if (enabled) {
      this.state.breakpoints.push({ file, line, enabled: true });
    }
    this.save();

    const ipcResult = await this.dispatchJetBrainsIPC('set-breakpoint', { file, line, enabled });

    return {
      ok: true,
      file,
      line,
      enabled,
      breakpointsCount: this.state.breakpoints.length,
      ipcResult,
    };
  }

  async createRunConfig(options = {}) {
    const {
      name,
      type = 'Application',
      projectPath = null,
      mainClassOrCommand = null,
      env = {},
      passSecrets = {},
    } = options;

    if (!name) throw new Error('Run configuration name is required');

    // Merge pass secrets with pass: prefix so they are securely resolved
    const finalEnv = { ...env };
    for (const [k, v] of Object.entries(passSecrets)) {
      finalEnv[k] = v.startsWith('pass:') ? v : `pass:${v}`;
    }

    const config = {
      name,
      type,
      projectPath,
      mainClassOrCommand,
      env: finalEnv,
      status: 'READY',
      secretsSecured: Object.keys(passSecrets).length,
    };

    const existingIdx = this.state.runConfigs.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
    if (existingIdx >= 0) {
      this.state.runConfigs[existingIdx] = config;
    } else {
      this.state.runConfigs.push(config);
    }
    this.save();

    const ipcResult = await this.postJetBrainsIPC('run-config/create', {
      name,
      type,
      projectPath,
      mainClassOrCommand,
      env: finalEnv,
    });

    return {
      ok: true,
      name,
      type,
      config,
      ipcResult,
    };
  }

  async runConfig(name, mode = 'debug') {
    const config = this.state.runConfigs.find(c => c.name.toLowerCase() === name.toLowerCase());
    let targetConfig = config;
    if (!targetConfig) {
      targetConfig = { name, type: 'Custom', status: 'RUNNING', mode, pid: Math.floor(Math.random() * 9000 + 10000), env: {} };
      this.state.runConfigs.push(targetConfig);
    } else {
      targetConfig.status = 'RUNNING';
      targetConfig.mode = mode;
      targetConfig.pid = Math.floor(Math.random() * 9000 + 10000);
    }
    this.save();

    const ipcResult = await this.postJetBrainsIPC('run-config/run', { name, mode });

    return { ok: true, config: targetConfig, ipcResult };
  }

  async stopConfig(name) {
    const config = this.state.runConfigs.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!config) return { ok: false, error: 'Configuration not found' };
    config.status = 'STOPPED';
    config.pid = null;
    this.save();

    const ipcResult = await this.dispatchJetBrainsIPC('run-config/stop', { name });

    return { ok: true, config, ipcResult };
  }

  async registerBreakpointWebhook(webhookUrl) {
    if (!webhookUrl) throw new Error('webhookUrl is required');
    if (!this.state.webhooks.includes(webhookUrl)) {
      this.state.webhooks.push(webhookUrl);
      this.save();
    }
    const ipcResult = await this.postJetBrainsIPC('webhook/register', { webhookUrl });
    return { ok: true, webhookUrl, totalWebhooks: this.state.webhooks.length, ipcResult };
  }

  async getThreadState(threadId = null) {
    let ipcResult = await this.dispatchJetBrainsIPC('debug/thread-state', threadId ? { threadId } : {});
    let thread = this.state.threadState;

    if (ipcResult.ok && ipcResult.data) {
      try {
        const parsed = typeof ipcResult.data === 'string' ? JSON.parse(ipcResult.data) : ipcResult.data;
        if (parsed.thread) thread = parsed.thread;
      } catch (_) {}
    }

    return { ok: true, thread, ipcResult };
  }

  async createEphemeralWorkspace(options = {}) {
    const {
      workspaceId = `ws-${Date.now()}`,
      projects = [],
      autoRunConfig = null,
      autoDestroyOnSessionEnd = true,
    } = options;

    const ws = {
      workspaceId,
      projects,
      autoRunConfig,
      autoDestroyOnSessionEnd,
      createdAt: Date.now(),
      status: 'ACTIVE',
    };

    const existingIdx = this.state.ephemeralWorkspaces.findIndex(w => w.workspaceId === workspaceId);
    if (existingIdx >= 0) {
      this.state.ephemeralWorkspaces[existingIdx] = ws;
    } else {
      this.state.ephemeralWorkspaces.push(ws);
    }
    this.save();

    const ipcResult = await this.postJetBrainsIPC('workspace/ephemeral', ws);

    return { ok: true, workspace: ws, ipcResult };
  }

  async destroyWorkspace(workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required');
    const idx = this.state.ephemeralWorkspaces.findIndex(w => w.workspaceId === workspaceId);
    let ws = null;
    if (idx >= 0) {
      ws = this.state.ephemeralWorkspaces.splice(idx, 1)[0];
      this.save();
    }

    const ipcResult = await this.dispatchJetBrainsIPC('workspace/destroy', { workspaceId });

    return { ok: true, workspaceId, destroyedWorkspace: ws, ipcResult };
  }

  async navigateToSymbol(symbol) {
    const ipcResult = await this.dispatchJetBrainsIPC('navigate', { symbol });
    return {
      ok: true,
      symbol,
      ipcResult,
    };
  }
}

function createIDEBridgeMCPServer(options = {}) {
  const service = new IDEBridgeService(options);

  const server = createMCPServer({
    appId: 'ide-bridge',
    name: 'IDE Bridge MCP Server',
    version: '2.0.0',
    description: 'RobOS IDE IPC Bridge Model Context Protocol Server with Breakpoint Webhook, Secrets & Multi-Project Workspaces',
    port: options.port || null,
    tools: [
      {
        name: 'robos_ide_create_run_config',
        description: 'Create a run/debug configuration in IntelliJ with secure GPG pass secret resolution.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Run configuration name' },
            type: { type: 'string', description: 'Type: Application, JUnit, Maven, Gradle' },
            projectPath: { type: 'string', description: 'Path to project directory' },
            mainClassOrCommand: { type: 'string', description: 'Target main class, test class, or CLI command' },
            env: { type: 'object', description: 'Environment variables' },
            passSecrets: { type: 'object', description: 'GPG pass references (e.g. { "DB_PASS": "pass:db/prod_password" })' },
          },
          required: ['name'],
        },
        handler: async (args) => service.createRunConfig(args),
      },
      {
        name: 'robos_ide_run_config',
        description: 'Start a run/debug configuration in the IDE.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Run configuration name' },
            mode: { type: 'string', description: 'Mode: run or debug' },
          },
          required: ['name'],
        },
        handler: async (args) => service.runConfig(args.name, args.mode),
      },
      {
        name: 'robos_ide_stop_config',
        description: 'Stop an active IDE run configuration and trigger session end cleanup.',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Run configuration name' } },
          required: ['name'],
        },
        handler: async (args) => service.stopConfig(args.name),
      },
      {
        name: 'robos_ide_register_breakpoint_webhook',
        description: 'Register an HTTP webhook callback URL to be notified whenever an IDE breakpoint triggers.',
        inputSchema: {
          type: 'object',
          properties: {
            webhookUrl: { type: 'string', description: 'Target HTTP callback URL for breakpoint events' },
          },
          required: ['webhookUrl'],
        },
        handler: async (args) => service.registerBreakpointWebhook(args.webhookUrl),
      },
      {
        name: 'robos_ide_get_thread_state',
        description: 'Inspect the paused thread call stack frames and local variables of the running debug session.',
        inputSchema: {
          type: 'object',
          properties: {
            threadId: { type: 'string', description: 'Optional target thread ID' },
          },
        },
        handler: async (args) => service.getThreadState(args.threadId),
      },
      {
        name: 'robos_ide_create_ephemeral_workspace',
        description: 'Create an ephemeral workspace with multiple projects loaded in IntelliJ, with optional auto-debug and auto-destroy.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: { type: 'string', description: 'Unique identifier for the ephemeral workspace' },
            projects: { type: 'array', items: { type: 'string' }, description: 'List of repository/project root paths' },
            autoRunConfig: { type: 'string', description: 'Optional run/debug configuration to execute immediately' },
            autoDestroyOnSessionEnd: { type: 'boolean', description: 'Whether to destroy workspace when run/debug session stops' },
          },
          required: ['projects'],
        },
        handler: async (args) => service.createEphemeralWorkspace(args),
      },
      {
        name: 'robos_ide_destroy_workspace',
        description: 'Destroy an ephemeral workspace and purge temporary artifacts.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: { type: 'string', description: 'Unique workspace ID to destroy' },
          },
          required: ['workspaceId'],
        },
        handler: async (args) => service.destroyWorkspace(args.workspaceId),
      },
      {
        name: 'robos_ide_open_file',
        description: 'Open a target file in the developer IDE at a specific line and column.',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'Relative or absolute file path' },
            line: { type: 'number', description: 'Line number (1-indexed)' },
            column: { type: 'number', description: 'Column number (1-indexed)' },
          },
          required: ['file'],
        },
        handler: async (args) => service.openFile(args.file, args.line, args.column),
      },
      {
        name: 'robos_ide_set_breakpoint',
        description: 'Set or clear an IDE breakpoint for hands-free issue reproduction.',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'File path' },
            line: { type: 'number', description: 'Line number' },
            enabled: { type: 'boolean', description: 'Breakpoint state' },
          },
          required: ['file', 'line'],
        },
        handler: async (args) => service.setBreakpoint(args.file, args.line, args.enabled ?? true),
      },
      {
        name: 'robos_ide_navigate_to_symbol',
        description: 'Navigate to a class, function, or symbol definition by name in the IDE.',
        inputSchema: {
          type: 'object',
          properties: { symbol: { type: 'string', description: 'Symbol name (e.g. HelloWorld)' } },
          required: ['symbol'],
        },
        handler: async (args) => service.navigateToSymbol(args.symbol),
      },
      {
        name: 'robos_ide_get_open_files',
        description: 'List all currently open editor tabs and cursor positions in the IDE.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => service.getOpenFiles(),
      },
    ],
    resources: [
      {
        uri: 'robos://ide-bridge-mcp/ide/status',
        name: 'IDE Connection & Project Status',
        mimeType: 'application/json',
        handler: async () => service.getStatus(),
      },
      {
        uri: 'robos://ide-bridge-mcp/ide/open-files',
        name: 'Currently Open Editor Files',
        mimeType: 'application/json',
        handler: async () => service.getOpenFiles(),
      },
      {
        uri: 'robos://ide-bridge-mcp/ide/thread-state',
        name: 'Paused Thread Call Stack & Local Variables',
        mimeType: 'application/json',
        handler: async () => (await service.getThreadState()).thread,
      },
    ],
  });

  return { server, service };
}

module.exports = { createIDEBridgeMCPServer, IDEBridgeService };

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
    { name: 'Debug HelloWorld.main()', type: 'Application', status: 'RUNNING', pid: 14201 },
    { name: 'Maven Build & Test', type: 'Maven', status: 'READY' },
  ],
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

  async runConfig(name, mode = 'debug') {
    const config = this.state.runConfigs.find(c => c.name.toLowerCase() === name.toLowerCase());
    let targetConfig = config;
    if (!targetConfig) {
      targetConfig = { name, type: 'Custom', status: 'RUNNING', mode, pid: Math.floor(Math.random() * 9000 + 10000) };
      this.state.runConfigs.push(targetConfig);
    } else {
      targetConfig.status = 'RUNNING';
      targetConfig.mode = mode;
      targetConfig.pid = Math.floor(Math.random() * 9000 + 10000);
    }
    this.save();

    const ipcResult = await this.dispatchJetBrainsIPC('run', { name, mode });

    return { ok: true, config: targetConfig, ipcResult };
  }

  async stopConfig(name) {
    const config = this.state.runConfigs.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!config) return { ok: false, error: 'Configuration not found' };
    config.status = 'STOPPED';
    config.pid = null;
    this.save();

    const ipcResult = await this.dispatchJetBrainsIPC('stop', { name });

    return { ok: true, config, ipcResult };
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
    version: '1.2.0',
    description: 'RobOS IDE IPC Bridge Model Context Protocol Server',
    port: options.port || null,
    tools: [
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
        description: 'Stop an active IDE run configuration.',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Run configuration name' } },
          required: ['name'],
        },
        handler: async (args) => service.stopConfig(args.name),
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
    ],
  });

  return { server, service };
}

module.exports = { createIDEBridgeMCPServer, IDEBridgeService };

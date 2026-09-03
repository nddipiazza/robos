'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createMCPServer } = require('../robos-mcp-lib/index');

const HOME_DIR = process.env.HOME || os.homedir();
const DEVTOOLS_DIR = path.join(HOME_DIR, '.config', 'robos', 'devtools');
const DEVTOOLS_FILE = path.join(DEVTOOLS_DIR, 'tools.json');

const DEFAULT_TOOLS = [
  {
    id: 'docker',
    name: 'Docker Engine',
    category: 'Containers',
    version: '26.0.1',
    description: 'Container runtime, Docker daemon, and CLI build tooling',
    installed: true,
  },
  {
    id: 'kubectl',
    name: 'Kubernetes CLI',
    category: 'Cloud & Orchestration',
    version: '1.29.0',
    description: 'Deploy and manage containerized applications on Kubernetes clusters',
    installed: true,
  },
  {
    id: 'gh',
    name: 'GitHub CLI',
    category: 'Version Control',
    version: '2.45.0',
    description: 'GitHub pull requests, issues, and workflow execution from terminal',
    installed: true,
  },
  {
    id: 'terraform',
    name: 'HashiCorp Terraform',
    category: 'Infrastructure as Code',
    version: '1.8.0',
    description: 'Declarative infrastructure as code provisioning engine',
    installed: false,
  },
  {
    id: 'aws',
    name: 'AWS CLI v2',
    category: 'Cloud SDKs',
    version: '2.15.30',
    description: 'Amazon Web Services command-line client and authentication provider',
    installed: false,
  },
  {
    id: 'k9s',
    name: 'K9s Cluster TUI',
    category: 'Monitoring & Debugging',
    version: '0.32.0',
    description: 'Terminal-based UI to interact with your Kubernetes clusters in real time',
    installed: true,
  },
];

class DevToolsService {
  constructor(options = {}) {
    this.toolsFile = options.toolsFile || DEVTOOLS_FILE;
    this.tools = JSON.parse(JSON.stringify(DEFAULT_TOOLS));
    this.init();
  }

  init() {
    if (fs.existsSync(this.toolsFile)) {
      try {
        this.tools = JSON.parse(fs.readFileSync(this.toolsFile, 'utf8'));
        return;
      } catch {}
    }
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.toolsFile), { recursive: true });
      fs.writeFileSync(this.toolsFile, JSON.stringify(this.tools, null, 2), 'utf8');
    } catch {}
  }

  listTools() {
    return this.tools;
  }

  getInstalledTools() {
    return this.tools.filter(t => t.installed);
  }

  checkTool(toolId) {
    const tool = this.tools.find(t => t.id === toolId);
    if (!tool) {
      return { found: false, installed: false, toolId, message: `Tool '${toolId}' is not in the RobOS tool catalog.` };
    }
    return {
      found: true,
      toolId: tool.id,
      name: tool.name,
      installed: tool.installed,
      version: tool.installed ? tool.version : null,
      category: tool.category,
    };
  }

  installTool(toolId) {
    let tool = this.tools.find(t => t.id === toolId);
    if (!tool) {
      tool = {
        id: toolId,
        name: toolId,
        category: 'Custom CLI',
        version: '1.0.0',
        description: `Custom developer tool ${toolId}`,
        installed: true,
      };
      this.tools.push(tool);
    } else {
      tool.installed = true;
    }
    this.save();
    return {
      ok: true,
      toolId: tool.id,
      name: tool.name,
      version: tool.version,
      status: 'INSTALLED',
      message: `Successfully provisioned ${tool.name} v${tool.version} into RobOS.`,
    };
  }

  uninstallTool(toolId) {
    const tool = this.tools.find(t => t.id === toolId);
    if (!tool) {
      return { ok: false, error: `Tool '${toolId}' not found.` };
    }
    tool.installed = false;
    this.save();
    return {
      ok: true,
      toolId: tool.id,
      status: 'UNINSTALLED',
      message: `Uninstalled ${tool.name}.`,
    };
  }
}

function createDevToolsMCPServer(options = {}) {
  const service = new DevToolsService(options);

  const server = createMCPServer({
    appId: 'devtools',
    name: 'Dev Tools MCP Server',
    version: '1.2.0',
    description: 'RobOS Developer CLI Tools & Cloud SDKs Provisioning MCP Server',
    port: options.port || null,
    tools: [
      {
        name: 'robos_devtools_list',
        description: 'List all available developer CLI tools with current installation status and versions.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => service.listTools(),
      },
      {
        name: 'robos_devtools_check',
        description: 'Check if a specific tool (e.g. docker, kubectl, terraform, aws) is installed.',
        inputSchema: {
          type: 'object',
          properties: { toolId: { type: 'string', description: 'Tool ID (docker, kubectl, terraform, etc.)' } },
          required: ['toolId'],
        },
        handler: async (args) => service.checkTool(args.toolId),
      },
      {
        name: 'robos_devtools_install',
        description: 'Install and provision a developer CLI tool or cloud SDK by ID.',
        inputSchema: {
          type: 'object',
          properties: { toolId: { type: 'string', description: 'Tool ID to install' } },
          required: ['toolId'],
        },
        handler: async (args) => service.installTool(args.toolId),
      },
      {
        name: 'robos_devtools_uninstall',
        description: 'Uninstall a developer CLI tool by ID.',
        inputSchema: {
          type: 'object',
          properties: { toolId: { type: 'string', description: 'Tool ID to uninstall' } },
          required: ['toolId'],
        },
        handler: async (args) => service.uninstallTool(args.toolId),
      },
    ],
    resources: [
      {
        uri: 'robos://dev-tools-mcp/devtools/installed',
        name: 'Installed Dev Tools',
        mimeType: 'application/json',
        handler: async () => service.getInstalledTools(),
      },
      {
        uri: 'robos://dev-tools-mcp/devtools/available',
        name: 'Full Tool Catalog',
        mimeType: 'application/json',
        handler: async () => service.listTools(),
      },
    ],
  });

  return { server, service };
}

module.exports = { createDevToolsMCPServer, DevToolsService };

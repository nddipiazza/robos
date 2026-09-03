'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createMCPServer } = require('../robos-mcp-lib/index');

const HOME_DIR = process.env.HOME || os.homedir();
const SYSTEM_DIR = path.join(HOME_DIR, '.config', 'robos', 'system');
const SYSTEM_FILE = path.join(SYSTEM_DIR, 'state.json');

const DEFAULT_STATE = {
  preferences: {
    theme: 'dark',
    aiModel: 'claude-3-7-sonnet',
    autoApprove: false,
    notificationsEnabled: true,
    mcpBridgePort: 19151,
  },
  notifications: [
    {
      id: 'notif-101',
      title: 'Task Assigned',
      body: 'TASK-101 (First-Class MCP) assigned to you',
      urgency: 'NORMAL',
      timestamp: new Date().toISOString(),
      read: true,
    },
  ],
  tools: [
    { id: 'gh', name: 'GitHub CLI', version: '2.45.0', status: 'INSTALLED' },
    { id: 'kubectl', name: 'Kubernetes CLI', version: '1.29.0', status: 'INSTALLED' },
    { id: 'docker', name: 'Docker Engine', version: '26.0.1', status: 'INSTALLED' },
    { id: 'cargo', name: 'Rust Cargo', version: '1.78.0', status: 'INSTALLED' },
  ],
  activeTask: {
    id: 'TASK-101',
    title: 'Implement First-Class MCP Support',
    stage: 'IN_DEVELOPMENT',
    assignee: 'developer',
    repo: 'nddipiazza/robos',
    branch: 'feat/task-101-flow',
  },
  indexedFiles: [
    'packages/robos-mcp-lib/index.js',
    'packages/robos-mcp-router/router.js',
    'packages/task-manager-mcp/server.js',
    'packages/workspace-manager-mcp/server.js',
    'packages/ekgraph-mcp/server.js',
    'packages/ci-monitor-mcp/server.js',
    'packages/ide-bridge-mcp/server.js',
    'src/main/java/com/robos/HelloWorld.java',
  ],
};

class SystemService {
  constructor(options = {}) {
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.stateFile = options.stateFile || SYSTEM_FILE;
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

  getPreferences() {
    return this.state.preferences;
  }

  getNotifications() {
    return this.state.notifications;
  }

  sendNotification(title, body, urgency = 'NORMAL') {
    const notif = {
      id: `notif-${Date.now()}`,
      title,
      body,
      urgency,
      timestamp: new Date().toISOString(),
      read: false,
    };
    this.state.notifications.unshift(notif);
    this.save();
    return { ok: true, notification: notif };
  }

  searchFiles(query) {
    if (!query) return this.state.indexedFiles.slice(0, 5);
    const q = query.toLowerCase().replace(/^@/, '');
    const matches = this.state.indexedFiles.filter(f => f.toLowerCase().includes(q));
    return {
      query,
      count: matches.length,
      files: matches,
    };
  }

  getInstalledTools() {
    return this.state.tools;
  }

  installTool(toolId) {
    let tool = this.state.tools.find(t => t.id === toolId);
    if (!tool) {
      tool = { id: toolId, name: toolId, version: '1.0.0', status: 'INSTALLED' };
      this.state.tools.push(tool);
    } else {
      tool.status = 'INSTALLED';
    }
    this.save();
    return { ok: true, tool };
  }

  getActiveTask() {
    return this.state.activeTask;
  }
}

function createSystemMCPServer(options = {}) {
  const service = new SystemService(options);

  const server = createMCPServer({
    appId: 'system',
    name: 'System MCP Server',
    version: '1.2.0',
    description: 'RobOS System Preferences, Notifications, Dev Tools & Search MCP Server',
    port: options.port || null,
    tools: [
      {
        name: 'robos_system_get_preferences',
        description: 'Read RobOS system preferences and AI agent configuration.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => service.getPreferences(),
      },
      {
        name: 'robos_system_send_notification',
        description: 'Send a desktop toast notification to the developer.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Notification title' },
            body: { type: 'string', description: 'Notification message body' },
            urgency: { type: 'string', description: 'Urgency: LOW, NORMAL, CRITICAL' },
          },
          required: ['title', 'body'],
        },
        handler: async (args) => service.sendNotification(args.title, args.body, args.urgency),
      },
      {
        name: 'robos_system_search_files',
        description: 'Search workspace file index for @-mention file resolution.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search term or filename prefix' } },
          required: ['query'],
        },
        handler: async (args) => service.searchFiles(args.query),
      },
      {
        name: 'robos_system_get_installed_tools',
        description: 'List installed developer CLI tools, cloud SDKs, and versions.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => service.getInstalledTools(),
      },
      {
        name: 'robos_system_install_tool',
        description: 'Install a developer CLI tool or cloud SDK by ID.',
        inputSchema: {
          type: 'object',
          properties: { toolId: { type: 'string', description: 'Tool ID (e.g. gh, kubectl, terraform)' } },
          required: ['toolId'],
        },
        handler: async (args) => service.installTool(args.toolId),
      },
      {
        name: 'robos_system_get_active_task',
        description: 'Get the currently active task, assigned repository, and workflow stage.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => service.getActiveTask(),
      },
    ],
    resources: [
      {
        uri: 'robos://system-mcp/system/preferences',
        name: 'Current Settings',
        mimeType: 'application/json',
        handler: async () => service.getPreferences(),
      },
      {
        uri: 'robos://system-mcp/system/notifications/recent',
        name: 'Recent Notifications',
        mimeType: 'application/json',
        handler: async () => service.getNotifications(),
      },
      {
        uri: 'robos://system-mcp/system/tools',
        name: 'Installed Tool Inventory',
        mimeType: 'application/json',
        handler: async () => service.getInstalledTools(),
      },
    ],
  });

  return { server, service };
}

module.exports = { createSystemMCPServer, SystemService };

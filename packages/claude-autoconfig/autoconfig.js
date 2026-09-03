'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOME_DIR = process.env.HOME || os.homedir();
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const CLAUDE_SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

const DEFAULT_ACTIVE_TASK = {
  id: 'TASK-101',
  title: 'Implement First-Class MCP Server Support',
  stage: 'IN_DEVELOPMENT',
  repo: 'nddipiazza/robos',
  branch: 'feat/task-101-flow',
  assignee: 'developer',
};

const DEFAULT_EKGRAPH_CONTEXT = {
  repo: 'nddipiazza/robos',
  services: ['desktop-shell', 'task-server', 'mcp-router', 'ide-bridge'],
  environments: ['staging', 'production'],
  primaryLanguage: 'JavaScript / Node.js',
  architectureNodes: 142,
};

function generateClaudeSettings(options = {}) {
  const routerPath = options.routerPath || '/usr/local/share/robos/robos-mcp-router/cli.js';
  return {
    mcpServers: {
      robos: {
        command: 'node',
        args: [routerPath, '--stdio'],
        env: {
          ROBOS_ENV: 'desktop',
          ROBOS_MCP_AUTO: 'true',
        },
      },
    },
  };
}

function generateProjectClaudeMd(options = {}) {
  const task = options.activeTask || DEFAULT_ACTIVE_TASK;
  const ekgraph = options.ekgraph || DEFAULT_EKGRAPH_CONTEXT;

  return `# CLAUDE.md — RobOS AI Development Guidelines

## RobOS AI-First Architecture & MCP Gateway

Claude Code is automatically connected to the **RobOS Unified MCP Router** (\`mcpServers.robos\`).
All tools and resources are available without manual setup:

### Available MCP Tool Suites
- **Tasks (\`robos_tasks_*\`)**: List, query, update, and advance workflow stages for active tickets.
- **Workspaces (\`robos_workspace_*\`)**: Automate workspace branching, IDE launching, and dev server boot.
- **Knowledge Graph (\`robos_ekgraph_*\`)**: Query repos, architecture nodes, microservices, and dependencies.
- **CI / CD (\`robos_ci_*\`)**: Check real-time CI status, retrieve failure logs, and trigger pipeline re-runs.
- **IDE Bridge (\`robos_ide_*\`)**: Navigate IntelliJ / VS Code, inject reproduction breakpoints, attach debuggers.
- **System (\`robos_system_*\`)**: Send toast notifications, read user preferences, and search @-mentions.

---

## Active Task Context (Auto-Injected)
- **Task ID**: \`${task.id}\`
- **Title**: ${task.title}
- **Stage**: \`${task.stage}\`
- **Target Branch**: \`${task.branch}\`
- **Assigned Repo**: \`${task.repo}\`

---

## EKGraph Knowledge Context (Auto-Injected)
- **Repository**: \`${ekgraph.repo}\`
- **Core Services**: ${ekgraph.services.map(s => `\`${s}\``).join(', ')}
- **Deployment Environments**: ${ekgraph.environments.map(e => `\`${e}\``).join(', ')}
- **Primary Stack**: ${ekgraph.primaryLanguage}
- **Architecture Graph Nodes**: ${ekgraph.architectureNodes} linked components
`;
}

class ClaudeAutoconfigService {
  constructor(options = {}) {
    this.homeDir = options.homeDir || HOME_DIR;
    this.claudeDir = path.join(this.homeDir, '.claude');
    this.settingsFile = path.join(this.claudeDir, 'settings.json');
    this.projectDir = options.projectDir || path.join(this.homeDir, 'workspace');
    this.activeTask = options.activeTask || { ...DEFAULT_ACTIVE_TASK };
    this.ekgraph = options.ekgraph || { ...DEFAULT_EKGRAPH_CONTEXT };
    this.init();
  }

  init() {
    try {
      fs.mkdirSync(this.claudeDir, { recursive: true });
      fs.mkdirSync(this.projectDir, { recursive: true });
    } catch {}
    this.sync();
  }

  getSettings() {
    return generateClaudeSettings();
  }

  getClaudeMd() {
    return generateProjectClaudeMd({
      activeTask: this.activeTask,
      ekgraph: this.ekgraph,
    });
  }

  setActiveTask(task) {
    this.activeTask = { ...this.activeTask, ...task };
    this.sync();
    return this.activeTask;
  }

  setEKGraph(ekgraph) {
    this.ekgraph = { ...this.ekgraph, ...ekgraph };
    this.sync();
    return this.ekgraph;
  }

  sync() {
    const settings = this.getSettings();
    const claudeMd = this.getClaudeMd();

    try {
      fs.mkdirSync(this.claudeDir, { recursive: true });
      fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2), 'utf8');

      fs.mkdirSync(this.projectDir, { recursive: true });
      fs.writeFileSync(path.join(this.projectDir, 'CLAUDE.md'), claudeMd, 'utf8');
    } catch {}

    return {
      ok: true,
      settingsFile: this.settingsFile,
      claudeMdFile: path.join(this.projectDir, 'CLAUDE.md'),
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = {
  ClaudeAutoconfigService,
  generateClaudeSettings,
  generateProjectClaudeMd,
};

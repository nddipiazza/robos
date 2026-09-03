'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOME_DIR = process.env.HOME || os.homedir();

const DEFAULT_ACTIVE_TASK = {
  id: 'TASK-101',
  title: 'Implement Universal AI Agent Auto-Configuration & MCP Support',
  stage: 'IN_DEVELOPMENT',
  repo: 'nddipiazza/robos',
  branch: 'feat/task-101-flow',
  assignee: 'developer',
};

const DEFAULT_EKGRAPH_CONTEXT = {
  repo: 'nddipiazza/robos',
  services: ['desktop-shell', 'task-server', 'mcp-router', 'ide-bridge', 'system-mcp'],
  environments: ['staging', 'production'],
  primaryLanguage: 'JavaScript / Node.js / Electron',
  architectureNodes: 142,
};

const SUPPORTED_AGENTS = [
  { id: 'universal', name: 'Universal Agent Standard', configFile: null, docFile: 'AGENTS.md' },
  { id: 'claude', name: 'Claude Code', configFile: '.claude/settings.json', docFile: 'CLAUDE.md' },
  { id: 'gemini', name: 'Gemini / Antigravity', configFile: '.gemini/antigravity/mcp/robos.json', docFile: 'GEMINI.md' },
  { id: 'copilot', name: 'GitHub Copilot CLI', configFile: '.config/github-copilot/mcp.json', docFile: 'COPILOT.md' },
  { id: 'cursor', name: 'Cursor / OpenAI Codex', configFile: '.cursor/mcp.json', docFile: 'CODEX.md' },
];

function generateMCPConfig(agentId = 'universal', options = {}) {
  const routerPath = options.routerPath || '/usr/local/share/robos/robos-mcp-router/cli.js';
  const baseConfig = {
    command: 'node',
    args: [routerPath, '--stdio'],
    env: {
      ROBOS_ENV: 'desktop',
      ROBOS_MCP_AUTO: 'true',
    },
  };

  switch (agentId) {
    case 'gemini':
      return {
        name: 'robos',
        ...baseConfig,
      };
    case 'claude':
    case 'copilot':
    case 'cursor':
    case 'universal':
    default:
      return {
        mcpServers: {
          robos: baseConfig,
        },
      };
  }
}

function generateAgentMarkdown(agentId = 'universal', options = {}) {
  const task = options.activeTask || DEFAULT_ACTIVE_TASK;
  const ekgraph = options.ekgraph || DEFAULT_EKGRAPH_CONTEXT;

  if (agentId === 'universal') {
    return `# AGENTS.md — Universal RobOS AI Agent Guidelines

## RobOS AI-First Architecture & MCP Gateway

RobOS automatically connects all AI coding agents (Claude Code, Antigravity/Gemini, GitHub Copilot, Cursor, Codex) to the **RobOS Unified MCP Router** (\`mcpServers.robos\`).
All tools and resources are available without per-agent manual setup:

### Available RobOS MCP Tool Suites
- **Tasks (\`robos_tasks_*\`)**: List, query, create, update, and advance workflow stages for active tickets.
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

  // Pointer files for specific agents referencing the universal standard
  return `# ${agentId.toUpperCase()}.md

> **Note**: RobOS has consolidated all AI agent instructions into the universal standard [\`AGENTS.md\`](./AGENTS.md).
> Connected to RobOS Unified MCP Router (\`mcpServers.robos\`).

- **Active Task**: \`${task.id}\` (${task.title}) on branch \`${task.branch}\`
- **Repository**: \`${ekgraph.repo}\` (${ekgraph.services.length} services)
`;
}

class AgentAutoconfigService {
  constructor(options = {}) {
    this.homeDir = options.homeDir || HOME_DIR;
    this.projectDir = options.projectDir || path.join(this.homeDir, 'workspace');
    this.activeTask = options.activeTask || { ...DEFAULT_ACTIVE_TASK };
    this.ekgraph = options.ekgraph || { ...DEFAULT_EKGRAPH_CONTEXT };
    this.init();
  }

  init() {
    try {
      fs.mkdirSync(this.projectDir, { recursive: true });
    } catch {}
    this.sync();
  }

  getSupportedAgents() {
    return SUPPORTED_AGENTS;
  }

  getMCPConfig(agentId) {
    return generateMCPConfig(agentId);
  }

  getAgentMarkdown(agentId) {
    return generateAgentMarkdown(agentId, {
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
    const writtenConfigs = [];
    const writtenDocs = [];

    // 1. Write Universal AGENTS.md
    const agentsMd = this.getAgentMarkdown('universal');
    const agentsMdPath = path.join(this.projectDir, 'AGENTS.md');
    try {
      fs.writeFileSync(agentsMdPath, agentsMd, 'utf8');
      writtenDocs.push('AGENTS.md');
    } catch {}

    // 2. Write configs & pointer docs for each agent
    for (const agent of SUPPORTED_AGENTS) {
      if (agent.configFile) {
        const fullConfigPath = path.join(this.homeDir, agent.configFile);
        try {
          fs.mkdirSync(path.dirname(fullConfigPath), { recursive: true });
          fs.writeFileSync(fullConfigPath, JSON.stringify(this.getMCPConfig(agent.id), null, 2), 'utf8');
          writtenConfigs.push(agent.configFile);
        } catch {}
      }

      if (agent.docFile && agent.docFile !== 'AGENTS.md') {
        const fullDocPath = path.join(this.projectDir, agent.docFile);
        try {
          fs.writeFileSync(fullDocPath, this.getAgentMarkdown(agent.id), 'utf8');
          writtenDocs.push(agent.docFile);
        } catch {}
      }
    }

    return {
      ok: true,
      supportedAgentsCount: SUPPORTED_AGENTS.length,
      writtenConfigs,
      writtenDocs,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = {
  AgentAutoconfigService,
  generateMCPConfig,
  generateAgentMarkdown,
  SUPPORTED_AGENTS,
};

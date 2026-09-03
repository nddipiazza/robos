'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let _debugServer;
try {
  _debugServer = require('/usr/local/share/robos/robos-lib/dom-snapshot');
} catch {
  try {
    _debugServer = require('../robos-lib/dom-snapshot');
  } catch {}
}

let mainWindow;

const DEFAULT_ROSTER = {
  version: '1.0',
  kind: 'TeamRoster',
  organization: {
    id: 'acme-corp',
    name: 'Acme Global Platform Engineering',
  },
  teams: [
    {
      id: 'core-platform',
      name: 'Core Platform Engineering',
      topology: 'platform',
      interaction: 'X-as-a-Service',
      description: 'Foundational platform architecture, shared APIs, and CI/CD fabrics',
      members: [
        {
          id: 'user-ndipiazza',
          name: 'Nick D. (Lead Architect)',
          type: 'human',
          role: 'Lead Architect & Code Reviewer',
          responsibilities: 'Architecture plans, PR sign-off, and security review',
          avatar: '👨‍💻',
        },
        {
          id: 'agent-gemini-planner',
          name: 'Gemini Strategic Planner',
          type: 'agent',
          model: 'gemini-2.5-pro',
          role: 'Architecture Planning & Task Breakdown',
          avatar: '🤖',
          skills: ['create-feature-spec', 'contract-drift-detector'],
          mcpServers: ['system-services', 'git-repo-tools'],
        },
        {
          id: 'agent-claude-coder',
          name: 'Claude Code Executor',
          type: 'agent',
          model: 'claude-3.7-sonnet',
          role: 'TDD Implementation & Refactoring',
          avatar: '⚡',
          skills: ['e2e-driven-dev', 'app-snapshot'],
          mcpServers: ['chrome-devtools', 'git-repo-tools', 'test-fabric'],
        },
      ],
    },
    {
      id: 'billing-stream',
      name: 'Billing & Checkout Team',
      topology: 'stream-aligned',
      interaction: 'Collaboration',
      description: 'Customer checkout flows, payment gateways, and tax compliance',
      members: [
        {
          id: 'user-sarah',
          name: 'Sarah M. (Product Engineer)',
          type: 'human',
          role: 'Domain Lead & Approver',
          avatar: '👩‍💻',
        },
        {
          id: 'agent-stripe-bot',
          name: 'Stripe Integration Specialist',
          type: 'agent',
          model: 'claude-3.7-sonnet',
          role: 'Payment Gateway Integration',
          avatar: '💳',
          skills: ['contract-drift-detector', 'e2e-driven-dev'],
          mcpServers: ['chrome-devtools'],
        },
      ],
    },
    {
      id: 'ai-guild',
      name: 'AI Tooling & Prompt Guild',
      topology: 'enabling',
      interaction: 'Facilitating',
      description: 'Continuous enablement, MCP server integrations, and eval benchmarks',
      members: [
        {
          id: 'user-alex',
          name: 'Alex K. (AI Guild Master)',
          type: 'human',
          role: 'Guild Master',
          avatar: '🧙‍♂️',
        },
        {
          id: 'agent-evaluator',
          name: 'Benchmark & Eval Sentinel',
          type: 'agent',
          model: 'gpt-4o',
          role: 'Prompt Regression Testing',
          avatar: '🔬',
          skills: ['app-snapshot'],
          mcpServers: ['system-services'],
        },
      ],
    },
  ],
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextBridge: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer && _debugServer.startDebugServer) {
    _debugServer.startDebugServer(mainWindow, 19163);
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('people-get-teams', async () => {
  return DEFAULT_ROSTER;
});

ipcMain.handle('people-add-agent', async (_evt, teamId, agentData) => {
  const team = DEFAULT_ROSTER.teams.find(t => t.id === teamId);
  if (team) {
    team.members.push(agentData);
    return { ok: true, team, agent: agentData };
  }
  return { ok: false, message: 'Team not found' };
});

ipcMain.handle('people-assign-mcp', async (_evt, agentId, newSkill) => {
  for (const team of DEFAULT_ROSTER.teams) {
    const member = team.members.find(m => m.id === agentId);
    if (member && member.type === 'agent') {
      if (!member.skills.includes(newSkill)) {
        member.skills.push(newSkill);
      }
      return { ok: true, member };
    }
  }
  return { ok: false, message: 'Agent not found' };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'Universal Agent Auto-Configuration provisions MCP settings and context across all major AI coding agents.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Multi-Agent Gateway Metrics',
    minHold: 3200,
  },
  {
    narration: 'We support Claude Code, Gemini Antigravity, GitHub Copilot CLI, Cursor, and the universal AGENTS.md standard.',
    target: '#agents-list',
    action: 'hover',
    callout: 'Discover Supported AI Coding Agents',
    minHold: 3200,
  },
  {
    narration: 'We inspect the auto-generated MCP stdio router gateway pointing to robos-mcp-router.',
    target: '#config-text',
    action: 'hover',
    callout: 'Inspect MCP Router Config',
    minHold: 3200,
  },
  {
    narration: 'We switch to the universal AGENTS.md view with active task context and EKGraph architecture links.',
    target: '#btn-select-universal',
    action: 'click',
    callout: 'Select Universal AGENTS.md Standard',
    minHold: 3500,
  },
  {
    narration: 'We trigger one-click synchronization to provision all agent config files and project documentation.',
    target: '#btn-sync-all',
    action: 'click',
    callout: 'Sync All AI Agent Configurations',
    minHold: 3500,
  },
  {
    narration: 'All AI agent sessions now start with instant, zero-configuration access to the entire RobOS MCP tool suite.',
    target: '#doc-text',
    action: 'hover',
    callout: 'Verify Zero-Config Multi-Agent Readiness',
    minHold: 3000,
  },
];

runDemo({
  slug: 'claude-autoconfig',
  appId: 'agent-autoconfig',
  windowTitle: 'RobOS Universal AI Agent Auto-Configuration Console',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

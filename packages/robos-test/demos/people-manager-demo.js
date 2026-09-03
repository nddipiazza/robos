'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'People Manager structures human engineers and AI agent personas using Team Topologies.',
    target: '#team-item-core-platform',
    action: 'click',
    callout: 'Select Core Platform Team',
    minHold: 3500,
  },
  {
    narration: 'Every AI agent swarm is paired with a designated human lead architect for review.',
    target: '#human-card-user-ndipiazza',
    action: 'hover',
    callout: 'Inspect Lead Architect Approver',
    minHold: 3500,
  },
  {
    narration: 'AI agent personas define explicit model configurations, roles, and execution permissions.',
    target: '#agent-card-agent-claude-coder',
    action: 'hover',
    callout: 'Inspect Claude Code Persona',
    minHold: 3500,
  },
  {
    narration: 'Anthropic Model Context Protocol (MCP) toolkits grant agents specialized tool access.',
    target: '#agent-card-agent-gemini-planner',
    action: 'hover',
    callout: 'Inspect MCP Skills & Toolkits',
    minHold: 3500,
  },
  {
    narration: 'Stream-aligned teams organize cross-functional human engineers and payment specialists.',
    target: '#team-item-billing-stream',
    action: 'click',
    callout: 'Switch to Stream-Aligned Team',
    minHold: 3500,
  },
  {
    narration: '1-click agent onboarding instantly updates .robos/teams.yaml across the organization.',
    target: '#btn-add-agent',
    action: 'click',
    callout: 'Add Codex Refactorer Persona',
    minHold: 3500,
  },
];

runDemo({
  slug: 'people-manager',
  appId: 'people-manager',
  windowTitle: 'RobOS Human & AI Agent Personnel Roster',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

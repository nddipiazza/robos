'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The Workspace Manager MCP Server orchestrates multi-repo Git worktrees and dev environments for AI agents.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Workspace MCP Metrics',
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos_workspace_list to discover active branches, repository locations, and dev servers.',
    target: '#ws-grid',
    action: 'hover',
    callout: 'Discover Active Git Workspaces',
    minHold: 3200,
  },
  {
    narration: 'We dispatch robos_workspace_create over MCP to provision an isolated worktree for TASK-103.',
    target: '#btn-create-ws',
    action: 'click',
    callout: 'Call robos_workspace_create',
    minHold: 3500,
  },
  {
    narration: 'We spin up local development servers and build tooling via robos_workspace_start_devserver.',
    target: '#card-ws-main .btn-secondary',
    action: 'click',
    callout: 'Call robos_workspace_start_devserver',
    minHold: 3200,
  },
  {
    narration: 'We trigger the RobOS IDE IPC bridge over MCP to open the workspace in IntelliJ at port 63343.',
    target: '#btn-open-ide',
    action: 'click',
    callout: 'Call robos_workspace_open_in_ide',
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos://workspace-manager/workspace/active to inspect live branch and runtime metadata.',
    target: '#trace-log',
    action: 'hover',
    callout: 'Read robos://workspace/active Resource',
    minHold: 3000,
  },
];

runDemo({
  slug: 'workspace-manager-mcp',
  appId: 'workspace-manager-mcp',
  windowTitle: 'RobOS Workspace Manager MCP Server Console',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

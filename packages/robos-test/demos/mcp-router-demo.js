'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The RobOS MCP Router provides a single unified endpoint that multiplexes all registered MCP servers.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Unified Router Endpoint',
    minHold: 3200,
  },
  {
    narration: 'The router automatically merges tool declarations into a consolidated tools/list for AI agents.',
    target: '#tools-list',
    action: 'hover',
    callout: 'Review Aggregated Tools List',
    minHold: 3200,
  },
  {
    narration: 'We dispatch a tool call for robos_task_manager_get_task, routed transparently to Task Manager.',
    target: '#btn-dispatch-test',
    action: 'click',
    callout: 'Route tools/call to Task Manager',
    minHold: 3500,
  },
  {
    narration: 'Next we select robos_workspace_manager_list_repos, routed dynamically to Workspace Manager.',
    target: '#tools-list .item-card:last-child',
    action: 'click',
    callout: 'Route tools/call to Workspace Manager',
    minHold: 3200,
  },
  {
    narration: 'The router aggregates resource listings (resources/list) and routes robos:// URI queries.',
    target: '#resources-list',
    action: 'hover',
    callout: 'Inspect Aggregated Resource Providers',
    minHold: 3200,
  },
  {
    narration: 'We export the auto-generated Claude configuration, allowing Claude Code to connect with zero manual setup.',
    target: '#btn-claude-config',
    action: 'click',
    callout: 'Generate Claude Code Configuration',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-mcp-router',
  appId: 'robos-mcp-router',
  windowTitle: 'RobOS Unified MCP Router Console',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

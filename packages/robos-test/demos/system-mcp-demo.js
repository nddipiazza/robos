'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The System MCP Server exposes system preferences, desktop notifications, tool inventory, and file indexing.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect System MCP Server Telemetry',
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos_system_get_preferences to inspect active AI model configs and system preferences.',
    target: '#tools-list',
    action: 'hover',
    callout: 'Inspect Dev Tools & Preferences',
    minHold: 3200,
  },
  {
    narration: 'We resolve @-mention file completions instantly using robos_system_search_files across repository sources.',
    target: '#btn-search-files',
    action: 'click',
    callout: 'Call robos_system_search_files',
    minHold: 3500,
  },
  {
    narration: 'AI agents dispatch desktop toast notifications to the developer via robos_system_send_notification.',
    target: '#btn-send-toast',
    action: 'click',
    callout: 'Call robos_system_send_notification',
    minHold: 3500,
  },
  {
    narration: 'We discover and verify installed dev CLI tools and cloud SDKs with robos_system_get_installed_tools.',
    target: '#tools-list .item-card:first-child',
    action: 'hover',
    callout: 'Query Installed Tools Inventory',
    minHold: 3200,
  },
  {
    narration: 'AI agents read robos://system-mcp/system/notifications/recent to stream real-time notification feeds.',
    target: '#trace-log',
    action: 'hover',
    callout: 'Read robos://system/notifications/recent',
    minHold: 3000,
  },
];

runDemo({
  slug: 'system-mcp',
  appId: 'system-mcp',
  windowTitle: 'RobOS System MCP Server Console',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

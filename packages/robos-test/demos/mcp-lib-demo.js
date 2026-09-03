'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The robos-mcp-lib framework enables any RobOS application to expose an MCP server in under 20 lines of code.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect MCP Server Framework',
    minHold: 3200,
  },
  {
    narration: 'The framework automatically standardizes tool naming (robos_<app>_<action>) and discovers registered tools.',
    target: '#tools-list',
    action: 'hover',
    callout: 'Review Registered MCP Tools',
    minHold: 3200,
  },
  {
    narration: 'We trigger tools/call to execute calculate_metrics, returning structured execution telemetry.',
    target: '#btn-call-demo-tool',
    action: 'click',
    callout: 'Execute tools/call (calculate_metrics)',
    minHold: 3500,
  },
  {
    narration: 'The framework exposes standardized resource URIs following the robos://<app>/<type>/<id> scheme.',
    target: '#resources-list',
    action: 'hover',
    callout: 'Explore Exposed MCP Resources',
    minHold: 3200,
  },
  {
    narration: 'We read the system-info resource, fetching structured host environment data for AI agents.',
    target: '.item-card:last-child',
    action: 'click',
    callout: 'Read Resource (robos://demo/system-info)',
    minHold: 3200,
  },
  {
    narration: 'The live JSON-RPC 2.0 trace log inspects protocol messages with full schema compliance and low latency.',
    target: '#trace-log',
    action: 'hover',
    callout: 'Inspect JSON-RPC 2.0 Protocol Trace',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-mcp-lib',
  appId: 'robos-mcp-lib',
  windowTitle: 'RobOS MCP Server Inspector & Framework',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

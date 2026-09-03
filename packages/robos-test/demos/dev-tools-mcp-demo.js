'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The Dev Tools MCP Server gives AI agents on-demand access to check and provision CLI tools and cloud SDKs.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Dev Tools MCP Architecture',
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos_devtools_list to discover all available toolchains, versions, and installation states.',
    target: '#tools-catalog',
    action: 'hover',
    callout: 'Query Tool Catalog via robos_devtools_list',
    minHold: 3200,
  },
  {
    narration: 'We verify that Docker Engine is installed and active using robos_devtools_check.',
    target: '#btn-check-docker',
    action: 'click',
    callout: 'Call robos_devtools_check (docker)',
    minHold: 3500,
  },
  {
    narration: 'When an AI agent needs Terraform for an IaC task, it provisions it instantly via robos_devtools_install.',
    target: '#btn-install-terraform',
    action: 'click',
    callout: 'Call robos_devtools_install (terraform)',
    minHold: 3500,
  },
  {
    narration: 'We read the robos://dev-tools-mcp/devtools/installed resource to stream the updated tool inventory.',
    target: '#tools-catalog .tool-card:nth-child(4)',
    action: 'hover',
    callout: 'Inspect Newly Provisioned Terraform Tool',
    minHold: 3200,
  },
  {
    narration: 'AI agents can now autonomously resolve missing tool dependencies without developer interruption.',
    target: '#trace-log',
    action: 'hover',
    callout: 'Inspect Live JSON-RPC Protocol Stream',
    minHold: 3000,
  },
];

runDemo({
  slug: 'dev-tools-mcp',
  appId: 'dev-tools-mcp',
  windowTitle: 'RobOS Dev Tools MCP Server Console',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

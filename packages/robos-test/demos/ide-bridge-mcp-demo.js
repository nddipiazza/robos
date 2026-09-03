'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The IDE Bridge MCP Server connects AI agents directly to developer IDEs over HTTP IPC and CLI automation.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect IDE Bridge Metrics',
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos_ide_get_open_files to discover active tabs and cursor positions in real time.',
    target: '#files-list',
    action: 'hover',
    callout: 'Discover Open Editor Files',
    minHold: 3200,
  },
  {
    narration: 'We dispatch robos_ide_open_file to navigate IntelliJ or VS Code to HelloWorld.java at Line 6.',
    target: '#btn-open-file',
    action: 'click',
    callout: 'Call robos_ide_open_file',
    minHold: 3500,
  },
  {
    narration: 'We set a reproduction breakpoint directly on Line 6 via robos_ide_set_breakpoint.',
    target: '#btn-set-bp',
    action: 'click',
    callout: 'Call robos_ide_set_breakpoint (Line 6)',
    minHold: 3500,
  },
  {
    narration: 'AI agents trigger Debug HelloWorld.main() using robos_ide_run_config over port 63343.',
    target: '#btn-run-debug',
    action: 'click',
    callout: 'Trigger Debug Run Configuration',
    minHold: 3500,
  },
  {
    narration: 'We inspect live JSON-RPC protocol messages and query robos://ide/status for connected IDE telemetry.',
    target: '#trace-log',
    action: 'hover',
    callout: 'Read robos://ide/status Resource',
    minHold: 3200,
  },
];

runDemo({
  slug: 'ide-bridge-mcp',
  appId: 'ide-bridge-mcp',
  windowTitle: 'RobOS IDE Bridge MCP Server Console',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

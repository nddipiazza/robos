'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The MCP Server Manager discovers, monitors, and tests all running Model Context Protocol servers.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Discovered MCP Servers',
    minHold: 3200,
  },
  {
    narration: 'We switch to the Tool & Resource Tester tab to inspect exposed schemas and live parameters.',
    target: '#tab-tester',
    action: 'click',
    callout: 'Open Interactive Tool Tester',
    minHold: 3200,
  },
  {
    narration: 'We select robos_task_manager_get_task and configure task parameters.',
    target: '#tool-picker-list',
    action: 'hover',
    callout: 'Select robos_task_manager_get_task',
    js: `(() => {
      window.selectTool('task-manager', 'robos_task_manager_get_task');
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We execute the tool live and observe the structured JSON-RPC response in the output pane.',
    target: '#btn-exec-tool',
    action: 'click',
    callout: 'Execute Tool & View Response',
    minHold: 3500,
  },
  {
    narration: 'We switch to the Agent Access Matrix tab to configure server visibility for Claude, Gemini, and Copilot.',
    target: '#tab-access',
    action: 'click',
    callout: 'Open Agent Access Matrix',
    minHold: 3200,
  },
  {
    narration: 'We save the authorized access permissions, persisting policies into ~/.config/robos/mcp-config.json.',
    target: '#btn-save-access',
    action: 'click',
    callout: 'Save Access Policy Configuration',
    minHold: 3000,
  },
];

runDemo({
  slug: 'mcp-manager',
  appId: 'mcp-manager',
  windowTitle: 'RobOS MCP Server Manager',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

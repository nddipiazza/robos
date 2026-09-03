'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The Task Manager MCP Server exposes structured task lifecycle tools and resources for AI agents.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Task MCP Server Metrics',
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos_tasks_list to discover active backlog and in-progress sprint tasks.',
    target: '.kanban-board',
    action: 'hover',
    callout: 'Review Kanban World State',
    minHold: 3200,
  },
  {
    narration: 'We dispatch robos_tasks_create over MCP to provision a new high-priority story.',
    target: '#btn-create-task',
    action: 'click',
    callout: 'Call robos_tasks_create',
    minHold: 3500,
  },
  {
    narration: 'The Kanban board updates dynamically as tasks advance across workflow stages via robos_tasks_advance_workflow.',
    target: '#btn-advance-active',
    action: 'click',
    callout: 'Call robos_tasks_advance_workflow',
    minHold: 3200,
  },
  {
    narration: 'We attach automated verification notes to the task using robos_tasks_add_comment.',
    target: '#col-review',
    action: 'hover',
    callout: 'Call robos_tasks_add_comment',
    js: `(() => {
      window.addComment('TASK-101', 'AI automated verification complete. Proof of work approved.');
    })()`,
    minHold: 3200,
  },
  {
    narration: 'AI agents query robos://task-manager/tasks/active to fetch the latest execution context in real time.',
    target: '#trace-log',
    action: 'hover',
    callout: 'Read robos://tasks/active Resource',
    minHold: 3000,
  },
];

runDemo({
  slug: 'task-manager-mcp',
  appId: 'task-manager-mcp',
  windowTitle: 'RobOS Task Manager MCP Server Console',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

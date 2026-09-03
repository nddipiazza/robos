'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS provisions isolated headless virtual displays for sub-agent GUI workflows.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Virtual Display Engine',
    minHold: 3200,
  },
  {
    narration: 'We open the provisioning dialog to initialize an isolated visual testing sub-agent.',
    target: '#btn-spawn-agent',
    action: 'click',
    callout: 'Open Sub-Agent Modal',
    minHold: 3000,
  },
  {
    narration: 'We configure the task identifier to ui-tester with the BDD Test Implementer persona.',
    target: '#spawn-task-id',
    action: 'type',
    value: 'ui-tester',
    callout: 'Configure Task ID: ui-tester',
    js: `(() => {
      const input = document.getElementById('spawn-task-id');
      if (input) input.value = 'ui-tester';
      const role = document.getElementById('spawn-role');
      if (role) role.value = 'BDD Test Implementer';
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We spawn the sub-agent session, dynamically allocating virtual display output :10.',
    target: '#btn-confirm-spawn',
    action: 'click',
    callout: 'Allocate Virtual Display :10',
    minHold: 3500,
  },
  {
    narration: 'The inspect drawer renders a live 60 FPS canvas stream of the sub-agent visual session.',
    target: '#display-canvas',
    action: 'hover',
    callout: 'Inspect 60 FPS Canvas Stream',
    minHold: 3200,
  },
  {
    narration: 'We terminate the session to cleanly unallocate the virtual display and release graphics buffers.',
    target: '.btn-term',
    action: 'click',
    callout: 'Unallocate Virtual Display',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-agentd-display',
  appId: 'robos-agentd',
  windowTitle: 'RobOS Desktop Agents Manager',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

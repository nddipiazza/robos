'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The robos-agentd daemon orchestrates isolated Linux sub-agent sessions bound to specific tasks.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Sub-Agent Daemon Telemetry',
    minHold: 3200,
  },
  {
    narration: 'We open the provisioning dialog to initialize a dedicated sub-agent Linux user account.',
    target: '#btn-spawn-agent',
    action: 'click',
    callout: 'Open Sub-Agent Provisioning Modal',
    minHold: 3000,
  },
  {
    narration: 'We set the task identifier to task-101 and assign the Senior Code Reviewer persona.',
    target: '#spawn-task-id',
    action: 'type',
    value: 'task-101',
    callout: 'Configure Task ID: task-101',
    js: `(() => {
      const input = document.getElementById('spawn-task-id');
      if (input) input.value = 'task-101';
      const role = document.getElementById('spawn-role');
      if (role) role.value = 'Senior Code Reviewer';
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We spawn the sub-agent account, initializing /home/agent-task-101 and cgroup memory limits.',
    target: '#btn-confirm-spawn',
    action: 'click',
    callout: 'Provision agent-task-101 Account',
    minHold: 3500,
  },
  {
    narration: 'The inspect drawer streams real-time logs and displays cgroup scope and virtual display metrics.',
    target: '#inspect-pane',
    action: 'hover',
    callout: 'Inspect Live Session Log Stream',
    minHold: 3200,
  },
  {
    narration: 'We terminate the sub-agent session, safely archiving session logs and purging temporary home storage.',
    target: '.btn-term',
    action: 'click',
    callout: 'Archive Logs & Purge Storage',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-agentd',
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

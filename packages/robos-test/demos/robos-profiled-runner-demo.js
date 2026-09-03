'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The robos-run-as CLI runner enables instant process execution inside ephemeral agent profiles.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Profile Daemon Engine',
    minHold: 3200,
  },
  {
    narration: 'We open the provisioning dialog to create a dedicated CLI runner agent session.',
    target: '#btn-spawn-profile',
    action: 'click',
    callout: 'Open Provisioning Dialog',
    minHold: 3000,
  },
  {
    narration: 'We configure the agent identifier to runner-agent for isolated task dispatch.',
    target: '#spawn-name',
    action: 'type',
    value: 'runner-agent',
    callout: 'Configure Agent: runner-agent',
    js: `(() => {
      const input = document.getElementById('spawn-name');
      if (input) input.value = 'runner-agent';
      const role = document.getElementById('spawn-role');
      if (role) role.value = 'Implementation Agent';
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We provision the profile, sourcing bridged display, SSH sockets, and memory quotas.',
    target: '#btn-confirm-spawn',
    action: 'click',
    callout: 'Provision Profile & Sockets',
    minHold: 3500,
  },
  {
    narration: 'The inspect drawer confirms active execution environment flags and systemd scope isolation.',
    target: '#inspect-details',
    action: 'hover',
    callout: 'Inspect Scope & Environment',
    minHold: 3200,
  },
  {
    narration: 'We terminate the session, demonstrating instant zero-residue cleanup and storage purging.',
    target: '.btn-term',
    action: 'click',
    callout: 'Terminate & Purge Runner Profile',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-profiled-runner',
  appId: 'robos-profiled',
  windowTitle: 'RobOS Ephemeral Profile Manager',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

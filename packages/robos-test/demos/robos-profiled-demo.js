'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS Ephemeral Profile Daemon creates isolated multi-user Linux sessions for AI agents.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Profile Daemon Metrics',
    minHold: 3200,
  },
  {
    narration: 'We open the provisioning dialog to spawn a dedicated agent user account.',
    target: '#btn-spawn-profile',
    action: 'click',
    callout: 'Open Provisioning Dialog',
    minHold: 3000,
  },
  {
    narration: 'We configure the agent identifier, role, and target LLM model before launching.',
    target: '#spawn-name',
    action: 'type',
    value: 'pr-reviewer',
    callout: 'Set Agent Name: pr-reviewer',
    js: `(() => {
      const input = document.getElementById('spawn-name');
      if (input) input.value = 'pr-reviewer';
    })()`,
    minHold: 3000,
  },
  {
    narration: 'We provision my-agent-pr-reviewer with memory-backed tmpfs home and host display bridging.',
    target: '#btn-confirm-spawn',
    action: 'click',
    callout: 'Provision Agent Profile',
    minHold: 3500,
  },
  {
    narration: 'The inspect drawer displays allocated subsystem groups (video, render, audio, kvm) and systemd scope.',
    target: '#inspect-details',
    action: 'hover',
    callout: 'Inspect Subsystem Permissions',
    minHold: 3200,
  },
  {
    narration: 'We terminate the ephemeral profile to execute instant, zero-residue process and home cleanup.',
    target: '.btn-term',
    action: 'click',
    callout: 'Terminate Agent Session',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-profiled',
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

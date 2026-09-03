'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS mounts all ephemeral agent homes into memory-backed tmpfs with strict 0700 permissions.',
    target: '#stat-tmpfs',
    action: 'hover',
    callout: 'Inspect Tmpfs RAM Storage Metric',
    minHold: 3200,
  },
  {
    narration: 'We open the provisioning dialog to create an ephemeral build and compilation agent.',
    target: '#btn-spawn-profile',
    action: 'click',
    callout: 'Open Provisioning Dialog',
    minHold: 3000,
  },
  {
    narration: 'We set the agent name to build-agent with isolated 4GB RAM quota allocation.',
    target: '#spawn-name',
    action: 'type',
    value: 'build-agent',
    callout: 'Configure Agent: build-agent',
    js: `(() => {
      const input = document.getElementById('spawn-name');
      if (input) input.value = 'build-agent';
      const role = document.getElementById('spawn-role');
      if (role) role.value = 'Implementation Agent';
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We provision the profile, populating default skeleton dotfiles (.bashrc, .profile) from /etc/skel.',
    target: '#btn-confirm-spawn',
    action: 'click',
    callout: 'Mount Tmpfs Home & Populate Skel',
    minHold: 3500,
  },
  {
    narration: 'The inspect drawer confirms the 2GB memory quota and active dotfile initialization in RAM.',
    target: '#inspect-details',
    action: 'hover',
    callout: 'Inspect Tmpfs Quota & Dotfiles',
    minHold: 3200,
  },
  {
    narration: 'We terminate the session to safely unmount tmpfs and purge all in-memory files with zero disk residue.',
    target: '.btn-term',
    action: 'click',
    callout: 'Unmount & Purge Tmpfs Home',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-profiled-tmpfs',
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

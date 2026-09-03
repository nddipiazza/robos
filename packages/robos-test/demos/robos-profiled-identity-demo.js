'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS securely tunnels host SSH and GPG agent sockets without exposing raw private keys.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Identity Forwarding Overview',
    minHold: 3200,
  },
  {
    narration: 'We open the provisioning dialog to create an ephemeral Git review and commit agent.',
    target: '#btn-spawn-profile',
    action: 'click',
    callout: 'Open Provisioning Dialog',
    minHold: 3000,
  },
  {
    narration: 'We set the agent identifier to git-agent with Code Reviewer and PR verification permissions.',
    target: '#spawn-name',
    action: 'type',
    value: 'git-agent',
    callout: 'Configure Agent: git-agent',
    js: `(() => {
      const input = document.getElementById('spawn-name');
      if (input) input.value = 'git-agent';
      const role = document.getElementById('spawn-role');
      if (role) role.value = 'Code Reviewer';
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We provision the profile, forwarding SSH_AUTH_SOCK and propagating host git author identity.',
    target: '#btn-confirm-spawn',
    action: 'click',
    callout: 'Tunnel Identity & Inject AI Tokens',
    minHold: 3500,
  },
  {
    narration: 'The inspect drawer confirms forwarded SSH agent, GPG agent socket, and injected AI model tokens.',
    target: '#inspect-details',
    action: 'hover',
    callout: 'Inspect Forwarded Credentials',
    minHold: 3200,
  },
  {
    narration: 'We terminate the session to safely unlink forwarded sockets and purge credential environment variables.',
    target: '.btn-term',
    action: 'click',
    callout: 'Unlink Forwarded Sockets',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-profiled-identity',
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

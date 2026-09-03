'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS securely tunnels host developer credentials and authentication sockets into sub-agent sessions.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Credential Tunnel Architecture',
    minHold: 3200,
  },
  {
    narration: 'We open the provisioning dialog to initialize a Git-enabled architecture sub-agent.',
    target: '#btn-spawn-agent',
    action: 'click',
    callout: 'Open Sub-Agent Modal',
    minHold: 3000,
  },
  {
    narration: 'We configure the task identifier to git-worker with the Lead Architect persona.',
    target: '#spawn-task-id',
    action: 'type',
    value: 'git-worker',
    callout: 'Configure Task ID: git-worker',
    js: `(() => {
      const input = document.getElementById('spawn-task-id');
      if (input) input.value = 'git-worker';
      const role = document.getElementById('spawn-role');
      if (role) role.value = 'Lead Architect Agent';
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We spawn the session, establishing SSH_AUTH_SOCK and GPG agent socket tunnels.',
    target: '#btn-confirm-spawn',
    action: 'click',
    callout: 'Tunnel Sockets & Inherit Git Identity',
    minHold: 3500,
  },
  {
    narration: 'The inspect drawer verifies forwarded SSH agent sockets, inherited git author, and injected AI API keys.',
    target: '#inspect-details',
    action: 'hover',
    callout: 'Inspect Tunneled Credentials',
    minHold: 3200,
  },
  {
    narration: 'We terminate the session to cleanly unlink forwarded sockets and purge credential environment variables.',
    target: '.btn-term',
    action: 'click',
    callout: 'Teardown & Unlink Sockets',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-agentd-tunnel',
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

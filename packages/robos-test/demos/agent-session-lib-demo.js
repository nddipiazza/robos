'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The robos-agent-session library provides clean API bindings for all RobOS desktop apps.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Shared Library Bindings',
    minHold: 3200,
  },
  {
    narration: 'We trigger spawnAgentSession() to provision a new sub-agent session over the UNIX socket.',
    target: '#btn-spawn-client',
    action: 'click',
    callout: 'Call spawnAgentSession()',
    minHold: 3500,
  },
  {
    narration: 'The library emits session:spawned, and the consumer UI reflects the new active sub-agent.',
    target: '#session-grid',
    action: 'hover',
    callout: 'Verify Active Session Card',
    minHold: 3200,
  },
  {
    narration: 'We configure and dispatch a background build command to the running sub-agent.',
    target: '#cmd-text',
    action: 'type',
    value: 'npm run build',
    callout: 'Configure Command: npm run build',
    js: `(() => {
      const cards = document.querySelectorAll('.session-card');
      if (cards.length) {
        const id = cards[0].id.replace('session-', '');
        const idInput = document.getElementById('cmd-task-id');
        if (idInput) idInput.value = id;
      }
      const cmdInput = document.getElementById('cmd-text');
      if (cmdInput) cmdInput.value = 'npm run build';
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We dispatch the command over IPC using sendAgentCommand() and observe live event logging.',
    target: '#btn-send-cmd',
    action: 'click',
    callout: 'Dispatch sendAgentCommand()',
    minHold: 3200,
  },
  {
    narration: 'We invoke terminateAgentSession() to cleanly tear down the session and archive execution logs.',
    target: '.btn-secondary',
    action: 'click',
    callout: 'Call terminateAgentSession()',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-agent-session',
  appId: 'robos-agent-session',
  windowTitle: 'RobOS Agent Session Client Demo',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

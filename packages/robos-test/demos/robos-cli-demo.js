'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS CLI Suite provides core terminal tools for notifications, session tasks, journals, and events.',
    target: '#btn-run-notify',
    action: 'click',
    callout: 'Execute robos-notify',
    minHold: 3200,
  },
  {
    narration: 'We switch to robos-active-task and assign the active developer task for the workspace session.',
    target: '#tab-btn-task',
    action: 'click',
    callout: 'Open robos-active-task Tab',
    js: `(() => {
      setTimeout(() => {
        const btn = document.getElementById('btn-run-task-set');
        if (btn) btn.click();
      }, 800);
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We verify the active session task via robos-active-task get.',
    target: '#btn-run-task-get',
    action: 'click',
    callout: 'Query Active Session Task',
    minHold: 2800,
  },
  {
    narration: 'In robos-journal-append, we log architectural decisions directly into the Git daily journal.',
    target: '#tab-btn-journal',
    action: 'click',
    callout: 'Open robos-journal-append Tab',
    js: `(() => {
      setTimeout(() => {
        const btn = document.getElementById('btn-run-journal');
        if (btn) btn.click();
      }, 800);
    })()`,
    minHold: 3200,
  },
  {
    narration: 'In robos-event, we emit structured SDLC lifecycle events to the system Event Bus.',
    target: '#tab-btn-event',
    action: 'click',
    callout: 'Open robos-event Tab',
    js: `(() => {
      setTimeout(() => {
        const btn = document.getElementById('btn-run-event-emit');
        if (btn) btn.click();
      }, 800);
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We query robos-event history to verify chronological NDJSON event logs across all system services.',
    target: '#btn-run-event-history',
    action: 'click',
    callout: 'Query Event History Timeline',
    minHold: 2800,
  },
];

runDemo({
  slug: 'robos-cli',
  appId: 'robos-cli',
  windowTitle: 'RobOS CLI Console',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

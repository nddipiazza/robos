'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS Toast Daemon provides categorized, tiered overlay notifications across all SDLC domains.',
    target: '#btn-trigger-ci-info',
    action: 'click',
    callout: 'Emit Info Toast (Cyan)',
    minHold: 3200,
  },
  {
    narration: 'Warning notifications highlight actionable items like review requests with amber borders and 15-second timers.',
    target: '#btn-trigger-pr-warning',
    action: 'click',
    callout: 'Emit Warning Toast (Amber)',
    minHold: 3500,
  },
  {
    narration: 'Critical notifications persist until acknowledged, highlighting blockers and build failures with red borders.',
    target: '#btn-trigger-ci-crit',
    action: 'click',
    callout: 'Emit Critical Blocker (Red)',
    minHold: 3500,
  },
  {
    narration: 'Toasts stack neatly in the overlay preview with auto-repositioning and smooth slide-in animations.',
    target: '#btn-trigger-task-info',
    action: 'click',
    callout: 'Stack Task Notification',
    minHold: 3200,
  },
  {
    narration: 'In Do-Not-Disturb (DND) mode, non-critical toasts are suppressed while critical blockers queue for later review.',
    target: '#dnd-toggle',
    action: 'click',
    callout: 'Toggle DND Mode & Flush Queue',
    js: `(() => {
      setTimeout(() => {
        const toggle = document.getElementById('dnd-toggle');
        if (toggle) toggle.click();
      }, 1200);
    })()`,
    minHold: 3500,
  },
  {
    narration: 'Interactive click-to-navigate opens the relevant application context with zero context-switching friction.',
    target: '#btn-dismiss-all',
    action: 'click',
    callout: 'Dismiss All Toasts',
    minHold: 2800,
  },
];

runDemo({
  slug: 'robos-toast',
  appId: 'robos-toast',
  windowTitle: 'RobOS Toast Daemon',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

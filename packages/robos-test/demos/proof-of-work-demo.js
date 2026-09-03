'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'Upon task completion, the sub-agent enters AWAITING_PROOF_VERIFICATION and positions test results on display.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Proof of Work Pipeline',
    minHold: 3200,
  },
  {
    narration: 'The developer selects TASK-101 to inspect the live Proof of Work verification surface.',
    target: '#card-TASK-101',
    action: 'click',
    callout: 'Open TASK-101 Stream',
    minHold: 3200,
  },
  {
    narration: 'The virtual desktop presents 42 passing test suites and 98.4% code coverage in real time.',
    target: '#focused-canvas',
    action: 'hover',
    callout: 'Review Test Suite & Coverage Proof',
    minHold: 3200,
  },
  {
    narration: 'The Proof of Work action bar provides interactive human-in-the-loop review and approval controls.',
    target: '#pow-overlay-bar',
    action: 'hover',
    callout: 'Inspect Proof of Work Action Bar',
    minHold: 3000,
  },
  {
    narration: 'We click Approve Proof & Create PR to accept the verified task and trigger automated PR generation.',
    target: '#btn-pow-approve',
    action: 'click',
    callout: 'Click Approve Proof & Create PR',
    minHold: 3500,
  },
  {
    narration: 'The system broadcasts verification completion and delivers an instant merge confirmation toast.',
    target: '#toast-container',
    action: 'hover',
    callout: 'Verify PR Creation & Task Completion',
    minHold: 3000,
  },
];

runDemo({
  slug: 'proof-of-work',
  appId: 'desktop-agents',
  windowTitle: 'RobOS Desktop Agents Viewer',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

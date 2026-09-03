'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS Autonomous EDD Runner executes strict Red-Green-Refactor development loops for AI agents.',
    target: '#tab-btn-edd',
    action: 'click',
    callout: 'Open Autonomous EDD Studio',
    minHold: 3500,
  },
  {
    narration: 'The agent initiates the automated verification loop against the local test fabric.',
    target: '#btn-run-edd-action',
    action: 'click',
    callout: 'Run Autonomous EDD Loop',
    minHold: 3500,
  },
  {
    narration: 'Phase 1: The agent verifies that the synthesized E2E test fails meaningfully before code is written.',
    target: '#step-row-red',
    action: 'hover',
    callout: 'Verify Strict RED Failure Guard',
    minHold: 3500,
  },
  {
    narration: 'Phase 2: The agent applies minimal microservice code modifications and contract stubs.',
    target: '#step-row-impl',
    action: 'hover',
    callout: 'Apply Minimal Implementation',
    minHold: 3500,
  },
  {
    narration: 'Phase 3: The E2E scenario is re-executed to confirm 100% green pass rate across all steps.',
    target: '#step-row-green',
    action: 'hover',
    callout: 'Confirm 100% GREEN Pass',
    minHold: 3500,
  },
  {
    narration: 'Phase 4: Full regression suite passes with 0 breaking changes, ready for 1-click human review.',
    target: '#edd-status-badge',
    action: 'hover',
    callout: 'Verified & Ready to Merge',
    minHold: 3000,
  },
];

runDemo({
  slug: 'edd-runner',
  appId: 'robos-graph',
  windowTitle: 'RobOS SDLC Knowledge Graph Explorer',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

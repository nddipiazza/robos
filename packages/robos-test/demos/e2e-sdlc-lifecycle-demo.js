'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS inverts the SDLC: AI investigates & plans, human reviews and approves.',
    target: '#btn-open-review-hub',
    action: 'click',
    callout: 'Open Proof-of-Work Review Hub',
    minHold: 3500,
  },
  {
    narration: 'Reviewers inspect OSLC knowledge graphs, TypeSpec models, and OpenAPI 3.1 contracts.',
    target: '#chapter-btn-1',
    action: 'click',
    callout: 'Inspect Architectural Specs',
    minHold: 3500,
  },
  {
    narration: 'Automated governance gates enforce 100% Pact and Stoplight Spectral pass rates.',
    target: '#chapter-btn-2',
    action: 'click',
    callout: 'Verify Contract Test Gates',
    minHold: 3500,
  },
  {
    narration: 'Autonomous agent swarms provide timestamped proof-of-work video walkthroughs.',
    target: '#chapter-btn-3',
    action: 'click',
    callout: 'Inspect Proof-of-Work Video',
    minHold: 3500,
  },
  {
    narration: 'With all verification gates satisfied, Lead Reviewers complete 1-click GitOps merges.',
    target: '#btn-signoff-merge',
    action: 'click',
    callout: '1-Click Lead Sign-Off & Git Merge',
    minHold: 4000,
  },
];

runDemo({
  slug: 'e2e-sdlc-lifecycle',
  appId: 'dev-central',
  windowTitle: 'RobOS Dev Central',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

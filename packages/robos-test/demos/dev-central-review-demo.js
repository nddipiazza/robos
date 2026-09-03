'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'Dev Central serves as the daily engineering cockpit and proof-of-work review hub.',
    target: '#header',
    action: 'hover',
    callout: 'Dev Central Engineering Cockpit',
    minHold: 3500,
  },
  {
    narration: 'The developer opens the Proof-of-Work Review Hub to verify completed agent tasks.',
    target: '#btn-open-review-hub',
    action: 'click',
    callout: 'Open Proof-of-Work Review Hub',
    minHold: 3500,
  },
  {
    narration: 'The 1080p video player displays synchronized UI screen recordings with WebVTT captions.',
    target: '#review-video-player-card',
    action: 'hover',
    callout: 'Inspect 1080p Video Walkthrough',
    minHold: 3500,
  },
  {
    narration: 'Clicking any chapter bookmark instantly seeks to the exact execution timestamp.',
    target: '#chapter-seek-3',
    action: 'click',
    callout: 'Seek to Chapter 3 Execution',
    minHold: 3500,
  },
  {
    narration: 'Quality gate badges confirm Pact contracts, SHACL conformance, and 0 regression failures.',
    target: '#quality-gates-grid',
    action: 'hover',
    callout: 'Verify 100% Quality Gates',
    minHold: 3500,
  },
  {
    narration: '1-click sign-off merges the branch into main and updates the production SDLC graph.',
    target: '#btn-signoff-merge',
    action: 'click',
    callout: '1-Click Sign-Off & Merge',
    minHold: 3000,
  },
];

runDemo({
  slug: 'dev-central-review',
  appId: 'dev-central',
  windowTitle: 'Dev Central',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

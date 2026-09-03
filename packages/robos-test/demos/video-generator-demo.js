'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS Video Walkthrough Generator produces multi-modal proof-of-work video artifacts.',
    target: '#tab-btn-video',
    action: 'click',
    callout: 'Open Video Walkthrough Studio',
    minHold: 3500,
  },
  {
    narration: 'The engine records 1080p 30fps screen streams in Xvfb with zero frame dropping.',
    target: '#video-player-card',
    action: 'hover',
    callout: 'Inspect 1080p Video Player & Specs',
    minHold: 3500,
  },
  {
    narration: 'Searchable chapter bookmarks and action timestamps are indexed for fast seeking.',
    target: '#video-chapters-card',
    action: 'hover',
    callout: 'Inspect Chapter Bookmarks & Timeline',
    minHold: 3500,
  },
  {
    narration: 'Clicking any chapter bookmark instantly seeks to the corresponding implementation action.',
    target: '#chapter-item-3',
    action: 'click',
    callout: 'Seek to Chapter 3 Action',
    minHold: 3500,
  },
  {
    narration: 'The synchronized W3C WebVTT subtitle track displays millisecond-accurate text narration.',
    target: '#vtt-stream-console',
    action: 'hover',
    callout: 'Inspect W3C WebVTT Subtitle Stream',
    minHold: 3500,
  },
  {
    narration: 'The complete proof-of-work video artifact is ready for 1-click merge review in Dev Central.',
    target: '#video-status-badge',
    action: 'hover',
    callout: 'Proof-of-Work Video Artifact Ready',
    minHold: 3000,
  },
];

runDemo({
  slug: 'video-generator',
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

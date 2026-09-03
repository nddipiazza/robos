'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The Desktop Agents Viewer provides a centralized console to monitor and interact with all sub-agent desktops.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Multi-Agent Streaming Console',
    minHold: 3200,
  },
  {
    narration: 'The grid view renders live 60 FPS virtual desktop streams for all active sub-agent sessions in parallel.',
    target: '#view-grid-container',
    action: 'hover',
    callout: 'Review 60 FPS Desktop Stream Grid',
    minHold: 3200,
  },
  {
    narration: 'We select TASK-101 to expand into a high-resolution focused stream view.',
    target: '#card-TASK-101',
    action: 'click',
    callout: 'Focus TASK-101 Stream View',
    minHold: 3200,
  },
  {
    narration: 'We toggle Take Manual Control to forward developer keyboard and mouse input into the sub-agent session.',
    target: '#btn-manual-control',
    action: 'click',
    callout: 'Toggle Manual Input Control',
    minHold: 3500,
  },
  {
    narration: 'The live control banner confirms real-time input forwarding with sub-15ms latency.',
    target: '#control-banner',
    action: 'hover',
    callout: 'Verify Interactive Input Forwarding',
    minHold: 3200,
  },
  {
    narration: 'We return to the grid overview to maintain oversight across all sub-agent tasks simultaneously.',
    target: '#btn-back-grid',
    action: 'click',
    callout: 'Return to Stream Grid Overview',
    minHold: 3000,
  },
];

runDemo({
  slug: 'desktop-agents',
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

'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS bridges host X11 and Wayland displays so agent graphical applications render natively.',
    target: '#stat-display',
    action: 'hover',
    callout: 'Inspect Direct Display Bridging Metric',
    minHold: 3200,
  },
  {
    narration: 'We open the provisioning dialog to create an ephemeral UI and media testing agent.',
    target: '#btn-spawn-profile',
    action: 'click',
    callout: 'Open Provisioning Dialog',
    minHold: 3000,
  },
  {
    narration: 'We set the agent identifier to ui-tester with Test Fabric Runner permissions.',
    target: '#spawn-name',
    action: 'type',
    value: 'ui-tester',
    callout: 'Configure Agent: ui-tester',
    js: `(() => {
      const input = document.getElementById('spawn-name');
      if (input) input.value = 'ui-tester';
      const role = document.getElementById('spawn-role');
      if (role) role.value = 'Test Fabric Runner';
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We provision the profile, synchronizing Xauthority cookies and PulseAudio media sockets.',
    target: '#btn-confirm-spawn',
    action: 'click',
    callout: 'Bridge Display & Audio Subsystems',
    minHold: 3500,
  },
  {
    narration: 'The inspect drawer confirms direct X11 :0 display, PulseAudio server, and GPU DRI render nodes.',
    target: '#inspect-details',
    action: 'hover',
    callout: 'Inspect Display & GPU Subsystems',
    minHold: 3200,
  },
  {
    narration: 'We terminate the session to safely unbridge the display and release all shared media sockets.',
    target: '.btn-term',
    action: 'click',
    callout: 'Teardown Display & Media Sockets',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-profiled-display',
  appId: 'robos-profiled',
  windowTitle: 'RobOS Ephemeral Profile Manager',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

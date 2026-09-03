'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'Package Manager standardizes runtime environments using Devcontainers and Mise.',
    target: '#pkg-item-forms-api',
    action: 'click',
    callout: 'Select Forms API Microservice',
    minHold: 3500,
  },
  {
    narration: 'Environment definitions in .robos/packages.yaml are versioned across Git branches.',
    target: '#select-gitops-branch',
    action: 'click',
    callout: 'Switch GitOps Branch',
    minHold: 3500,
  },
  {
    narration: 'Standard .devcontainer/devcontainer.json ensures 100% reproducible execution.',
    target: '#devcontainer-card',
    action: 'hover',
    callout: 'Inspect Devcontainer Configuration',
    minHold: 3500,
  },
  {
    narration: 'Supervised background services launch instantly with automatic port mapping.',
    target: '#btn-start-service',
    action: 'click',
    callout: 'Start Microservice Daemon',
    minHold: 3500,
  },
  {
    narration: 'Live /healthz polling verifies service availability with sub-millisecond precision.',
    target: '#btn-run-health-check',
    action: 'click',
    callout: 'Probe HTTP Health Endpoint',
    minHold: 3500,
  },
  {
    narration: 'Real-time stdout/stderr log streaming captures all container events.',
    target: '#package-logs-pre',
    action: 'hover',
    callout: 'Stream Live Process Logs',
    minHold: 3500,
  },
];

runDemo({
  slug: 'package-manager',
  appId: 'package-manager',
  windowTitle: 'RobOS App, Package & Runtime Manager',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

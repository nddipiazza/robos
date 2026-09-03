'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS Local Test Fabric intercepts outbound HTTP dependencies called by your service.',
    target: '#node-urn_robos_service_forms-api',
    action: 'hover',
    callout: 'Select Forms API Service',
    minHold: 3500,
  },
  {
    narration: 'We open Local Test Fabric to inspect all external APIs that Forms API Service reaches out to.',
    target: '#tab-btn-fabric',
    action: 'click',
    callout: 'Open Local Test Fabric for Service',
    minHold: 3500,
  },
  {
    narration: 'Our service calls the external Acme Tax Forms endpoint to retrieve this year vendor tax forms.',
    target: '#dep-row-acme-tax',
    action: 'hover',
    callout: 'Inspect Acme Tax Forms Outbound Dependency',
    minHold: 3500,
  },
  {
    narration: 'We probe the local contract stub to fake the external tax form response via contract-first mocking.',
    target: '#btn-probe-acme-tax',
    action: 'click',
    callout: 'Probe Acme Tax Mock Stub',
    minHold: 3500,
  },
  {
    narration: 'The local mock server returns the 2026 1099 tax form instant response without external network calls.',
    target: '#probe-response-console',
    action: 'hover',
    callout: 'Inspect Fake Contract Mock Response',
    minHold: 3500,
  },
  {
    narration: 'Your service runs and verifies 100% offline using reliable contract-first mocks.',
    target: '#fabric-status-badge',
    action: 'hover',
    callout: '100% Offline Contract Mocks Active',
    minHold: 3000,
  },
];

runDemo({
  slug: 'test-fabric',
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

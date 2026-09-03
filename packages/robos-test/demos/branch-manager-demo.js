'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS features Git-Backed Dual-State Multi-Branch World State Versioning for production and future states.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Multi-Branch World State Metrics',
    minHold: 3200,
  },
  {
    narration: 'We inspect main branch (Production Reality) with verified and deployed microservice topologies.',
    target: '#nodes-list',
    action: 'hover',
    callout: 'View Production Baseline (5 Nodes)',
    minHold: 3200,
  },
  {
    narration: 'We switch to feature/TASK-101-auth to view proposed microservices, OpenAPI specs, and OAuth requirements.',
    target: '#btn-switch-feature',
    action: 'click',
    callout: 'Switch to feature/TASK-101-auth',
    minHold: 3500,
  },
  {
    narration: 'We switch world states to poc/v2-graph-ql to evaluate an exploratory GraphQL federation spike.',
    target: '#branch-select',
    action: 'select',
    value: 'poc/v2-graph-ql',
    callout: 'Switch to poc/v2-graph-ql Spike',
    minHold: 3500,
  },
  {
    narration: 'We switch to pilot/beta-billing to inspect customer-facing beta canary deployments with Pact contracts.',
    target: '#branch-select',
    action: 'select',
    value: 'pilot/beta-billing',
    callout: 'Switch to pilot/beta-billing Rollout',
    minHold: 3500,
  },
  {
    narration: 'AI agents and architects can now query and validate production and future world states seamlessly.',
    target: '#query-text',
    action: 'hover',
    callout: 'Verify Sub-50ms Branch Switching',
    minHold: 3000,
  },
];

runDemo({
  slug: 'branch-manager',
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

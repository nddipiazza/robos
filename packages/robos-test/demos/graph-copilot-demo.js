'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'We inspect the loaded graph name, source location, node count and registered schema count.',
    target: '#graph-status-bar',
    action: 'hover',
    callout: 'Inspect Loaded Graph Context',
    minHold: 3200,
  },
  {
    narration: 'We input a prompt to create an asynchronous email notification worker subscribed to order events.',
    target: '#copilot-prompt',
    action: 'hover',
    callout: 'Input Architecture Prompt',
    minHold: 3200,
  },
  {
    narration: 'We click AI Co-Pilot Generate to synthesize OSLC microservices, AsyncAPI contracts, and requirements.',
    target: '#btn-copilot-generate',
    action: 'click',
    callout: 'Synthesize OSLC Graph Nodes',
    minHold: 3500,
  },
  {
    narration: 'We inspect the proposal validation result before applying graph changes.',
    target: '#inspector-content .card-title .status-tag-pass',
    action: 'hover',
    callout: 'Inspect Proposal Validation Result',
    minHold: 3200,
  },
  {
    narration: 'We apply the synthesized mutation to the active world state graph with a single click.',
    target: '#btn-copilot-apply',
    action: 'click',
    callout: 'Apply Mutation to Active Graph',
    minHold: 3500,
  },
  {
    narration: 'The new microservice and event contracts are now active and ready for autonomous agent implementation.',
    target: '#query-text',
    action: 'hover',
    callout: 'Verify Active Graph State (+3 Nodes)',
    minHold: 3000,
  },
];

runDemo({
  slug: 'graph-copilot',
  appId: 'robos-graph',
  windowTitle: 'RobOS Knowledge Graph Explorer',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

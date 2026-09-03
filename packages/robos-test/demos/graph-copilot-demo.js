'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The RobOS World Graph Authoring Studio embeds an AI Co-Pilot for natural language graph evolution.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect AI Co-Pilot Authoring Studio',
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
    narration: 'The AI Co-Pilot validates all proposed nodes against W3C SHACL shape constraints before committing.',
    target: '#stat-shacl-badge',
    action: 'hover',
    callout: 'Verify 100% SHACL Conformance',
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
  windowTitle: 'RobOS SDLC Knowledge Graph Explorer',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

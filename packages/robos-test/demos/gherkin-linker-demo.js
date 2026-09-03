'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS elevates Gherkin BDD Features into first-class SDLC Resource Nodes in the knowledge graph.',
    target: '.node-list',
    action: 'hover',
    callout: 'Inspect SDLC Resource Nodes (Features, Services, Contracts)',
    minHold: 3200,
  },
  {
    narration: 'Selecting the BDD Feature node displays its narrative, linked requirement REQ-201, and target service.',
    target: '.inspector-card',
    action: 'hover',
    callout: 'Inspect BDD Feature Metadata & Linkages',
    minHold: 3500,
  },
  {
    narration: 'We inspect the live Gherkin Scenarios with their Given, When, and Then executable step definitions.',
    target: '.scenario-box',
    action: 'hover',
    callout: 'Inspect Executable Scenarios & Steps',
    minHold: 3500,
  },
  {
    narration: 'Autonomous agents generate executable Cucumber-JS step definition boilerplate with a single click.',
    target: '.inspector-card .btn-secondary',
    action: 'click',
    callout: 'Generate Executable Step Definitions',
    minHold: 3500,
  },
  {
    narration: 'The Traceability Matrix tab maps every requirement to features, scenarios, microservices, and test suites.',
    target: '#tab-btn-traceability',
    action: 'click',
    callout: 'Open Traceability Matrix View',
    minHold: 3500,
  },
  {
    narration: 'Every requirement is bidirectionally linked and 100% verified across the entire engineering universe.',
    target: '.matrix-table',
    action: 'hover',
    callout: 'Verify End-to-End Traceability Matrix',
    minHold: 3200,
  },
];

runDemo({
  slug: 'gherkin-linker',
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

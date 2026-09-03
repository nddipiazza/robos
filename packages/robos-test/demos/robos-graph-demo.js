'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The RobOS SDLC Knowledge Graph standardizes on OASIS OSLC Core 3.0 and W3C JSON-LD 1.1.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect OSLC Knowledge Graph Telemetry',
    minHold: 3200,
  },
  {
    narration: 'We inspect C4 microservice container nodes, OpenAPI 3.1 contracts, and owner teams.',
    target: '#nodes-list',
    action: 'hover',
    callout: 'Discover SDLC Graph Nodes',
    minHold: 3200,
  },
  {
    narration: 'We view RDF triples and semantic links connecting Requirements, Services, and Test Artefacts.',
    target: '#details-text',
    action: 'hover',
    callout: 'Inspect JSON-LD Triples & Predicates',
    minHold: 3200,
  },
  {
    narration: 'We execute W3C SHACL shape validation to enforce schema integrity across all graph entities.',
    target: '#btn-validate-shacl',
    action: 'click',
    callout: 'Validate W3C SHACL Shapes',
    minHold: 3500,
  },
  {
    narration: 'We trace dependency blast radius across microservices to prevent unintended breaking changes.',
    target: '#btn-trace-dependents',
    action: 'click',
    callout: 'Trace Dependency Blast Radius',
    minHold: 3500,
  },
  {
    narration: 'All graph state is version-controlled declaratively in GitOps .robos/knowledge-graph.jsonld.',
    target: '#query-text',
    action: 'hover',
    callout: 'Verify Declarative GitOps Storage',
    minHold: 3000,
  },
];

runDemo({
  slug: 'robos-graph',
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

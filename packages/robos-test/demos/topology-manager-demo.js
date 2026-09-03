'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'Topology Manager visualizes distributed systems using C4 Model & Backstage standards.',
    target: '#node-card-forms-api',
    action: 'click',
    callout: 'Inspect Forms API Microservice',
    minHold: 3500,
  },
  {
    narration: 'The inspector displays container runtimes, devcontainers, and owner engineering teams.',
    target: '#inspector-card-details',
    action: 'hover',
    callout: 'Inspect Tech Stack & Devcontainer',
    minHold: 3500,
  },
  {
    narration: 'Nodes display linked OpenAPI & AsyncAPI contracts with real-time conformance status.',
    target: '#inspector-card-contracts',
    action: 'hover',
    callout: 'Inspect OpenAPI 3.1 Contract',
    minHold: 3500,
  },
  {
    narration: 'Developers and AI agents can seamlessly toggle between C4 Context, Containers, and Components.',
    target: '#btn-zoom-l1',
    action: 'click',
    callout: 'Switch to C4 Level 1 Context',
    minHold: 3500,
  },
  {
    narration: 'Level 2 container view exposes deployable microservices, databases, and message brokers.',
    target: '#btn-zoom-l2',
    action: 'click',
    callout: 'Return to C4 Level 2 Containers',
    minHold: 3500,
  },
  {
    narration: 'Importing a Spotify Backstage catalog-info.yaml dynamically integrates upstream services.',
    target: '#btn-import-backstage',
    action: 'click',
    callout: 'Ingest Backstage Catalog',
    minHold: 3500,
  },
  {
    narration: '1-click export generates Structurizr & PlantUML C4 architectural diagram markup.',
    target: '#btn-export-c4',
    action: 'click',
    callout: 'Generate C4 PlantUML Export',
    minHold: 3500,
  },
];

runDemo({
  slug: 'topology-manager',
  appId: 'topology-manager',
  windowTitle: 'RobOS System Topology & Backstage C4 Studio',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

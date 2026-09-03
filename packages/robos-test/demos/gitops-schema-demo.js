'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS unifies the entire SDLC under a declarative, version-controlled .robos/ directory.',
    target: '#tab-btn-gitops',
    action: 'click',
    callout: 'Open .robos/ GitOps SDLC Studio',
    minHold: 3500,
  },
  {
    narration: 'topology.yaml defines microservices, databases, and C4 communication links.',
    target: '#gitops-file-topology',
    action: 'click',
    callout: 'Inspect topology.yaml & C4 Links',
    minHold: 3500,
  },
  {
    narration: 'teams.yaml defines human architects and AI agent personas with MCP skill matrices.',
    target: '#gitops-file-teams',
    action: 'click',
    callout: 'Inspect teams.yaml & MCP Skills',
    minHold: 3500,
  },
  {
    narration: 'packages.yaml defines desktop applications, daemons, and devcontainer environments.',
    target: '#gitops-file-packages',
    action: 'click',
    callout: 'Inspect packages.yaml & Devcontainers',
    minHold: 3500,
  },
  {
    narration: 'The GitOps parser validates all .robos/ files against JSON Schema 2020-12 drafts.',
    target: '#btn-run-gitops-validate',
    action: 'click',
    callout: 'Validate .robos/ Specification Tree',
    minHold: 3500,
  },
  {
    narration: 'The declarative SDLC specification is 100% conforming and ready for AI agent swarms.',
    target: '#gitops-status-badge',
    action: 'hover',
    callout: '100% Validated GitOps SDLC',
    minHold: 3000,
  },
];

runDemo({
  slug: 'gitops-schema',
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

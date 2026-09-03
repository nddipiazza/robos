'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS embraces open source, integrating Spotify Backstage catalogs seamlessly.',
    target: '#adapter-item-backstage',
    action: 'click',
    callout: 'Select Spotify Backstage Adapter',
    js: "window.selectAdapter('backstage')",
    minHold: 3500,
  },
  {
    narration: 'Microsoft TypeSpec compiler extracts schemas and REST routes in sub-100ms cycles.',
    target: '#adapter-item-typespec',
    action: 'click',
    callout: 'Select TypeSpec Compiler Adapter',
    js: "window.selectAdapter('typespec')",
    minHold: 3500,
  },
  {
    narration: 'Pact Foundation matrices govern consumer-provider API compatibility.',
    target: '#adapter-item-pact',
    action: 'click',
    callout: 'Select Pact Contract Matrix',
    js: "window.selectAdapter('pact')",
    minHold: 3500,
  },
  {
    narration: 'GitOps versioning ensures OSS artifacts track branch mutations automatically.',
    target: '#select-gitops-branch',
    action: 'click',
    callout: 'Switch GitOps Branch',
    js: "window.switchGitBranch('feature/TAX-1099-ein-verification')",
    minHold: 3500,
  },
  {
    narration: 'Unified sync executes bi-directional zero-loss translation across all 5 adapters.',
    target: '#btn-sync-all',
    action: 'click',
    callout: 'Sync All 5 OSS Standards',
    js: 'window.syncAllAdapters()',
    minHold: 3500,
  },
  {
    narration: 'Export tools output compliant catalog-info.yaml and devcontainers effortlessly.',
    target: '#btn-export-backstage',
    action: 'click',
    callout: 'Export Backstage catalog-info.yaml',
    js: 'window.exportBackstage()',
    minHold: 3500,
  },
];

runDemo({
  slug: 'oss-adapters',
  appId: 'adapter-studio',
  windowTitle: 'RobOS Open-Source Ecosystem Adapter Suite',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

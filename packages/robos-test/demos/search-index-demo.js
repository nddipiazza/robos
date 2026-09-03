'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS }  = require('../lib/snapshot');

const SCRIPT = [
  {
    narration: 'RobOS Search Index maintains pre-built file indexes for fast @-mention lookups in AI textareas.',
    target: '.index-card',
    action: 'click',
    callout: 'Inspect Configured Indexes',
    minHold: 3200,
  },
  {
    narration: 'We select the Source Projects index to view indexed repository directories and file counts.',
    target: '[data-id="source"]',
    action: 'click',
    callout: 'Select Source Projects Index',
    minHold: 3000,
  },
  {
    narration: 'We trigger an incremental index rebuild to scan new repositories and file changes.',
    target: '#btn-rebuild-sel',
    action: 'click',
    callout: 'Rebuild Selected Index',
    js: `(() => {
      setTimeout(() => {
        const btn = document.getElementById('btn-rebuild-sel');
        if (btn) btn.click();
      }, 500);
    })()`,
    minHold: 3500,
  },
  {
    narration: 'We run a test search across all active indexes to verify immediate fuzzy match speed.',
    target: '#search-input',
    action: 'type',
    value: 'service',
    callout: 'Search for "service"',
    js: `(() => {
      window.searchQuery('service');
    })()`,
    minHold: 3200,
  },
  {
    narration: 'Custom project directories and documentation repositories can be registered in one click.',
    target: '#btn-add',
    action: 'click',
    callout: 'Open Add Index Dialog',
    minHold: 3000,
  },
  {
    narration: 'RobOS Search Index provides sub-millisecond @-mention completion for AI agents and code reviews.',
    target: '#btn-add-cancel',
    action: 'click',
    callout: 'Search Index Ready',
    minHold: 2800,
  },
];

runDemo({
  slug: 'search-index',
  appId: 'search-index',
  windowTitle: 'RobOS Search Index',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  prelaunch: async (app) => {
    // Seed sample files for indexing
    const mockDir = path.join(app.sandboxHome, 'source', 'sample-service');
    fs.mkdirSync(mockDir, { recursive: true });
    fs.writeFileSync(path.join(mockDir, 'service.js'), 'export const service = () => {};');
    fs.writeFileSync(path.join(mockDir, 'config.json'), '{"name": "sample-service"}');
  },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

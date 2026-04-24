'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS CI Monitor watches every pipeline on your project in real time — what\u2019s passing, what\u2019s broken, and why.',
    js: null, minHold: 4000,
  },
  {
    narration: 'Stats at the top give the full picture: total runs, how many passed, how many failed, and how many are still executing.',
    js: null, minHold: 4500,
  },
  {
    narration: 'The run list below is color-coded by status — green for success, red for failure, blue for in progress. Each card shows the branch, the workflow name, and the commit message.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Filter to just the failed runs to focus on what actually needs attention.',
    js: `(() => {
      const s = document.getElementById('filter-status');
      s.value = 'failure';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    })();`,
    minHold: 4000,
  },
  {
    narration: 'Open the failed TTL run to see the full breakdown.',
    js: `(async () => {
      const s = document.getElementById('filter-status');
      s.value = 'all';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const card = document.querySelector('.run-card[data-id="1000"]');
      if (card) card.click();
    })();`,
    minHold: 4500,
  },
  {
    narration: 'The Jobs tab lists every step in the pipeline with its duration and conclusion. Red badges mark the steps that failed.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Switch to the failed log tab to see exactly where things went wrong. No scrolling through a thousand lines of noise — RobOS pulls just the failing portion.',
    js: `document.querySelector('.tab-btn[data-tab="log"]').click();`,
    minHold: 5000,
  },
  {
    narration: 'And the hero feature: AI Diagnosis. Claude reads the failed log, classifies the failure type — test, lint, type error, or build failure — and surfaces a concrete suggested action.',
    js: `(() => {
      document.querySelector('.tab-btn[data-tab="diagnosis"]').click();
      setTimeout(() => {
        const btn = document.getElementById('btn-diagnose');
        if (btn) btn.click();
      }, 1000);
    })();`,
    minHold: 7500,
  },
  {
    narration: 'Re-run the workflow with one click, or jump straight to the run on GitHub. Every failing build is one action away from being unblocked.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Back to the dashboard. Watching a pipeline has never been less manual.',
    js: `document.getElementById('btn-back').click();`,
    minHold: 4500,
  },
];

runDemo({
  slug: 'ci-monitor',
  appId: 'ci-monitor',
  windowTitle: 'RobOS CI Monitor',
  scenario: scenarios['ci-monitor-github'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

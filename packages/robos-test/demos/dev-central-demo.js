'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS Dev Central is your daily developer dashboard. Everything that needs your attention in one place — the moment you log in.',
    js: null, minHold: 4500,
  },
  {
    narration: 'My Tasks in the top-left lists every issue assigned to you, color-coded by workflow state and pulled straight from GitHub, Jira, or whichever task server you\u2019ve configured.',
    js: null, minHold: 5500,
  },
  {
    narration: 'My Pull Requests shows your open PRs with CI status and review-decision dots next to each one — so you can see at a glance what\u2019s ready to land and what\u2019s blocked.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Review Requests lists the PRs waiting for your review — ordered by age, so the oldest asks surface first.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Blocker Radar is the early-warning system. RobOS scans your PRs and issues for failed CI, stale reviews older than 24 hours, and tickets stuck in the same state for days — then surfaces them here.',
    js: null, minHold: 6000,
  },
  {
    narration: 'The AI Standup Summary synthesizes yesterday\u2019s completed work and today\u2019s plan from your issue and PR state. Stand-ups write themselves.',
    js: `document.getElementById('standup-card').scrollIntoView({ behavior: 'smooth', block: 'center' });`,
    minHold: 5500,
  },
  {
    narration: 'Recent Activity is the audit log for your whole desktop — every issue you touched, every PR you reviewed, every AI agent that ran on your behalf.',
    js: `document.getElementById('activity-card').scrollIntoView({ behavior: 'smooth', block: 'end' });`,
    minHold: 5000,
  },
  {
    narration: 'No dashboards to keep open. No tabs to juggle. Dev Central is the first thing you see on RobOS, and it already knows what you should do next.',
    js: `window.scrollTo({ top: 0, behavior: 'smooth' });`,
    minHold: 5000,
  },
];

runDemo({
  slug: 'dev-central',
  appId: 'dev-central',
  windowTitle: 'Dev Central',
  scenario: scenarios['github-task-server'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

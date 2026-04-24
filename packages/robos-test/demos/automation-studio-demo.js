'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

const TODAY = new Date().toISOString().slice(0, 10);
const MIN  = 60_000;
const HOUR = 3_600_000;

const SEED_RULES = [
  {
    id: 'r1', name: 'Auto-triage new bugs',
    eventType: 'issue.opened',
    conditions: [{ field: 'labels', op: 'contains', value: 'bug' }],
    actions: [
      { type: 'ai_prompt', prompt: 'Triage this issue: classify severity and propose reproduction steps.' },
      { type: 'notify', channel: '#triage', message: 'New bug: {issue.title}' },
    ],
    enabled: true,
    lastFired: new Date(Date.now() - 2 * HOUR).toISOString(),
  },
  {
    id: 'r2', name: 'Block merge on failing CI',
    eventType: 'pr.ready_for_review',
    conditions: [{ field: 'checks.conclusion', op: 'equals', value: 'failure' }],
    actions: [
      { type: 'comment', body: '⚠ CI is failing — please fix before re-requesting review.' },
      { type: 'remove_label', label: 'ready' },
    ],
    enabled: true,
    lastFired: new Date(Date.now() - 45 * MIN).toISOString(),
  },
  {
    id: 'r3', name: 'Generate PR summary on open',
    eventType: 'pr.opened',
    conditions: [],
    actions: [
      { type: 'ai_prompt', prompt: 'Summarize this PR: scope, risk, and suggested reviewers.' },
    ],
    enabled: false,
    lastFired: null,
  },
];

const SEED_JOBS = [
  {
    id: 'j1', name: 'Nightly stale-review sweep',
    cronExpression: '0 2 * * *',
    actions: [
      { type: 'ai_prompt', prompt: 'List PRs with reviews older than 48 hours and post to #dev.' },
    ],
    enabled: true,
  },
  {
    id: 'j2', name: 'Weekly velocity report',
    cronExpression: '0 9 * * MON',
    actions: [
      { type: 'ai_prompt', prompt: 'Generate last week\'s velocity report and save to Manager Dashboard.' },
    ],
    enabled: true,
  },
];

const SEED_EVENTS = [
  { type: 'pr.opened',              category: 'pr',    source: 'github', timestamp: new Date(Date.now() - 5 * MIN).toISOString(),  payload: { number: 15, title: 'Add worker fleet health monitoring endpoint' } },
  { type: 'ci.build.completed',     category: 'ci',    source: 'github', timestamp: new Date(Date.now() - 12 * MIN).toISOString(), payload: { run: 1001, conclusion: 'success' } },
  { type: 'ci.build.completed',     category: 'ci',    source: 'github', timestamp: new Date(Date.now() - 35 * MIN).toISOString(), payload: { run: 1000, conclusion: 'failure' } },
  { type: 'issue.opened',           category: 'issue', source: 'github', timestamp: new Date(Date.now() - 1 * HOUR).toISOString(), payload: { number: 42, title: 'Worker pool exhaustion', labels: ['bug'] } },
  { type: 'agent.task.completed',   category: 'agent', source: 'claude', timestamp: new Date(Date.now() - 2 * HOUR).toISOString(), payload: { session: 's-482', task: 'Draft fix for #42' } },
  { type: 'deploy.succeeded',       category: 'deploy', source: 'github', timestamp: new Date(Date.now() - 3 * HOUR).toISOString(), payload: { version: 'v2.4.3', env: 'production' } },
  { type: 'pr.review_requested',    category: 'pr',    source: 'github', timestamp: new Date(Date.now() - 4 * HOUR).toISOString(), payload: { number: 15, reviewer: 'testuser' } },
];

function seedFiles(sandboxHome) {
  const cfgDir = path.join(sandboxHome, '.config', 'robos');
  const logDir = path.join(cfgDir, 'event-log');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'event-rules.json'),    JSON.stringify(SEED_RULES, null, 2));
  fs.writeFileSync(path.join(cfgDir, 'scheduled-jobs.json'), JSON.stringify(SEED_JOBS,  null, 2));
  fs.writeFileSync(path.join(logDir, `${TODAY}.jsonl`),
    SEED_EVENTS.map(e => JSON.stringify(e)).join('\n') + '\n');
}

const SCRIPT = [
  {
    narration: 'RobOS Automation Studio wires up event-driven rules and scheduled jobs that run across every app on your desktop. When something happens, RobOS decides what should happen next.',
    js: null, minHold: 5000,
  },
  {
    narration: 'The Rules tab lists every event-triggered automation. Auto-triage new bugs, block merges on failing CI, summarize pull requests — each one fires on a specific event type with optional conditions.',
    js: null, minHold: 6000,
  },
  {
    narration: 'Each rule shows its event, conditions, actions, and when it last fired. Toggle it on or off with one click.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Create a new rule. The editor slides in from the right — pick the event, chain conditions, and wire up actions: notify a channel, comment on a PR, fire an AI prompt, or call a webhook.',
    js: `document.getElementById('btn-add-rule').click();`,
    minHold: 6000,
  },
  {
    narration: 'Scheduled Jobs run on a cron schedule. Weekly velocity reports, nightly stale-review sweeps, daily backups — anything that shouldn\u2019t wait for an event to trigger.',
    js: `(() => {
      const btn = document.getElementById('btn-cancel-rule');
      if (btn) btn.click();
      setTimeout(() => document.querySelector('.tab[data-tab="jobs"]').click(), 400);
    })();`,
    minHold: 5500,
  },
  {
    narration: 'And the Event Log gives you a live stream of everything that happened on the desktop — pull requests, CI builds, issues, agent runs, deploys — all in one searchable feed.',
    js: `document.querySelector('.tab[data-tab="log"]').click();`,
    minHold: 5000,
  },
  {
    narration: 'Filter by category or type to zoom in on what matters. Click any event to see its full payload — the exact data RobOS passed to the rules that fired.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Automation Studio is the glue that makes every other RobOS app feel connected. Code a rule once, and the whole desktop reacts.',
    js: `document.querySelector('.tab[data-tab="rules"]').click();`,
    minHold: 5000,
  },
];

runDemo({
  slug: 'automation-studio',
  appId: 'automation-studio',
  windowTitle: 'Automation Studio',
  scenario: scenarios['github-task-server'],
  prelaunch: async (app) => {
    seedFiles(app.sandboxHome);
    await evalJS(app.port, `window.location.reload()`);
  },
  postSettle: 1800,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

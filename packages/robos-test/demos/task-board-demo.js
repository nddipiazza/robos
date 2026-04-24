'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS Task Board is a live view of every issue on your project. Pick up work, track status, and jump into a ticket without leaving your desktop.',
    js: null, minHold: 2500,
  },
  {
    narration: 'The Kanban view groups issues by workflow state — Triage, In Progress, and Done — so the whole backlog is visible at a glance.',
    js: null, minHold: 3500,
  },
  {
    narration: 'Filter to just the tickets assigned to you.',
    js: `(() => { const s = document.getElementById('filter-assignee'); s.value = '@me'; s.dispatchEvent(new Event('change', {bubbles: true})); })();`,
    minHold: 3000,
  },
  {
    narration: 'Or search by title to find a specific issue.',
    js: `(() => { const s = document.getElementById('filter-assignee'); s.value = ''; s.dispatchEvent(new Event('change', {bubbles: true}));
      const i = document.getElementById('filter-search'); i.value = 'scheduler'; i.dispatchEvent(new Event('input', {bubbles: true})); })();`,
    minHold: 3200,
  },
  {
    narration: 'Clear the search and switch to the list view for a denser table of every ticket.',
    js: `(() => { const i = document.getElementById('filter-search'); i.value = ''; i.dispatchEvent(new Event('input', {bubbles: true}));
      document.getElementById('btn-list').click(); })();`,
    minHold: 3500,
  },
  {
    narration: 'Flip back to the board. Click any card to open the ticket on GitHub, or launch RobOS Issue Manager for a deeper view with AI assistance.',
    js: `document.getElementById('btn-kanban').click();`,
    minHold: 4000,
  },
];

runDemo({
  slug: 'task-board',
  appId: 'task-board',
  windowTitle: 'RobOS Task Board',
  scenario: scenarios['issue-manager-github'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

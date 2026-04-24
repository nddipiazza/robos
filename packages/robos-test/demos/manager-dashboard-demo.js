'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS Manager Dashboard is the single pane of glass for engineering leaders — sprint status, team velocity, deployment frequency, and cycle time, pulled live from your task server.',
    js: null, minHold: 5500,
  },
  {
    narration: 'The top row is the KPIs that actually matter: open issues, merged PRs, cycle time, deploy frequency, and approval rate. Every number is a link to the underlying data.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Adjust the time range to compare the last sprint to the last quarter.',
    js: `(() => {
      const s = document.getElementById('time-range');
      if (!s) return;
      s.value = '30';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    })();`,
    minHold: 3500,
  },
  {
    narration: 'Below, the sprint board shows where every open issue sits in your workflow — Triage, In Progress, Done — aggregated across the whole team.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Velocity by developer. Color-coded bars show who shipped what over the window. Not for rankings — for spotting who\u2019s overloaded, who\u2019s blocked, and where to rebalance.',
    js: `(() => {
      const el = document.getElementById('velocity-content');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    })();`,
    minHold: 7000,
  },
  {
    narration: 'Pull request activity tracks open PRs by state and approval. Anything flagged in red is blocked — failing CI, stale reviews, or merge conflicts — and calls out where the manager should step in.',
    js: `(() => {
      const el = document.getElementById('pr-activity-content');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    })();`,
    minHold: 5500,
  },
  {
    narration: 'Deployment history at the bottom. Every deploy, with frequency trends and environments, so you know whether you\u2019re actually shipping or just talking about shipping.',
    js: `(() => {
      const el = document.getElementById('deploy-content');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    })();`,
    minHold: 5500,
  },
  {
    narration: 'Manager Dashboard is how RobOS lets engineering managers see the whole team at once — without chasing five different tools.',
    js: `window.scrollTo({ top: 0, behavior: 'smooth' });`,
    minHold: 4500,
  },
];

runDemo({
  slug: 'manager-dashboard',
  appId: 'manager-dashboard',
  windowTitle: 'Manager Dashboard',
  scenario: scenarios['github-task-server'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS Deploy Tracker is the deployment timeline for your project — every release, every environment, every rollback — pulled live from GitHub\u2019s Deployments API.',
    js: null, minHold: 5500,
  },
  {
    narration: 'The KPI cards at the top summarize the window: total deploys, frequency per week, releases shipped, average deploy size, and mean time to recovery when something breaks.',
    js: null, minHold: 6000,
  },
  {
    narration: 'Change the time range to see how the team\u2019s shipping pace has moved. Seven days, thirty days, a full quarter.',
    js: `(() => {
      const s = document.getElementById('time-range');
      if (!s) return;
      s.value = '30';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    })();`,
    minHold: 4500,
  },
  {
    narration: 'Filter by environment to separate production from staging. Deploy Tracker correlates both so you can see how quickly a change moves from one to the other.',
    js: `(() => {
      const f = document.getElementById('env-filter');
      if (!f) return;
      f.value = 'production';
      f.dispatchEvent(new Event('change', { bubbles: true }));
    })();`,
    minHold: 5000,
  },
  {
    narration: 'Clear the filter to see the full timeline. Each row is one deploy with its environment badge, the author, the ref, and a direct link back to GitHub.',
    js: `(() => {
      const f = document.getElementById('env-filter');
      if (!f) return;
      f.value = '';
      f.dispatchEvent(new Event('change', { bubbles: true }));
    })();`,
    minHold: 5500,
  },
  {
    narration: 'Failed deploys show in red so you can spot rollbacks at a glance. RobOS pairs each failure with the retry that followed, so MTTR is a real number, not a fuzzy estimate.',
    js: `(() => {
      const el = document.getElementById('timeline-content');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    })();`,
    minHold: 6000,
  },
  {
    narration: 'Below the timeline, the release list cross-references deploys against tagged GitHub releases, and the changeset view shows which merged PRs made it into each deploy.',
    js: `(() => {
      const el = document.getElementById('changeset-content');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    })();`,
    minHold: 5500,
  },
  {
    narration: 'Deploy Tracker is how RobOS turns "did that ship?" into a question you never have to ask twice.',
    js: `window.scrollTo({ top: 0, behavior: 'smooth' });`,
    minHold: 4500,
  },
];

runDemo({
  slug: 'deploy-tracker',
  appId: 'deploy-tracker',
  windowTitle: 'Deploy Tracker',
  scenario: scenarios['github-task-server'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

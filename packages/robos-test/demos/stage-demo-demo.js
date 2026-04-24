'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/**
 * Stage Demo Viewer reads staged AI-generated demos from
 * ~/.config/robos/stage-demos/*.json. Pre-seed two demos: one pending review
 * (the hero) and one already approved (shows the lifecycle).
 */
function seedStageDemos(sandboxHome) {
  const dir = path.join(sandboxHome, '.config', 'robos', 'stage-demos');
  fs.mkdirSync(dir, { recursive: true });

  const demos = [
    {
      id: 'acme-corp-buildbarn-forms-14-1745600000000',
      repo: 'acme-corp/buildbarn-forms',
      prNumber: 14,
      prTitle: 'Fix CAS blob TTL calculation overflow',
      prBody: 'Fixes the integer overflow in TTL math that caused CAS entries to expire in the past. Adds a regression test for the boundary condition at MAX_INT seconds.',
      author: 'testuser',
      branch: 'fix/cas-ttl-overflow',
      baseBranch: 'main',
      additions: 62, deletions: 18,
      labels: ['bug', 'priority:high'],
      mergedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      url: 'https://github.com/acme-corp/buildbarn-forms/pull/14',
      changedFiles: ['src/cas/ttl.rs', 'src/cas/ttl_test.rs', 'CHANGELOG.md'],
      status: 'pending-review',
      generatedAt: new Date(Date.now() - 3 * 86_400_000 + 10 * 60_000).toISOString(),
      walkthrough: [
        { title: 'What Changed',       description: 'The TTL calculation now uses u64 everywhere and saturates instead of wrapping when the expiry exceeds u32.' },
        { title: 'Why It Matters',     description: 'CAS entries with TTLs near the u32 ceiling were wrapping to zero — causing them to appear expired immediately and blowing up the cache hit rate.' },
        { title: 'Files Touched',      description: 'Three files: the TTL calculator, a new regression test, and a changelog note. No public API changes.' },
        { title: 'How to Verify',      description: 'Set pool_size=50 and push 200 concurrent actions. Cache hit rate should stay above 95%. The new ttl_test.rs::boundary_at_max_int asserts the saturating behavior directly.' },
      ],
    },
    {
      id: 'acme-corp-buildbarn-forms-10-1744900000000',
      repo: 'acme-corp/buildbarn-forms',
      prNumber: 10,
      prTitle: 'Worker pool refactor — replace channels with crossbeam deque',
      prBody: 'Switches the scheduler\'s worker pool from std::mpsc to crossbeam-deque for work-stealing. Roughly 3× throughput on the contention benchmarks.',
      author: 'alice-dev',
      branch: 'perf/worker-pool-deque',
      baseBranch: 'main',
      additions: 440, deletions: 210,
      labels: ['enhancement', 'performance'],
      mergedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      url: 'https://github.com/acme-corp/buildbarn-forms/pull/10',
      changedFiles: ['src/scheduler/pool.rs', 'src/scheduler/mod.rs', 'benches/pool_bench.rs'],
      status: 'approved',
      generatedAt: new Date(Date.now() - 10 * 86_400_000 + 15 * 60_000).toISOString(),
      walkthrough: [
        { title: 'What Changed',       description: 'Worker pool now uses crossbeam-deque for work-stealing across threads.' },
        { title: 'Why It Matters',     description: 'The old mpsc-based queue serialized at the receiver. Under contention the throughput ceiling was ~120k tasks/sec. Deque-based work-stealing lifts that to ~380k.' },
        { title: 'Benchmark Numbers',  description: 'New bench shows 3.1× throughput on 16-core, 2.6× on 8-core. P99 latency down 44%.' },
        { title: 'How to Verify',      description: 'cargo bench --bench pool_bench; observe mean throughput ≥ 350k/sec on 16-core. No regressions in the existing correctness suite.' },
      ],
    },
  ];

  for (const d of demos) {
    fs.writeFileSync(path.join(dir, `${d.id}.json`), JSON.stringify(d, null, 2));
  }
}

const SCRIPT = [
  {
    narration: 'RobOS Stage Demo Viewer is where product owners and engineering leads review AI-generated demos of every merged pull request — so shipped changes never land unseen.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Every merged PR gets a demo card with the title, author, size, and current review status. Pending, approved, or rejected — filter by any of them to focus your review queue.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Filter to just the pending ones.',
    js: `(() => {
      const s = document.getElementById('filter-status');
      if (!s) return;
      s.value = 'pending-review';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    })();`,
    minHold: 4000,
  },
  {
    narration: 'Open the CAS TTL fix to see the full AI-generated walkthrough.',
    js: `(async () => {
      const s = document.getElementById('filter-status');
      if (s) { s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }
      await new Promise(r => setTimeout(r, 400));
      const cards = document.querySelectorAll('.demo-card');
      if (cards[0]) cards[0].click();
    })();`,
    minHold: 4500,
  },
  {
    narration: 'The walkthrough explains what changed, why it matters, which files were touched, and — critically — how to verify. Everything a non-author needs to feel confident about a release.',
    js: null, minHold: 6500,
  },
  {
    narration: 'Changed files on the right, with line counts. Labels from the PR carry over, and a direct link to the PR on GitHub is one click away.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Approve and the demo moves to the approved column. Reject and RobOS opens a bug issue on your behalf with the review notes attached.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Stage Demo Viewer makes "what shipped this week?" a one-page answer. Every merged change, AI-explained, one click to approve.',
    js: `(() => {
      const btn = document.getElementById('btn-back');
      if (btn) btn.click();
    })();`,
    minHold: 4500,
  },
];

runDemo({
  slug: 'stage-demo',
  appId: 'stage-demo',
  windowTitle: 'RobOS Stage Demo Viewer',
  scenario: scenarios['stage-demo-github'],
  prelaunch: async (app) => {
    seedStageDemos(app.sandboxHome);
    await evalJS(app.port, `window.location.reload()`);
  },
  postSettle: 1800,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

'use strict';
/**
 * SDLC Tour — narrated multi-app walkthrough for YouTube (~3–4 min)
 *
 * Visits every RobOS app involved in software delivery in workflow order:
 *   Dev Central → Issue Manager → Git Projects → Task Planner →
 *   AI Prompt → PR Review → CI Monitor → Deploy Tracker
 *
 * Each app gets 2–3 cues (~15–20 seconds). All AI/network calls are mocked.
 * The clips are concatenated at the end into a single sdlc-tour-final.webm.
 *
 * Run:
 *   node packages/robos-test/demos/sdlc-tour-demo.js
 */

const path      = require('path');
const fs        = require('fs');
const { execSync } = require('child_process');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

// ── shared seeding helpers ──────────────────────────────────────────────────

function seedGitProjects(sandboxHome) {
  const cfgDir = path.join(sandboxHome, '.config', 'robos');
  fs.mkdirSync(cfgDir, { recursive: true });
  const mkProj = (id, repo, cloned) => {
    const localPath = path.join(sandboxHome, 'source', 'github.com', 'acme-corp', repo);
    return { id, label: repo, host: 'github.com', org: 'acme-corp', repo,
      url: `https://github.com/acme-corp/${repo}`, sshUrl: `git@github.com:acme-corp/${repo}.git`,
      localPath, _cloned: cloned, secrets: [], scripts: {
        instructions: `# ${repo}\n\nRun \`npm install && npm run build\` to get started.`,
        setup: '#!/bin/bash\nnpm install && npm run build',
        start: '#!/bin/bash\nnpm run dev', test: '#!/bin/bash\nnpm test', e2e: '',
      }, notes: '' };
  };
  const projects = { projects: [
    mkProj('p1', 'buildbarn-forms', true),
    mkProj('p2', 'worker-pool', true),
    mkProj('p3', 'scheduler-dashboard', false),
  ]};
  fs.writeFileSync(path.join(cfgDir, 'git-projects.json'), JSON.stringify(projects, null, 2));
  for (const p of projects.projects) {
    if (!p._cloned) continue;
    const git = path.join(p.localPath, '.git');
    fs.mkdirSync(git, { recursive: true });
    fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(p.localPath, 'README.md'), `# ${p.label}\n`);
  }
}

function seedWorkspaces(sandboxHome) {
  for (const name of ['buildbarn-forms', 'worker-pool']) {
    const dir = path.join(sandboxHome, 'source', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }, null, 2));
    fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n`);
  }
}

// ── mock JS snippets ────────────────────────────────────────────────────────

const MOCK_DEV_CENTRAL = `
  (() => {
    const tasks = document.getElementById('tasks-list');
    if (tasks) tasks.innerHTML = \`
      <div class="task-item state-in-progress"><span class="badge badge-bug">Bug</span><span class="task-title">#42 Worker pool exhaustion under sustained load</span><span class="task-meta">in-progress</span></div>
      <div class="task-item state-open"><span class="badge badge-feat">Feat</span><span class="task-title">#61 Add CAS TTL configuration to scheduler</span><span class="task-meta">open</span></div>
    \`;
    const prs = document.getElementById('prs-list');
    if (prs) prs.innerHTML = \`
      <div class="pr-item"><span class="pr-status ci-pass">✓</span><span class="pr-title">#14 fix: TTL calculation in blob cache</span><span class="pr-meta">2 reviews pending</span></div>
    \`;
    const blockers = document.getElementById('blockers-list');
    if (blockers) blockers.innerHTML = \`<div class="blocker-item"><span class="icon">⚠</span> PR #14 CI failing — build blocked</div>\`;
    document.getElementById('tasks-count').textContent = '2';
    document.getElementById('prs-count').textContent = '1';
  })();
`;

const MOCK_ISSUE_MANAGER = `
  (() => {
    const num = document.getElementById('issue-num');
    if (num) num.textContent = '#42';
    const typeBadge = document.getElementById('issue-type-badge');
    if (typeBadge) { typeBadge.textContent = 'Bug'; typeBadge.classList.remove('hidden'); }
    const stateChip = document.getElementById('issue-state-chip');
    if (stateChip) { stateChip.textContent = 'In Progress'; stateChip.style.background = '#1f6feb'; }
    const repoLabel = document.getElementById('issue-repo-label');
    if (repoLabel) repoLabel.textContent = 'acme-corp/worker-pool';
    const view = document.getElementById('view-issue');
    if (view) view.classList.remove('hidden');
    const listView = document.getElementById('view-list');
    if (listView) listView.classList.add('hidden');
  })();
`;

const MOCK_TASK_PLANNER = `
  (() => {
    const textarea = document.querySelector('.ai-textarea') || document.querySelector('textarea');
    if (textarea) {
      textarea.value = 'Fix bug #42: Worker pool exhaustion. The semaphore is not released in the error path of checkout(). Steps: 1) Locate checkout() in pool.js, 2) Add semaphore.release() to the catch block, 3) Add a unit test that triggers the error path.';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })();
`;

const MOCK_AI_PROMPT = `
  (() => {
    const section = document.getElementById('results-section');
    if (section) section.style.display = 'block';
    const icon = document.getElementById('results-status-icon');
    if (icon) { icon.textContent = '✓'; icon.style.color = '#4caf50'; }
    const summary = document.getElementById('results-summary');
    if (summary) summary.textContent = 'Found semaphore leak in pool.js:88. Patch applied and unit test added.';
    const steps = document.getElementById('steps-list');
    if (steps) steps.innerHTML = \`
      <div class="step-item">
        <div class="step-header"><span class="step-num">1</span><code class="step-cmd">grep -n "semaphore" src/pool.js</code></div>
        <pre class="step-output">88:  await this.semaphore.acquire();\\n92:  return result;   // ← release missing</pre>
        <div class="step-explanation">Error path at line 92 exits without releasing the semaphore — causes deadlock under load.</div>
      </div>
      <div class="step-item">
        <div class="step-header"><span class="step-num">2</span><code class="step-cmd">patch src/pool.js && npm test</code></div>
        <pre class="step-output">PASS src/pool.test.js (3 tests, 0 failed)</pre>
        <div class="step-explanation">All tests pass including the new error-path regression test.</div>
      </div>
    \`;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  })();
`;

const MOCK_PR_REVIEW = `
  (() => {
    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = \`
      <div class="pr-list">
        <div class="pr-card selected" data-number="14" style="border-left:3px solid #f85149">
          <div class="pr-card-header"><span class="pr-num">#14</span><span class="pr-title">fix: release semaphore in worker-pool error path</span></div>
          <div class="pr-card-meta"><span class="author">dev-user</span><span class="ci-status ci-fail">✗ CI failing</span><span class="reviews">2 approvals needed</span></div>
        </div>
        <div class="pr-card" data-number="15">
          <div class="pr-card-header"><span class="pr-num">#15</span><span class="pr-title">feat: CAS TTL scheduler config</span></div>
          <div class="pr-card-meta"><span class="author">dev-user</span><span class="ci-status ci-pass">✓ passing</span><span class="reviews">ready to merge</span></div>
        </div>
      </div>
    \`;
  })();
`;

const MOCK_CI_MONITOR = `
  (() => {
    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = \`
      <div class="stats-row" style="display:flex;gap:1rem;margin-bottom:1rem">
        <div class="stat-card"><div class="stat-label">Total Runs</div><div class="stat-value">24</div></div>
        <div class="stat-card"><div class="stat-label">Passing</div><div class="stat-value" style="color:#3fb950">21</div></div>
        <div class="stat-card"><div class="stat-label">Failing</div><div class="stat-value" style="color:#f85149">3</div></div>
      </div>
      <div class="run-list">
        <div class="run-card" data-id="1000" style="border-left:3px solid #f85149">
          <span class="run-status fail">✗</span>
          <div class="run-info"><div class="run-title">CI / test (ubuntu-latest)</div><div class="run-meta">fix/semaphore-release · 2 minutes ago</div></div>
        </div>
        <div class="run-card" data-id="1001" style="border-left:3px solid #3fb950">
          <span class="run-status pass">✓</span>
          <div class="run-info"><div class="run-title">CI / lint + typecheck</div><div class="run-meta">fix/semaphore-release · 3 minutes ago</div></div>
        </div>
      </div>
    \`;
  })();
`;

const MOCK_DEPLOY_TRACKER = `
  (() => {
    const kpi = document.getElementById('kpi-row');
    if (kpi) kpi.innerHTML = \`
      <div class="kpi-card"><div class="kpi-label">Deploys (7d)</div><div class="kpi-value">12</div></div>
      <div class="kpi-card"><div class="kpi-label">Frequency</div><div class="kpi-value">1.7/day</div></div>
      <div class="kpi-card"><div class="kpi-label">Releases</div><div class="kpi-value">3</div></div>
      <div class="kpi-card"><div class="kpi-label">MTTR</div><div class="kpi-value">18 min</div></div>
    \`;
    const dash = document.getElementById('dashboard');
    if (dash) {
      const timeline = document.createElement('div');
      timeline.id = 'timeline-content';
      timeline.style.cssText = 'margin-top:1rem';
      timeline.innerHTML = \`
        <div class="deploy-row" style="border-left:3px solid #3fb950;padding:.5rem 1rem;margin:.4rem 0;background:#161b22">
          <span class="env-badge" style="background:#1f6feb;padding:2px 6px;border-radius:4px;font-size:.75rem">production</span>
          <span style="margin-left:.75rem">v1.4.2 — fix: semaphore release in worker-pool</span>
          <span style="float:right;color:#8b949e">just now</span>
        </div>
        <div class="deploy-row" style="border-left:3px solid #3fb950;padding:.5rem 1rem;margin:.4rem 0;background:#161b22">
          <span class="env-badge" style="background:#388bfd26;padding:2px 6px;border-radius:4px;font-size:.75rem">staging</span>
          <span style="margin-left:.75rem">v1.4.2 — fix: semaphore release in worker-pool</span>
          <span style="float:right;color:#8b949e">5 min ago</span>
        </div>
        <div class="deploy-row" style="border-left:3px solid #f85149;padding:.5rem 1rem;margin:.4rem 0;background:#161b22">
          <span class="env-badge" style="background:#da36361f;padding:2px 6px;border-radius:4px;font-size:.75rem">production</span>
          <span style="margin-left:.75rem">v1.4.1 — rollback</span>
          <span style="float:right;color:#8b949e">22 min ago</span>
        </div>
      \`;
      dash.appendChild(timeline);
    }
  })();
`;

// ── per-app mini-demo configs ────────────────────────────────────────────────

const APPS = [
  {
    slug:        'sdlc-tour-dev-central',
    appId:       'dev-central',
    windowTitle: 'Dev Central',
    scenario:    scenarios['all-good'],
    script: [
      {
        narration: 'The day starts at Dev Central — your AI-powered developer dashboard. At a glance you see every task assigned to you, open pull requests, and anything blocking the team.',
        js: MOCK_DEV_CENTRAL,
        minHold: 5000,
      },
      {
        narration: 'Bug 42 — worker pool exhaustion — is already In Progress. One open PR and a blocker on the CI side. This is where we focus today.',
        js: null,
        minHold: 4000,
      },
    ],
  },
  {
    slug:        'sdlc-tour-issue-manager',
    appId:       'issue-manager',
    windowTitle: 'RobOS Issue Manager',
    scenario:    scenarios['all-good'],
    script: [
      {
        narration: 'Issue Manager opens ticket 42 with full context — type, state, repo label, and the workflow pipeline on the left showing exactly where this bug lives in the process.',
        js: MOCK_ISSUE_MANAGER,
        minHold: 4500,
      },
      {
        narration: 'Moving the issue to In Progress triggers automations — branch creation, agent setup, and a context snapshot so the AI already knows what the bug is before you type a word.',
        js: null,
        minHold: 4000,
      },
    ],
  },
  {
    slug:        'sdlc-tour-git-projects',
    appId:       'git-projects',
    windowTitle: 'RobOS Git Projects',
    scenario:    scenarios['all-good'],
    prelaunch:   async ({ sandboxHome }) => seedGitProjects(sandboxHome),
    script: [
      {
        narration: 'Git Projects is the repo manager. The sidebar lists every project in the org. Cloned repos are a single click away — branches, commits, secrets, and dev setup scripts all in one panel.',
        js: null,
        minHold: 4500,
      },
      {
        narration: 'Select the worker-pool repo to see its setup script. One click runs npm install, builds the project, and drops you into a working local environment — no manual steps.',
        js: `(() => {
          const items = document.querySelectorAll('.project-item');
          if (items[1]) items[1].click();
        })();`,
        minHold: 4000,
      },
    ],
  },
  {
    slug:        'sdlc-tour-task-planner',
    appId:       'task-planner',
    windowTitle: 'RobOS Task Planner',
    scenario:    scenarios['all-good'],
    script: [
      {
        narration: 'Task Planner is where the AI proposes the fix. Describe the problem, and the planner breaks it into ordered steps — which file, which function, what the test should assert.',
        js: MOCK_TASK_PLANNER,
        minHold: 4500,
      },
      {
        narration: 'The plan is yours to review before any code changes. You approve it, reorder steps, or add constraints. The AI is the co-pilot, but you are the pilot.',
        js: null,
        minHold: 4000,
      },
    ],
  },
  {
    slug:        'sdlc-tour-ai-prompt',
    appId:       'ai-prompt',
    windowTitle: 'RobOS AI Prompt',
    scenario:    scenarios['all-good'],
    script: [
      {
        narration: 'AI Prompt runs OS-level skills with natural language. Type the instruction, select the skills to activate, and the agent executes — grep, patch, test — returning a structured step-by-step results report.',
        js: null,
        minHold: 4500,
      },
      {
        narration: 'The AI located the semaphore leak at line 88, applied the patch, and ran the test suite. All three tests pass. The fix is ready to push.',
        js: MOCK_AI_PROMPT,
        minHold: 4500,
      },
    ],
  },
  {
    slug:        'sdlc-tour-pr-review',
    appId:       'pr-review',
    windowTitle: 'RobOS PR Review Board',
    scenario:    scenarios['all-good'],
    script: [
      {
        narration: 'PR Review Board shows the pull request open for the fix. The CI badge is red — the test pipeline hasn\'t passed yet. Two approvals are pending.',
        js: MOCK_PR_REVIEW,
        minHold: 4500,
      },
      {
        narration: 'AI Diff reads the patch and surfaces every changed line with an explanation. It flags anything that needs a second look — no scrolling through raw diffs.',
        js: null,
        minHold: 4000,
      },
    ],
  },
  {
    slug:        'sdlc-tour-ci-monitor',
    appId:       'ci-monitor',
    windowTitle: 'RobOS CI Monitor',
    scenario:    scenarios['all-good'],
    script: [
      {
        narration: 'CI Monitor shows the pipeline in real time. The test job is failing on the fix branch. Lint and type-check passed — it\'s isolated to the unit test runner.',
        js: MOCK_CI_MONITOR,
        minHold: 4500,
      },
      {
        narration: 'Click the failing run for AI Diagnosis — Claude reads the log, classifies the failure, and suggests a concrete fix. No hunting through 800 lines of ANSI output.',
        js: null,
        minHold: 4000,
      },
    ],
  },
  {
    slug:        'sdlc-tour-deploy-tracker',
    appId:       'deploy-tracker',
    windowTitle: 'Deploy Tracker',
    scenario:    scenarios['all-good'],
    script: [
      {
        narration: 'Once CI is green and the PR is merged, Deploy Tracker picks up the release. KPIs at the top — frequency, MTTR, and total deploys — update as each environment receives the change.',
        js: MOCK_DEPLOY_TRACKER,
        minHold: 4500,
      },
      {
        narration: 'Staging took the build five minutes ago. Production just landed. The previous rollback is logged below — MTTR eighteen minutes. Bug 42 is closed. That\'s the full loop in RobOS.',
        js: null,
        minHold: 5000,
      },
    ],
  },
];

// ── concatenate webm clips with ffmpeg ───────────────────────────────────────

function concatClips(clipPaths, outPath) {
  const listFile = outPath + '.list.txt';
  fs.writeFileSync(listFile, clipPaths.map(p => `file '${p}'`).join('\n'));
  console.log(`[sdlc-tour] Concatenating ${clipPaths.length} clips → ${outPath}`);
  execSync(
    `ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "${listFile}" -c copy "${outPath}"`,
    { stdio: 'inherit' }
  );
  fs.unlinkSync(listFile);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const outRoot  = path.join(__dirname, '..', 'run', 'demos');
  const finalOut = path.join(outRoot, 'sdlc-tour', 'sdlc-tour-final.webm');
  fs.mkdirSync(path.dirname(finalOut), { recursive: true });

  const clips = [];

  for (const appConfig of APPS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[sdlc-tour] ▶ ${appConfig.appId}`);
    console.log('─'.repeat(60));
    try {
      await runDemo({
        ...appConfig,
        outRoot,
      });
      const clip = path.join(outRoot, appConfig.slug, `${appConfig.slug}-final.webm`);
      if (fs.existsSync(clip)) {
        clips.push(clip);
        console.log(`[sdlc-tour] ✓ clip: ${clip}`);
      } else {
        console.warn(`[sdlc-tour] ⚠ clip not found: ${clip}`);
      }
    } catch (err) {
      console.error(`[sdlc-tour] ✗ ${appConfig.appId} failed:`, err.message);
    }
  }

  if (clips.length === 0) {
    console.error('[sdlc-tour] No clips produced — aborting concat');
    process.exit(1);
  }

  concatClips(clips, finalOut);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[sdlc-tour] ✅ Final video: ${finalOut}`);
  console.log('═'.repeat(60));
}

main().catch(err => { console.error(err); process.exit(1); });

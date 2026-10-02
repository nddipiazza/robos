'use strict';
/**
 * Task Planner + Task Implementer — End-to-End Demo
 *
 * Shows the full workflow:
 *   1. Task Planner: type a prompt → Generate (real gh stub, 2s delay) →
 *      preview 3 tasks → Create All → 3 GitHub issues created with real URLs
 *   2. Task Implementer: pick up issue #42 from the same repo →
 *      Start Agent (mock stream) → agent completes with summary
 *
 * Both apps use stub scenarios (no live credentials needed).
 * The two clips are concatenated into a single final video.
 *
 * Run:
 *   node packages/robos-test/demos/task-planner-implementer-e2e-demo.js
 */

const path        = require('path');
const fs          = require('fs');
const { execSync } = require('child_process');
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

// ── helpers ───────────────────────────────────────────────────────────────────

function CLICK(sel) {
  return `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.click(); return !!el; })();`;
}

function JS_TYPE(selector, text, delayMs = 20) {
  return `
    (() => {
      (async () => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return;
        el.focus();
        el.value = '';
        for (const ch of ${JSON.stringify(text)}) {
          el.value += ch;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, ${delayMs}));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })();
      return 'typing-started';
    })();
  `;
}

// ── Task Implementer mock agent output ───────────────────────────────────────

const AGENT_LINES = [
  '🤖 Starting AI agent on #42\n',
  '   Task: Worker pool exhaustion under sustained load\n',
  '\n',
  '📋 Reading task description...\n',
  '   Pool runs out of slots after 200+ concurrent actions.\n',
  '   Configured pool_size=50 causes unbounded queue growth.\n',
  '\n',
  '🔍 Exploring codebase...\n',
  '   → src/worker/pool.go\n',
  '   → src/scheduler/queue.go\n',
  '   → config/defaults.yml\n',
  '\n',
  '📝 Identifying the bottleneck...\n',
  '   Fixed-size channel at pool.go:147 blocks instead of scaling.\n',
  '   Queue applies no backpressure when depth exceeds pool capacity.\n',
  '\n',
  '✏️  Updating: src/worker/pool.go\n',
  '   + dynamic scaling: min=50, max=200, scale-factor=1.5\n',
  '\n',
  '✏️  Updating: src/scheduler/queue.go\n',
  '   + max queue depth: 5000 (env ROBOS_QUEUE_MAX)\n',
  '   + backpressure via context cancellation after 30 s\n',
  '\n',
  '🧪 Running tests...\n',
  '   pool_test.go .............. PASS (22 tests)\n',
  '   scheduler_test.go ......... PASS (15 tests)\n',
  '   integration_test.go ....... PASS (8 tests)\n',
  '\n',
  '✅ Done! Summary:\n',
  '   Fixed worker pool exhaustion with dynamic scaling and backpressure.\n',
  '   Updated: pool.go, queue.go. All 45 tests pass. PR ready to open.\n',
];

function buildAgentStreamJS() {
  return `
    (() => {
      const lines = ${JSON.stringify(AGENT_LINES)};
      let i = 0;
      window._demoSetAgentBusy(true);
      window._demoSetAgentStatus('AI agent running…', 'running');
      function next() {
        if (i >= lines.length) {
          window._demoSetAgentBusy(false);
          window._demoSetAgentStatus('Agent finished successfully.', 'done-ok');
          return;
        }
        window._demoAppendOutput(lines[i], false);
        i++;
        setTimeout(next, 80 + Math.random() * 60);
      }
      next();
      return 'streaming-started';
    })()
  `;
}

// ── App configs ───────────────────────────────────────────────────────────────

const APPS = [
  // ── Task Planner ─────────────────────────────────────────────────────────
  {
    slug:        'task-planner-e2e',
    appId:       'task-planner',
    windowTitle: 'RobOS Task Planner',
    scenario:    scenarios['task-planner-github'],
    postSettle:  5000,   // wait for Acme GitHub badge to load
    script: [
      {
        narration: 'RobOS Task Planner — let\'s plan a real GitHub sprint from scratch.',
        js: null,
        minHold: 4500,
      },
      {
        narration: 'The app is connected to the Acme GitHub repo. Bug, Feature, and Chore issue types are ready to go.',
        js: null,
        minHold: 4500,
      },
      {
        narration: 'Describe the sprint: add user authentication — login with J W T, logout that revokes tokens, and a password reset flow.',
        js: JS_TYPE('#prompt-input', 'Add user authentication: login endpoint that returns a JWT, logout endpoint that revokes the token, and a password reset flow via email. Create one issue per feature.'),
        minHold: 5500,
      },
      {
        narration: 'Hit Generate. RobOS calls the AI agent — in about two seconds the structured task list comes back.',
        js: CLICK('#btn-generate'),
        minHold: 7000,   // gh stub sleeps 2s + render time
      },
      {
        narration: 'Three tasks, each with labels and full acceptance criteria. Login endpoint, logout endpoint, and password reset — all ready to push to GitHub.',
        js: null,
        minHold: 5000,
      },
      {
        narration: 'Click Create All. RobOS calls gh issue create for every task and returns the live GitHub issue U R Ls.',
        js: CLICK('#btn-create-all'),
        minHold: 6000,   // gh issue create ×3, stub is fast
      },
      {
        narration: 'Done. Three issues are now open in the GitHub repo. Click any link to jump straight to it. The sprint backlog is built.',
        js: null,
        minHold: 5000,
      },
    ],
  },

  // ── Task Implementer ─────────────────────────────────────────────────────
  {
    slug:        'task-implementer-e2e',
    appId:       'task-implementer',
    windowTitle: 'RobOS Task Implementer',
    scenario:    scenarios['task-implementer-github'],
    postSettle:  5000,   // wait for issue list to populate from gh stub
    script: [
      {
        narration: 'RobOS Task Implementer — the same GitHub repo, five open issues, loaded from the live stub.',
        js: null,
        minHold: 4500,
      },
      {
        narration: 'Issue forty-two: Worker pool exhaustion under sustained load. A high-priority bug that needs fixing now.',
        js: `
          (() => {
            const items = document.querySelectorAll('.task-item');
            if (items[0]) items[0].click();
          })()
        `,
        minHold: 4500,
      },
      {
        narration: 'The workspace panel loads the full issue body. You can add extra context for the agent — or just let it run.',
        js: null,
        minHold: 5000,
      },
      {
        narration: 'Click Start Agent. Claude Code reads the issue description, finds the bottleneck, and starts patching.',
        js: buildAgentStreamJS(),
        minHold: 5000,
      },
      {
        narration: 'The agent updates the worker pool for dynamic scaling and adds backpressure to the queue. All forty-five tests pass.',
        js: null,
        minHold: 5000,
      },
      {
        narration: 'Task Planner to Task Implementer — describe your sprint, generate the backlog, and let AI drive the implementation. That is the RobOS workflow.',
        js: null,
        minHold: 5000,
      },
    ],
  },
];

// ── concatenate clips ─────────────────────────────────────────────────────────

function concatClips(clipPaths, outPath) {
  const listFile = outPath + '.list.txt';
  fs.writeFileSync(listFile, clipPaths.map(p => `file '${p}'`).join('\n'));
  console.log(`\n[e2e-demo] Concatenating ${clipPaths.length} clips → ${outPath}`);
  execSync(
    `ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "${listFile}" -c copy "${outPath}"`,
    { stdio: 'inherit' }
  );
  fs.unlinkSync(listFile);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const outRoot  = path.join(__dirname, '..', 'run', 'demos');
  const finalOut = path.join(outRoot, 'task-planner-implementer-e2e', 'task-planner-implementer-e2e-final.webm');
  fs.mkdirSync(path.dirname(finalOut), { recursive: true });

  const clips = [];

  for (const appConfig of APPS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[e2e-demo] ▶ ${appConfig.appId} (${appConfig.slug})`);
    console.log('─'.repeat(60));
    try {
      await runDemo({ ...appConfig, outRoot });
      const clip = path.join(outRoot, appConfig.slug, `${appConfig.slug}-final.webm`);
      if (fs.existsSync(clip)) {
        clips.push(clip);
        console.log(`[e2e-demo] ✓ clip saved: ${clip}`);
      } else {
        console.warn(`[e2e-demo] ⚠ clip not found: ${clip}`);
      }
    } catch (err) {
      console.error(`[e2e-demo] ✗ ${appConfig.appId} failed:`, err.message);
    }
  }

  if (clips.length === 0) {
    console.error('[e2e-demo] No clips produced — aborting');
    process.exit(1);
  }

  concatClips(clips, finalOut);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[e2e-demo] ✅ Final video: ${finalOut}`);
  console.log('═'.repeat(60));
}

main().catch(err => { console.error(err); process.exit(1); });

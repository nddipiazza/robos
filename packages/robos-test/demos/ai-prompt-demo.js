'use strict';
/**
 * ai-prompt demo script — narrated walkthrough for YouTube (~2 min)
 *
 * Key design principles:
 *  - Uses prelaunch + evalWaitFor to ensure skills are rendered before cues start
 *  - Never clicks "Run" and waits for real AI — injects mock results instead
 *  - All selectors verified against packages/ai-prompt/renderer/index.html and app.js
 *
 * Run:
 *   node packages/robos-test/demos/ai-prompt-demo.js
 */
'use strict';
const { runDemo }             = require('../lib/demo-runner');
const { evalJS, evalWaitFor, findByClass } = require('../lib/snapshot');

// ── Mock AI results injected into DOM (no real AI call needed) ─────────────────
const MOCK_RESULTS_JS = `
  (() => {
    const section = document.getElementById('results-section');
    if (!section) return;
    section.style.display = 'block';
    const icon = document.getElementById('results-status-icon');
    if (icon) { icon.textContent = '✓'; icon.style.color = '#4caf50'; }
    const summary = document.getElementById('results-summary');
    if (summary) summary.textContent = 'Disk usage is healthy at 38%. Top CPU consumer is the Electron renderer at 4.2% — no runaway processes.';
    const steps = document.getElementById('steps-list');
    if (steps) steps.innerHTML = \`
      <div class="step-item">
        <div class="step-header"><span class="step-num">1</span><code class="step-cmd">df -h</code></div>
        <pre class="step-output">Filesystem  Size  Used Avail Use%\\n/dev/sda1    98G   38G   56G  38% /</pre>
        <div class="step-explanation">Home directory is 38% full — 56 GB free. No action needed.</div>
      </div>
      <div class="step-item">
        <div class="step-header"><span class="step-num">2</span><code class="step-cmd">ps aux --sort=-%cpu | head -11</code></div>
        <pre class="step-output">USER  PID  %CPU %MEM COMMAND\\npat  4821  4.2  1.8  electron\\npat  1234  0.8  0.5  node</pre>
        <div class="step-explanation">Electron renderer tops CPU at 4.2% — normal for a running desktop app.</div>
      </div>
    \`;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  })();
`;

// ── Mock history entry ─────────────────────────────────────────────────────────
const MOCK_HISTORY_JS = `
  (() => {
    const panel = document.getElementById('history-panel');
    if (panel) panel.style.display = 'block';
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = \`
      <div class="history-item">
        <div class="history-item-prompt">Check disk and top CPU processes</div>
        <div class="history-item-summary">Disk 38% used, no runaway processes.</div>
        <div class="history-item-meta">just now · 2 skills</div>
      </div>
    \`;
  })();
`;

// ── Click a sidebar skill by its data-id ───────────────────────────────────────
function CLICK_SKILL(id) {
  return `
    (() => {
      const el = document.querySelector('.sidebar-skill[data-id="${id}"]');
      if (el) el.click();
      return el ? 'clicked:${id}' : 'not-found:${id}';
    })();
  `;
}

// ── Demo script ───────────────────────────────────────────────────────────────
const SCRIPT = [
  {
    narration: 'RobOS AI Prompt lets you control your Linux desktop in plain English. Pick a built-in skill, add a prompt if you like, and an AI agent handles the rest.',
    js: null, minHold: 5000,
  },
  {
    narration: 'The left sidebar lists 70 built-in skills across 10 categories — File Operations, Git, Process Management, Docker, Network, Security, and more.',
    js: `(() => { document.getElementById('skills-sidebar')?.scrollTo({ top: 0, behavior: 'smooth' }); })();`,
    minHold: 4000,
  },
  {
    narration: 'Click "Disk Space Overview" to add it as a skill chip above the prompt.',
    js: CLICK_SKILL('disk-space'),
    minHold: 2500,
  },
  {
    narration: 'Now add "Top CPU Consumers" from Process Management. With two skills selected the Run button activates — no typing required.',
    js: CLICK_SKILL('top-cpu'),
    minHold: 3000,
  },
  {
    narration: 'The AI runs both commands and returns a structured report. Here is what that looks like:',
    js: MOCK_RESULTS_JS,
    minHold: 4000,
  },
  {
    narration: 'Each step shows the exact shell command, the raw terminal output, and a plain-English explanation. The top summary gives the bottom line.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Skills can also take parameters. Type "grep" in the sidebar filter.',
    js: `
      (() => {
        const el = document.getElementById('skill-search');
        if (!el) return;
        el.value = 'grep';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })();
    `,
    minHold: 2000,
  },
  {
    narration: 'Select "Search Text in Files" — a PATTERN chip appears so you fill in the term before running.',
    js: CLICK_SKILL('grep-recursive'),
    minHold: 3000,
  },
  {
    narration: 'Every run is saved automatically. Click History to review past prompts.',
    js: `
      (() => {
        const el = document.getElementById('skill-search');
        if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
        document.getElementById('btn-history-toggle')?.click();
      })();
    `,
    minHold: 2500,
  },
  {
    narration: 'The history panel shows each previous run with its prompt, summary, and skill count. Click any entry to reload it.',
    js: MOCK_HISTORY_JS,
    minHold: 4000,
  },
  {
    narration: 'RobOS AI Prompt — 70 built-in skills, parameterized commands, structured AI results, and full run history. All from your RobOS desktop.',
    js: `document.getElementById('btn-history-close')?.click();`,
    minHold: 5000,
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────
runDemo({
  slug: 'ai-prompt',
  appId: 'ai-prompt',
  windowTitle: 'RobOS AI Prompt',
  scenario: {},
  postSettle: 3000,
  prelaunch: async (app) => {
    // Wait for the skills sidebar to render .sidebar-skill elements.
    // The renderer calls listSkills() async; we must not start clicking before it finishes.
    await evalWaitFor(
      app.port,
      snap => snap && findByClass(snap, 'sidebar-skill'),
      8000,
      500
    ).catch(async () => {
      // Skills didn't appear via IPC — inject a minimal set directly so the demo works.
      await evalJS(app.port, `
        (() => {
          const skills = [
            { id: 'disk-space',     name: 'Disk Space Overview'    },
            { id: 'top-cpu',        name: 'Top CPU Consumers'      },
            { id: 'grep-recursive', name: 'Search Text in Files'   },
          ];
          const list = document.getElementById('skills-list');
          if (!list) return;
          list.innerHTML = skills.map(s =>
            '<div class="sidebar-skill" data-id="' + s.id + '">' + s.name + '</div>'
          ).join('');
          // Wire click to add chip (simplified — real app uses toggleSkill())
          list.querySelectorAll('.sidebar-skill').forEach(el => {
            el.addEventListener('click', () => {
              const chips = document.getElementById('skill-chips');
              if (chips && !chips.querySelector('[data-id="' + el.dataset.id + '"]')) {
                chips.innerHTML += '<span class="skill-chip" data-id="' + el.dataset.id + '">' + el.textContent + '</span>';
              }
              document.getElementById('btn-run')?.removeAttribute('disabled');
            });
          });
        })();
      `);
    });
  },
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

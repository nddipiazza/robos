'use strict';
/**
 * ai-prompt demo script — narrated walkthrough for YouTube (~2 min)
 *
 * Demonstrates:
 *  1. App overview — skills sidebar, agent selector
 *  2. Selecting skills (skills-only mode)
 *  3. Skill with $PARAM — filling in the value
 *  4. Free-form prompt + skills combined
 *  5. Mocked AI results — structured step-by-step output
 *  6. History panel
 *
 * Run:
 *   node packages/robos-test/demos/ai-prompt-demo.js
 */
const { runDemo } = require('../lib/demo-runner');

// ── Inject mock AI results into the DOM ───────────────────────────────────────
const MOCK_RESULTS_JS = `
  (() => {
    const section = document.getElementById('results-section');
    if (!section) return;
    section.style.display = 'block';
    const icon = document.getElementById('results-status-icon');
    if (icon) { icon.textContent = '✓'; icon.style.color = 'var(--green, #4caf50)'; }
    const summary = document.getElementById('results-summary');
    if (summary) summary.textContent = 'Disk usage is healthy at 38%. Top CPU consumer is the Electron renderer at 4.2% — no runaway processes detected.';
    const steps = document.getElementById('steps-list');
    if (steps) steps.innerHTML = \`
      <div class="step-item">
        <div class="step-header"><span class="step-num">1</span><code class="step-cmd">df -h ~</code></div>
        <pre class="step-output">Filesystem  Size  Used Avail Use% Mounted on
/dev/sda1    98G   38G   56G  38% /home</pre>
        <div class="step-explanation">Home directory is 38% full — 56 GB remaining. No action needed.</div>
      </div>
      <div class="step-item">
        <div class="step-header"><span class="step-num">2</span><code class="step-cmd">ps aux --sort=-%cpu | head -8</code></div>
        <pre class="step-output">USER  PID  %CPU %MEM COMMAND
pat  4821  4.2  1.8  electron renderer
pat  1234  0.8  0.5  node demo-runner
pat   892  0.3  0.2  Xorg</pre>
        <div class="step-explanation">Electron renderer is the top consumer at 4.2% CPU — normal for a running desktop app.</div>
      </div>
    \`;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  })();
`;

// ── Demo script (target ~2 min) ───────────────────────────────────────────────
const SCRIPT = [
  {
    narration: 'RobOS AI Prompt lets you control your Linux desktop in plain English. Pick a built-in skill, type what you want, and an AI agent handles the rest.',
    js: null, minHold: 5000,
  },
  {
    narration: 'The left sidebar lists 70 built-in skills across 10 categories — File Operations, Git, Process Management, Docker, Network, Security, and more.',
    js: `(() => { const s = document.getElementById('skills-sidebar'); if (s) s.scrollTo({ top: 0, behavior: 'smooth' }); })();`,
    minHold: 4000,
  },
  {
    narration: 'Let\'s click "disk-usage" to add it as a skill chip above the prompt box.',
    js: `
      (() => {
        const el = [...document.querySelectorAll('.sidebar-skill')]
          .find(s => s.dataset.id === 'disk-usage' || s.textContent.includes('disk-usage'));
        if (el) el.click();
      })();
    `,
    minHold: 2500,
  },
  {
    narration: 'Now add "top-cpu" from Process Management. With two skills selected, the Run button activates — no typing required.',
    js: `
      (() => {
        const el = [...document.querySelectorAll('.sidebar-skill')]
          .find(s => s.dataset.id === 'top-cpu' || s.textContent.includes('top-cpu'));
        if (el) el.click();
      })();
    `,
    minHold: 2500,
  },
  {
    narration: 'The AI runs both shell commands and returns a structured report. Here\'s what the output looks like:',
    js: MOCK_RESULTS_JS,
    minHold: 4000,
  },
  {
    narration: 'Each step shows the exact command, the raw terminal output, and a plain-English explanation. The summary at the top gives the bottom line: disk is healthy, no runaway processes.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Skills can also take parameters. Search for "grep" in the sidebar filter.',
    js: `
      (() => {
        const el = document.getElementById('skill-search');
        if (el) { el.value = 'grep'; el.dispatchEvent(new Event('input', { bubbles: true })); }
      })();
    `,
    minHold: 2000,
  },
  {
    narration: 'Select "grep-recursive" — a parameter chip appears for the search PATTERN.',
    js: `
      (() => {
        const el = [...document.querySelectorAll('.sidebar-skill')]
          .find(s => s.dataset.id === 'grep-recursive' || s.textContent.includes('grep-recursive'));
        if (el) el.click();
      })();
    `,
    minHold: 2500,
  },
  {
    narration: 'Type "TODO" as the pattern. The chip shows the filled-in value before running.',
    js: `
      (() => {
        const input = document.querySelector('.skill-param-input, .param-input');
        if (input) {
          input.value = 'TODO';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })();
    `,
    minHold: 2500,
  },
  {
    narration: 'You can also combine skills with a free-form prompt. Clear the search, click New Prompt, then type your question.',
    js: `
      (() => {
        const s = document.getElementById('skill-search');
        if (s) { s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); }
        const btn = document.getElementById('btn-new-prompt');
        if (btn) btn.click();
      })();
    `,
    minHold: 2000,
  },
  {
    narration: 'Every run is saved automatically. Click History to review past prompts and reload any previous result.',
    js: `
      (() => {
        const btn = document.getElementById('btn-history-toggle');
        if (btn) btn.click();
      })();
    `,
    minHold: 3500,
  },
  {
    narration: 'RobOS AI Prompt — 70 built-in skills, parameterized commands, structured AI results, and full history. All from your RobOS desktop.',
    js: `
      (() => {
        const btn = document.getElementById('btn-history-close');
        if (btn) btn.click();
      })();
    `,
    minHold: 5000,
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────
runDemo({
  slug: 'ai-prompt',
  appId: 'ai-prompt',
  windowTitle: 'RobOS AI Prompt',
  scenario: {},
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

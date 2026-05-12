'use strict';
/**
 * ai-prompt demo script — narrated walkthrough for YouTube
 *
 * Demonstrates:
 *  1. App overview — skills sidebar, agent selector
 *  2. Selecting a skill and running it (skills-only mode)
 *  3. Selecting a skill with $PARAM and filling in the value
 *  4. Combining multiple skills with a free-form prompt
 *  5. Reviewing the structured step-by-step results
 *  6. Browsing run history
 *
 * Run:
 *   node packages/robos-test/demos/ai-prompt-demo.js
 */
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

// ── Typing helper ─────────────────────────────────────────────────────────────
function JS_TYPE(selector, text, delayMs = 22) {
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

// ── Demo script ───────────────────────────────────────────────────────────────
const SCRIPT = [
  {
    narration: 'RobOS AI Prompt lets you control your Linux operating system in plain English. Instead of memorizing shell commands, you describe what you want — or pick a pre-built skill — and an AI agent figures out the rest.',
    js: null, minHold: 6000,
  },
  {
    narration: 'On the left is the Skills sidebar: 70 built-in commands organised into 10 categories — File Operations, Git, Process Management, Docker, Network, Security, and more.',
    js: `
      (() => {
        const sidebar = document.getElementById('skills-sidebar');
        if (sidebar) sidebar.scrollTo({ top: 0, behavior: 'smooth' });
      })();
    `,
    minHold: 4500,
  },
  {
    narration: 'In the top-right corner is the AI agent selector. We can switch between GitHub Copilot, Claude, Codex, and Gemini at any time. The app checks authentication on load and shows a login banner if a provider isn\'t connected.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Let\'s start with the simplest flow: skills-only mode. Click "disk-usage" in the File Operations section to add it as a skill chip.',
    js: `
      (() => {
        const skills = document.querySelectorAll('.sidebar-skill');
        const disk = [...skills].find(s => s.textContent.includes('disk-usage') || s.textContent.includes('Disk Usage'));
        if (disk) disk.click();
      })();
    `,
    minHold: 2000,
  },
  {
    narration: 'The skill appears as a chip above the prompt box. Notice the Run button is now enabled — we don\'t need to type anything. RobOS will send an automatic prompt to the AI: "Run the selected skills and show me the results."',
    js: null, minHold: 4000,
  },
  {
    narration: 'Add a second skill: "top-cpu" from Process Management. Now we\'ll get both disk and CPU information in a single AI run.',
    js: `
      (() => {
        const skills = document.querySelectorAll('.sidebar-skill');
        const cpu = [...skills].find(s => s.textContent.includes('top-cpu') || s.textContent.includes('Top CPU'));
        if (cpu) cpu.click();
      })();
    `,
    minHold: 2000,
  },
  {
    narration: 'Two skill chips selected. Hit Run to send both commands to the AI agent.',
    js: `document.getElementById('btn-run').click();`,
    minHold: 35000,
  },
  {
    narration: 'The results section appears. At the top is a plain-English summary of what the AI found. Below that is a numbered step list — each step shows the exact shell command that was run, the raw terminal output, and the AI\'s explanation.',
    js: null, minHold: 6000,
  },
  {
    narration: 'Step 1 ran df -h to check disk usage. The AI notes we\'re using 43 percent of our home directory with plenty of space remaining. Step 2 ran ps aux sorted by CPU — the AI highlights any processes consuming unusually high resources.',
    js: `
      (() => {
        const steps = document.querySelectorAll('.step-item');
        if (steps[0]) steps[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      })();
    `,
    minHold: 5000,
  },
  {
    narration: 'Now let\'s try a skill that needs a parameter. Search for "grep" in the sidebar filter.',
    js: `
      (() => {
        const search = document.getElementById('skill-search');
        search.value = 'grep';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      })();
    `,
    minHold: 1500,
  },
  {
    narration: 'Select "grep-recursive" — it needs a search pattern. The chip expands into a small card with a PATTERN input field. Let\'s search for TODO comments in the codebase.',
    js: `
      (() => {
        const skills = document.querySelectorAll('.sidebar-skill');
        const grep = [...skills].find(s => s.textContent.includes('grep-recursive') || s.textContent.includes('Grep Recursive'));
        if (grep) grep.click();
      })();
    `,
    minHold: 1500,
  },
  {
    narration: 'The chip shows a PATTERN label with a text input. Fill in "TODO" as our search term.',
    js: `
      (() => {
        const inputs = document.querySelectorAll('.skill-param-input');
        const paramInput = [...inputs].find(i => i.placeholder && i.placeholder.toLowerCase().includes('pattern') || i.closest('.skill-chip-card'));
        if (paramInput) {
          paramInput.value = 'TODO';
          paramInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })();
    `,
    minHold: 1500,
  },
  {
    narration: 'Now let\'s clear the skills sidebar filter and add a natural language prompt to go along with our grep skill.',
    js: `
      (() => {
        const search = document.getElementById('skill-search');
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      })();
    `,
    minHold: 800,
  },
  {
    narration: 'Also click "git-status" so the AI can tie the TODO findings back to git context.',
    js: `
      (() => {
        const skills = document.querySelectorAll('.sidebar-skill');
        const git = [...skills].find(s => s.textContent.includes('git-status') || s.textContent.includes('Git Status'));
        if (git) git.click();
      })();
    `,
    minHold: 1200,
  },
  {
    narration: 'Click New Prompt first to clear the previous results.',
    js: `
      (() => {
        const btn = document.getElementById('btn-new-prompt');
        if (btn) btn.click();
      })();
    `,
    minHold: 800,
  },
  {
    narration: 'Type a free-form prompt to give the AI additional context about what we want.',
    js: JS_TYPE('robos-ai-textarea textarea, #prompt-input textarea, #prompt-input',
      'Summarize the TODO items and tell me which ones are in uncommitted files'),
    minHold: 4000,
  },
  {
    narration: 'Hit Run. The AI will run both skills — grep and git status — then use our prompt to produce a focused analysis.',
    js: `document.getElementById('btn-run').click();`,
    minHold: 40000,
  },
  {
    narration: 'The report shows each step\'s command and output, followed by a summary that directly answers our question: which TODO items are in uncommitted files. This is the core value of AI Prompt — it runs the commands AND explains what they mean.',
    js: null, minHold: 7000,
  },
  {
    narration: 'Every run is saved to history. Click History in the header to browse past prompts.',
    js: `document.getElementById('btn-history-toggle').click();`,
    minHold: 2000,
  },
  {
    narration: 'The history panel slides in from the right. Each entry shows the original prompt and a short summary. Click any entry to load it back into the results view.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Close the history panel.',
    js: `document.getElementById('btn-history-close').click();`,
    minHold: 1000,
  },
  {
    narration: 'The Skills Manager button in the header opens the companion app where you can browse all 70 built-in skills, create custom ones, and install community skill packs from GitHub.',
    js: null, minHold: 5000,
  },
  {
    narration: 'RobOS AI Prompt: plain-English OS control, 70 built-in skill packs, structured step-by-step results, and full run history — all from a single Electron app on your RobOS desktop.',
    js: null, minHold: 6000,
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

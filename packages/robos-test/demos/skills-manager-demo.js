'use strict';
/**
 * skills-manager demo script — narrated walkthrough for YouTube
 *
 * Demonstrates:
 *  1. App overview — My Skills tab, search, category tabs
 *  2. Browsing built-in skill categories
 *  3. Creating a custom skill
 *  4. Skill Packs tab — community packs from GitHub
 *  5. Installing a community pack (fabric patterns)
 *  6. Relationship to AI Prompt
 *
 * Run:
 *   node packages/robos-test/demos/skills-manager-demo.js
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
    narration: 'RobOS Skills Manager is the library catalog for the AI Prompt app. It ships with 74 built-in shell skills organised into 10 categories, and supports installing community skill packs from any GitHub repository.',
    js: null, minHold: 6500,
  },
  {
    narration: 'The My Skills tab shows all installed skills. The count badge in the top right reflects the total. By default all 74 built-in skills are visible.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Use the category tabs to filter. Let\'s click Git to see all git-related skills.',
    js: `
      (() => {
        const tabs = document.querySelectorAll('#category-tabs .cat-tab');
        const gitTab = [...tabs].find(t => t.textContent.includes('Git'));
        if (gitTab) gitTab.click();
      })();
    `,
    minHold: 2000,
  },
  {
    narration: 'Eight git skills: git-status, git-log, git-branches, git-stash, git-cleanup, git-remotes, git-diff, and uncommitted. Each card shows the skill name, description, and the exact shell command it runs.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Switch to Docker to see container management skills.',
    js: `
      (() => {
        const tabs = document.querySelectorAll('#category-tabs .cat-tab');
        const tab = [...tabs].find(t => t.textContent.includes('Docker'));
        if (tab) tab.click();
      })();
    `,
    minHold: 2000,
  },
  {
    narration: 'Docker skills cover listing containers and images, streaming logs, cleaning up stopped containers, and checking network connectivity between containers.',
    js: null, minHold: 4000,
  },
  {
    narration: 'Click All to return to the full list, then use the search bar to find skills by name or keyword.',
    js: `
      (() => {
        const tabs = document.querySelectorAll('#category-tabs .cat-tab');
        const allTab = tabs[0];
        if (allTab) allTab.click();
      })();
    `,
    minHold: 1500,
  },
  {
    narration: 'Search for "port" — this finds skills that deal with network ports: port-in-use, kill-port, open-ports.',
    js: JS_TYPE('#search-input', 'port'),
    minHold: 3000,
  },
  {
    narration: 'Notice "kill-port" takes a $PORT parameter. When you select this skill in AI Prompt, an inline input field will appear so you can specify the port number before running.',
    js: `
      (() => {
        const cards = document.querySelectorAll('.skill-card');
        const killPort = [...cards].find(c => c.textContent.includes('kill-port') || c.textContent.includes('Kill Port'));
        if (killPort) killPort.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })();
    `,
    minHold: 4000,
  },
  {
    narration: 'Clear the search and let\'s create a brand-new custom skill.',
    js: JS_TYPE('#search-input', ''),
    minHold: 1000,
  },
  {
    narration: 'Click New Skill. The modal opens with fields for Name, Category, Description, and the shell Command.',
    js: `document.getElementById('btn-add-skill').click();`,
    minHold: 2000,
  },
  {
    narration: 'Create a skill called "Recent Errors" that tails the system journal for the last 50 error lines.',
    js: JS_TYPE('#field-name', 'Recent Errors'),
    minHold: 2000,
  },
  {
    narration: 'Set the category to System.',
    js: JS_TYPE('#field-category', 'System'),
    minHold: 1500,
  },
  {
    narration: 'Add a description.',
    js: JS_TYPE('#field-description', 'Show the last 50 error-level journal entries'),
    minHold: 2000,
  },
  {
    narration: 'Enter the shell command.',
    js: JS_TYPE('#field-command', 'journalctl -p err -n 50 --no-pager'),
    minHold: 2500,
  },
  {
    narration: 'Save the skill.',
    js: `document.getElementById('btn-modal-save').click();`,
    minHold: 1500,
  },
  {
    narration: 'The new "Recent Errors" skill appears in the grid immediately. It\'s now saved to the config file and will show up in the AI Prompt skills sidebar on next launch.',
    js: `
      (() => {
        const cards = document.querySelectorAll('.skill-card');
        const card = [...cards].find(c => c.textContent.includes('Recent Errors'));
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })();
    `,
    minHold: 4000,
  },
  {
    narration: 'Now let\'s explore community skill packs. Click the Skill Packs tab.',
    js: `document.getElementById('tab-skill-packs').click();`,
    minHold: 2000,
  },
  {
    narration: 'The Skill Pack Marketplace shows curated community repositories. The most popular is danielmiessler/fabric — a collection of over 200 AI prompt patterns used by security researchers, developers, and writers.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Other packs cover developer productivity, DevOps automation, data engineering, and more. Each card shows the repo description, star count, and skill count.',
    js: `
      (() => {
        const grid = document.getElementById('packs-grid');
        if (grid) grid.scrollTo({ top: 0, behavior: 'smooth' });
      })();
    `,
    minHold: 4500,
  },
  {
    narration: 'Click the Fabric pack card to browse its patterns.',
    js: `
      (() => {
        const cards = document.querySelectorAll('#packs-grid .pack-card');
        if (cards[0]) cards[0].click();
      })();
    `,
    minHold: 5000,
  },
  {
    narration: 'The browser view shows all patterns from the Fabric repository. They\'re listed with name, category, and description. Use the search bar to filter — let\'s search for "summarize".',
    js: JS_TYPE('#pattern-search', 'summarize'),
    minHold: 3000,
  },
  {
    narration: 'Click a pattern to preview its full prompt content on the right.',
    js: `
      (() => {
        const items = document.querySelectorAll('#pattern-list .pattern-item');
        if (items[0]) items[0].click();
      })();
    `,
    minHold: 3000,
  },
  {
    narration: 'The preview pane shows the full system prompt that Fabric uses. Click Install to add this pattern as a skill to your library.',
    js: null, minHold: 4000,
  },
  {
    narration: 'Go back to My Skills. The pattern is now listed as a custom skill alongside the built-ins, and it\'s immediately available in AI Prompt.',
    js: `document.getElementById('btn-back-to-packs').click();`,
    minHold: 1500,
  },
  {
    narration: 'Back on the Marketplace. Hit Clone Repo to download the full Fabric repository to your machine for offline access and direct CLI usage.',
    js: null, minHold: 4000,
  },
  {
    narration: 'The Open AI Prompt button in the header takes you straight to the AI Prompt app with all your skills ready to use. Everything you create or install here instantly becomes available there.',
    js: `
      (() => {
        document.getElementById('tab-my-skills').click();
      })();
    `,
    minHold: 3000,
  },
  {
    narration: 'RobOS Skills Manager: 74 built-in shell skills, custom skill creation, community pack installation from GitHub, and deep integration with AI Prompt — all in one place on your RobOS desktop.',
    js: null, minHold: 6000,
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────
runDemo({
  slug: 'skills-manager',
  appId: 'skills-manager',
  windowTitle: 'RobOS Skills Manager',
  scenario: {},
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

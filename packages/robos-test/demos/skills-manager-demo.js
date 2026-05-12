'use strict';
/**
 * skills-manager demo script — narrated walkthrough for YouTube (~2 min)
 *
 * Demonstrates:
 *  1. App overview — My Skills tab, category filter
 *  2. Browsing Git and Docker skills
 *  3. Searching for a parameterized skill
 *  4. Creating a custom skill via the modal
 *  5. Skill Packs tab — community packs from GitHub
 *
 * Run:
 *   node packages/robos-test/demos/skills-manager-demo.js
 */
const { runDemo } = require('../lib/demo-runner');

function JS_TYPE(selector, text, delayMs = 30) {
  return `
    (() => {
      (async () => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return;
        el.focus(); el.value = '';
        for (const ch of ${JSON.stringify(text)}) {
          el.value += ch;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, ${delayMs}));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })();
      return 'ok';
    })();
  `;
}

function CLICK_CAT(name) {
  return `
    (() => {
      const tab = [...document.querySelectorAll('#category-tabs .cat-tab')]
        .find(t => t.textContent.trim().includes(${JSON.stringify(name)}));
      if (tab) tab.click();
    })();
  `;
}

const SCRIPT = [
  {
    narration: 'RobOS Skills Manager is the skill library that powers the AI Prompt app. It ships with 74 built-in shell skills across 10 categories, lets you create your own, and supports installing community packs from GitHub.',
    js: null, minHold: 6000,
  },
  {
    narration: 'The My Skills tab shows all installed skills. Click the Git category to filter.',
    js: CLICK_CAT('Git'),
    minHold: 3000,
  },
  {
    narration: 'Eight git skills: status, log, branches, stash, diff, cleanup, remotes, and uncommitted. Each card shows the exact shell command that will run.',
    js: null, minHold: 4000,
  },
  {
    narration: 'Let\'s search for "port" to find network skills.',
    js: `
      (() => {
        const tabs = [...document.querySelectorAll('#category-tabs .cat-tab')];
        if (tabs[0]) tabs[0].click();
        setTimeout(() => {
          const s = document.getElementById('search-input');
          if (s) { s.value = 'port'; s.dispatchEvent(new Event('input', { bubbles: true })); }
        }, 300);
      })();
    `,
    minHold: 3000,
  },
  {
    narration: '"kill-port" takes a dollar-sign PORT parameter. When you pick it in AI Prompt, an inline input card appears so you fill in the port before running.',
    js: `
      (() => {
        const card = [...document.querySelectorAll('.skill-card')]
          .find(c => c.textContent.includes('kill-port'));
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })();
    `,
    minHold: 4000,
  },
  {
    narration: 'Now let\'s create a custom skill. Clear the search and click New Skill.',
    js: `
      (() => {
        const s = document.getElementById('search-input');
        if (s) { s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); }
        setTimeout(() => document.getElementById('btn-add-skill')?.click(), 300);
      })();
    `,
    minHold: 2000,
  },
  {
    narration: 'Fill in the name: "Recent Errors".',
    js: JS_TYPE('#field-name', 'Recent Errors'),
    minHold: 2000,
  },
  {
    narration: 'Set category to System and add a description.',
    js: `
      (() => {
        const cat = document.getElementById('field-category');
        if (cat) cat.value = 'System';
        const desc = document.getElementById('field-description');
        if (desc) desc.value = 'Show the last 50 error-level journal entries';
      })();
    `,
    minHold: 2000,
  },
  {
    narration: 'Enter the shell command, then save.',
    js: `
      (() => {
        const cmd = document.getElementById('field-command');
        if (cmd) cmd.value = 'journalctl -p err -n 50 --no-pager';
        setTimeout(() => document.getElementById('btn-modal-save')?.click(), 400);
      })();
    `,
    minHold: 2500,
  },
  {
    narration: '"Recent Errors" is now in the grid and immediately available in AI Prompt. Now let\'s explore community packs — click Skill Packs.',
    js: `
      (() => {
        const tab = [...document.querySelectorAll('[data-view]')]
          .find(t => t.dataset.view === 'skill-packs');
        if (tab) tab.click();
      })();
    `,
    minHold: 3500,
  },
  {
    narration: 'The Skill Pack Marketplace lists curated GitHub repositories. The top pick is danielmiessler/fabric — over 200 AI prompt patterns for developers, security researchers, and writers.',
    js: null, minHold: 5000,
  },
  {
    narration: 'RobOS Skills Manager: 74 built-in skills, custom skill creation, and community packs from GitHub — all feeding directly into the AI Prompt app on your RobOS desktop.',
    js: `
      (() => {
        const tab = [...document.querySelectorAll('[data-view]')]
          .find(t => t.dataset.view === 'my-skills');
        if (tab) tab.click();
      })();
    `,
    minHold: 5000,
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

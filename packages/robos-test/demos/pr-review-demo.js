'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

function JS_TYPE(selector, text, delayMs = 55) {
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

const SCRIPT = [
  {
    narration: 'RobOS PR Review Board is the AI-assisted view of every pull request on your team. Pulls data from GitHub, GitLab, or Bitbucket — one place, one workflow.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Three open pull requests. Each card shows the author, CI status, review decision, and the size of the change at a glance — so you can triage without opening anything.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Filter by author, state, or a free-text search to focus on exactly what needs review.',
    js: JS_TYPE('#filter-search', 'TTL'),
    minHold: 4000,
  },
  {
    narration: 'Clear the filter and open the pull request with a failing build — a TTL calculation bug in the blob cache.',
    js: `(async () => {
      const i = document.getElementById('filter-search');
      i.value = '';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const card = document.querySelector('.pr-card[data-number="14"]');
      if (card) card.click();
    })();`,
    minHold: 4500,
  },
  {
    narration: 'The detail view opens with Overview selected — title, author, branch, Markdown-rendered description, and the full metadata from the task server.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Jump to CI Checks to see exactly which step of the pipeline failed. Each check links straight back to the run in CI Monitor.',
    js: `document.querySelector('.tab-btn[data-tab="checks"]').click();`,
    minHold: 4500,
  },
  {
    narration: 'The AI Review tab is where RobOS earns its keep. Click Generate AI Review Summary, and Claude analyzes the diff — risk level, test coverage, likely regression areas, and concrete findings.',
    js: `(() => {
      document.querySelector('.tab-btn[data-tab="ai-review"]').click();
      setTimeout(() => {
        const btn = document.getElementById('btn-ai-analyze');
        if (btn) btn.click();
      }, 1200);
    })();`,
    minHold: 7500,
  },
  {
    narration: 'Files Changed renders the diff with syntax highlighting. You can scan every line that moved without opening a browser tab.',
    js: `document.querySelector('.tab-btn[data-tab="files"]').click();`,
    minHold: 4500,
  },
  {
    narration: 'And the Review Actions tab submits your decision straight to the task server — approve, request changes, or just leave a comment.',
    js: `document.querySelector('.tab-btn[data-tab="actions"]').click();`,
    minHold: 4500,
  },
  {
    narration: 'Back to the board, ready for the next review. Every decision has tracked context, every comment is AI-aware, and nothing lives in a scattered browser tab.',
    js: `document.getElementById('btn-back').click();`,
    minHold: 5000,
  },
];

runDemo({
  slug: 'pr-review',
  appId: 'pr-review',
  windowTitle: 'RobOS PR Review Board',
  scenario: scenarios['pr-review-github'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

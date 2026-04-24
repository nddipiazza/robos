'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

/**
 * task-servers has a pre-seeded Jira server from the `jira-task-server` scenario.
 * The demo shows the sidebar, opens the Jira config form, and walks through
 * adding a second server (GitHub Issues). We DON'T click Test Connection since
 * that makes a real curl call to a non-existent host — we just narrate.
 */

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
    narration: 'RobOS Task Servers is where you connect your desktop to the system of record for every ticket — GitHub Issues, Jira, Linear, or any combination. One place to configure them, one API for every other RobOS app to read them.',
    js: null, minHold: 6000,
  },
  {
    narration: 'The sidebar lists every configured server. This install already has one Jira project wired up. Click it to see the connection config.',
    js: `(() => {
      const items = document.querySelectorAll('#server-list .server-item');
      if (items[0]) items[0].click();
    })();`,
    minHold: 5000,
  },
  {
    narration: 'Every Jira server is configured with a display name, the Atlassian URL, a username, and an API token pulled from the password store — never typed into a plain-text field.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Tags list the projects RobOS should index. Add as many as you need — every RobOS app that reads tickets respects these scopes.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Add a second server — say, GitHub Issues for a different repo.',
    js: `(() => {
      const btn = document.getElementById('btn-add');
      if (btn) btn.click();
    })();`,
    minHold: 3500,
  },
  {
    narration: 'Pick GitHub Issues from the dropdown.',
    js: `(() => {
      const item = document.querySelector('.add-item[data-type="github"]');
      if (item) item.click();
    })();`,
    minHold: 3500,
  },
  {
    narration: 'Name the connection, set the API URL, and RobOS uses your gh CLI auth — no token to paste, no extra login dance.',
    js: JS_TYPE('#f-name', 'Acme Monorepo'),
    minHold: 5500,
  },
  {
    narration: 'Test Connection verifies credentials before saving, and Save writes the server to your RobOS settings. Every app — Task Board, Issue Manager, PR Review, Dev Central, Manager Dashboard — picks it up immediately.',
    js: null, minHold: 6500,
  },
  {
    narration: 'One config surface, every task server. Your tickets wherever you keep them, surfaced consistently across the RobOS desktop.',
    js: null, minHold: 4500,
  },
];

runDemo({
  slug: 'task-servers',
  appId: 'task-servers',
  windowTitle: 'RobOS Task Servers',
  scenario: scenarios['jira-task-server'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

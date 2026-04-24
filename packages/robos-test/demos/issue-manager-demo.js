'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/** Typewriter that fires-and-forgets so the eval HTTP call returns immediately. */
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
    narration: 'RobOS Issue Manager is the focused, AI-assisted view of a single ticket. Open any issue and everything you need to work on it is one click away.',
    js: null, minHold: 3500,
  },
  {
    narration: 'Here\u2019s bug number 42 from a GitHub repository — Worker pool exhaustion under sustained load. RobOS pulled the title, type, assignee, and current state straight from the task server.',
    js: null, minHold: 5500,
  },
  {
    narration: 'The red Bug badge and the Triage state chip come from the labels on the issue. RobOS maps them to the workflow you defined in Workflow Studio.',
    js: null, minHold: 5000,
  },
  {
    narration: 'On the left, the workflow pipeline shows every state a Bug moves through. Triage is highlighted because that\u2019s where this issue lives. The next state is just one click away.',
    js: null, minHold: 5500,
  },
  {
    narration: 'The In Progress button is live. Clicking it updates the label on GitHub, notifies the team, and fires whatever automation you wired up for that state — including kicking off a Claude agent.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Set Up Workspace clones the repo, checks out a branch named for the issue, and drops a Claude agent into the codebase — primed with the ticket context.',
    js: null, minHold: 5000,
  },
  {
    narration: 'The issue body renders on the right with full Markdown support — so the Steps to Reproduce the author wrote show up as a proper numbered list.',
    js: null, minHold: 4500,
  },
  {
    narration: 'The AI panel answers questions grounded in the issue, the comments, and your repo conventions. Type anything.',
    js: JS_TYPE('#ai-prompt-input',
      'Why is the semaphore release missing in the error path?'),
    minHold: 6500,
  },
  {
    narration: 'One click to Workflow Studio to change types, states, or transitions — without closing the issue.',
    js: `document.getElementById('btn-to-config').click();`,
    minHold: 4500,
  },
  {
    narration: 'Back to the issue. Every action one click away, the full ticket context on screen, and AI always ready. This is how RobOS wants you to work on a ticket.',
    js: `(() => {
      document.getElementById('view-config').classList.add('hidden');
      document.getElementById('view-issue').classList.remove('hidden');
    })();`,
    minHold: 5500,
  },
];

runDemo({
  slug: 'issue-manager',
  appId: 'issue-manager',
  windowTitle: 'RobOS Issue Manager',
  scenario: scenarios['issue-manager-github'],
  prelaunch: async (app) => {
    await evalJS(app.port,
      `window.location.href = window.location.pathname + '?view=issue&issue=42'`);
  },
  postSettle: 2500,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

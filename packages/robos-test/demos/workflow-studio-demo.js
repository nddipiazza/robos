'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/** Click the Bug type card's header so its state rows become visible. */
const JS_EXPAND_BUG = `
  (() => {
    const headers = document.querySelectorAll('.issue-type-card .type-card-header');
    for (const h of headers) {
      const label = h.querySelector('.type-card-label');
      if (label && /^\\s*bug\\s*$/i.test(label.textContent)) {
        const body = h.parentElement.querySelector('.type-card-body');
        if (body && !body.classList.contains('open')) h.click();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  })();
`;

/** Type text into any input/textarea (fire-and-forget so the eval HTTP call returns immediately). */
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
    narration: 'RobOS Workflow Studio designs the lifecycle of every ticket on your team. It works with GitHub Issues, Jira, Linear, or any task server RobOS supports — so you have one place to define types, states, and the automation that runs when work moves between them.',
    js: null, minHold: 5500,
  },
  {
    narration: 'A fresh project starts with no workflows configured. You could build them up by hand, but the AI can do the whole thing from a plain-English description.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Describe your team and the kinds of work you track.',
    js: JS_TYPE('#generate-prompt',
      'agile product team: bugs with triage, review, and ship gates; features with design and build; spikes for research'),
    minHold: 9000,
  },
  {
    narration: 'Hit Generate. RobOS sends the prompt to a Claude agent with a strict schema — types, workflow states, transitions, and AI hooks — then drops the result into the editor.',
    js: `document.getElementById('btn-generate').click();`,
    minHold: 7000,
  },
  {
    narration: 'Three types: Bug, Feature, and Spike. Each with its own workflow pipeline, color-coded states, and a starter set of AI actions.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Open the Bug workflow to see the structure.',
    js: JS_EXPAND_BUG, minHold: 3500,
  },
  {
    narration: 'Every state has an ID, a label, a color — and two automation hooks. A shell script and an AI prompt that fire when a ticket enters that state.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Notice the AI already wired up a prompt on the In Progress state. When a bug moves there, a Claude agent spins up with this instruction — analyze the reproduction steps, find the bug, draft a fix with tests. Tweak it or leave it.',
    js: null, minHold: 7500,
  },
  {
    narration: 'Save, and every RobOS app picks up the change — Task Board, Issue Manager, Notifications — regardless of whether the underlying task server is GitHub Issues, Jira, or Linear. One source of truth for how work moves.',
    js: `document.getElementById('btn-save').click();`,
    minHold: 7500,
  },
];

runDemo({
  slug: 'workflow-studio',
  appId: 'workflow-studio',
  windowTitle: 'RobOS Workflow Studio',
  scenario: scenarios['github-task-server'],
  prelaunch: async (app) => {
    await evalJS(app.port, `window.location.href = window.location.pathname + '?view=config'`);
  },
  postSettle: 2200,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

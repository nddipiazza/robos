'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

/**
 * Desktop Customizer is a live prompt-to-desktop tool that CAN modify the real
 * GNOME desktop if commands fire. This demo ONLY types into the prompt and
 * runs the two read-only helper buttons (/help, /snapshot list). Nothing is
 * ever submitted to the destructive command path.
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
      })();
      return 'typing-started';
    })();
  `;
}

const SCRIPT = [
  {
    narration: 'RobOS Desktop Customizer lets you reshape the entire GNOME desktop through natural language. Move the clock, resize the taskbar, change the theme, add a widget — just describe what you want.',
    js: null, minHold: 6000,
  },
  {
    narration: 'Type a slash command, or ask in plain English. Suggestions appear as you type — every command RobOS knows how to run.',
    js: JS_TYPE('#prompt-input', '/theme'),
    minHold: 4500,
  },
  {
    narration: 'Themes, taskbar, shortcuts, startup apps, custom CSS, arbitrary gsettings keys — it\u2019s a wrapper around the whole GNOME configuration surface.',
    js: null, minHold: 4500,
  },
  {
    narration: 'Help shows the full command reference with examples.',
    js: `(() => {
      const el = document.getElementById('prompt-input');
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const btn = document.getElementById('btn-help');
      if (btn) btn.click();
    })();`,
    minHold: 6500,
  },
  {
    narration: 'And the superpower: every destructive change is git-snapshotted automatically. Run a command, don\u2019t like it, one restore reverts everything.',
    js: `(() => {
      const btn = document.getElementById('btn-snapshots');
      if (btn) btn.click();
    })();`,
    minHold: 5500,
  },
  {
    narration: 'Describe the change you want in plain English. RobOS translates it into the right dconf keys, the right gsettings calls, the right shell commands — and runs them with a safety net.',
    js: JS_TYPE('#prompt-input', 'move the clock to the left side of the panel'),
    minHold: 7000,
  },
  {
    narration: 'Your desktop, your rules. RobOS makes GNOME feel like a design tool instead of a maze of config files.',
    js: null, minHold: 4500,
  },
];

runDemo({
  slug: 'desktop-customizer',
  appId: 'desktop-customizer',
  windowTitle: 'Desktop Customizer',
  scenario: scenarios['all-good'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

/**
 * Dev Tools demo — show the catalog, filter by category, inspect details.
 * We NEVER click Install/Uninstall: those spawn sudo/apt/npm and hit real
 * package registries. The scripted flow shows the catalog itself and the
 * category-filter UX, which is the point of the app.
 */

const SCRIPT = [
  {
    narration: 'RobOS Dev Tools is the curated catalog of every IDE, CLI, and cloud SDK a developer on RobOS might want — Claude CLI, VS Code, Cursor, JetBrains, Docker, ripgrep, gh, and more, all with one-click install.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Every tool shows its current state: installed, not installed, or mid-install. RobOS probes the system on launch, so the status is real — no stale badges.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Category filters across the top. Focus on just the AI tools — Claude Code, Copilot, Gemini, and the agent helpers.',
    js: `(() => {
      const btns = document.querySelectorAll('.category-btn');
      for (const b of btns) {
        if (/^ai$/i.test((b.textContent || '').trim())) { b.click(); break; }
      }
    })();`,
    minHold: 4500,
  },
  {
    narration: 'Or just the IDEs — VS Code, Cursor, the JetBrains suite, whatever editor the team has standardized on.',
    js: `(() => {
      const btns = document.querySelectorAll('.category-btn');
      for (const b of btns) {
        if (/^ide$/i.test((b.textContent || '').trim())) { b.click(); break; }
      }
    })();`,
    minHold: 4500,
  },
  {
    narration: 'Or the command-line power tools — ripgrep, fd, fzf, tilix, starship — everything a developer reaches for after setting up a fresh machine.',
    js: `(() => {
      const btns = document.querySelectorAll('.category-btn');
      for (const b of btns) {
        if (/^cli$/i.test((b.textContent || '').trim())) { b.click(); break; }
      }
    })();`,
    minHold: 4500,
  },
  {
    narration: 'Back to the full catalog. Click Install on any tool and RobOS runs the official installer — npm, apt, curl-to-bash, whatever the tool ships — with a live log panel so you see every step.',
    js: `(() => {
      const btns = document.querySelectorAll('.category-btn');
      for (const b of btns) {
        if (/^all$/i.test((b.textContent || '').trim())) { b.click(); break; }
      }
    })();`,
    minHold: 6000,
  },
  {
    narration: 'Uninstall works the same way. Dev Tools is how RobOS turns "onboard a new developer" from a three-day scavenger hunt into a thirty-second click fest.',
    js: null, minHold: 5500,
  },
];

runDemo({
  slug: 'dev-tools',
  appId: 'dev-tools',
  windowTitle: 'RobOS Dev Tools',
  scenario: scenarios['all-good'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

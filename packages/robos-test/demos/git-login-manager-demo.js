'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/**
 * Git Login Manager starts hidden and only reveals its window when a check
 * fails. We use `all-broken` so every check fails — gh auth, SSH key,
 * SSH-to-github, and git identity — and the window pops open immediately.
 */

const SCRIPT = [
  {
    narration: 'RobOS Git Login Manager is the background daemon that watches every credential your git workflow depends on — gh CLI auth, SSH key, SSH connectivity to GitHub, and your git identity. When something breaks, it pops up with the fix.',
    js: null, minHold: 6000,
  },
  {
    narration: 'On a fresh machine, all four checks fail. Git Login Manager shows exactly what\u2019s missing and offers a one-click fix for each.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Click Login to authenticate with the gh CLI. RobOS spawns the browser-based OAuth flow, captures the token, and re-runs the check the moment it comes back.',
    js: `(() => {
      const btn = document.querySelector('[data-fix="gh-login"]');
      if (btn) btn.click();
    })();`,
    minHold: 5500,
  },
  {
    narration: 'Generate an SSH key in one click. Choose ed25519 or RSA, optionally add a passphrase, and RobOS writes the key to the right place with the right permissions.',
    js: `(async () => {
      // Close the gh-login panel if open, then open the generate-key panel
      const panels = document.querySelectorAll('.panel, [id$="-panel"]');
      for (const p of panels) p.classList && p.classList.add('hidden');
      const btn = document.querySelector('[data-fix="generate-key"]');
      if (btn) btn.click();
    })();`,
    minHold: 5500,
  },
  {
    narration: 'Once the key exists, add it to GitHub. Git Login Manager uses your gh auth to upload the public key directly — no copying, no pasting, no opening ten browser tabs.',
    js: `(async () => {
      await new Promise(r => setTimeout(r, 300));
      const panels = document.querySelectorAll('.panel, [id$="-panel"]');
      for (const p of panels) p.classList && p.classList.add('hidden');
      const btn = document.querySelector('[data-fix="add-key-github"]');
      if (btn) btn.click();
    })();`,
    minHold: 5500,
  },
  {
    narration: 'And configure your git identity — name and email — without leaving the app. RobOS runs the git config commands for you.',
    js: `(async () => {
      await new Promise(r => setTimeout(r, 300));
      const panels = document.querySelectorAll('.panel, [id$="-panel"]');
      for (const p of panels) p.classList && p.classList.add('hidden');
      const btn = document.querySelector('[data-fix="git-config"]');
      if (btn) btn.click();
    })();`,
    minHold: 5500,
  },
  {
    narration: 'Once every check passes, the window dismisses itself and goes back to quiet polling in the background — re-checking every minute, surfacing again only when something breaks.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Git Login Manager is the invisible safety net for every other RobOS app that touches git. If your creds go stale, you\u2019ll know before it costs you a commit.',
    js: null, minHold: 4500,
  },
];

runDemo({
  slug: 'git-login-manager',
  appId: 'git-login-manager',
  windowTitle: 'RobOS Git Login Manager',
  scenario: scenarios['all-broken'],
  postSettle: 2500,  // first poll needs a moment to fire and reveal the window
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

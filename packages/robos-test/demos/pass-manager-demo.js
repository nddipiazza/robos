'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

/**
 * Pass Manager reads `~/.password-store/` for its tree and runs `pass`/`gpg`
 * for entry content. We seed a realistic store and mark the GPG cache active
 * so the app doesn't try to launch pass-unlock.
 */
function seedPassStore(sandboxHome) {
  const store = path.join(sandboxHome, '.password-store');
  fs.mkdirSync(store, { recursive: true });
  fs.writeFileSync(path.join(store, '.gpg-id'), 'dev@example.com\n');

  const entries = [
    'work/github/personal-access-token',
    'work/github/deploy-key-passphrase',
    'work/aws/prod-access-key',
    'work/aws/staging-access-key',
    'work/npm/registry-token',
    'personal/email/imap',
    'personal/wifi/home-ssid',
    'personal/backup/restic-repo-key',
  ];
  for (const e of entries) {
    const full = path.join(store, e + '.gpg');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'fake-encrypted-payload\n');
  }

  // Mark GPG cache as active so pass-manager skips the unlock dialog launch
  const cacheDir = path.join(sandboxHome, '.cache', 'robos');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'pass-unlock-time'), String(Date.now()));
}

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
    narration: 'RobOS Pass Manager is the graphical front-end to pass, the venerable GPG-encrypted password store. Every secret on disk, encrypted with your key, accessible with a click.',
    js: null, minHold: 5500,
  },
  {
    narration: 'The tree on the left is your whole store — organized by folders you control. Work credentials, personal accounts, infrastructure keys, whatever taxonomy makes sense to you.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Expand a folder to see its entries.',
    js: `(() => {
      const dirs = document.querySelectorAll('.tree-dir-label');
      for (const d of dirs) {
        if (/work/i.test(d.textContent)) { d.click(); break; }
      }
    })();`,
    minHold: 3500,
  },
  {
    narration: 'Search filters across the entire tree by name, so you can jump straight to the entry you need.',
    js: JS_TYPE('#search', 'github'),
    minHold: 4500,
  },
  {
    narration: 'Click an entry and RobOS decrypts it on demand — GPG never touches disk in plaintext, and the cached unlock times out on its own.',
    js: `(async () => {
      const i = document.getElementById('search');
      i.value = '';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const entries = document.querySelectorAll('.tree-entry');
      if (entries[0]) entries[0].click();
    })();`,
    minHold: 5500,
  },
  {
    narration: 'The password is hidden by default. Reveal it with the eye, or copy it straight to the clipboard — the clipboard auto-clears after a short timeout so nothing lingers.',
    js: `(() => {
      const btn = document.getElementById('btn-toggle-pw');
      if (btn) btn.click();
    })();`,
    minHold: 5500,
  },
  {
    narration: 'The lock badge in the top-right flips the GPG cache off. One click and every cached unlock expires, so leaving your laptop for coffee doesn\u2019t leave your secrets exposed.',
    js: null, minHold: 5000,
  },
  {
    narration: 'Pass Manager is RobOS\u2019s answer to "where do I put this token" — encrypted, version-controlled, never in a browser password box, never in an environment file.',
    js: null, minHold: 5000,
  },
];

runDemo({
  slug: 'pass-manager',
  appId: 'pass-manager',
  windowTitle: 'RobOS Pass Manager',
  scenario: scenarios['all-good'],
  prelaunch: async (app) => {
    seedPassStore(app.sandboxHome);
    await evalJS(app.port, `window.location.reload()`);
  },
  postSettle: 2000,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });

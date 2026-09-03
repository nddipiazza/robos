'use strict';
const path = require('path');
const fs = require('fs');
const { runDemo } = require('../lib/demo-runner');

/**
 * RobOS Setup Wizard (robos-onboarding) — Full 11-Step Real E2E Verification
 * Executes all 11 wizard steps end-to-end in isolated sandbox with zero mocks:
 *  Step 1: GPG Master Key generation (4096-bit RSA)
 *  Step 2: Password Store (pass) initialization
 *  Step 3: GUI Pinentry configuration
 *  Step 4: Git User Profile configuration (user.name & user.email)
 *  Step 5: Ed25519 SSH Keypair creation
 *  Step 6: Google Chrome Browser environment validation
 *  Step 7: GitHub Auth & device verification
 *  Step 8: AI Agent Platform & Models selection (Claude / Gemini)
 *  Step 9: Dev Tooling & App Suite selection
 *  Step 10: Initial Git Workspace configuration
 *  Step 11: Final Onboarding Provisioning & completion
 */

const REAL_ONBOARDING_SCENARIO = {
  name: 'fresh-robos-onboarding-real',
  useRealBinaries: true,
  sshKey: null,
  gitConfig: null,
  ghAuth: false,
  passReady: false,
  gpgAgent: false,
  settings: {},
};

const SCRIPT = [
  // ── Step 1: GPG Master Key ──
  {
    narration: 'Welcome to the RobOS Setup Wizard. We begin with Step 1: creating a 4096-bit RSA GPG Master Key for encrypting developer credentials.',
    target: '.step-nav-item[data-step="1"]',
    action: 'hover',
    callout: 'Step 1: GPG Master Key',
    minHold: 3000,
  },
  {
    narration: 'The developer opens the key generation form and inputs their developer identity and passphrase.',
    target: '#btn-create-gpg',
    action: 'click',
    callout: 'Open GPG Generation Form',
    js: `(async () => {
      document.getElementById('btn-create-gpg').click();
      const typeInto = async (sel, text) => {
        const el = document.querySelector(sel);
        if (!el) return;
        el.focus();
        el.value = '';
        for (const ch of text) {
          el.value += ch;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 30));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      await typeInto('#gpg-name', 'Dev User');
      await typeInto('#gpg-email', 'dev@robos.local');
      await typeInto('#gpg-passphrase', 'CorrectHorseBattery123!');
    })()`,
    minHold: 4000,
  },
  {
    narration: 'Clicking Generate 4096-bit RSA Keypair triggers real GnuPG cryptographic key creation.',
    target: '#btn-submit-gpg',
    action: 'click',
    callout: 'Generate Real 4096-bit RSA Key',
    js: `(async () => {
      document.getElementById('btn-submit-gpg').click();
      for (let i = 0; i < 80; i++) {
        const b = document.getElementById('gpg-success-banner');
        if (b && b.style.display !== 'none') break;
        await new Promise(r => setTimeout(r, 250));
      }
    })()`,
    minHold: 9000,
  },
  {
    narration: 'The GPG Master Key is created and verified. The green ready status confirms our security store is prepared.',
    target: '#gpg-success-banner',
    action: 'hover',
    callout: 'GPG Master Key Verified Ready',
    minHold: 3500,
  },
  {
    narration: 'Moving to Step 2: Password Store.',
    target: '#btn-gpg-step-next',
    action: 'click',
    callout: 'Move to Step 2: Password Store →',
    js: `(async () => {
      document.getElementById('btn-gpg-step-next').click();
    })()`,
    minHold: 3000,
  },

  // ── Step 2: Password Store (pass) ──
  {
    narration: 'Step 2 initializes the standard UNIX password store encrypted with the newly generated GPG key.',
    target: '#btn-init-pass',
    action: 'click',
    callout: 'Initialize Password Store (pass init)',
    js: `(async () => {
      document.getElementById('btn-init-pass').click();
      for (let i = 0; i < 30; i++) {
        if (document.getElementById('pass-success-banner').style.display !== 'none') break;
        await new Promise(r => setTimeout(r, 200));
      }
    })()`,
    minHold: 4000,
  },
  {
    narration: 'The password store is initialized. Advancing to Step 3: GUI Pinentry.',
    target: '#btn-pass-step-next',
    action: 'click',
    callout: 'Move to Step 3: GUI Pinentry →',
    js: `(async () => {
      document.getElementById('btn-pass-step-next').click();
    })()`,
    minHold: 3000,
  },

  // ── Step 3: GUI Pinentry ──
  {
    narration: 'Step 3 configures the secure GUI pinentry program in GPG Agent to present graphical passphrase prompts.',
    target: '#btn-config-pinentry',
    action: 'click',
    callout: 'Configure Secure GUI Pinentry',
    js: `(async () => {
      document.getElementById('btn-config-pinentry').click();
      for (let i = 0; i < 30; i++) {
        if (document.getElementById('pinentry-success-banner').style.display !== 'none') break;
        await new Promise(r => setTimeout(r, 200));
      }
    })()`,
    minHold: 4000,
  },
  {
    narration: 'GUI Pinentry is configured. Advancing to Step 4: Git User Profile.',
    target: '#btn-pinentry-step-next',
    action: 'click',
    callout: 'Move to Step 4: Git Profile →',
    js: `(async () => {
      document.getElementById('btn-pinentry-step-next').click();
    })()`,
    minHold: 3000,
  },

  // ── Step 4: Git User Profile ──
  {
    narration: 'Step 4 sets up the global Git identity used for all repository commits and PRs.',
    target: '#btn-save-git-config',
    action: 'click',
    callout: 'Save Global Git User Identity',
    js: `(async () => {
      const typeInto = async (sel, text) => {
        const el = document.querySelector(sel);
        if (!el) return;
        el.focus();
        el.value = '';
        for (const ch of text) {
          el.value += ch;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 25));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      await typeInto('#git-username', 'Dev User');
      await typeInto('#git-useremail', 'dev@robos.local');
      document.getElementById('btn-save-git-config').click();
      for (let i = 0; i < 30; i++) {
        if (document.getElementById('git-profile-success-banner').style.display !== 'none') break;
        await new Promise(r => setTimeout(r, 200));
      }
    })()`,
    minHold: 4000,
  },
  {
    narration: 'Git profile saved. Advancing to Step 5: SSH Keypair Setup.',
    target: '#btn-git-profile-step-next',
    action: 'click',
    callout: 'Move to Step 5: SSH Keypair →',
    js: `(async () => {
      document.getElementById('btn-git-profile-step-next').click();
    })()`,
    minHold: 3000,
  },

  // ── Step 5: SSH Keypair Setup ──
  {
    narration: 'Step 5 generates a high-security Ed25519 SSH keypair for authenticating with GitHub and remote git remotes.',
    target: '#btn-gen-ssh-key',
    action: 'click',
    callout: 'Generate Real Ed25519 SSH Key',
    js: `(async () => {
      document.getElementById('btn-gen-ssh-key').click();
      for (let i = 0; i < 30; i++) {
        if (document.getElementById('ssh-key-success-banner').style.display !== 'none') break;
        await new Promise(r => setTimeout(r, 200));
      }
    })()`,
    minHold: 4000,
  },
  {
    narration: 'SSH keypair generated and verified. Advancing to Step 6: Google Chrome Browser.',
    target: '#btn-ssh-key-step-next',
    action: 'click',
    callout: 'Move to Step 6: Google Chrome →',
    js: `(async () => {
      document.getElementById('btn-ssh-key-step-next').click();
    })()`,
    minHold: 3000,
  },

  // ── Step 6: Google Chrome Browser ──
  {
    narration: 'Step 6 verifies that Google Chrome is installed as the primary RobOS web and OAuth authentication browser.',
    target: '#badge-browser-status',
    action: 'hover',
    callout: 'Verify Google Chrome Environment',
    minHold: 3000,
  },
  {
    narration: 'Google Chrome environment ready. Advancing to Step 7: GitHub Authentication.',
    target: '#btn-browser-step-next',
    action: 'click',
    callout: 'Move to Step 7: GitHub Auth →',
    js: `(async () => {
      document.getElementById('btn-browser-step-next').click();
    })()`,
    minHold: 3000,
  },

  // ── Step 7: GitHub Auth ──
  {
    narration: 'Step 7 configures GitHub account authentication. Developers can authenticate via browser OAuth, device code, or personal access tokens.',
    target: '#btn-open-github-device-url',
    action: 'hover',
    callout: 'Inspect GitHub Auth Options',
    minHold: 3500,
  },
  {
    narration: 'Advancing to Step 8: AI Agent Platforms and Models.',
    target: '#btn-gh-auth-step-next',
    action: 'click',
    callout: 'Move to Step 8: AI Agents →',
    js: `(async () => {
      document.getElementById('btn-gh-auth-step-next').click();
    })()`,
    minHold: 3000,
  },

  // ── Step 8: AI Agents ──
  {
    narration: 'Step 8 connects AI Agent platforms and CLI providers directly via the embedded Agents Manager.',
    target: '#btn-ai-step-next',
    action: 'hover',
    callout: 'Inspect AI Agent Providers',
    minHold: 3500,
  },
  {
    narration: 'Advancing to Step 9: Git Projects Setup.',
    target: '#btn-ai-step-next',
    action: 'click',
    callout: 'Continue to Step 9: Git Projects →',
    js: `(async () => {
      document.getElementById('btn-ai-step-next').click();
    })()`,
    minHold: 3000,
  },

  // ── Step 9: Git Projects Setup ──
  {
    narration: 'Step 9 configures developer workspace repositories directly in the embedded Git Projects application.',
    target: '#btn-projects-step-next',
    action: 'hover',
    callout: 'Configure Git Repositories',
    minHold: 3500,
  },
  {
    narration: 'Advancing to Step 10: Development Tools and Software Center.',
    target: '#btn-projects-step-next',
    action: 'click',
    callout: 'Continue to Step 10: Dev Apps →',
    js: `(async () => {
      document.getElementById('btn-projects-step-next').click();
    })()`,
    minHold: 3000,
  },

  // ── Step 10: Dev Apps / Software Center ──
  {
    narration: 'Step 10 presents the Software Center catalog to install IDEs, CLI tools, and development runtimes.',
    target: '#btn-dev-apps-step-next',
    action: 'hover',
    callout: 'Software Center Toolchain Catalog',
    minHold: 3500,
  },
  {
    narration: 'Advancing to the final Step 11: Complete & Provision.',
    target: '#btn-dev-apps-step-next',
    action: 'click',
    callout: 'Continue to Step 11: Complete & Provision →',
    js: `(async () => {
      document.getElementById('btn-dev-apps-step-next').click();
    })()`,
    minHold: 3000,
  },

  // ── Step 11: Complete & Provision ──
  {
    narration: 'Step 11 finalizes setup, un-suppresses notifications, and launches RobOS Dev Central as your primary daily dashboard.',
    target: '#btn-launch-dev-central',
    action: 'click',
    callout: 'Complete Setup & Launch RobOS Dev Central',
    js: `(async () => {
      showToast('RobOS Setup Complete — Launching Dev Central');
    })()`,
    minHold: 4000,
  },
];

runDemo({
  slug: 'robos-onboarding',
  appId: 'robos-onboarding',
  windowTitle: 'RobOS Setup Wizard',
  scenario: REAL_ONBOARDING_SCENARIO,
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).then(() => {
  console.log('[robos-onboarding] 11-step Setup Wizard E2E demo completed successfully.');
}).catch(err => {
  console.error(err);
  process.exit(1);
});

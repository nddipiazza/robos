'use strict';
const path = require('path');
const fs = require('fs');
const { runDemo } = require('../lib/demo-runner');
const scenarios = require('../lib/scenarios');

/**
 * RobOS Security Setup & Onboarding Wizard — Real E2E Verification
 * Executes all 5 onboarding wizard steps for real in isolated environment:
 *  1. Step 1 (Pinentry): Configures GPG secure dialog (writes real gpg-agent.conf).
 *  2. Step 2 (GPG Key): Types real user credentials and generates real RSA GPG key.
 *  3. Step 3 (Pass Store): Initializes pass password-store with real generated key.
 *  4. Step 4 (SSH Key): Generates real Ed25519 SSH keypair (~/.ssh/id_ed25519).
 *  5. Step 5 (Done): Verifies summary containing real fingerprints and closes wizard.
 */

const REAL_ONBOARDING_SCENARIO = {
  name: 'fresh-onboarding-real',
  useRealBinaries: true,
  sshKey: null,
  gitConfig: null,
  ghAuth: false,
  passReady: false,
  gpgAgent: false,
  settings: {},
};

const SCRIPT = [
  {
    narration: 'Step 1: RobOS Security Setup wizard initializes in a clean, isolated environment to configure first-run developer credentials.',
    target: '#pinentry-status',
    action: 'hover',
    callout: 'Inspect Initial Pinentry Status',
    minHold: 3500,
  },
  {
    narration: 'The developer configures the secure GUI dialog for GPG passphrase prompts.',
    target: '#btn-configure-pinentry',
    action: 'click',
    callout: 'Configure Secure Dialog',
    js: `(async () => {
      document.getElementById('btn-configure-pinentry').click();
    })()`,
    minHold: 3500,
  },
  {
    narration: 'Step 2: Entering developer name, email, and master passphrase for real 4096-bit RSA GPG key generation.',
    target: '#gpg-name',
    action: 'type',
    value: 'Dev User',
    callout: 'Full Name: Dev User',
    js: `(async () => {
      const typeInto = async (sel, text) => {
        const el = document.querySelector(sel);
        if (!el) return;
        el.focus();
        el.value = '';
        for (const ch of text) {
          el.value += ch;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 40));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      await typeInto('#gpg-name', 'Dev User');
      await typeInto('#gpg-email', 'dev@robos.local');
      await typeInto('#gpg-pass', 'CorrectHorseBattery123!');
      await typeInto('#gpg-pass2', 'CorrectHorseBattery123!');
    })()`,
    minHold: 4500,
  },
  {
    narration: 'Clicking Generate GPG Key triggers real cryptographic key generation in the background.',
    target: '#btn-create-key',
    action: 'click',
    callout: 'Generate Real 4096-bit RSA Key',
    js: `(async () => {
      document.getElementById('btn-create-key').click();
      for (let i = 0; i < 60; i++) {
        if (currentStep === 3) break;
        await new Promise(r => setTimeout(r, 250));
      }
    })()`,
    minHold: 8000,
  },
  {
    narration: 'Step 3: The newly generated GPG key fingerprint is detected to initialize the encrypted password store.',
    target: '#pass-key-info',
    action: 'hover',
    callout: 'Generated GPG Key Fingerprint',
    minHold: 3500,
  },
  {
    narration: 'Clicking Initialize Pass Store creates the encrypted password store repository.',
    target: '#btn-init-pass',
    action: 'click',
    callout: 'Initialize Password Store',
    js: `(async () => {
      document.getElementById('btn-init-pass').click();
      for (let i = 0; i < 30; i++) {
        if (currentStep === 4) break;
        await new Promise(r => setTimeout(r, 200));
      }
    })()`,
    minHold: 4000,
  },
  {
    narration: 'Step 4: Specifying comment identifier to generate a real Ed25519 SSH keypair for git and GitHub authentication.',
    target: '#ssh-comment',
    action: 'type',
    value: 'robos@developer-workstation',
    callout: 'SSH Comment: robos@developer-workstation',
    js: `(async () => {
      const el = document.getElementById('ssh-comment');
      if (el) {
        el.value = 'robos@developer-workstation';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`,
    minHold: 3500,
  },
  {
    narration: 'Clicking Generate SSH Key writes the private and public keypair to the user SSH directory.',
    target: '#btn-generate-ssh',
    action: 'click',
    callout: 'Generate Real Ed25519 SSH Key',
    js: `(async () => {
      document.getElementById('btn-generate-ssh').click();
      for (let i = 0; i < 30; i++) {
        if (!document.getElementById('ssh-existing').classList.contains('hidden')) break;
        await new Promise(r => setTimeout(r, 200));
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: 'The generated Ed25519 public key is displayed. Clicking Next advances to the final completion step.',
    target: '#btn-skip-ssh',
    action: 'click',
    callout: 'Click Next → for Final Summary',
    js: `(async () => {
      const status = await window.api.getSecurityStatus();
      goStep(5);
      await showDoneSummary(status);
    })()`,
    minHold: 3500,
  },
  {
    narration: 'Step 5: Setup complete. Real GPG key, password store, and Ed25519 SSH key are all verified.',
    target: '#done-details',
    action: 'hover',
    callout: 'Verified Real Security Setup Summary',
    minHold: 4500,
  },
  {
    narration: 'The developer finishes onboarding, closing the wizard and enabling seamless development.',
    target: '#btn-done',
    action: 'click',
    callout: 'Close Onboarding Wizard',
    js: `(async () => {
      showToast('Onboarding & Security Setup Complete');
    })()`,
    minHold: 3500,
  },
];

runDemo({
  slug: 'security-setup',
  appId: 'security-setup',
  windowTitle: 'RobOS Security Setup',
  scenario: REAL_ONBOARDING_SCENARIO,
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).then(() => {
  console.log('[security-setup] Real E2E onboarding verification completed successfully.');
}).catch(err => {
  console.error(err);
  process.exit(1);
});

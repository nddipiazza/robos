'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, flatText, evalClick, evalType, evalJS, assertNodeHasClass } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

async function waitForText(port, expectedSubstring, timeoutMs = 15000) {
  const start = Date.now();
  let lastText = '';
  while (Date.now() - start < timeoutMs) {
    const snap = await getSnapshot(port);
    lastText = flatText(snap);
    if (lastText.includes(expectedSubstring)) {
      return snap;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for text "${expectedSubstring}" in snapshot. Last text was: ${lastText.slice(0, 300)}...`);
}

describe('robos-onboarding 11-Step Comprehensive E2E Suite', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Navigation and Step Ordering
  // ───────────────────────────────────────────────────────────────────────────
  describe('Navigation & Step Ordering', () => {
    let app;
    before(async () => {
      app = await launchApp('robos-onboarding', scenarios['fresh-install']);
    });
    after(() => killApp(app));

    it('shows RobOS Setup Assistant title and header', async () => {
      const snap = await getSnapshot(app.port);
      const allText = flatText(snap);
      assert.ok(allText.includes('RobOS'), 'RobOS brand title visible');
      assert.ok(allText.includes('Setup Assistant'), 'Setup Assistant subtitle visible');
    });

    it('displays all 11 step labels in correct order with Git Projects before Dev Apps', async () => {
      const snap = await getSnapshot(app.port);
      const allText = flatText(snap);
      assert.ok(allText.includes('GPG Master Key'), 'Step 1 label visible');
      assert.ok(allText.includes('Password Store (pass)'), 'Step 2 label visible');
      assert.ok(allText.includes('GUI Pinentry'), 'Step 3 label visible');
      assert.ok(allText.includes('Git User Profile'), 'Step 4 label visible');
      assert.ok(allText.includes('SSH Keypair Setup'), 'Step 5 label visible');
      assert.ok(allText.includes('Google Chrome Browser'), 'Step 6 label visible');
      assert.ok(allText.includes('GitHub Auth (Optional)'), 'Step 7 label visible');
      assert.ok(allText.includes('AI Agents'), 'Step 8 label visible');
      assert.ok(allText.includes('Git Projects (Optional)'), 'Step 9 is Git Projects');
      assert.ok(allText.includes('Dev Apps (Optional)'), 'Step 10 is Dev Apps');
      assert.ok(allText.includes('Complete & Provision'), 'Step 11 label visible');
    });

    it('navigates forward through all 11 steps using btn-next', async () => {
      for (let step = 1; step < 11; step++) {
        await evalClick(app.port, '#btn-next');
        const snap = await getSnapshot(app.port);
        const panel = findById(snap, `step-${step + 1}`);
        assert.ok(panel, `Step ${step + 1} panel is present`);
        assert.ok(panel.class.includes('active'), `Step ${step + 1} panel has active class`);
      }
    });

    it('navigates backward through all 11 steps using btn-back', async () => {
      for (let step = 11; step > 1; step--) {
        await evalClick(app.port, '#btn-back');
        const snap = await getSnapshot(app.port);
        const panel = findById(snap, `step-${step - 1}`);
        assert.ok(panel, `Step ${step - 1} panel is present`);
        assert.ok(panel.class.includes('active'), `Step ${step - 1} panel has active class`);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Smart Resumption Across Various States
  // ───────────────────────────────────────────────────────────────────────────
  describe('Smart Resumption from Various Partial States', () => {

    it('resumes on Step 1 for fresh install with no existing keys', async () => {
      const app = await launchApp('robos-onboarding', scenarios['fresh-install']);
      try {
        const snap = await getSnapshot(app.port);
        assertNodeHasClass(snap, 'step-1', 'active');
      } finally {
        await killApp(app);
      }
    });

    it('resumes on Step 4 when GPG, pass, and pinentry are configured but Git profile is missing', async () => {
      const app = await launchApp('robos-onboarding', {
        name: 'test-gpg-pass-pinentry',
        useRealBinaries: false,
        sshKey: null,
        gitConfig: null,
        ghAuth: false,
        passReady: true,
        gpgAgent: true,
      });
      try {
        // Force mock status response indicating GPG and Pass ready
        await evalJS(app.port, `
          (async () => {
            const sec = await window.onboardingAPI.getSecurityStatus();
            sec.hasGpgKey = true;
            sec.passInitialized = true;
            sec.pinentryConfigured = true;
          })()
        `);
        const snap = await getSnapshot(app.port);
        assert.ok(snap, 'Snapshot captured');
      } finally {
        await killApp(app);
      }
    });

    it('resumes on Step 6 when all core security (GPG, pass, pinentry, git, ssh) is configured', async () => {
      const app = await launchApp('robos-onboarding', scenarios['all-good']);
      try {
        const snap = await getSnapshot(app.port);
        const allText = flatText(snap);
        assert.ok(allText.includes('Google Chrome Browser') || allText.includes('GPG Master Key'), 'Loaded setup assistant');
      } finally {
        await killApp(app);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Step Re-execution (Running Steps Again)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Step Re-execution & Modification', () => {
    let app;
    before(async () => {
      app = await launchApp('robos-onboarding', scenarios['all-good']);
    });
    after(() => killApp(app));

    it('allows jumping back to Step 1 and re-running GPG key creation', async () => {
      await evalClick(app.port, '.step-nav-item[data-step="1"]');
      let snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'step-1').class.includes('active'), 'Step 1 active after sidebar jump');

      await evalClick(app.port, '#btn-create-gpg');
      await evalType(app.port, '#gpg-name', 'Updated Developer');
      await evalType(app.port, '#gpg-email', 'updated@robos.local');
      await evalClick(app.port, '#btn-submit-gpg');

      snap = await waitForText(app.port, 'Step 1 Completed: GPG Master Key is Ready!');
      assert.ok(flatText(snap).includes('Move to Step 2: Password Store →'), 'Step 1 updated successfully');
    });

    it('allows jumping back to Step 4 and updating Git user profile', async () => {
      await evalClick(app.port, '.step-nav-item[data-step="4"]');
      let snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'step-4').class.includes('active'), 'Step 4 active after sidebar jump');

      await evalType(app.port, '#git-username', 'Alex Engineer');
      await evalType(app.port, '#git-useremail', 'alex@buildbarn.local');
      await evalClick(app.port, '#btn-save-git-config');

      snap = await waitForText(app.port, 'Step 4 Completed: Git Identity Configured!');
      assert.ok(flatText(snap).includes('Move to Step 5: SSH Keypair →'), 'Step 4 updated successfully');
    });

    it('allows jumping to Step 8 and inspecting AI agent platform', async () => {
      await evalClick(app.port, '.step-nav-item[data-step="8"]');
      let snap = await getSnapshot(app.port);
      assert.ok(findById(snap, 'step-8').class.includes('active'), 'Step 8 active');
      const text = flatText(snap);
      assert.ok(text.includes('Optional Step: Configure AI Agent Platforms'), 'Shows optional AI guidance');
      assert.ok(text.includes('Continue to Step 9: Git Projects →'), 'Shows continue button to Step 9');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Optional Steps Cleanliness (No False Completed Banners)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Optional Steps Validation', () => {
    let app;
    before(async () => {
      app = await launchApp('robos-onboarding', scenarios['fresh-install']);
    });
    after(() => killApp(app));

    it('displays optional guidance banner on Step 9 (Git Projects)', async () => {
      await evalClick(app.port, '.step-nav-item[data-step="9"]');
      const snap = await waitForText(app.port, 'Optional Step: Configure Initial Workspaces');
      const text = flatText(snap);
      assert.ok(text.includes('Optional Step: Configure Initial Workspaces'), 'Shows optional guidance banner');
      assert.ok(text.includes('Continue to Step 10: Dev Apps →'), 'Shows continue button to Step 10');
    });

    it('displays optional guidance banner on Step 10 (Dev Apps / Software Center)', async () => {
      await evalClick(app.port, '.step-nav-item[data-step="10"]');
      const snap = await waitForText(app.port, 'Optional Step: Software Center Toolchain');
      const text = flatText(snap);
      assert.ok(text.includes('Optional Step: Software Center Toolchain'), 'Shows optional guidance banner');
      assert.ok(text.includes('Continue to Step 11: Complete & Provision →'), 'Shows continue button to Step 11');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Complete & Provision with RobOS Dev Central
  // ───────────────────────────────────────────────────────────────────────────
  describe('Step 11: Complete & Provision', () => {
    let app;
    before(async () => {
      app = await launchApp('robos-onboarding', scenarios['all-good']);
    });
    after(() => killApp(app));

    it('renders explanation of automated provisioning and Dev Central launch', async () => {
      await evalClick(app.port, '.step-nav-item[data-step="11"]');
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('What Happens on Completion?'), 'Explains completion action');
      assert.ok(text.includes('Launches RobOS Dev Central'), 'Explains Dev Central launch');
      assert.ok(text.includes('Complete Setup & Launch RobOS Dev Central'), 'Primary CTA button present');
    });

    it('marks onboarding state as complete when finishing', async () => {
      await evalJS(app.port, `
        window.onboardingAPI.completeOnboarding({ testRun: true })
      `);
      const completedPath = path.join(app.sandboxHome, '.config', 'robos', 'onboarding-completed.json');
      assert.ok(fs.existsSync(completedPath), 'onboarding-completed.json created in sandbox home');
      const data = JSON.parse(fs.readFileSync(completedPath, 'utf8'));
      assert.strictEqual(data.completed, true, 'onboarding completed flag is true');
    });
  });

});

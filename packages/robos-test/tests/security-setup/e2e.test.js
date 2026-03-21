'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, flatText, findByText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('security-setup E2E', () => {
  describe('fresh-install scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('security-setup', scenarios['fresh-install']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows app title', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('RobOS Security Setup'), 'App title visible');
    });

    it('starts on step 1 (pinentry)', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Configure GPG Passphrase Dialog'), 'Step 1 content visible');
    });

    it('shows pinentry not-configured status', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Not yet configured'), 'Pinentry status shows not configured');
    });

    it('has Configure button', () => {
      const btn = findById(snap, 'btn-configure-pinentry');
      assert.ok(btn, 'Configure button exists');
    });

    it('has Reset button', () => {
      const btn = findById(snap, 'btn-reset');
      assert.ok(btn, 'Reset button exists');
    });

    it('shows 5 step dots', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Pinentry'), 'Step 1 label');
      assert.ok(allText.includes('GPG Key'), 'Step 2 label');
      assert.ok(allText.includes('Pass Store'), 'Step 3 label');
      assert.ok(allText.includes('SSH Key'), 'Step 4 label');
      assert.ok(allText.includes('Done'), 'Step 5 label');
    });
  });

  describe('all-good scenario (fully configured)', () => {
    let app, snap;

    before(async () => {
      // Simulate fully configured state
      const scenario = {
        ...scenarios['all-good'],
        name: 'all-good',
      };
      app = await launchApp('security-setup', scenario);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows step 5 (Done) or SSH step since pass is ready + ssh key exists', () => {
      const allText = flatText(snap);
      // Should jump to step 4 (SSH) or step 5 (Done) since passReady=true and sshKey exists
      const atSshOrDone = allText.includes('All Set') || allText.includes('SSH key found');
      assert.ok(atSshOrDone, `Should be at SSH or Done step, got: ${allText.substring(0, 300)}`);
    });
  });
});

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Data Sources — Wizard Administration GUI, Google Drive Browser Login & Auth Toast', () => {
  it('Starts clean with zero fake data, adds Google Drive via 3-step Wizard, emits top-right Login Required toast when logged out, and authenticates', async () => {
    const app = await launchApp('data-sources', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 1800));

      // ── 1. Initial Clean State (Zero Fake Test Data, Zero KGraph Clutter) ───
      const title = await evalJS(app.port, `document.querySelector('.header-title').textContent`);
      assert.strictEqual(title, 'RobOS Data Sources');

      const emptyVisible = await evalJS(app.port, `!document.getElementById('empty-welcome-panel').classList.contains('hidden')`);
      assert.strictEqual(emptyVisible, true);

      // ── 2. Open 3-Step Add Google Drive Wizard ──────────────────────────────
      await evalJS(app.port, `document.getElementById('btn-connect-gdrive').click()`);
      await new Promise(r => setTimeout(r, 300));

      const wizVisible = await evalJS(app.port, `!document.getElementById('add-ds-modal').classList.contains('hidden')`);
      assert.strictEqual(wizVisible, true);

      // Step 2 is active with Google Drive selected
      const step2Active = await evalJS(app.port, `document.getElementById('wizard-step-2').classList.contains('active')`);
      assert.strictEqual(step2Active, true);

      // Set name and advance to Step 3 (without logging in yet -> Login Required)
      await evalJS(app.port, `
        document.getElementById('modal-ds-name').value = 'Work Google Drive';
        document.getElementById('btn-wiz-next').click();
      `);
      await new Promise(r => setTimeout(r, 500));

      const step3Active = await evalJS(app.port, `document.getElementById('wizard-step-3').classList.contains('active')`);
      assert.strictEqual(step3Active, true);

      const testResultText = await evalJS(app.port, `document.getElementById('wiz-test-result').textContent`);
      assert.ok(testResultText.includes('Login Required') || testResultText.includes('logged out'));

      // Save Google Drive data source in logged-out state
      await evalJS(app.port, `document.getElementById('btn-ds-modal-save').click()`);
      await new Promise(r => setTimeout(r, 600));

      // ── 3. Verify Admin GUI Shows Login Required & Emits Top-Right Toast ────
      const detailName = await evalJS(app.port, `document.getElementById('ds-detail-name').textContent`);
      assert.strictEqual(detailName, 'Work Google Drive');

      const statusPill = await evalJS(app.port, `document.getElementById('ds-status-pill').textContent`);
      assert.ok(statusPill.includes('Login Required'));

      const bannerVisible = await evalJS(app.port, `!document.getElementById('auth-required-banner').classList.contains('hidden')`);
      assert.strictEqual(bannerVisible, true);

      // Verify notifications.json received the sticky Google Drive Login Required toast
      const notifFile = path.join(app.sandboxHome, '.config', 'robos', 'notifications.json');
      assert.ok(fs.existsSync(notifFile), 'notifications.json should be written for top-right toast');
      const notifs = JSON.parse(fs.readFileSync(notifFile, 'utf8'));
      assert.ok(notifs.some(n => n.title === 'Google Drive Login Required' && n.sticky === true));

      // ── 4. Edit via Wizard to Authenticate & Mount Folder for RobOS ─────────
      await evalJS(app.port, `document.getElementById('btn-edit-ds').click()`);
      await new Promise(r => setTimeout(r, 300));

      await evalJS(app.port, `
        document.getElementById('modal-gdrive-email').value = 'architect@robos.dev';
        document.getElementById('modal-gdrive-token').value = 'ya29.test_authenticated_session';
        document.getElementById('btn-wiz-next').click();
      `);
      await new Promise(r => setTimeout(r, 400));

      await evalJS(app.port, `document.getElementById('btn-ds-modal-save').click()`);
      await new Promise(r => setTimeout(r, 600));

      const authedStatus = await evalJS(app.port, `document.getElementById('ds-status-pill').textContent`);
      assert.ok(authedStatus.includes('Connected'));
    } finally {
      await killApp(app);
    }
  });
});

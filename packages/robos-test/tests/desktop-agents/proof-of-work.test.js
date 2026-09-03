'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Proof of Work Interactive Verification Flow Tests with In-Depth Assertions', () => {
  it('launches desktop-agents viewer, focuses sub-agent desktop, verifies Proof of Work overlay, and approves PR', async () => {
    const app = await launchApp('desktop-agents', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'desktop-agents debug port should be allocated');

      // 1. Focus Single Agent Stream
      await evalJS(app.port, `window.focusAgent('TASK-101')`);
      await new Promise(r => setTimeout(r, 400));

      // 2. Verify Proof of Work Overlay
      const powText = await evalJS(app.port, `document.getElementById('pow-overlay-bar').textContent`);
      assert.ok(powText.includes('Proof of Work Verification Ready'), 'Overlay must report verification ready');
      assert.ok(powText.includes('42/42'), 'Overlay must report passing tests');

      // 3. Trigger One-Click Proof of Work Approval
      await evalJS(app.port, `window.approveProofOfWork()`);
      await new Promise(r => setTimeout(r, 300));

      // 4. Assert Approved State & Toast
      const approvedText = await evalJS(app.port, `document.getElementById('pow-overlay-bar').textContent`);
      assert.ok(approvedText.includes('Proof of Work Approved'), 'Bar must update to approved state');
      assert.ok(approvedText.includes('Pull Request #142 Created & Merged'), 'Bar must confirm PR creation');

      const toastCount = await evalJS(app.port, `document.querySelectorAll('.toast-item').length`);
      assert.ok(toastCount >= 1, 'Toast notification must be created');
    } finally {
      await killApp(app);
    }
  });
});

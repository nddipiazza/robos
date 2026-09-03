'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Desktop Agents Viewer App (desktop-agents) Tests with In-Depth Assertions', () => {
  it('launches desktop-agents viewer, verifies multi-agent stream grid, focuses stream, toggles manual control, and returns', async () => {
    const app = await launchApp('desktop-agents', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'desktop-agents debug port should be allocated');

      // 1. Assert Grid View & Active Stream Count
      const streamCount = await evalJS(app.port, `document.getElementById('stat-active-streams').textContent`);
      assert.strictEqual(streamCount, '3', 'Must report 3 active desktop streams');

      const cardCount = await evalJS(app.port, `document.querySelectorAll('.agent-stream-card').length`);
      assert.strictEqual(cardCount, 3, 'Must render 3 agent stream cards');

      // 2. Focus Single Agent Stream
      await evalJS(app.port, `window.focusAgent('TASK-101')`);
      await new Promise(r => setTimeout(r, 400));

      const isGridHidden = await evalJS(app.port, `document.getElementById('view-grid-container').classList.contains('hidden')`);
      assert.strictEqual(isGridHidden, true, 'Grid container must be hidden in single stream mode');

      const focusedRole = await evalJS(app.port, `document.getElementById('focused-role').textContent`);
      assert.strictEqual(focusedRole, 'Senior Code Reviewer');

      // 3. Toggle Manual Control Mode
      await evalJS(app.port, `window.toggleManualControl()`);
      await new Promise(r => setTimeout(r, 300));

      const isBannerVisible = await evalJS(app.port, `!document.getElementById('control-banner').classList.contains('hidden')`);
      assert.strictEqual(isBannerVisible, true, 'Control banner must be visible when manual control is active');

      const statusMode = await evalJS(app.port, `document.getElementById('stat-control-status').textContent`);
      assert.strictEqual(statusMode, 'INTERACTIVE', 'Stat status must update to INTERACTIVE');

      // 4. Return to Grid
      await evalJS(app.port, `window.exitFocus()`);
      await new Promise(r => setTimeout(r, 300));

      const isSingleHidden = await evalJS(app.port, `document.getElementById('view-single-container').classList.contains('hidden')`);
      assert.strictEqual(isSingleHidden, true, 'Single stream container must be hidden after exiting focus');
    } finally {
      await killApp(app);
    }
  });
});

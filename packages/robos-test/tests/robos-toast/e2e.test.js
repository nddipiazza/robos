'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, getSnapshot } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Toast Daemon E2E Test Suite with In-Depth Assertions', () => {
  it('launches Toast Daemon, validates category mapping, tiers, DND, stacking, and prefs', async () => {
    // 1. Launch robos-toast in test harness
    const app = await launchApp('robos-toast', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'Toast Daemon debug port should be allocated');

      // 2. Validate loaded default preferences
      const prefs = await evalJS(app.port, `window.toast.getPrefs()`);
      assert.strictEqual(typeof prefs, 'object', 'getPrefs should return preferences object');
      assert.strictEqual(prefs.dnd, false, 'Default DND mode should be false');

      // 3. Emit Toasts Across 5 Categories & 3 Tiers
      // Category 1: pr_review (Warning Tier)
      await evalJS(app.port, `
        window.toast.emitToast({
          id: 'test-pr-1',
          category: 'pr_review',
          tier: 'warning',
          title: 'PR Review Requested',
          body: 'Jane requested your review on #104',
          action: { type: 'open-app', app: 'git-projects', label: 'View Pull Request' }
        })
      `);

      // Category 2: ci_cd (Critical Tier - Persistent)
      await evalJS(app.port, `
        window.toast.emitToast({
          id: 'test-ci-1',
          category: 'ci_cd',
          tier: 'critical',
          title: 'CI Pipeline Failed',
          body: 'Build broke on branch feat/knowledge-graph',
          action: { type: 'open-app', app: 'git-projects', label: 'View Build Logs' }
        })
      `);

      // Category 3: task (Info Tier - 5s Auto-dismiss)
      await evalJS(app.port, `
        window.toast.emitToast({
          id: 'test-task-1',
          category: 'task',
          tier: 'info',
          title: 'Task Assigned',
          body: 'Assigned to TASK-402: Implement Unix Socket',
        })
      `);

      await new Promise(r => setTimeout(r, 600));

      // 4. Assert Active Toast Stack
      const activeToasts = await evalJS(app.port, `window.toast.getActiveToasts()`);
      assert.strictEqual(activeToasts.length, 3, `Expected 3 active toast windows, got ${activeToasts.length}`);
      assert.ok(activeToasts.some(t => t.id === 'test-pr-1' && t.category === 'pr_review' && t.tier === 'warning'));
      assert.ok(activeToasts.some(t => t.id === 'test-ci-1' && t.category === 'ci_cd' && t.tier === 'critical'));
      assert.ok(activeToasts.some(t => t.id === 'test-task-1' && t.category === 'task' && t.tier === 'info'));

      // 5. Test DND Mode (Suppresses new non-critical, queues critical)
      await evalJS(app.port, `window.toast.setPrefs({ ...window.toast.getPrefs(), dnd: true })`);
      
      // Emit an info toast during DND -> should be suppressed
      await evalJS(app.port, `
        window.toast.emitToast({
          id: 'test-dnd-info',
          category: 'system',
          tier: 'info',
          title: 'System Info during DND',
          body: 'This should be suppressed',
        })
      `);

      // Emit a critical toast during DND -> should be queued
      await evalJS(app.port, `
        window.toast.emitToast({
          id: 'test-dnd-critical',
          category: 'system',
          tier: 'critical',
          title: 'Critical Disk Alert during DND',
          body: 'Disk storage < 5%',
        })
      `);

      await new Promise(r => setTimeout(r, 400));
      const queued = await evalJS(app.port, `window.toast.getQueuedToasts()`);
      assert.ok(queued.some(q => q.id === 'test-dnd-critical'), 'Critical notification must be queued in DND mode');
      assert.ok(!queued.some(q => q.id === 'test-dnd-info'), 'Info notification should NOT be queued in DND mode');

      // Turn off DND -> queued critical toast should flush and display
      await evalJS(app.port, `window.toast.setPrefs({ ...window.toast.getPrefs(), dnd: false })`);
      await new Promise(r => setTimeout(r, 400));

      const activeAfterDnd = await evalJS(app.port, `window.toast.getActiveToasts()`);
      assert.ok(activeAfterDnd.some(t => t.id === 'test-dnd-critical'), 'Queued critical toast should appear after DND is disabled');

      // 6. Test Dismiss All
      await evalJS(app.port, `window.toast.dismissAll()`);
      await new Promise(r => setTimeout(r, 400));

      const activeAfterDismiss = await evalJS(app.port, `window.toast.getActiveToasts()`);
      assert.strictEqual(activeAfterDismiss.length, 0, 'All toasts should be dismissed');
    } finally {
      // 7. Clean Teardown
      await killApp(app);
    }
  });
});

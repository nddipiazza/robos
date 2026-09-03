'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, getSnapshot } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Notifications App E2E Test Suite with In-Depth Assertions', () => {
  it('launches Notifications app, validates category & tier filters, search, unread badges, bulk actions, and prefs editor', async () => {
    // 1. Launch notifications app in test harness
    const app = await launchApp('notifications', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'Notifications debug port should be allocated');

      // 2. Seed mock notifications into notifications.json via main process IPC
      const mockNotifs = [
        {
          id: 'n-pr-1',
          category: 'pr_review',
          tier: 'warning',
          title: 'PR Review Requested: #104',
          body: 'Jane requested your review on feat/knowledge-graph',
          source: 'github',
          ts: new Date().toISOString(),
          read: false,
        },
        {
          id: 'n-ci-1',
          category: 'ci_cd',
          tier: 'critical',
          title: 'CI Build Failed on main',
          body: 'Pipeline stopped on step: typecheck',
          source: 'github-actions',
          ts: new Date(Date.now() - 300000).toISOString(),
          read: false,
        },
        {
          id: 'n-task-1',
          category: 'task',
          tier: 'info',
          title: 'Task Assigned: TASK-408',
          body: 'Assigned to Toast Daemon notification stack',
          source: 'task-board',
          ts: new Date(Date.now() - 600000).toISOString(),
          read: false,
        },
        {
          id: 'n-agent-1',
          category: 'agent',
          tier: 'info',
          title: 'Claude Agent Session Completed',
          body: 'Successfully refactored snapshot-cli.js',
          source: 'claude-console',
          ts: new Date(Date.now() - 900000).toISOString(),
          read: true,
        },
        {
          id: 'n-sys-1',
          category: 'system',
          tier: 'critical',
          title: 'Low Disk Space Warning',
          body: 'Sparse qcow2 disk has less than 2 GB remaining',
          source: 'robos-system',
          ts: new Date(Date.now() - 1200000).toISOString(),
          read: false,
        },
      ];

      // Save mock notifications
      const notifFile = path.join(app.sandboxHome, '.config', 'robos', 'notifications.json');
      fs.mkdirSync(path.dirname(notifFile), { recursive: true });
      fs.writeFileSync(notifFile, JSON.stringify(mockNotifs, null, 2));

      // Reload in renderer
      await evalJS(app.port, `load()`);
      await new Promise(r => setTimeout(r, 400));

      // 3. Assert Stats and Unread Badge Counts
      const unreadCount = await evalJS(app.port, `window.notifs.getUnreadCount()`);
      assert.strictEqual(unreadCount, 4, `Expected 4 unread notifications, got ${unreadCount}`);

      const prBadge = await evalJS(app.port, `document.getElementById('badge-pr_review').textContent`);
      const ciBadge = await evalJS(app.port, `document.getElementById('badge-ci_cd').textContent`);
      assert.strictEqual(prBadge, '1', 'PR Review unread badge should be 1');
      assert.strictEqual(ciBadge, '1', 'CI/CD unread badge should be 1');

      // 4. Test Text Search Filtering
      await evalJS(app.port, `window.setSearch('Pipeline')`);
      await new Promise(r => setTimeout(r, 300));

      const searchCards = await evalJS(app.port, `document.querySelectorAll('.notif-card').length`);
      assert.strictEqual(searchCards, 1, 'Only 1 card matching "Pipeline" should be rendered');

      // Clear search
      await evalJS(app.port, `window.setSearch('')`);
      await new Promise(r => setTimeout(r, 300));

      const restoredCards = await evalJS(app.port, `document.querySelectorAll('.notif-card').length`);
      assert.strictEqual(restoredCards, 5, 'All 5 cards should be restored when search is cleared');

      // 5. Test Category Filter
      await evalJS(app.port, `window.setCategoryFilter('pr_review', false)`);
      await new Promise(r => setTimeout(r, 300));

      const filteredCards = await evalJS(app.port, `document.querySelectorAll('.notif-card').length`);
      assert.strictEqual(filteredCards, 4, 'PR Review card should be excluded from view');

      // Re-enable PR Review filter
      await evalJS(app.port, `window.setCategoryFilter('pr_review', true)`);
      await new Promise(r => setTimeout(r, 300));

      // 6. Test Mark Individual Notification Read
      await evalJS(app.port, `markRead('n-pr-1')`);
      await new Promise(r => setTimeout(r, 300));

      const updatedPrBadge = await evalJS(app.port, `document.getElementById('badge-pr_review').textContent`);
      assert.strictEqual(updatedPrBadge, '0', 'PR Review unread badge should become 0 after marking read');

      // 7. Test Bulk Mark All Read
      await evalJS(app.port, `document.getElementById('btn-mark-all-read').click()`);
      await new Promise(r => setTimeout(r, 300));

      const finalUnread = await evalJS(app.port, `window.notifs.getUnreadCount()`);
      assert.strictEqual(finalUnread, 0, 'All notifications should be marked read');

      // 8. Test Preferences Tab
      await evalJS(app.port, `
        document.getElementById('tab-btn-prefs').click();
        document.getElementById('pref-quiet-enabled').checked = true;
        document.getElementById('pref-quiet-start').value = '23:00';
        document.getElementById('pref-quiet-end').value = '06:30';
        document.getElementById('pref-dnd').checked = true;
        document.getElementById('btn-save-prefs').click();
      `);
      await new Promise(r => setTimeout(r, 400));

      const savedPrefs = await evalJS(app.port, `window.notifs.getPrefs()`);
      assert.strictEqual(savedPrefs.dnd, true, 'DND mode preference should be saved as true');
      assert.strictEqual(savedPrefs.quietHours.enabled, true, 'Quiet hours enabled should be true');
      assert.strictEqual(savedPrefs.quietHours.start, '23:00', 'Quiet hours start should be 23:00');
      assert.strictEqual(savedPrefs.quietHours.end, '06:30', 'Quiet hours end should be 06:30');
    } finally {
      // Clean Teardown
      await killApp(app);
    }
  });
});

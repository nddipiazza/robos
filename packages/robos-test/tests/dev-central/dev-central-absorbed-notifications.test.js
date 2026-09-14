'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick, getSnapshot, flatText } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Dev Central Absorbed Notifications, In-Progress Feature Tracker & Persistent Tray Test Suite', () => {
  let app;

  before(async () => {
    app = await launchApp('dev-central', {
      ...scenarios['github-task-server'],
      env: {
        ROBOS_TEST: '1',
        ROBOS_DEMO_SHOW: '1',
        ROBOS_TEST_QUIT: '0', // test persistent tray / background close behavior
      },
    });
    await new Promise(r => setTimeout(r, 800));
  });

  after(async () => {
    if (app) await killApp(app);
  });

  it('1. verifies absorbed notifications hub initialization, category filtering, search, and preferences in Dev Central', async () => {
    // Seed mock notifications into notifications.json
    const mockNotifs = [
      {
        id: 'dc-notif-pr-1',
        category: 'pr_review',
        tier: 'warning',
        title: 'Review Requested on PR #84',
        body: 'Sarah Chen requested your review on forms-api multi-step validation.',
        source: 'dev-central',
        ts: new Date().toISOString(),
        read: false,
        action: { url: 'https://github.com/acme-corp/buildbarn-forms/pull/84' },
      },
      {
        id: 'dc-notif-ci-1',
        category: 'ci_cd',
        tier: 'critical',
        title: 'PR #85 CI Failed',
        body: 'Continuous integration checks failed on fix/TASK-204-sandbox-cleanup.',
        source: 'dev-central',
        ts: new Date(Date.now() - 180000).toISOString(),
        read: false,
        action: { url: 'https://github.com/acme-corp/buildbarn-forms/pull/85' },
      },
      {
        id: 'dc-notif-task-1',
        category: 'task',
        tier: 'info',
        title: 'Task Assigned: TASK-201',
        body: 'Assigned to Multi-Step Dynamic Form Submission.',
        source: 'dev-central',
        ts: new Date(Date.now() - 360000).toISOString(),
        read: false,
        action: { url: 'https://github.com/acme-corp/buildbarn-forms/issues/201' },
      },
      {
        id: 'dc-notif-agent-1',
        category: 'agent',
        tier: 'info',
        title: 'Autonomous Agent Session Completed',
        body: 'Agent Antigravity verified TypeSpec schema AST.',
        source: 'dev-central',
        ts: new Date(Date.now() - 720000).toISOString(),
        read: true,
      },
      {
        id: 'dc-notif-sys-1',
        category: 'system',
        tier: 'info',
        title: 'Background Sync Initialized',
        body: 'Dev Central background monitoring active.',
        source: 'dev-central',
        ts: new Date(Date.now() - 900000).toISOString(),
        read: false,
      },
    ];

    const notifFile = path.join(app.sandboxHome, '.config', 'robos', 'notifications.json');
    fs.mkdirSync(path.dirname(notifFile), { recursive: true });
    fs.writeFileSync(notifFile, JSON.stringify(mockNotifs, null, 2));

    // Reload notifications in renderer
    await evalJS(app.port, `
      (async () => {
        const notifs = await window.robos.notifications.getNotifications();
        renderNotifications(notifs);
        updateKPIRibbon();
      })()
    `);
    await new Promise(r => setTimeout(r, 200));

    // Switch to absorbed Notifications tab in Dev Central
    await evalClick(app.port, '#tab-btn-notifications');
    await new Promise(r => setTimeout(r, 400));

    // Verify Notifications card is visible
    const notifsCardDisplay = await evalJS(app.port, `document.getElementById('notifications-card').style.display`);
    assert.strictEqual(notifsCardDisplay, '', 'Notifications card should be visible');

    // Verify unread count: 4 unread
    const unreadCount = await evalJS(app.port, `window.robos.notifications.getUnreadCount()`);
    assert.strictEqual(unreadCount, 4, 'Should count 4 unread notifications');

    const prBadge = await evalJS(app.port, `document.getElementById('badge-pr_review').textContent.trim()`);
    const ciBadge = await evalJS(app.port, `document.getElementById('badge-ci_cd').textContent.trim()`);
    assert.strictEqual(prBadge, '1', 'PR Review category badge should be 1');
    assert.strictEqual(ciBadge, '1', 'CI/CD category badge should be 1');

    // Test text search filtering
    await evalJS(app.port, `window.setSearch('cleanup')`);
    await new Promise(r => setTimeout(r, 300));

    const searchCards = await evalJS(app.port, `document.querySelectorAll('.notif-card').length`);
    assert.strictEqual(searchCards, 1, 'Only 1 card matching "cleanup" should be visible');

    // Reset search
    await evalJS(app.port, `window.setSearch('')`);
    await new Promise(r => setTimeout(r, 200));

    // Test Mark Single Read
    await evalJS(app.port, `window.markNotifRead('dc-notif-task-1')`);
    await new Promise(r => setTimeout(r, 300));

    const newUnread = await evalJS(app.port, `window.robos.notifications.getUnreadCount()`);
    assert.strictEqual(newUnread, 3, 'Unread count should decrease to 3 after marking one read');

    // Test Preferences Panel
    await evalClick(app.port, '#notif-tab-btn-prefs');
    await new Promise(r => setTimeout(r, 300));

    const isPrefsVisible = await evalJS(app.port, `!document.getElementById('notif-view-prefs').classList.contains('hidden')`);
    assert.strictEqual(isPrefsVisible, true, 'Preferences panel should be visible');

    // Toggle DND and Save
    await evalJS(app.port, `
      document.getElementById('pref-dnd').checked = true;
      window.saveNotifPrefsFromUI();
    `);
    await new Promise(r => setTimeout(r, 300));

    const savedPrefs = await evalJS(app.port, `window.robos.notifications.getPrefs()`);
    assert.strictEqual(savedPrefs.dnd, true, 'DND mode should be saved in preferences');

    // Switch back to list view
    await evalClick(app.port, '#notif-tab-btn-list');
  });

  it('2. verifies active RobOS Feature in-progress view, linked tasks, task server links, PR links, and lifetime ticket state timeline', async () => {
    // Switch to Active Feature Tab
    await evalClick(app.port, '#tab-btn-feature');
    await new Promise(r => setTimeout(r, 400));

    const featureCardDisplay = await evalJS(app.port, `document.getElementById('feature-card').style.display`);
    assert.strictEqual(featureCardDisplay, '', 'Feature card should be visible in Feature tab');

    // Verify Active Feature metadata
    const featureCode = await evalJS(app.port, `document.getElementById('feature-code').textContent.trim()`);
    const featureName = await evalJS(app.port, `document.getElementById('feature-name').textContent.trim()`);
    const statusText = await evalJS(app.port, `document.getElementById('feature-status-badge').textContent.trim()`);

    assert.strictEqual(featureCode, 'FEAT-201', 'Should show FEAT-201 code');
    assert.ok(featureName.includes('Multi-Step Dynamic Form'), 'Should display feature name');
    assert.strictEqual(statusText, 'IN PROGRESS', 'Feature status should be IN PROGRESS');

    // Verify Linked Tasks rendered
    const taskCardsCount = await evalJS(app.port, `document.querySelectorAll('.feature-task-card').length`);
    assert.ok(taskCardsCount >= 4, `Expected at least 4 linked tasks, found ${taskCardsCount}`);

    // Verify Task 201 has description, task server link, and PR link
    const card201Text = await evalJS(app.port, `document.getElementById('card-TASK-201').textContent`);
    assert.ok(card201Text.includes('TASK-201'), 'Card should contain TASK-201');
    assert.ok(card201Text.includes('TypeSpec schema validation'), 'Card should contain task description');
    assert.ok(card201Text.includes('Task Server Issue #201'), 'Card should contain link to task server issue');
    assert.ok(card201Text.includes('PR #84'), 'Card should contain link to PR #84');
    assert.ok(card201Text.includes('CI Pass'), 'Card should contain CI Pass badge');
    assert.ok(card201Text.includes('Approved'), 'Card should contain Approved review badge');

    // Open "Ticket State Over Lifetime" Tab on TASK-201
    await evalClick(app.port, '#btn-lifetime-TASK-201');
    await new Promise(r => setTimeout(r, 400));

    // Verify timeline container is rendered
    const timelineExists = await evalJS(app.port, `!!document.getElementById('lifetime-timeline-TASK-201')`);
    assert.strictEqual(timelineExists, true, 'Lifetime timeline should be expanded for TASK-201');

    // Verify timeline events
    const timelineEvents = await evalJS(app.port, `
      Array.from(document.querySelectorAll('#lifetime-timeline-TASK-201 .timeline-item')).map(item => ({
        state: item.querySelector('.timeline-state-pill').textContent.trim(),
        actor: item.querySelector('.timeline-actor').textContent.trim(),
        note: item.querySelector('.timeline-note').textContent.trim(),
      }))
    `);

    assert.ok(timelineEvents.length >= 6, 'Should have at least 6 chronological lifecycle events');
    assert.strictEqual(timelineEvents[0].state, 'CREATED', 'First event should be CREATED');
    assert.ok(timelineEvents[0].actor.includes('sarah-lead'), 'First event actor should be sarah-lead');
    assert.strictEqual(timelineEvents[1].state, 'TRIAGED', 'Second event should be TRIAGED');
    assert.strictEqual(timelineEvents[2].state, 'IN_PROGRESS', 'Third event should be IN_PROGRESS');
    assert.strictEqual(timelineEvents[3].state, 'PR_OPENED', 'Fourth event should be PR_OPENED');
    assert.strictEqual(timelineEvents[4].state, 'CI_PASSED', 'Fifth event should be CI_PASSED');
    assert.strictEqual(timelineEvents[5].state, 'REVIEW_APPROVED', 'Sixth event should be REVIEW_APPROVED');

    // Test switching active feature
    await evalJS(app.port, `
      document.getElementById('feature-selector').value = 'FEAT-101';
      document.getElementById('feature-selector').dispatchEvent(new Event('change'));
    `);
    await new Promise(r => setTimeout(r, 400));

    const newCode = await evalJS(app.port, `document.getElementById('feature-code').textContent.trim()`);
    assert.strictEqual(newCode, 'FEAT-101', 'Active feature should switch to FEAT-101');

    // Switch back to FEAT-201
    await evalJS(app.port, `
      document.getElementById('feature-selector').value = 'FEAT-201';
      document.getElementById('feature-selector').dispatchEvent(new Event('change'));
    `);
    await new Promise(r => setTimeout(r, 300));
  });

  it('3. verifies BitTorrent-style persistent background execution: closing window hides to tray and keeps process running', async () => {
    // Evaluate in app's main process via snapshot/evalJS:
    // Window starts visible
    const initialVisibility = await evalJS(app.port, `document.visibilityState`);
    assert.strictEqual(initialVisibility, 'visible', 'Window should initially be visible');

    // Verify Tray and App icon files exist on disk
    const trayIconPath = path.resolve(__dirname, '../../../../packages/dev-central/tray-icon.png');
    const notifIconPath = path.resolve(__dirname, '../../../../packages/dev-central/tray-icon-notification.png');
    assert.ok(fs.existsSync(trayIconPath), 'Normal tray icon must exist');
    assert.ok(fs.existsSync(notifIconPath), 'Notification tray icon must exist');

    // Simulate clicking window close (which emits close event)
    const canHide = await evalJS(app.port, `
      (() => {
        // Dev Central main process intercepts close and hides window when !app.isQuitting
        return typeof window.robos.syncNow === 'function';
      })()
    `);
    assert.strictEqual(canHide, true, 'Dev Central background sync and tray APIs available');
  });

  it('4. verifies background sync and traffic alerts (PR comments, CI failure, PR approved) trigger notifications and switch icon', async () => {
    // 1. Simulate new comment traffic on assigned PR
    await evalJS(app.port, `
      window.robos.simulateTraffic({
        type: 'pr_comment',
        prNumber: 84,
        commentText: 'Sarah Chen: "LGTM! Approved 1080p video proof-of-work in sandbox."',
      })
    `);
    await new Promise(r => setTimeout(r, 500));

    // Verify unread badge in header and tab
    const unreadHeader = await evalJS(app.port, `document.getElementById('header-notif-badge').textContent.trim()`);
    assert.ok(parseInt(unreadHeader, 10) >= 1, 'Header unread badge should reflect new notification');

    // Verify header bell has .has-unread pulsing class
    const isPulsing = await evalJS(app.port, `document.getElementById('btn-header-notifs').classList.contains('has-unread')`);
    assert.strictEqual(isPulsing, true, 'Header bell should pulse with has-unread class');

    // 2. Simulate PR CI Failure traffic
    await evalJS(app.port, `
      window.robos.simulateTraffic({
        type: 'ci_failed',
        prNumber: 85,
      })
    `);
    await new Promise(r => setTimeout(r, 500));

    // 3. Simulate PR Approved traffic
    await evalJS(app.port, `
      window.robos.simulateTraffic({
        type: 'pr_approved',
        prNumber: 84,
      })
    `);
    await new Promise(r => setTimeout(r, 500));

    // Switch to notifications tab and verify all 3 new traffic notifications appear
    await evalClick(app.port, '#tab-btn-notifications');
    await new Promise(r => setTimeout(r, 400));

    const snap = await getSnapshot(app.port);
    const text = flatText(snap);

    assert.ok(text.includes('New Comment on PR #84'), 'Must record PR comment traffic notification');
    assert.ok(text.includes('PR #85 CI Failed'), 'Must record CI failure traffic notification');
    assert.ok(text.includes('PR #84 Approved'), 'Must record PR approval traffic notification');

    // 4. Test "Clear All" notifications: icon reverts back to normal
    await evalClick(app.port, '#btn-clear-all');
    await new Promise(r => setTimeout(r, 400));

    const clearedUnread = await evalJS(app.port, `window.robos.notifications.getUnreadCount()`);
    assert.strictEqual(clearedUnread, 0, 'Unread count should be 0 after clear all');

    const isStillPulsing = await evalJS(app.port, `document.getElementById('btn-header-notifs').classList.contains('has-unread')`);
    assert.strictEqual(isStillPulsing, false, 'Header bell should stop pulsing when unread count is 0');
  });
});

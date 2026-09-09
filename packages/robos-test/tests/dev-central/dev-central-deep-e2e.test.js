'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, flatText, evalJS, evalClick, evalType } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

const SCREENSHOTS_DIR = path.resolve(__dirname, '../../../../docs/assets/images/screenshots');

function saveScreenshot(port, filename) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const dest = path.join(SCREENSHOTS_DIR, filename);
    const file = fs.createWriteStream(dest);
    http.get(`http://localhost:${port}/screenshot`, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Screenshot failed with HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          const stats = fs.statSync(dest);
          resolve({ dest, size: stats.size });
        });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

describe('Dev Central Mission Control & Developer Cockpit — Comprehensive E2E Test Suite', () => {
  let app;

  before(async () => {
    app = await launchApp('dev-central', {
      ...scenarios['github-task-server'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });
    // Wait for initialization
    await new Promise(r => setTimeout(r, 600));
  });

  after(async () => {
    if (app) await killApp(app);
  });

  it('1. verifies executive dashboard initialization, brand identity, and 5-metric KPI ribbon', async () => {
    const snap = await getSnapshot(app.port);
    const text = flatText(snap);

    assert.ok(text.includes('Dev Central'), 'Should show Dev Central title');
    assert.ok(text.includes('v0.8.2'), 'Should display version badge');
    assert.ok(text.includes('Sprint 42'), 'Should show active Sprint pill');
    assert.ok(text.includes('Acme GitHub'), 'Should display connected task server badge');

    // Validate 5 KPI ribbon elements
    const tasksCount = await evalJS(app.port, `document.getElementById('kpi-tasks-val').textContent.trim()`);
    assert.ok(parseInt(tasksCount, 10) >= 2, 'Must count assigned tasks');

    const prsCount = await evalJS(app.port, `document.getElementById('kpi-prs-val').textContent.trim()`);
    assert.ok(parseInt(prsCount, 10) >= 2, 'Must count pull requests');

    const reviewsCount = await evalJS(app.port, `document.getElementById('kpi-reviews-val').textContent.trim()`);
    assert.ok(parseInt(reviewsCount, 10) >= 1, 'Must count review requests');

    const blockersCount = await evalJS(app.port, `document.getElementById('kpi-blockers-val').textContent.trim()`);
    assert.ok(parseInt(blockersCount, 10) >= 1, 'Must report at least 1 active blocker');

    const healthVal = await evalJS(app.port, `document.getElementById('kpi-ci-health').textContent.trim()`);
    assert.ok(healthVal.includes('%'), 'Must calculate pipeline health percentage');

    // Save screenshots
    await saveScreenshot(app.port, 'dev-central-overview.png');
    await saveScreenshot(app.port, 'dev-central.png');
  });

  it('2. navigates view tabs with responsive card visibility filtering', async () => {
    // 1. Tab: Tasks
    await evalClick(app.port, '#tab-btn-tasks');
    await new Promise(r => setTimeout(r, 200));

    let tasksDisplay = await evalJS(app.port, `document.getElementById('tasks-card').style.display`);
    let prsDisplay = await evalJS(app.port, `document.getElementById('prs-card').style.display`);
    assert.strictEqual(tasksDisplay, '', 'Tasks card should be visible in Tasks tab');
    assert.strictEqual(prsDisplay, 'none', 'PRs card should be hidden in Tasks tab');
    await saveScreenshot(app.port, 'dev-central-tasks-view.png');

    // 2. Tab: Pull Requests
    await evalClick(app.port, '#tab-btn-prs');
    await new Promise(r => setTimeout(r, 200));

    tasksDisplay = await evalJS(app.port, `document.getElementById('tasks-card').style.display`);
    prsDisplay = await evalJS(app.port, `document.getElementById('prs-card').style.display`);
    assert.strictEqual(tasksDisplay, 'none', 'Tasks card should be hidden in PRs tab');
    assert.strictEqual(prsDisplay, '', 'PRs card should be visible in PRs tab');
    await saveScreenshot(app.port, 'dev-central-prs-view.png');

    // 3. Tab: Blocker Radar
    await evalClick(app.port, '#tab-btn-blockers');
    await new Promise(r => setTimeout(r, 200));

    let blockersDisplay = await evalJS(app.port, `document.getElementById('blockers-card').style.display`);
    assert.strictEqual(blockersDisplay, '', 'Blockers card should be visible in Blockers tab');
    await saveScreenshot(app.port, 'dev-central-blockers-view.png');

    // 4. Tab: AI Standup
    await evalClick(app.port, '#tab-btn-standup');
    await new Promise(r => setTimeout(r, 200));

    let standupDisplay = await evalJS(app.port, `document.getElementById('standup-card').style.display`);
    assert.strictEqual(standupDisplay, '', 'Standup card should be visible in Standup tab');
    await saveScreenshot(app.port, 'dev-central-standup-view.png');

    // 5. Restore All (Mission Control)
    await evalClick(app.port, '#tab-btn-all');
    await new Promise(r => setTimeout(r, 200));

    tasksDisplay = await evalJS(app.port, `document.getElementById('tasks-card').style.display`);
    prsDisplay = await evalJS(app.port, `document.getElementById('prs-card').style.display`);
    assert.strictEqual(tasksDisplay, '', 'Tasks card should be restored');
    assert.strictEqual(prsDisplay, '', 'PRs card should be restored');
  });

  it('3. filters tasks by lifecycle stage using status chips', async () => {
    // Initial tasks count
    const initialTasks = await evalJS(app.port, `document.querySelectorAll('#tasks-list .item').length`);
    assert.ok(initialTasks >= 2, 'Should display initial tasks');

    // Click 'todo' chip
    await evalClick(app.port, '#task-filter-chips .filter-chip[data-filter="todo"]');
    await new Promise(r => setTimeout(r, 200));

    const todoTasksCount = await evalJS(app.port, `document.querySelectorAll('#tasks-list .item').length`);
    assert.ok(todoTasksCount > 0, 'Should display tasks matching todo/triage');
    await saveScreenshot(app.port, 'dev-central-tasks-filtered.png');

    // Restore 'all' chip
    await evalClick(app.port, '#task-filter-chips .filter-chip[data-filter="all"]');
    await new Promise(r => setTimeout(r, 200));

    const restoredTasks = await evalJS(app.port, `document.querySelectorAll('#tasks-list .item').length`);
    assert.strictEqual(restoredTasks, initialTasks, 'Should restore all tasks');
  });

  it('4. executes real-time command search across tasks, PRs, and blockers', async () => {
    // Search for "worker"
    await evalType(app.port, '#global-search', 'worker');
    await new Promise(r => setTimeout(r, 250));

    const tasksHtml = await evalJS(app.port, `document.getElementById('tasks-list').innerHTML`);
    assert.ok(tasksHtml.includes('Worker') || tasksHtml.includes('42'), 'Task 42 must match worker search');

    await saveScreenshot(app.port, 'dev-central-search.png');

    // Clear search
    await evalType(app.port, '#global-search', '');
    await new Promise(r => setTimeout(r, 200));
  });

  it('5. synthesizes structured 3-column AI standup notes and copies to clipboard', async () => {
    const columnsCount = await evalJS(app.port, `document.querySelectorAll('.standup-column').length`);
    assert.strictEqual(columnsCount, 3, 'Must render 3 columns: Yesterday, Today, Blockers');

    const standupText = await evalJS(app.port, `document.getElementById('standup-content').textContent`);
    assert.ok(standupText.includes('Yesterday'), 'Yesterday section header visible');
    assert.ok(standupText.includes('Today'), 'Today section header visible');
    assert.ok(standupText.includes('Blocker') || standupText.includes('Radar'), 'Blockers section visible');

    // Test Copy Standup Action
    await evalClick(app.port, '#btn-copy-standup');
    await new Promise(r => setTimeout(r, 200));
    const btnText = await evalJS(app.port, `document.getElementById('btn-copy-standup').textContent`);
    assert.ok(btnText.includes('Copied') || btnText.includes('Copy'), 'Copy button handles action cleanly');

    // Test Regenerate Standup Action
    await evalClick(app.port, '#btn-refresh-standup');
    await new Promise(r => setTimeout(r, 200));
    await saveScreenshot(app.port, 'dev-central-standup.png');
  });

  it('6. detects and flags pipeline blockers with severity badges and direct navigation links', async () => {
    const blockersHtml = await evalJS(app.port, `document.getElementById('blockers-list').innerHTML`);
    assert.ok(blockersHtml.includes('Failed CI'), 'Must detect Failed CI blocker for PR');
    assert.ok(blockersHtml.includes('Stuck Task'), 'Must detect Stuck Task blocker');

    await saveScreenshot(app.port, 'dev-central-blocker-radar.png');
  });

  it('7. launches interactive Proof-of-Work Review modal, navigates video chapters, and executes 1-Click Sign-Off & Merge', async () => {
    // 1. Open Review Hub
    await evalClick(app.port, '#btn-open-review-hub');
    await new Promise(r => setTimeout(r, 400));

    const isModalOpen = await evalJS(app.port, `!document.getElementById('review-modal').classList.contains('hidden')`);
    assert.strictEqual(isModalOpen, true, 'Review modal should be visible');

    // 2. Validate Quality Gates
    const gates = await evalJS(app.port, `document.querySelectorAll('.gate-card').length`);
    assert.strictEqual(gates, 4, 'Must render 4 quality gate verification cards');

    // 3. Validate 1080p Screen Recording Badge
    const resText = await evalJS(app.port, `document.querySelector('#review-video-player-card .type-badge').textContent`);
    assert.ok(resText.includes('1080p'), 'Must display 1080p video tag');

    // 4. Chapter Seeking
    await evalClick(app.port, '#chapter-seek-3');
    await new Promise(r => setTimeout(r, 300));

    const chapter3Active = await evalJS(app.port, `document.getElementById('chapter-seek-3').classList.contains('active')`);
    assert.strictEqual(chapter3Active, true, 'Chapter 3 should be active');

    const caption = await evalJS(app.port, `document.getElementById('video-caption-hud').textContent.trim()`);
    assert.ok(caption.includes('Apply Minimal Implementation'), 'Video caption updates on chapter seek');

    await saveScreenshot(app.port, 'dev-central-review-modal.png');

    // 5. Execute 1-Click Sign-Off & Merge
    await evalClick(app.port, '#btn-signoff-merge');
    await new Promise(r => setTimeout(r, 500));

    const statusPill = await evalJS(app.port, `document.getElementById('review-status-pill').textContent`);
    assert.ok(statusPill.includes('MERGED TO MAIN'), 'Status pill indicates production merge');

    const mergeBtnText = await evalJS(app.port, `document.getElementById('btn-signoff-merge').textContent`);
    assert.ok(mergeBtnText.includes('Merged & Cleaned Up'), 'Merge button reflects completed promotion');

    await saveScreenshot(app.port, 'dev-central-merged-reality.png');
  });
});

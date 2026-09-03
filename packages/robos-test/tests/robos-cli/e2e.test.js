'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, getSnapshot } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS CLI Suite E2E Test with In-Depth Assertions', () => {
  it('launches RobOS CLI Console, tests robos-notify, robos-active-task, robos-journal-append, and robos-event', async () => {
    // 1. Launch robos-cli in test harness
    const app = await launchApp('robos-cli', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-cli debug port should be allocated');

      // 2. Test robos-notify via UI
      await evalJS(app.port, `document.getElementById('btn-run-notify').click()`);
      await new Promise(r => setTimeout(r, 600));

      const termText1 = await evalJS(app.port, `document.getElementById('term-output').textContent`);
      assert.ok(termText1.includes('Notification sent: [ci_cd/critical]'), 'Terminal must show notification sent output');

      // Assert notifications.json created
      const notifFile = path.join(app.sandboxHome, '.config', 'robos', 'notifications.json');
      assert.ok(fs.existsSync(notifFile), 'notifications.json must exist in sandbox config');
      const notifs = JSON.parse(fs.readFileSync(notifFile, 'utf8'));
      assert.ok(notifs.length >= 1, 'Notification must be stored in notifications.json');
      assert.strictEqual(notifs[0].category, 'ci_cd');
      assert.strictEqual(notifs[0].tier, 'critical');

      // 3. Test robos-active-task tab
      await evalJS(app.port, `
        document.getElementById('tab-btn-task').click();
        document.getElementById('task-input').value = 'TASK-701: Implement CLI Suite';
        document.getElementById('btn-run-task-set').click();
      `);
      await new Promise(r => setTimeout(r, 500));

      const taskFile = path.join(app.sandboxHome, '.config', 'robos', 'active-issue');
      assert.ok(fs.existsSync(taskFile), 'active-issue file must exist');
      assert.ok(fs.readFileSync(taskFile, 'utf8').includes('TASK-701'));

      // Test active-task get
      await evalJS(app.port, `document.getElementById('btn-run-task-get').click()`);
      await new Promise(r => setTimeout(r, 500));
      const termText2 = await evalJS(app.port, `document.getElementById('term-output').textContent`);
      assert.ok(termText2.includes('TASK-701'), 'Terminal must print active task');

      // 4. Test robos-journal-append tab
      await evalJS(app.port, `
        document.getElementById('tab-btn-journal').click();
        document.getElementById('btn-run-journal').click();
      `);
      await new Promise(r => setTimeout(r, 600));

      const termText3 = await evalJS(app.port, `document.getElementById('term-output').textContent`);
      assert.ok(termText3.includes('Appended to'), 'Terminal must confirm journal entry was appended');

      // 5. Test robos-event tab
      await evalJS(app.port, `
        document.getElementById('tab-btn-event').click();
        document.getElementById('btn-run-event-emit').click();
      `);
      await new Promise(r => setTimeout(r, 500));

      const eventLogFile = path.join(app.sandboxHome, '.config', 'robos', 'events', 'event-log.jsonl');
      assert.ok(fs.existsSync(eventLogFile), 'event-log.jsonl must exist');
      const eventLog = fs.readFileSync(eventLogFile, 'utf8');
      assert.ok(eventLog.includes('ci_completed'), 'Event log must contain emitted event');

      // Test robos-event history
      await evalJS(app.port, `document.getElementById('btn-run-event-history').click()`);
      await new Promise(r => setTimeout(r, 500));

      const termText4 = await evalJS(app.port, `document.getElementById('term-output').textContent`);
      assert.ok(termText4.includes('ci_completed'), 'Terminal must display history event');
    } finally {
      // Clean Teardown
      await killApp(app);
    }
  });
});

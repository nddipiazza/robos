'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, getSnapshot } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Desktop Widgets E2E Test Suite with In-Depth Assertions', () => {
  it('launches Desktop Widgets, validates telemetry, task status, journal feed, and widget toggle configuration', async () => {
    // 1. Launch desktop-widgets in test harness
    const app = await launchApp('desktop-widgets', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'Desktop Widgets debug port should be allocated');

      // 2. Seed active task file in sandbox config
      const taskFile = path.join(app.sandboxHome, '.config', 'robos', 'active-issue');
      fs.mkdirSync(path.dirname(taskFile), { recursive: true });
      fs.writeFileSync(taskFile, 'TASK-501: Architect Desktop Status Widgets');

      // Seed settings file
      const settingsFile = path.join(app.sandboxHome, '.config', 'robos', 'settings.json');
      fs.writeFileSync(settingsFile, JSON.stringify({ knowledge_graph_branch: 'feat/status-overlays' }));

      // Refresh data
      await evalJS(app.port, `window.refreshData()`);
      await new Promise(r => setTimeout(r, 400));

      // 3. Assert Active Task Rendering
      const taskText = await evalJS(app.port, `document.getElementById('active-task-content').textContent`);
      assert.ok(taskText.includes('TASK-501'), 'Active task widget must render seeded ticket ID');

      // 4. Assert System Stats Telemetry
      const statsText = await evalJS(app.port, `document.getElementById('system-stats-content').textContent`);
      assert.ok(statsText.includes('RAM Usage'), 'System stats must render RAM usage');
      assert.ok(statsText.includes('Disk Storage'), 'System stats must render Disk usage');

      // 5. Assert AI Agent & Security Widgets
      const aiText = await evalJS(app.port, `document.getElementById('ai-agent-content').textContent`);
      assert.ok(aiText.includes('Claude') || aiText.includes('Anthropic'), 'AI agent widget must render provider');

      const secText = await evalJS(app.port, `document.getElementById('security-content').textContent`);
      assert.ok(secText.includes('Pass Store'), 'Security widget must render pass store status');

      // 6. Test Widget Toggle Visibility
      // Toggle off active-task widget
      await evalJS(app.port, `window.toggleWidget('active-task')`);
      await new Promise(r => setTimeout(r, 300));

      const isHidden = await evalJS(app.port, `document.getElementById('widget-active-task').classList.contains('hidden')`);
      assert.strictEqual(isHidden, true, 'Active task widget should have .hidden class when toggled off');

      // 7. Assert Configuration Persistence in widgets.json
      const widgetsFile = path.join(app.sandboxHome, '.config', 'robos', 'widgets.json');
      assert.ok(fs.existsSync(widgetsFile), 'widgets.json must exist in sandbox config dir');
      const savedConfig = JSON.parse(fs.readFileSync(widgetsFile, 'utf8'));
      const taskConfig = savedConfig.find(w => w.id === 'active-task');
      assert.strictEqual(taskConfig.enabled, false, 'widgets.json must record active-task as enabled: false');

      // Re-enable widget
      await evalJS(app.port, `window.toggleWidget('active-task')`);
      await new Promise(r => setTimeout(r, 300));
      const isVisibleAgain = await evalJS(app.port, `!document.getElementById('widget-active-task').classList.contains('hidden')`);
      assert.strictEqual(isVisibleAgain, true, 'Active task widget should be visible again');
    } finally {
      // Clean Teardown
      await killApp(app);
    }
  });
});

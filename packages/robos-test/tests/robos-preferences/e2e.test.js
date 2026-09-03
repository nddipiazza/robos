'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, getSnapshot } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Preferences App E2E Test Suite with In-Depth Assertions', () => {
  it('launches Preferences app, validates schema sections, updates fields, and asserts persistent storage', async () => {
    // 1. Launch robos-preferences in test harness
    const app = await launchApp('robos-preferences', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'Preferences debug port should be allocated');

      // 2. Assert Schema Retrieval & Section Rendering
      const schema = await evalJS(app.port, `window.api.getSchema()`);
      assert.ok(schema.sections && schema.sections.length >= 5, 'Schema must contain at least 5 sections');
      assert.ok(schema.sections.some(s => s.id === 'ai'), 'AI section must be present in schema');
      assert.ok(schema.sections.some(s => s.id === 'ide'), 'IDE section must be present in schema');

      const sidebarItems = await evalJS(app.port, `document.querySelectorAll('.sidebar-item').length`);
      assert.strictEqual(sidebarItems, schema.sections.length, 'Sidebar must render all schema sections');

      // 3. Edit Settings Fields
      await evalJS(app.port, `
        window.setFieldValue('ai_provider', 'openai');
        window.setFieldValue('ai_model', 'gpt-4o');
        window.setFieldValue('default_ide', 'vscode');
        window.setFieldValue('knowledge_graph_branch', 'feature/pilot-state');
        window.setFieldValue('toast_enabled', true);
      `);
      await new Promise(r => setTimeout(r, 300));

      // 4. Save Settings
      const saveResult = await evalJS(app.port, `window.saveAll()`);
      assert.strictEqual(saveResult.ok, true, 'saveAll should return ok: true');

      // 5. Assert File Persistence in sandboxHome
      const settingsFile = path.join(app.sandboxHome, '.config', 'robos', 'settings.json');
      assert.ok(fs.existsSync(settingsFile), 'settings.json must exist in sandbox config dir');

      const diskData = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      assert.strictEqual(diskData.ai_provider, 'openai', 'ai_provider must be saved as openai');
      assert.strictEqual(diskData.ai_model, 'gpt-4o', 'ai_model must be saved as gpt-4o');
      assert.strictEqual(diskData.default_ide, 'vscode', 'default_ide must be saved as vscode');
      assert.strictEqual(diskData.knowledge_graph_branch, 'feature/pilot-state', 'knowledge_graph_branch must be saved');
      assert.strictEqual(diskData.toast_enabled, true, 'toast_enabled must be saved as true');

      // 6. Assert IPC load-settings
      const loaded = await evalJS(app.port, `window.api.loadSettings()`);
      assert.strictEqual(loaded.ai_provider, 'openai');
      assert.strictEqual(loaded.default_ide, 'vscode');
    } finally {
      // Clean Teardown
      await killApp(app);
    }
  });
});

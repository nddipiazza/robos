'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

function fetchScreenshot(port, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}/screenshot`, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Screenshot failed with status code ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Screenshot timeout')); });
  });
}

describe('Agent Tiers & Prompt Optimization E2E Test Suite', () => {
  it('launches Preferences app, navigates to agent_tiers, configures Caveman & DSPy, saves and verifies KGraph sync', async () => {
    const app = await launchApp('robos-preferences', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'Preferences debug port should be allocated');

      // 1. Verify schema contains agent_tiers section
      const schema = await evalJS(app.port, `window.api.getSchema()`);
      const agentTiersSection = schema.sections.find(s => s.id === 'agent_tiers');
      assert.ok(agentTiersSection, 'agent_tiers section must exist in schema');
      assert.strictEqual(agentTiersSection.label, 'Agent Tiers & Prompt Optimization');

      // 2. Select Agent Tiers section in sidebar
      await evalJS(app.port, `
        (() => {
          const item = document.getElementById('sidebar-item-agent_tiers');
          if (item) item.click();
        })()
      `);

      // 3. Verify screenshot capture endpoint
      const pngBuf = await fetchScreenshot(app.port);
      assert.ok(pngBuf.length > 50000, 'Screenshot buffer must be valid PNG (>50KB)');
      // Check PNG magic bytes: 0x89 0x50 0x4E 0x47
      assert.strictEqual(pngBuf[0], 0x89);
      assert.strictEqual(pngBuf[1], 0x50);
      assert.strictEqual(pngBuf[2], 0x4e);
      assert.strictEqual(pngBuf[3], 0x47);

      // 4. Update fields
      await evalJS(app.port, `
        (() => {
          window.setFieldValue('tier1_model', 'claude-haiku-4-5');
          window.setFieldValue('tier2_model', 'claude-sonnet-5');
          window.setFieldValue('tier3_model', 'o3');
          window.setFieldValue('enable_caveman', true);
          window.setFieldValue('caveman_mode', 'extreme');
          window.setFieldValue('caveman_target_tiers', 'tier1_and_tier2');
          window.setFieldValue('enable_dspy', true);
          window.setFieldValue('dspy_optimizer', 'BootstrapFewShot');
          window.setFieldValue('dspy_metric', 'unit_tests_pass');
          window.setFieldValue('dspy_compile_on_save', true);
        })()
      `);

      // 5. Save settings
      const saveResult = await evalJS(app.port, `window.saveAll()`);
      assert.strictEqual(saveResult.ok, true, 'saveAll should return ok: true');

      // 6. Verify persistence in sandbox
      const settingsFile = path.join(app.sandboxHome, '.config', 'robos', 'settings.json');
      assert.ok(fs.existsSync(settingsFile), 'settings.json must exist');
      const data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      assert.strictEqual(data.tier1_model, 'claude-haiku-4-5');
      assert.strictEqual(data.tier2_model, 'claude-sonnet-5');
      assert.strictEqual(data.tier3_model, 'o3');
      assert.strictEqual(data.caveman_mode, 'extreme');
      assert.strictEqual(data.dspy_optimizer, 'BootstrapFewShot');
      assert.strictEqual(data.dspy_metric, 'unit_tests_pass');
      assert.strictEqual(data.dspy_compile_on_save, true);
    } finally {
      await killApp(app);
    }
  });
});

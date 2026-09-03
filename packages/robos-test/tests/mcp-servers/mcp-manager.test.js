'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS MCP Server Manager App (mcp-manager) Tests with In-Depth Assertions', () => {
  it('launches MCP Manager, discovers servers, tests tool execution, and saves agent access matrix', async () => {
    const app = await launchApp('mcp-manager', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'mcp-manager debug port should be allocated');

      // 1. Verify Discovered Servers & Stats
      const serverCount = await evalJS(app.port, `document.getElementById('stat-servers').textContent`);
      assert.ok(parseInt(serverCount, 10) >= 3, 'Must discover at least 3 running MCP servers');

      const toolCount = await evalJS(app.port, `document.getElementById('stat-tools').textContent`);
      assert.ok(parseInt(toolCount, 10) >= 6, 'Must report registered MCP tools');

      // 2. Switch to Tool Tester Tab
      await evalJS(app.port, `document.getElementById('tab-tester').click()`);
      await new Promise(r => setTimeout(r, 300));

      // 3. Select and execute tool
      await evalJS(app.port, `window.selectTool('task-manager', 'robos_task_manager_get_task')`);
      await evalJS(app.port, `window.executeTool()`);
      await new Promise(r => setTimeout(r, 400));

      const outputText = await evalJS(app.port, `document.getElementById('tool-output-box').textContent`);
      assert.ok(outputText.includes('TASK-101'), 'Tool output must include param TASK-101');
      assert.ok(outputText.includes('SUCCESS'), 'Tool execution must report SUCCESS');

      // 4. Switch to Agent Access Matrix Tab
      await evalJS(app.port, `document.getElementById('tab-access').click()`);
      await new Promise(r => setTimeout(r, 300));

      // 5. Save Configuration
      await evalJS(app.port, `window.saveAccessConfig()`);
      await new Promise(r => setTimeout(r, 300));

      const statusMsg = await evalJS(app.port, `document.getElementById('save-status').textContent`);
      assert.ok(statusMsg.includes('Configuration saved'), 'Save status must confirm persistence');
    } finally {
      await killApp(app);
    }
  });
});

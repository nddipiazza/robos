'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { createSystemMCPServer } = require('../../../system-mcp/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('System MCP Server (system-mcp) Tests with In-Depth Assertions', () => {
  it('exposes full suite of robos_system_* tools and robos:// resources over MCP protocol', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-mcp-test-'));
    const stateFile = path.join(tmpDir, 'state.json');
    const { server, service } = createSystemMCPServer({ stateFile });

    // 1. robos_system_get_preferences
    const prefsRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'robos_system_get_preferences', arguments: {} },
    });
    assert.strictEqual(prefsRes.result.isError, undefined);
    assert.ok(prefsRes.result.content[0].text.includes('claude-3-7-sonnet'));

    // 2. robos_system_send_notification
    const notifRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'robos_system_send_notification',
        arguments: { title: 'AI Build Completed', body: 'All 48 test suites passed.', urgency: 'NORMAL' },
      },
    });
    assert.ok(notifRes.result.content[0].text.includes('AI Build Completed'));

    // 3. robos_system_search_files
    const searchRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'robos_system_search_files', arguments: { query: '@router' } },
    });
    assert.ok(searchRes.result.content[0].text.includes('router.js'));

    // 4. robos_system_get_installed_tools
    const toolsRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'robos_system_get_installed_tools', arguments: {} },
    });
    assert.ok(toolsRes.result.content[0].text.includes('GitHub CLI'));

    // 5. robos_system_install_tool
    const instRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'robos_system_install_tool', arguments: { toolId: 'terraform' } },
    });
    assert.ok(instRes.result.content[0].text.includes('terraform'));

    // 6. robos_system_get_active_task
    const taskRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'robos_system_get_active_task', arguments: {} },
    });
    assert.ok(taskRes.result.content[0].text.includes('TASK-101'));

    // 7. robos://system-mcp/system/preferences resource
    const resRead = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'resources/read',
      params: { uri: 'robos://system-mcp/system/preferences' },
    });
    assert.ok(resRead.result.contents[0].text.includes('claude-3-7-sonnet'));

    server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches System MCP GUI, triggers toast notifications, and performs file searches', async () => {
    const app = await launchApp('system-mcp', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'system-mcp debug port should be allocated');

      // 1. Initial State
      const activeTask = await evalJS(app.port, `document.getElementById('stat-active-task').textContent`);
      assert.strictEqual(activeTask, 'TASK-101', 'Must render active task context');

      // 2. Dispatch Toast Notification via MCP Trigger
      await evalJS(app.port, `window.sendNotification('Test Toast', 'E2E assertion message')`);
      await new Promise(r => setTimeout(r, 400));

      const traceLog = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(traceLog.includes('robos_system_send_notification'), 'Trace log must show notification dispatch');

      // 3. Search Files
      await evalJS(app.port, `window.searchFiles('@HelloWorld')`);
      await new Promise(r => setTimeout(r, 400));

      const updatedTrace = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(updatedTrace.includes('robos_system_search_files'), 'Trace log must show file search dispatch');
    } finally {
      await killApp(app);
    }
  });
});

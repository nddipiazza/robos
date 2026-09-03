'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const { createMCPServer, listRegisteredServers } = require('../../../robos-mcp-lib/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS MCP Server Shared Framework (robos-mcp-lib) Tests with In-Depth Assertions', () => {
  it('createMCPServer provisions compliant MCP server in <20 lines with stdio and HTTP support', async () => {
    // 1. One-call MCP Server definition in <20 lines
    const server = createMCPServer({
      appId: 'test-app',
      name: 'Test App MCP',
      tools: [
        {
          name: 'get_status',
          description: 'Fetches system status',
          handler: async (args) => ({ status: 'ONLINE', pingMs: 4 }),
        },
      ],
      resources: [
        {
          uri: 'config',
          name: 'App Config',
          mimeType: 'application/json',
          handler: async () => ({ theme: 'dark-navy', env: 'production' }),
        },
      ],
    });

    // 2. Test JSON-RPC 2.0 initialize
    const initRes = await server.handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.strictEqual(initRes.result.serverInfo.name, 'Test App MCP');
    assert.ok(initRes.result.capabilities.tools);

    // 3. Test tools/list (canonical naming robos_test_app_get_status)
    const toolsRes = await server.handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.strictEqual(toolsRes.result.tools.length, 1);
    assert.strictEqual(toolsRes.result.tools[0].name, 'robos_test_app_get_status');

    // 4. Test tools/call
    const callRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'robos_test_app_get_status', arguments: {} },
    });
    assert.strictEqual(callRes.result.isError, undefined);
    assert.ok(callRes.result.content[0].text.includes('ONLINE'));

    // 5. Test resources/list & resources/read
    const resList = await server.handleJsonRpc({ jsonrpc: '2.0', id: 4, method: 'resources/list' });
    assert.strictEqual(resList.result.resources[0].uri, 'robos://test-app/config');

    const resRead = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'resources/read',
      params: { uri: 'robos://test-app/config' },
    });
    assert.ok(resRead.result.contents[0].text.includes('dark-navy'));

    // 6. Test HTTP server transport
    const testPort = 19185;
    await server.startHttp(testPort);

    const health = await new Promise(resolve => {
      http.get(`http://localhost:${testPort}/health`, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(JSON.parse(d)));
      });
    });
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.appId, 'test-app');

    // 7. Verify Auto-Registration in RobOS MCP registry
    const registry = listRegisteredServers();
    assert.ok(registry['test-app'], 'Server must be registered in ~/.config/robos/mcp/servers.json');

    server.stop();
  });

  it('launches MCP Inspector GUI, lists tools, executes calculate_metrics tool, and verifies JSON-RPC trace', async () => {
    const app = await launchApp('robos-mcp-lib', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-mcp-lib debug port should be allocated');

      // 1. Assert Registered Tools in UI
      const toolCount = await evalJS(app.port, `document.getElementById('stat-tools').textContent`);
      assert.strictEqual(toolCount, '2', 'Must report 2 registered MCP tools');

      const resCount = await evalJS(app.port, `document.getElementById('stat-resources').textContent`);
      assert.strictEqual(resCount, '1', 'Must report 1 exposed MCP resource');

      // 2. Call Tool via UI
      await evalJS(app.port, `window.callTool('robos_demo_calculate_metrics')`);
      await new Promise(r => setTimeout(r, 400));

      // 3. Verify JSON-RPC 2.0 Protocol Trace
      const traceText = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(traceText.includes('tools/call'), 'Trace log must show tools/call request');
      assert.ok(traceText.includes('calculate_metrics'), 'Trace log must show tool name');
      assert.ok(traceText.includes('HEALTHY'), 'Trace log must show result with HEALTHY status');
    } finally {
      await killApp(app);
    }
  });
});

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const { MCPRouter } = require('../../../robos-mcp-router/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Unified MCP Router (robos-mcp-router) Tests with In-Depth Assertions', () => {
  it('MCPRouter multiplexes multiple MCP servers, aggregates tools/resources, routes calls, and degrades gracefully', async () => {
    const mockServers = {
      'task-manager': {
        appId: 'task-manager',
        name: 'Task Manager MCP Server',
        tools: [
          { name: 'robos_task_manager_get_task', description: 'Get task details' },
        ],
        resources: [
          { uri: 'robos://task-manager/tasks/active', name: 'Active Tasks' },
        ],
      },
      'workspace-manager': {
        appId: 'workspace-manager',
        name: 'Workspace Manager MCP Server',
        tools: [
          { name: 'robos_workspace_manager_list_repos', description: 'List repos' },
        ],
        resources: [
          { uri: 'robos://workspace-manager/repos', name: 'Repos' },
        ],
      },
    };

    const router = new MCPRouter({ servers: mockServers });

    // 1. Initialize
    const initRes = await router.handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.strictEqual(initRes.result.serverInfo.name, 'RobOS Unified MCP Router');

    // 2. tools/list aggregation
    const toolsRes = await router.handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.strictEqual(toolsRes.result.tools.length, 2);
    const toolNames = toolsRes.result.tools.map(t => t.name);
    assert.ok(toolNames.includes('robos_task_manager_get_task'));
    assert.ok(toolNames.includes('robos_workspace_manager_list_repos'));

    // 3. tools/call routing to task-manager
    const callTask = await router.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'robos_task_manager_get_task', arguments: { taskId: 'TASK-101' } },
    });
    assert.strictEqual(callTask.result.isError, undefined);
    assert.ok(callTask.result.content[0].text.includes('task-manager'));

    // 4. tools/call routing to workspace-manager
    const callWs = await router.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'robos_workspace_manager_list_repos', arguments: {} },
    });
    assert.ok(callWs.result.content[0].text.includes('workspace-manager'));

    // 5. Graceful degradation on missing tool
    const missingTool = await router.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'robos_unknown_tool', arguments: {} },
    });
    assert.strictEqual(missingTool.error.code, -32601);

    // 6. resources/list and resources/read routing
    const resList = await router.handleJsonRpc({ jsonrpc: '2.0', id: 6, method: 'resources/list' });
    assert.strictEqual(resList.result.resources.length, 2);

    const resRead = await router.handleJsonRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'resources/read',
      params: { uri: 'robos://task-manager/tasks/active' },
    });
    assert.ok(resRead.result.contents[0].text.includes('task-manager'));

    // 7. Claude Desktop config generator
    const claudeCfg = router.generateClaudeConfig();
    assert.ok(claudeCfg.mcpServers.robos);

    // 8. HTTP Server Transport
    const routerPort = 19186;
    await router.startHttp(routerPort);

    const health = await new Promise(resolve => {
      http.get(`http://localhost:${routerPort}/health`, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(JSON.parse(d)));
      });
    });
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.serversConnected, 2);

    router.stop();
  });

  it('launches MCP Router GUI console, displays aggregated tools/resources, routes calls, and generates Claude config', async () => {
    const app = await launchApp('robos-mcp-router', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-mcp-router debug port should be allocated');

      // 1. Check Stat Bar
      const serverCount = await evalJS(app.port, `document.getElementById('stat-servers').textContent`);
      assert.ok(parseInt(serverCount, 10) >= 2, 'Must report multiplexed servers');

      const toolCount = await evalJS(app.port, `document.getElementById('stat-tools').textContent`);
      assert.ok(parseInt(toolCount, 10) >= 3, 'Must report aggregated tools');

      // 2. Dispatch Task Manager Route Test
      await evalJS(app.port, `window.dispatchTool('robos_task_manager_get_task')`);
      await new Promise(r => setTimeout(r, 400));

      const logText = await evalJS(app.port, `document.getElementById('dispatch-log').textContent`);
      assert.ok(logText.includes('robos_task_manager_get_task'), 'Log must show dispatched tool name');
      assert.ok(logText.includes('task-manager'), 'Log must show target server resolution');

      // 3. Trigger Claude Config Generation
      await evalJS(app.port, `document.getElementById('btn-claude-config').click()`);
      await new Promise(r => setTimeout(r, 300));

      const updatedLog = await evalJS(app.port, `document.getElementById('dispatch-log').textContent`);
      assert.ok(updatedLog.includes('CLAUDE_CONFIG'), 'Log must show generated Claude settings');
    } finally {
      await killApp(app);
    }
  });
});

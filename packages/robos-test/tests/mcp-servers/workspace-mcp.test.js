'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { createWorkspaceMCPServer } = require('../../../workspace-manager-mcp/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Workspace Manager MCP Server (workspace-manager-mcp) Tests with In-Depth Assertions', () => {
  it('exposes full suite of robos_workspace_* tools and robos:// resources over MCP protocol', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-mcp-test-'));
    const wsFile = path.join(tmpDir, 'workspaces.json');
    const { server, service } = createWorkspaceMCPServer({ wsFile });

    // 1. robos_workspace_list
    const listRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'robos_workspace_list', arguments: {} },
    });
    assert.strictEqual(listRes.result.isError, undefined);
    assert.ok(listRes.result.content[0].text.includes('robos-core'));

    // 2. robos_workspace_create
    const createRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'robos_workspace_create',
        arguments: { taskId: 'TASK-202', repo: 'nddipiazza/robos', branch: 'feat/task-202-flow' },
      },
    });
    assert.ok(createRes.result.content[0].text.includes('ws-task-202'));

    // 3. robos_workspace_get_active
    const activeRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'robos_workspace_get_active', arguments: {} },
    });
    assert.ok(activeRes.result.content[0].text.includes('ws-task-202'));

    // 4. robos_workspace_open_in_ide
    const ideRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'robos_workspace_open_in_ide', arguments: { id: 'ws-task-202', ide: 'intellij' } },
    });
    assert.ok(ideRes.result.content[0].text.includes('63343'));

    // 5. robos_workspace_run_setup
    const setupRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'robos_workspace_run_setup', arguments: { id: 'ws-task-202' } },
    });
    assert.ok(setupRes.result.content[0].text.includes('npm install'));

    // 6. robos_workspace_start_devserver
    const devRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'robos_workspace_start_devserver', arguments: { id: 'ws-task-202', port: 3000 } },
    });
    assert.ok(devRes.result.content[0].text.includes('3000'));

    // 7. robos://workspace-manager/workspace/active resource
    const resRead = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'resources/read',
      params: { uri: 'robos://workspace-manager/workspace/active' },
    });
    assert.ok(resRead.result.contents[0].text.includes('ws-task-202'));

    server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches Workspace Manager MCP GUI, verifies workspaces, provisions worktree, and triggers dev server', async () => {
    const app = await launchApp('workspace-manager-mcp', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'workspace-manager-mcp debug port should be allocated');

      // 1. Initial State
      const totalWs = await evalJS(app.port, `document.getElementById('stat-total-ws').textContent`);
      assert.ok(parseInt(totalWs, 10) >= 2, 'Must render initial workspaces');

      // 2. Provision Worktree via MCP Trigger
      await evalJS(app.port, `window.createWorkspace('TASK-500')`);
      await new Promise(r => setTimeout(r, 400));

      const updatedCount = await evalJS(app.port, `document.getElementById('stat-total-ws').textContent`);
      assert.strictEqual(parseInt(updatedCount, 10), parseInt(totalWs, 10) + 1, 'Workspace count must increment');

      // 3. Open in IDE
      await evalJS(app.port, `window.openInIde('ws-main')`);
      await new Promise(r => setTimeout(r, 400));

      const traceLog = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(traceLog.includes('robos_workspace_open_in_ide'), 'Trace log must show IDE dispatch');
    } finally {
      await killApp(app);
    }
  });
});

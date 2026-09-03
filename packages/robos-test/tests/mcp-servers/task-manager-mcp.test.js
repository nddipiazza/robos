'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { createTaskMCPServer } = require('../../../task-manager-mcp/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Task Manager MCP Server (task-manager-mcp) Tests with In-Depth Assertions', () => {
  it('exposes full suite of robos_tasks_* tools and robos:// resources over MCP protocol', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-mcp-test-'));
    const tasksFile = path.join(tmpDir, 'tasks.json');
    const { server, service } = createTaskMCPServer({ tasksFile });

    // 1. robos_tasks_list
    const listRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'robos_tasks_list', arguments: { status: 'IN_PROGRESS' } },
    });
    assert.strictEqual(listRes.result.isError, undefined);
    assert.ok(listRes.result.content[0].text.includes('TASK-101'));

    // 2. robos_tasks_create
    const createRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'robos_tasks_create',
        arguments: { id: 'TASK-999', title: 'Test Autonomous Execution', priority: 'CRITICAL' },
      },
    });
    assert.ok(createRes.result.content[0].text.includes('TASK-999'));

    // 3. robos_tasks_get
    const getRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'robos_tasks_get', arguments: { id: 'TASK-999' } },
    });
    assert.ok(getRes.result.content[0].text.includes('Test Autonomous Execution'));

    // 4. robos_tasks_advance_workflow
    const advanceRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'robos_tasks_advance_workflow', arguments: { id: 'TASK-999' } },
    });
    assert.ok(advanceRes.result.content[0].text.includes('IN_PROGRESS'));

    // 5. robos_tasks_add_comment & log_hours
    await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'robos_tasks_add_comment', arguments: { id: 'TASK-999', comment: 'All unit tests passing.' } },
    });

    await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'robos_tasks_log_hours', arguments: { id: 'TASK-999', hours: 2.5 } },
    });

    const updatedTask = service.get('TASK-999');
    assert.strictEqual(updatedTask.hoursLogged, 2.5);
    assert.ok(updatedTask.comments.some(c => c.includes('All unit tests passing.')));

    // 6. robos://task-manager/tasks/active resource
    const resRead = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'resources/read',
      params: { uri: 'robos://task-manager/tasks/active' },
    });
    assert.ok(resRead.result.contents[0].text.includes('TASK-999'));

    server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches Task Manager MCP GUI, verifies Kanban rendering, triggers task creation and workflow advance', async () => {
    const app = await launchApp('task-manager-mcp', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'task-manager-mcp debug port should be allocated');

      // 1. Initial State
      const totalTasks = await evalJS(app.port, `document.getElementById('stat-total-tasks').textContent`);
      assert.ok(parseInt(totalTasks, 10) >= 3, 'Must render initial tasks');

      // 2. Create Task via MCP Trigger
      await evalJS(app.port, `window.createTask('Live MCP Integration Task', 'HIGH')`);
      await new Promise(r => setTimeout(r, 400));

      const updatedCount = await evalJS(app.port, `document.getElementById('stat-total-tasks').textContent`);
      assert.strictEqual(parseInt(updatedCount, 10), parseInt(totalTasks, 10) + 1, 'Task count must increment');

      // 3. Advance Active Workflow
      await evalJS(app.port, `window.advanceTask('TASK-101')`);
      await new Promise(r => setTimeout(r, 400));

      const traceLog = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(traceLog.includes('robos_tasks_advance_workflow'), 'Trace log must show workflow advance');
    } finally {
      await killApp(app);
    }
  });
});

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { createEKGraphMCPServer } = require('../../../ekgraph-mcp/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('EKGraph MCP Server (ekgraph-mcp) Tests with In-Depth Assertions', () => {
  it('exposes full suite of robos_ekgraph_* tools and robos:// resources over MCP protocol', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ekg-mcp-test-'));
    const nodesFile = path.join(tmpDir, 'nodes.json');
    const { server, service } = createEKGraphMCPServer({ nodesFile });

    // 1. robos_ekgraph_search
    const searchRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'robos_ekgraph_search', arguments: { query: 'jwt' } },
    });
    assert.strictEqual(searchRes.result.isError, undefined);
    assert.ok(searchRes.result.content[0].text.includes('auth-service'));

    // 2. robos_ekgraph_get_node
    const getRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'robos_ekgraph_get_node', arguments: { path: 'services/auth-service' } },
    });
    assert.ok(getRes.result.content[0].text.includes('https://auth.internal.corp'));

    // 3. robos_ekgraph_list_children
    const listRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'robos_ekgraph_list_children', arguments: { prefix: 'services' } },
    });
    assert.ok(listRes.result.content[0].text.includes('services/gateway'));

    // 4. robos_ekgraph_create_node
    const createRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'robos_ekgraph_create_node',
        arguments: {
          path: 'services/notification-hub',
          title: 'Notification Hub',
          type: 'service',
          content: 'Event-driven notification broker.',
          tags: ['notifications', 'events'],
          links: ['environments/prod'],
        },
      },
    });
    assert.ok(createRes.result.content[0].text.includes('notification-hub'));

    // 5. robos_ekgraph_get_linked
    const linkedRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'robos_ekgraph_get_linked', arguments: { path: 'services/auth-service' } },
    });
    assert.ok(linkedRes.result.content[0].text.includes('environments/prod'));

    // 6. robos://ekgraph-mcp/ekgraph/services resource
    const resRead = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'resources/read',
      params: { uri: 'robos://ekgraph-mcp/ekgraph/services' },
    });
    assert.ok(resRead.result.contents[0].text.includes('services/gateway'));

    server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches EKGraph MCP GUI, searches nodes, selects topology node, and traverses linked dependencies', async () => {
    const app = await launchApp('ekgraph-mcp', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'ekgraph-mcp debug port should be allocated');

      // 1. Initial State
      const totalNodes = await evalJS(app.port, `document.getElementById('stat-total-nodes').textContent`);
      assert.ok(parseInt(totalNodes, 10) >= 5, 'Must render initial knowledge nodes');

      // 2. Filter Search
      await evalJS(app.port, `(() => {
        const input = document.getElementById('input-search');
        input.value = 'auth';
        input.dispatchEvent(new Event('input'));
      })()`);
      await new Promise(r => setTimeout(r, 400));

      const filteredCount = await evalJS(app.port, `document.querySelectorAll('#nodes-list .node-item').length`);
      assert.ok(filteredCount >= 1, 'Search filter must match auth node');

      // 3. Clear Search & Create Node
      await evalJS(app.port, `(() => {
        const input = document.getElementById('input-search');
        input.value = '';
        input.dispatchEvent(new Event('input'));
      })()`);
      await new Promise(r => setTimeout(r, 300));

      await evalJS(app.port, `window.createNode('services/audit-log', 'Audit Logging Service')`);
      await new Promise(r => setTimeout(r, 400));

      const updatedCount = await evalJS(app.port, `document.getElementById('stat-total-nodes').textContent`);
      assert.strictEqual(parseInt(updatedCount, 10), parseInt(totalNodes, 10) + 1, 'Node count must increment');

      // 4. Traverse Linked
      await evalJS(app.port, `window.traverseLinked()`);
      await new Promise(r => setTimeout(r, 400));

      const traceLog = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(traceLog.includes('robos_ekgraph_get_linked'), 'Trace log must show linked node traversal');
    } finally {
      await killApp(app);
    }
  });
});

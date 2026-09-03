'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { createDevToolsMCPServer } = require('../../../dev-tools-mcp/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Dev Tools MCP Server (dev-tools-mcp) Tests with In-Depth Assertions', () => {
  it('exposes full suite of robos_devtools_* tools and robos:// resources over MCP protocol', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-tools-mcp-test-'));
    const toolsFile = path.join(tmpDir, 'tools.json');
    const { server, service } = createDevToolsMCPServer({ toolsFile });

    // 1. robos_devtools_list
    const listRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'robos_devtools_list', arguments: {} },
    });
    assert.strictEqual(listRes.result.isError, undefined);
    assert.ok(listRes.result.content[0].text.includes('Docker Engine'));

    // 2. robos_devtools_check
    const checkRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'robos_devtools_check', arguments: { toolId: 'docker' } },
    });
    assert.ok(checkRes.result.content[0].text.includes('"installed": true'));

    // 3. robos_devtools_install
    const installRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'robos_devtools_install', arguments: { toolId: 'terraform' } },
    });
    assert.ok(installRes.result.content[0].text.includes('INSTALLED'));

    // 4. robos_devtools_uninstall
    const uninstallRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'robos_devtools_uninstall', arguments: { toolId: 'terraform' } },
    });
    assert.ok(uninstallRes.result.content[0].text.includes('UNINSTALLED'));

    // 5. robos://dev-tools-mcp/devtools/installed resource
    const resRead = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'resources/read',
      params: { uri: 'robos://dev-tools-mcp/devtools/installed' },
    });
    assert.ok(resRead.result.contents[0].text.includes('Kubernetes CLI'));

    server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches Dev Tools MCP GUI, checks tool status, and installs packages', async () => {
    const app = await launchApp('dev-tools-mcp', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'dev-tools-mcp debug port should be allocated');

      // 1. Initial State
      const totalCatalog = await evalJS(app.port, `document.getElementById('stat-total').textContent`);
      assert.strictEqual(totalCatalog, '6 Catalog', 'Must render 6 catalog tools');

      // 2. Dispatch Check Tool via MCP Trigger
      await evalJS(app.port, `window.checkTool('docker')`);
      await new Promise(r => setTimeout(r, 400));

      const traceLog = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(traceLog.includes('robos_devtools_check'), 'Trace log must show check tool dispatch');

      // 3. Install Terraform
      await evalJS(app.port, `window.installTool('terraform')`);
      await new Promise(r => setTimeout(r, 400));

      const updatedTrace = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(updatedTrace.includes('robos_devtools_install'), 'Trace log must show install tool dispatch');
    } finally {
      await killApp(app);
    }
  });
});

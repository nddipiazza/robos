'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { createIDEBridgeMCPServer } = require('../../../ide-bridge-mcp/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('IDE Bridge MCP Server (ide-bridge-mcp) Tests with In-Depth Assertions', () => {
  it('exposes full suite of robos_ide_* tools and robos:// resources over MCP protocol', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-mcp-test-'));
    const stateFile = path.join(tmpDir, 'state.json');
    const { server, service } = createIDEBridgeMCPServer({ stateFile });

    // 1. robos_ide_open_file
    const openRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'robos_ide_open_file',
        arguments: { file: 'src/main/java/com/robos/HelloWorld.java', line: 6, column: 9 },
      },
    });
    assert.strictEqual(openRes.result.isError, undefined);
    assert.ok(openRes.result.content[0].text.includes('63343'));

    // 2. robos_ide_get_open_files
    const listRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'robos_ide_get_open_files', arguments: {} },
    });
    assert.ok(listRes.result.content[0].text.includes('HelloWorld.java'));

    // 3. robos_ide_set_breakpoint
    const bpRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'robos_ide_set_breakpoint',
        arguments: { file: 'src/main/java/com/robos/HelloWorld.java', line: 6, enabled: true },
      },
    });
    assert.ok(bpRes.result.content[0].text.includes('"enabled": true'));

    // 4. robos_ide_run_config
    const runRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'robos_ide_run_config',
        arguments: {
          name: 'Debug HelloWorld.main()',
          mode: 'debug',
        },
      },
    });
    assert.ok(runRes.result.content[0].text.includes('RUNNING'));

    // 5. robos_ide_navigate_to_symbol
    const navRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'robos_ide_navigate_to_symbol', arguments: { symbol: 'HelloWorld' } },
    });
    assert.ok(navRes.result.content[0].text.includes('HelloWorld'));

    // 6. robos://ide-bridge-mcp/ide/status resource
    const resRead = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'resources/read',
      params: { uri: 'robos://ide-bridge-mcp/ide/status' },
    });
    assert.ok(resRead.result.contents[0].text.includes('IntelliJ'));

    server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches IDE Bridge MCP GUI, inspects open files, and sets reproduction breakpoint', async () => {
    const app = await launchApp('ide-bridge-mcp', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'ide-bridge-mcp debug port should be allocated');

      // 1. Initial State
      const openCount = await evalJS(app.port, `document.getElementById('stat-open-files').textContent`);
      assert.ok(parseInt(openCount, 10) >= 2, 'Must render open editor files');

      // 2. Set Breakpoint via MCP Trigger
      await evalJS(app.port, `window.setBreakpoint('src/main/java/com/robos/HelloWorld.java', 6)`);
      await new Promise(r => setTimeout(r, 400));

      const traceLog = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(traceLog.includes('robos_ide_set_breakpoint'), 'Trace log must show breakpoint dispatch');

      // 3. Start Debug Session & Trigger Breakpoint
      await evalJS(app.port, `window.runConfig('Debug HelloWorld.main()', 'debug')`);
      await new Promise(r => setTimeout(r, 400));

      const updatedTrace = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(updatedTrace.includes('robos_ide_run_config'), 'Trace log must show run config dispatch');
    } finally {
      await killApp(app);
    }
  });
});

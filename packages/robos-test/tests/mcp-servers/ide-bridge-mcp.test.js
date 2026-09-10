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

    // 4. robos_ide_create_run_config with pass secrets
    const createRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'robos_ide_create_run_config',
        arguments: {
          name: 'Debug PetServiceTest',
          type: 'JUnit',
          projectPath: '/tmp/petstore-api',
          mainClassOrCommand: 'com.acme.petshop.service.PetServiceTest',
          env: { SPRING_PROFILES_ACTIVE: 'test' },
          passSecrets: { MTLS_KEYSTORE: 'pass:acme/vaccine-gateway-mTLS' },
        },
      },
    });
    assert.ok(createRes.result.content[0].text.includes('Debug PetServiceTest'));
    assert.ok(createRes.result.content[0].text.includes('pass:acme/vaccine-gateway-mTLS'));

    // 5. robos_ide_run_config
    const runRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'robos_ide_run_config',
        arguments: {
          name: 'Debug PetServiceTest',
          mode: 'debug',
        },
      },
    });
    assert.ok(runRes.result.content[0].text.includes('RUNNING'));

    // 6. robos_ide_register_breakpoint_webhook
    const webhookRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'robos_ide_register_breakpoint_webhook',
        arguments: {
          webhookUrl: 'http://127.0.0.1:9099/webhook/breakpoint',
        },
      },
    });
    assert.ok(webhookRes.result.content[0].text.includes('http://127.0.0.1:9099/webhook/breakpoint'));

    // 7. robos_ide_get_thread_state
    const threadRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'robos_ide_get_thread_state',
        arguments: {},
      },
    });
    assert.ok(threadRes.result.content[0].text.includes('SUSPENDED'));
    assert.ok(threadRes.result.content[0].text.includes('PetService.java'));
    assert.ok(threadRes.result.content[0].text.includes('VAX-2026-9814'));

    // 8. robos_ide_create_ephemeral_workspace (multi-project)
    const wsRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'robos_ide_create_ephemeral_workspace',
        arguments: {
          workspaceId: 'ephemeral-ws-petstore',
          projects: ['/tmp/petstore-api', '/tmp/petstore-web', '/tmp/petstore-lib'],
          autoRunConfig: 'Debug PetServiceTest',
          autoDestroyOnSessionEnd: true,
        },
      },
    });
    assert.ok(wsRes.result.content[0].text.includes('ephemeral-ws-petstore'));
    assert.ok(wsRes.result.content[0].text.includes('petstore-lib'));

    // 9. robos_ide_stop_config
    const stopRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'robos_ide_stop_config',
        arguments: { name: 'Debug PetServiceTest' },
      },
    });
    assert.ok(stopRes.result.content[0].text.includes('STOPPED'));

    // 10. robos_ide_destroy_workspace
    const destroyRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'robos_ide_destroy_workspace',
        arguments: { workspaceId: 'ephemeral-ws-petstore' },
      },
    });
    assert.ok(destroyRes.result.content[0].text.includes('ephemeral-ws-petstore'));

    // 11. robos:// resources
    const statusResource = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 11,
      method: 'resources/read',
      params: { uri: 'robos://ide-bridge-mcp/ide/status' },
    });
    assert.ok(statusResource.result.contents[0].text.includes('IntelliJ'));

    const threadResource = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 12,
      method: 'resources/read',
      params: { uri: 'robos://ide-bridge-mcp/ide/thread-state' },
    });
    assert.ok(threadResource.result.contents[0].text.includes('PetService'));

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
      await new Promise(r => setTimeout(r, 600));

      const traceLog = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(traceLog.includes('robos_ide_set_breakpoint'), 'Trace log must show breakpoint dispatch');

      // 3. Start Debug Session & Trigger Breakpoint
      await evalJS(app.port, `window.runConfig('Debug HelloWorld.main()', 'debug')`);
      await new Promise(r => setTimeout(r, 600));

      const updatedTrace = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(updatedTrace.includes('robos_ide_run_config'), 'Trace log must show run config dispatch');
    } finally {
      await killApp(app);
    }
  });
});

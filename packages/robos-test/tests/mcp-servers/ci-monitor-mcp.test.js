'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { createCIMonitorMCPServer } = require('../../../ci-monitor-mcp/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('CI Monitor MCP Server (ci-monitor-mcp) Tests with In-Depth Assertions', () => {
  it('exposes full suite of robos_ci_* tools and robos:// resources over MCP protocol', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-mcp-test-'));
    const runsFile = path.join(tmpDir, 'runs.json');
    const { server, service } = createCIMonitorMCPServer({ runsFile });

    // 1. robos_ci_get_status
    const statusRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'robos_ci_get_status', arguments: { branch: 'main' } },
    });
    assert.strictEqual(statusRes.result.isError, undefined);
    assert.ok(statusRes.result.content[0].text.includes('SUCCESS'));

    // 2. robos_ci_list_runs
    const listRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'robos_ci_list_runs', arguments: { status: 'FAILURE' } },
    });
    assert.ok(listRes.result.content[0].text.includes('run-102'));

    // 3. robos_ci_get_failures
    const failRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'robos_ci_get_failures', arguments: { runId: 'run-102' } },
    });
    assert.ok(failRes.result.content[0].text.includes('mcp-router-route-failure'));

    // 4. robos_ci_get_logs
    const logsRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'robos_ci_get_logs', arguments: { runId: 'run-102' } },
    });
    assert.ok(logsRes.result.content[0].text.includes('PIPELINE FAILED'));

    // 5. robos_ci_retry_run
    const retryRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'robos_ci_retry_run', arguments: { runId: 'run-102' } },
    });
    assert.ok(retryRes.result.content[0].text.includes('SUCCESS'));

    // 6. robos_ci_get_deployments
    const depRes = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'robos_ci_get_deployments', arguments: {} },
    });
    assert.ok(depRes.result.content[0].text.includes('staging.robos.dev'));

    // 7. robos://ci-monitor-mcp/ci/current resource
    const resRead = await server.handleJsonRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'resources/read',
      params: { uri: 'robos://ci-monitor-mcp/ci/current' },
    });
    assert.ok(resRead.result.contents[0].text.includes('main'));

    server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches CI Monitor MCP GUI, inspects test failures, and triggers run retry', async () => {
    const app = await launchApp('ci-monitor-mcp', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'ci-monitor-mcp debug port should be allocated');

      // 1. Initial State
      const totalRuns = await evalJS(app.port, `document.getElementById('stat-total-runs').textContent`);
      assert.ok(parseInt(totalRuns, 10) >= 2, 'Must render initial pipeline runs');

      // 2. Inspect Failures via MCP Trigger
      await evalJS(app.port, `window.inspectFailures('run-102')`);
      await new Promise(r => setTimeout(r, 400));

      const traceLog = await evalJS(app.port, `document.getElementById('trace-log').textContent`);
      assert.ok(traceLog.includes('robos_ci_get_failures'), 'Trace log must show get_failures dispatch');

      // 3. Trigger Retry
      await evalJS(app.port, `window.retryFailed('run-102')`);
      await new Promise(r => setTimeout(r, 400));

      const updatedPassRate = await evalJS(app.port, `document.getElementById('stat-pass-rate').textContent`);
      assert.strictEqual(updatedPassRate, '100%', 'Pass rate should update to 100% after retry');
    } finally {
      await killApp(app);
    }
  });
});

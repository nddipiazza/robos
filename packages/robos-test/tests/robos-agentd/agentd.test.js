'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { AgentDaemon } = require('../../../robos-agentd/daemon');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Sub-Agent Linux Daemon (robos-agentd) Tests with In-Depth Assertions', () => {
  it('AgentDaemon initializes sub-agent home, configures dotfiles, appends logs, and archives upon termination', () => {
    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentd-unit-test-'));
    const daemon = new AgentDaemon({ baseDir: sandboxDir });

    // 1. Spawn sub-agent
    const spawnRes = daemon.spawnAgent('task-301', {
      role: 'Architecture Reviewer',
      memoryMb: 1024,
      cpuShares: 512,
    });
    assert.strictEqual(spawnRes.ok, true);
    assert.strictEqual(spawnRes.agent.taskId, 'task-301');
    assert.strictEqual(spawnRes.agent.username, 'agent-task-301');

    const agentHome = spawnRes.agent.home;
    assert.ok(fs.existsSync(agentHome), 'Agent home must be created');
    assert.ok(fs.existsSync(path.join(agentHome, '.bashrc')), 'Agent .bashrc must exist');

    const bashrc = fs.readFileSync(path.join(agentHome, '.bashrc'), 'utf8');
    assert.ok(bashrc.includes('ROBOS_TASK_ID="task-301"'), 'Bashrc must export task id');
    assert.ok(bashrc.includes('ROBOS_AGENT=1'), 'Bashrc must export ROBOS_AGENT flag');

    // 2. Append live logs
    daemon.appendLog('task-301', 'Executing automated test run');
    const insp = daemon.inspectAgent('task-301');
    assert.strictEqual(insp.ok, true);
    assert.ok(insp.agent.logs.some(l => l.includes('Executing automated test run')));

    // 3. Terminate and verify log archiving & home directory purge
    const termRes = daemon.terminateAgent('task-301');
    assert.strictEqual(termRes.ok, true);
    assert.strictEqual(termRes.agent.status, 'terminated');
    assert.ok(termRes.agent.archivedLog, 'Archived log path must be set');
    assert.ok(fs.existsSync(termRes.agent.archivedLog), 'Archived log file must exist');

    assert.strictEqual(fs.existsSync(agentHome), false, 'Active home directory must be purged on termination');

    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });

  it('launches RobOS Desktop Agents Manager GUI, spawns sub-agent session, inspects telemetry and logs, and terminates session', async () => {
    const app = await launchApp('robos-agentd', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-agentd debug port should be allocated');

      // 1. Spawn sub-agent
      const spawnRes = await evalJS(app.port, `window.spawnAgent('task-e2e', { role: 'Senior Code Reviewer', memoryMb: 2048 })`);
      assert.strictEqual(spawnRes.ok, true, 'spawnAgent should succeed');

      await new Promise(r => setTimeout(r, 400));

      // 2. Inspect Details in Drawer
      const inspectDetails = await evalJS(app.port, `document.getElementById('inspect-details').textContent`);
      assert.ok(inspectDetails.includes('Senior Code Reviewer'), 'Must render role persona');
      assert.ok(inspectDetails.includes('task-e2e'), 'Must render task ID');
      assert.ok(inspectDetails.includes('UID / GID'), 'Must render UID / GID row');
      assert.ok(inspectDetails.includes('Cgroup Scope'), 'Must render Cgroup Scope row');

      // 3. Check Live Log Stream
      const logContent = await evalJS(app.port, `document.getElementById('inspect-logs').textContent`);
      assert.ok(logContent.includes('ROBOS_AGENTD'), 'Log viewer must render initial boot log');

      // 4. Terminate agent
      await evalJS(app.port, `window.terminateAgent('task-e2e')`);
      await new Promise(r => setTimeout(r, 400));

      const isTerminated = await evalJS(app.port, `document.getElementById('card-agent-task-e2e').classList.contains('terminated')`);
      assert.strictEqual(isTerminated, true, 'Card must reflect terminated state');
    } finally {
      await killApp(app);
    }
  });
});

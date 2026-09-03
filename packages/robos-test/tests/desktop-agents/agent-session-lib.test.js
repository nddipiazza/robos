'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { RobOSAgentSession } = require('../../../robos-agent-session/index');
const { AgentDaemon } = require('../../../robos-agentd/daemon');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Agent Session Shared Library (robos-agent-session) Tests with In-Depth Assertions', () => {
  it('RobOSAgentSession library manages full sub-agent lifecycle and emits real-time events', async () => {
    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-session-lib-test-'));
    const daemon = new AgentDaemon({ baseDir: sandboxDir, runDir: path.join(sandboxDir, 'run') });
    const client = new RobOSAgentSession({ daemon });

    const events = [];
    client.on('session:spawned', agent => events.push({ type: 'spawned', taskId: agent.taskId }));
    client.on('session:command', data => events.push({ type: 'command', ...data }));
    client.on('session:terminated', agent => events.push({ type: 'terminated', taskId: agent.taskId }));

    // 1. Spawn session
    const spawnRes = await client.spawnAgentSession('task-lib-alpha', { role: 'DevCentral Runner' });
    assert.strictEqual(spawnRes.ok, true);
    assert.strictEqual(spawnRes.agent.taskId, 'task-lib-alpha');

    // 2. Query list
    const list = await client.listAgentSessions();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].taskId, 'task-lib-alpha');

    // 3. Dispatch command
    await client.sendAgentCommand('task-lib-alpha', 'npm run build');

    // 4. Inspect session
    const inspectRes = await client.inspectAgentSession('task-lib-alpha');
    assert.strictEqual(inspectRes.ok, true);
    assert.ok(inspectRes.agent.logs.some(l => l.includes('COMMAND_DISPATCH')));

    // 5. Terminate session
    const termRes = await client.terminateAgentSession('task-lib-alpha');
    assert.strictEqual(termRes.ok, true);

    // Verify events
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].type, 'spawned');
    assert.strictEqual(events[1].type, 'command');
    assert.strictEqual(events[2].type, 'terminated');

    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });

  it('launches Agent Session Client Demo GUI, spawns session, sends command over IPC, and verifies event log', async () => {
    const app = await launchApp('robos-agent-session', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-agent-session debug port should be allocated');

      // 1. Spawn session
      const spawnRes = await evalJS(app.port, `window.spawnSession('task-gui-client', { role: 'Issue Manager Agent' })`);
      assert.strictEqual(spawnRes.ok, true);

      await new Promise(r => setTimeout(r, 400));

      // 2. Assert active session count & card
      const count = await evalJS(app.port, `document.getElementById('stat-sessions').textContent`);
      assert.strictEqual(count, '1');

      // 3. Send command over IPC
      await evalJS(app.port, `window.sendCommand('task-gui-client', 'git status')`);
      await new Promise(r => setTimeout(r, 300));

      const logText = await evalJS(app.port, `document.getElementById('event-log').textContent`);
      assert.ok(logText.includes('Command dispatched to task-gui-client'));

      // 4. Terminate session
      await evalJS(app.port, `window.terminateSession('task-gui-client')`);
      await new Promise(r => setTimeout(r, 300));

      const updatedCount = await evalJS(app.port, `document.getElementById('stat-sessions').textContent`);
      assert.strictEqual(updatedCount, '0');
    } finally {
      await killApp(app);
    }
  });
});

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, getSnapshot } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Ephemeral Profile Daemon E2E Test Suite with In-Depth Assertions', () => {
  it('launches Profile Daemon, provisions ephemeral Linux user, inspects subsystems, and terminates profile', async () => {
    // 1. Launch robos-profiled in test harness
    const app = await launchApp('robos-profiled', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-profiled debug port should be allocated');

      // 2. Assert Initial State
      const initialCount = await evalJS(app.port, `document.getElementById('stat-active').textContent`);
      assert.strictEqual(initialCount, '0', 'Initial active count should be 0');

      // 3. Provision Ephemeral Profile via UI
      const spawnRes = await evalJS(app.port, `window.spawnProfile('pr-reviewer', { role: 'Pact Contract Verifier', model: 'claude-sonnet-4-20250514' })`);
      assert.strictEqual(spawnRes.ok, true, 'spawnProfile should succeed');
      assert.strictEqual(spawnRes.profile.username, 'my-agent-pr-reviewer', 'Username must follow my-agent-<name> format');

      await new Promise(r => setTimeout(r, 400));

      // 4. Assert Profile Card Rendering in DOM
      const card = await evalJS(app.port, `document.getElementById('card-my-agent-pr-reviewer') !== null`);
      assert.strictEqual(card, true, 'Profile card must be rendered in DOM');

      const activeStat = await evalJS(app.port, `document.getElementById('stat-active').textContent`);
      assert.strictEqual(activeStat, '1', 'Active profile count should update to 1');

      // 5. Assert Subsystems in Inspect Drawer
      const inspectDetails = await evalJS(app.port, `document.getElementById('inspect-details').textContent`);
      assert.ok(inspectDetails.includes('tmpfs'), 'Must indicate memory-backed tmpfs home');
      assert.ok(inspectDetails.includes('video, render, audio, kvm'), 'Must display allocated subsystem groups');
      assert.ok(inspectDetails.includes('robos-agent-pr-reviewer.scope'), 'Must display systemd scope');

      // 6. Assert Disk State Persistence in Sandbox Home
      const stateFile = path.join(app.sandboxHome, '.config', 'robos', 'profiled', 'profiles.json');
      assert.ok(fs.existsSync(stateFile), 'profiles.json must exist in sandbox config');
      const diskList = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(diskList.length, 1);
      assert.strictEqual(diskList[0].username, 'my-agent-pr-reviewer');
      assert.strictEqual(diskList[0].status, 'active');

      // 7. Terminate Profile
      await evalJS(app.port, `window.terminateProfile('my-agent-pr-reviewer')`);
      await new Promise(r => setTimeout(r, 400));

      const updatedStat = await evalJS(app.port, `document.getElementById('stat-active').textContent`);
      assert.strictEqual(updatedStat, '0', 'Active profile count should return to 0');

      const isTerminated = await evalJS(app.port, `document.getElementById('card-my-agent-pr-reviewer').classList.contains('terminated')`);
      assert.strictEqual(isTerminated, true, 'Card should reflect terminated status');
    } finally {
      // Clean Teardown
      await killApp(app);
    }
  });
});

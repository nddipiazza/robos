'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

const RUN_AS_BIN = path.resolve(__dirname, '../../../robos-profiled/robos-run-as');

describe('CLI Runner & IPC Bridge Tests with In-Depth Assertions', () => {
  it('robos-run-as provisions agent on demand, executes command with environment, and honors --autoclean', () => {
    // 1. Run basic command
    const res1 = cp.execSync(`${RUN_AS_BIN} --agent worker-one echo "worker-one-ready"`, {
      encoding: 'utf8',
      env: { ...process.env, DISPLAY: ':0' },
    });
    assert.ok(res1.includes('worker-one-ready'), 'CLI output must include command result');

    // 2. Run with --autoclean
    const res2 = cp.execSync(`${RUN_AS_BIN} --agent worker-clean --autoclean echo "cleaning-up"`, {
      encoding: 'utf8',
      env: { ...process.env, DISPLAY: ':0' },
    });
    assert.ok(res2.includes('cleaning-up'), 'CLI with autoclean must succeed');

    // 3. Check environment injection
    const res3 = cp.execSync(`${RUN_AS_BIN} --agent worker-env bash -c 'echo "AGENT=$ROBOS_AGENT NAME=$ROBOS_AGENT_NAME"'`, {
      encoding: 'utf8',
      env: { ...process.env, DISPLAY: ':0' },
    });
    assert.ok(res3.includes('AGENT=1'), 'ROBOS_AGENT flag must be exported');
    assert.ok(res3.includes('NAME=worker-env'), 'ROBOS_AGENT_NAME must match profile');
  });

  it('launches Profile Daemon, tests IPC runCommand with environment and autoclean', async () => {
    const app = await launchApp('robos-profiled', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-profiled debug port should be allocated');

      // Execute command over IPC with autoclean
      const runRes = await evalJS(app.port, `window.profiled.runCommand('ipc-exec', 'echo IPC_SUCCESS_OUTPUT', { autoclean: true })`);
      assert.strictEqual(runRes.ok, true, 'runCommand over IPC must succeed');
      assert.strictEqual(runRes.output, 'IPC_SUCCESS_OUTPUT', 'Output must match');

      await new Promise(r => setTimeout(r, 400));

      // Assert profile is terminated
      const inspectRes = await evalJS(app.port, `window.profiled.inspectProfile('ipc-exec')`);
      assert.strictEqual(inspectRes.profile.status, 'terminated', 'Profile must be terminated after autoclean');
    } finally {
      await killApp(app);
    }
  });
});

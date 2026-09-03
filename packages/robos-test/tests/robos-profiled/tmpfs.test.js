'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { TmpfsManager } = require('../../../robos-profiled/tmpfs-manager');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Tmpfs Home Directory Manager Tests with In-Depth Assertions', () => {
  it('TmpfsManager creates isolated directory, populates dotfiles, sets 0700 permissions, and unmounts cleanly', () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpfs-unit-'));
    const mgr = new TmpfsManager({ baseDir: tmpBase, defaultQuota: '2G' });

    // 1. Mount home
    const res = mgr.mountHome('my-agent-test-agent', { quota: '2G' });
    assert.strictEqual(res.ok, true, 'mountHome should return ok: true');
    assert.ok(fs.existsSync(res.targetDir), 'Target home directory must exist');

    // 2. Check permissions
    const stat = fs.statSync(res.targetDir);
    const mode = (stat.mode & 0o777).toString(8);
    assert.strictEqual(mode, '700', 'Directory permissions must be 0700');

    // 3. Check skeleton dotfiles
    const bashrc = path.join(res.targetDir, '.bashrc');
    const profile = path.join(res.targetDir, '.profile');
    assert.ok(fs.existsSync(bashrc), '.bashrc must be populated');
    assert.ok(fs.existsSync(profile), '.profile must be populated');
    assert.ok(fs.readFileSync(bashrc, 'utf8').includes('robos-agent'), '.bashrc must contain prompt config');

    // 4. Unmount and purge
    const unmountRes = mgr.unmountHome('my-agent-test-agent');
    assert.strictEqual(unmountRes.ok, true, 'unmountHome should return ok: true');
    assert.strictEqual(fs.existsSync(res.targetDir), false, 'Target home directory must be purged');

    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it('launches Profile Daemon, provisions profile with tmpfs quota, inspects memory/dotfiles, and terminates session', async () => {
    const app = await launchApp('robos-profiled', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-profiled debug port should be allocated');

      // Provision profile with custom quota
      const spawnRes = await evalJS(app.port, `window.spawnProfile('build-agent', { role: 'Build & Compilation Agent', quota: '4G' })`);
      assert.strictEqual(spawnRes.ok, true, 'spawnProfile should succeed');

      await new Promise(r => setTimeout(r, 400));

      // Inspect drawer
      const inspectDetails = await evalJS(app.port, `document.getElementById('inspect-details').textContent`);
      assert.ok(inspectDetails.includes('RAM Quota'), 'Must render RAM Quota row');
      assert.ok(inspectDetails.includes('4G'), 'Must render 4G quota');
      assert.ok(inspectDetails.includes('.bashrc'), 'Must list .bashrc dotfile');

      // Terminate profile
      await evalJS(app.port, `window.terminateProfile('my-agent-build-agent')`);
      await new Promise(r => setTimeout(r, 400));

      const isTerminated = await evalJS(app.port, `document.getElementById('card-my-agent-build-agent').classList.contains('terminated')`);
      assert.strictEqual(isTerminated, true, 'Card must reflect terminated status');
    } finally {
      await killApp(app);
    }
  });
});

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { ProfileDaemon } = require('../../../robos-profiled/daemon');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Zero-Residue Multi-Agent Swarm Concurrency & Isolation E2E Tests with In-Depth Assertions', () => {
  it('ProfileDaemon handles 4 concurrent agent profiles, enforces 0700 cross-profile isolation, and purges all storage on wipeAll', () => {
    const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-daemon-test-'));
    const daemon = new ProfileDaemon({ baseDir: sandboxDir });

    // 1. Concurrently spawn 4 agent profiles
    const swarmRes = daemon.spawnSwarm(4, 'swarm-worker');
    assert.strictEqual(swarmRes.ok, true);
    assert.strictEqual(swarmRes.count, 4);

    const profiles = daemon.listProfiles().filter(p => p.status === 'active');
    assert.strictEqual(profiles.length, 4, 'Must have 4 active profiles');

    const uids = new Set(profiles.map(p => p.uid));
    assert.strictEqual(uids.size, 4, 'All 4 agents must have distinct UIDs');

    // 2. Check each home directory and 0700 permission isolation
    for (const p of profiles) {
      assert.ok(fs.existsSync(p.home), `Agent home ${p.home} must exist on tmpfs`);
      const stat = fs.statSync(p.home);
      const mode = (stat.mode & 0o777).toString(8);
      assert.strictEqual(mode, '700', `Agent home ${p.home} must be mode 0700`);
      assert.ok(fs.existsSync(path.join(p.home, '.bashrc')), 'Dotfiles must be populated');
      assert.ok(fs.existsSync(path.join(p.home, '.gitconfig')), 'Git author must be forwarded');
      assert.ok(fs.existsSync(path.join(p.home, '.ssh-auth-sock')), 'SSH socket must be bridged');
    }

    // 3. Test cross-profile write/read isolation simulation
    const home1 = profiles[0].home;
    const home2 = profiles[1].home;
    fs.writeFileSync(path.join(home1, 'secret.txt'), 'agent1-confidential-token');
    assert.ok(fs.existsSync(path.join(home1, 'secret.txt')));
    assert.strictEqual(fs.existsSync(path.join(home2, 'secret.txt')), false, 'Files from Agent 1 must not leak into Agent 2');

    // 4. Wipe All & Assert Zero Residue
    const wipeRes = daemon.wipeAll();
    assert.strictEqual(wipeRes.ok, true);
    assert.strictEqual(wipeRes.count, 4);

    const activeAfter = daemon.listProfiles().filter(p => p.status === 'active');
    assert.strictEqual(activeAfter.length, 0, 'No active profiles should remain');

    // Verify zero storage residue
    for (const p of profiles) {
      assert.strictEqual(fs.existsSync(p.home), false, `Agent home ${p.home} must be completely purged`);
    }

    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });

  it('launches Profile Daemon GUI, triggers 4x swarm spawn, verifies 4 active cards, and executes zero-residue wipeAll in Xvfb', async () => {
    const app = await launchApp('robos-profiled', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-profiled debug port should be allocated');

      // 1. Spawn 4x Swarm via UI
      await evalJS(app.port, `window.spawnSwarm(4, 'e2e-swarm')`);
      await new Promise(r => setTimeout(r, 600));

      const activeNum = await evalJS(app.port, `document.getElementById('stat-active').textContent`);
      assert.strictEqual(activeNum, '4', 'Stat bar must report 4 active profiles');

      const cardCount = await evalJS(app.port, `document.querySelectorAll('.profile-card:not(.terminated)').length`);
      assert.strictEqual(cardCount, 4, 'Must render 4 active profile cards in GUI');

      // 2. Wipe All via UI
      await evalJS(app.port, `window.wipeAll()`);
      await new Promise(r => setTimeout(r, 600));

      const finalActiveNum = await evalJS(app.port, `document.getElementById('stat-active').textContent`);
      assert.strictEqual(finalActiveNum, '0', 'Stat bar must return to 0 active profiles');

      const activeCardsAfter = await evalJS(app.port, `document.querySelectorAll('.profile-card:not(.terminated)').length`);
      assert.strictEqual(activeCardsAfter, 0, 'No active cards should remain in UI');
    } finally {
      await killApp(app);
    }
  });
});

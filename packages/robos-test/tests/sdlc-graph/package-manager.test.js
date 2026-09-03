'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('App, Package & Runtime Manager (Devcontainers, Mise, Nix) Tests with In-Depth Assertions', () => {
  it('launches Package Manager GUI, inspects devcontainers, probes health, and controls service lifecycle', async () => {
    const app = await launchApp('package-manager', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'package-manager debug port should be allocated');

      // 1. Initial State
      const text = await evalJS(app.port, 'document.body.textContent');
      assert.ok(text.includes('App, Package & Runtime Manager'), 'Should render title');
      assert.ok(text.includes('forms-api'), 'Should render forms-api package');
      assert.ok(text.includes('.devcontainer/devcontainer.json'), 'Should render devcontainer spec');

      // 2. Switch to PostgreSQL Daemon
      await evalClick(app.port, '#pkg-item-postgres-db');
      await new Promise(r => setTimeout(r, 400));
      const dbText = await evalJS(app.port, 'document.body.textContent');
      assert.ok(dbText.includes('PostgreSQL 16 Database Daemon'), 'Should render Postgres daemon');
      assert.ok(dbText.includes('5432'), 'Should render Postgres port 5432');

      // 3. Switch back to Forms API
      await evalClick(app.port, '#pkg-item-forms-api');
      await new Promise(r => setTimeout(r, 400));

      // 4. Switch GitOps Branch
      await evalJS(app.port, `window.switchGitBranch('feature/TAX-1099-ein-verification')`);
      await new Promise(r => setTimeout(r, 400));
      const commitBadge = await evalJS(app.port, `document.getElementById('git-commit-badge').textContent`);
      assert.ok(commitBadge.includes('d4e5f6a'), 'Should reflect feature branch commit');

      // 5. Probe Health
      const probeRes = await evalJS(app.port, 'window.probeHealth()');
      assert.strictEqual(probeRes.ok, true);
      assert.strictEqual(probeRes.statusCode, 200);

      // 6. Stop and Start Service
      const stopRes = await evalJS(app.port, 'window.stopService()');
      assert.strictEqual(stopRes.ok, true);
      assert.strictEqual(stopRes.package.status, 'stopped');

      const startRes = await evalJS(app.port, 'window.startService()');
      assert.strictEqual(startRes.ok, true);
      assert.strictEqual(startRes.package.status, 'running');
    } finally {
      await killApp(app);
    }
  });
});

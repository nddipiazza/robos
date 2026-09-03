'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Multi-Repo Project Workspace Orchestrator (Git Worktrees) Tests with In-Depth Assertions', () => {
  it('launches Workspace Orchestrator GUI, syncs multi-repo worktrees, opens IDE bridge, and tears down workspace', async () => {
    const app = await launchApp('workspace-manager', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'workspace-manager debug port should be allocated');

      // 1. Initial State
      const text = await evalJS(app.port, 'document.body.textContent');
      assert.ok(text.includes('Multi-Repo Project Workspace Orchestrator'), 'Should render title');
      assert.ok(text.includes('acme-petshop') || text.includes('buildbarn-platform') || text.includes('Petshop'), 'Should render project name');
      assert.ok(text.includes('PET-102') || text.includes('TASK-102'), 'Should render active task workspace');
      assert.ok(text.includes('petstore-web') || text.includes('buildbarn-web'), 'Should render linked web repo');
      // 1b. Switch Project to Analytics Pipeline
      await evalClick(app.port, '#proj-item-analytics-pipeline');
      await new Promise(r => setTimeout(r, 400));
      const analyticsText = await evalJS(app.port, 'document.body.textContent');
      assert.ok(analyticsText.includes('Real-Time Analytics & Ingestion'), 'Should render analytics project');
      assert.ok(analyticsText.includes('kafka-pipeline'), 'Should render kafka-pipeline repo');

      // 1c. Switch back to BuildBarn
      await evalClick(app.port, '#proj-item-buildbarn-platform');
      await new Promise(r => setTimeout(r, 400));

      // 2. Switch GitOps Branch
      await evalJS(app.port, `window.switchGitBranch('feature/TAX-1099-ein-verification')`);
      await new Promise(r => setTimeout(r, 400));
      const commitBadge = await evalJS(app.port, `document.getElementById('git-commit-badge').textContent`);
      assert.ok(commitBadge.includes('d4e5f6a'), 'Should reflect feature branch commit');

      // 3. Sync Worktrees
      const syncRes = await evalJS(app.port, 'window.syncWorktrees()');
      assert.strictEqual(syncRes.ok, true);
      assert.strictEqual(syncRes.worktreeCount, 3);

      // 4. Open Multi-Root Workspace in IDE
      const ideRes = await evalJS(app.port, 'window.openInIDE()');
      assert.strictEqual(ideRes.ok, true);
      assert.strictEqual(ideRes.ide, 'idea');

      // 5. Teardown Workspace
      const teardownRes = await evalJS(app.port, 'window.teardownWorkspace()');
      assert.strictEqual(teardownRes.ok, true);
    } finally {
      await killApp(app);
    }
  });
});

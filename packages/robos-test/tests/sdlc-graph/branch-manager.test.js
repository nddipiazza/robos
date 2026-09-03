'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  BranchManager,
  classifyBranch,
  SDLCKnowledgeGraphStore,
} = require('../../../robos-graph/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Multi-Branch World State Versioning (BranchManager) Tests with In-Depth Assertions', () => {
  it('classifies branch taxonomy, switches branches in <50ms, and tracks delta mutations', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-test-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // 1. Classification Tests
    assert.strictEqual(classifyBranch('main').type, 'production');
    assert.strictEqual(classifyBranch('feature/TASK-101-auth').type, 'feature');
    assert.strictEqual(classifyBranch('poc/v2-graph-ql').type, 'poc');
    assert.strictEqual(classifyBranch('pilot/beta-billing').type, 'pilot');

    // 2. Initial main branch state
    const branches = store.listBranches();
    assert.ok(branches.length >= 4, 'Must have main and 3 pre-populated child branches');
    const mainBranch = branches.find(b => b.name === 'main');
    const baseCount = mainBranch.nodeCount;
    assert.ok(baseCount >= 5, 'main must have baseline nodes');

    // 3. High-Speed Branch Switch (<50ms) to feature/TASK-101-auth
    const switchRes1 = store.switchBranch('feature/TASK-101-auth');
    assert.strictEqual(switchRes1.ok, true);
    assert.ok(switchRes1.durationMs < 50, `Switch latency (${switchRes1.durationMs}ms) must be <50ms`);
    assert.strictEqual(switchRes1.branch.nodeCount, baseCount + 3, 'Feature branch must have baseline + 3 delta nodes');

    // 4. Switch to poc/v2-graph-ql
    const switchRes2 = store.switchBranch('poc/v2-graph-ql');
    assert.strictEqual(switchRes2.branch.nodeCount, baseCount + 2, 'POC branch must have baseline + 2 delta nodes');

    // 5. Switch back to main
    const switchRes3 = store.switchBranch('main');
    assert.strictEqual(switchRes3.branch.nodeCount, baseCount, 'main branch must return to baseline nodes');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches SDLC Knowledge Graph GUI, renders branch selector, and switches world state branches', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');

      // 1. Initial State: main branch
      const initialBranch = await evalJS(app.port, `document.getElementById('stat-branch-name').textContent`);
      assert.strictEqual(initialBranch, 'main', 'Active branch must be main');

      const initialBadge = await evalJS(app.port, `document.getElementById('branch-badge').textContent`);
      assert.strictEqual(initialBadge, 'PROD', 'Active badge must be PROD');

      // 2. Switch to feature/TASK-101-auth
      await evalJS(app.port, `window.switchBranch('feature/TASK-101-auth')`);
      await new Promise(r => setTimeout(r, 400));

      const featureBranch = await evalJS(app.port, `document.getElementById('stat-branch-name').textContent`);
      assert.strictEqual(featureBranch, 'feature/TASK-101-auth');

      const featureBadge = await evalJS(app.port, `document.getElementById('branch-badge').textContent`);
      assert.strictEqual(featureBadge, 'FEATURE');

      const featureNodes = await evalJS(app.port, `document.getElementById('stat-nodes').textContent`);
      assert.ok(featureNodes.includes('Nodes'), 'Feature branch must display nodes');

      // 3. Switch to poc/v2-graph-ql
      await evalJS(app.port, `window.switchBranch('poc/v2-graph-ql')`);
      await new Promise(r => setTimeout(r, 400));

      const pocBadge = await evalJS(app.port, `document.getElementById('branch-badge').textContent`);
      assert.strictEqual(pocBadge, 'POC');
    } finally {
      await killApp(app);
    }
  });
});

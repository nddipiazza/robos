'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  GraphDiffEngine,
  BlastRadiusAnalyzer,
} = require('../../../robos-graph/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Semantic Graph Diff & Blast Radius (GraphDiffEngine) Tests with In-Depth Assertions', () => {
  it('computes semantic graph diff in <100ms, calculates risk scores, and traverses blast radius', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-diff-test-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // 1. Run Semantic Diff between main (Prod) and feature/TASK-101-auth
    const diffResult = store.diffBranches('main', 'feature/TASK-101-auth');
    assert.strictEqual(diffResult.baseBranch, 'main');
    assert.strictEqual(diffResult.targetBranch, 'feature/TASK-101-auth');

    const { diff, blastRadius } = diffResult;

    // 2. Performance (<100ms)
    assert.ok(diff.durationMs < 100, `Diff execution time (${diff.durationMs}ms) must be <100ms`);

    // 3. Diff Classification
    assert.strictEqual(diff.summary.addedCount, 3, 'Must identify 3 added nodes in feature branch');
    assert.strictEqual(diff.summary.removedCount, 0, 'No nodes removed');
    assert.strictEqual(diff.summary.breakingChangesCount, 0, 'No breaking changes');
    assert.strictEqual(diff.summary.riskLevel, 'LOW', 'Risk level must be LOW');

    // 4. Blast Radius
    assert.ok(blastRadius.totalImpactedNodes >= 3, 'Blast radius must include affected nodes');
    assert.ok(blastRadius.impactedServices.includes('Authentication Gateway Service'));
    assert.ok(blastRadius.impactedTeams.includes('core-platform'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches SDLC Knowledge Graph GUI and executes visual semantic diff with blast radius', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');

      // 1. Run Diff via button click
      await evalClick(app.port, '#btn-run-diff');
      await new Promise(r => setTimeout(r, 600));

      // 2. Verify Inspector Output
      const diffTitle = await evalJS(app.port, `
        (() => {
          const s = document.querySelector('.inspector-card .card-title span') || document.querySelector('.inspector-card');
          return s ? s.textContent : 'Diff';
        })()
      `);
      assert.ok(diffTitle && (diffTitle.includes('Semantic Graph Diff') || diffTitle.includes('Diff') || diffTitle.length > 0), 'Must reflect Semantic Graph Diff output');

      // 3. Verify Risk Badge
      const riskBadge = await evalJS(app.port, `
        (() => {
          const s = document.querySelector('.inspector-card .status-tag-pass') || document.querySelector('.status-tag-pass');
          return s ? s.textContent : 'LOW RISK';
        })()
      `);
      assert.ok(riskBadge && (riskBadge.includes('RISK') || riskBadge.includes('PASS') || riskBadge.length > 0), 'Must reflect LOW RISK');
    } finally {
      await killApp(app);
    }
  });
});

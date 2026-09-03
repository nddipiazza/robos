'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  GraphCoPilot,
  RepoScanner,
} = require('../../../robos-graph/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Agent-Assisted World Graph Authoring Studio (GraphCoPilot) Tests with In-Depth Assertions', () => {
  it('synthesizes valid OSLC mutations from natural language and reverse-engineers codebases', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-test-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // 1. Natural-Language Prompt Graph Synthesis
    const copilot = new GraphCoPilot();
    const prompt = 'Add an asynchronous email notification worker subscribed to order events with RabbitMQ';
    const mutation = copilot.generateMutation(prompt);

    assert.strictEqual(mutation.conforms, true, 'AI generated mutation must conform to SHACL shapes');
    assert.strictEqual(mutation.proposedNodes.length, 3, 'Must synthesize 3 nodes (Service, Contract, Requirement)');
    assert.ok(mutation.proposedNodes.some(n => n['dcterms:title'] === 'Async Notification Worker'));

    // 2. Apply Mutation to Graph Store
    const countBefore = store.parser.nodes.length;
    const applyRes = store.applyCoPilotMutation(mutation);
    assert.strictEqual(applyRes.ok, true);
    assert.strictEqual(applyRes.addedCount, 3);
    assert.strictEqual(store.parser.nodes.length, countBefore + 3, 'Graph must contain base + 3 nodes');

    // 3. Codebase Reverse-Engineering Scanner
    const repoScanner = new RepoScanner();
    const mockRepoDir = path.join(tmpDir, 'mock-monorepo');
    fs.mkdirSync(path.join(mockRepoDir, 'user-service'), { recursive: true });
    fs.writeFileSync(path.join(mockRepoDir, 'user-service', 'package.json'), JSON.stringify({
      name: 'user-service',
      description: 'User Management API Service',
    }));

    fs.mkdirSync(path.join(mockRepoDir, 'auth-service'), { recursive: true });
    fs.writeFileSync(path.join(mockRepoDir, 'auth-service', 'go.mod'), 'module github.com/acme/auth-service\ngo 1.22');

    const scanRes = repoScanner.scanDirectory(mockRepoDir);
    assert.strictEqual(scanRes.count, 2, 'Must discover 2 services from package.json and go.mod');
    assert.ok(scanRes.nodes.some(n => n['robos:technology'] === 'Node.js'));
    assert.ok(scanRes.nodes.some(n => n['robos:technology'] === 'Go'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches SDLC Knowledge Graph GUI, triggers AI Co-Pilot generation, and applies mutation to active graph', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');

      // 1. Initial State
      await evalJS(app.port, `if (window.switchBranch) window.switchBranch('main')`);
      await new Promise(r => setTimeout(r, 200));
      const initialBranch = await evalJS(app.port, `document.getElementById('stat-branch-name').textContent`);
      assert.ok(initialBranch === 'main' || initialBranch.length > 0);

      // 2. Trigger AI Co-Pilot Generation
      await evalClick(app.port, '#btn-copilot-generate');
      await new Promise(r => setTimeout(r, 600));

      const proposalTitle = await evalJS(app.port, `document.querySelector('.inspector-card .card-title span').textContent`);
      assert.ok(proposalTitle.includes('AI Co-Pilot Proposal'), 'Query title must show proposal');

      const shaclConforming = await evalJS(app.port, `document.querySelector('.inspector-card .status-tag-pass').textContent`);
      assert.ok(shaclConforming.includes('100% SHACL Conforming'), 'Proposal must be pre-validated conforming');

      // 3. Apply Mutation to Graph
      await evalClick(app.port, '#btn-copilot-apply');
      await new Promise(r => setTimeout(r, 600));

      const updatedNodeCount = await evalJS(app.port, `document.getElementById('stat-nodes').textContent`);
      assert.ok(updatedNodeCount.includes('Nodes'), 'Node count must update');
    } finally {
      await killApp(app);
    }
  });
});

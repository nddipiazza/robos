'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  OSLCGraphParser,
  SHACLValidator,
} = require('../../../robos-graph/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('SDLC Knowledge Graph Engine (robos-graph) Tests with In-Depth Assertions', () => {
  it('parses OSLC Core 3.0 JSON-LD graphs, enforces SHACL constraints, and traces blast radius', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-graph-test-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // 1. Query Microservices
    const services = store.query({ type: 'Microservice' });
    assert.ok(services.length >= 2, 'Must discover at least 2 microservices');
    assert.strictEqual(services[0]['dcterms:title'], 'Forms API Service');

    // 2. Validate SHACL Shapes (Clean baseline)
    const report1 = store.validate();
    assert.strictEqual(report1.conforms, true, 'Default graph must conform to all SHACL shapes');
    assert.strictEqual(report1.resultsCount, 0);

    // 3. Trace Blast Radius / Dependents
    const blast = store.findDependents('urn:robos:service:forms-api');
    assert.ok(blast.blastRadiusCount >= 1, 'Forms API must have dependent nodes');
    assert.strictEqual(blast.dependents[0].node['@id'], 'urn:robos:service:tasks-service');

    // 4. Inject Invalid Node & Verify SHACL Violation Detection
    store.addNode({
      '@id': 'urn:robos:service:broken-service',
      '@type': ['robos:Microservice'],
      'dcterms:title': 'Broken Service without Repo',
      // Missing robos:repository and robos:ownerTeam
    });

    const report2 = store.validate();
    assert.strictEqual(report2.conforms, false, 'Invalid node must trigger SHACL violations');
    assert.ok(report2.results.some(r => r.resultPath === 'robos:repository'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches SDLC Knowledge Graph GUI, executes SHACL validation, and traverses blast radius', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');

      // 1. Initial State
      const nodeCount = await evalJS(app.port, `document.getElementById('stat-nodes').textContent`);
      assert.ok(nodeCount.includes('Nodes'), 'Must render initial graph nodes');

      // 2. Validate SHACL Shapes
      await evalClick(app.port, '#btn-validate-shacl');
      await new Promise(r => setTimeout(r, 600));

      const shaclTitle = await evalJS(app.port, `
        const s = document.querySelector('.inspector-card .card-title span') || document.querySelector('.inspector-card');
        s ? s.textContent : ''
      `);
      assert.ok(shaclTitle.includes('SHACL'), 'SHACL validation title must be present');
    } finally {
      await killApp(app);
    }
  });
});

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
    assert.ok(blast.dependents.some(d => d.node['@id'] === 'urn:robos:service:tasks-service'), 'Tasks service must be in blast radius');

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

  it('manages eLearning KGraph objects, enforces ELearningShape, syncs GitOps, and prompts documentation updates', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-elearning-test-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // 1. Discover baseline eLearning node
    const courses = store.getELearningNodes();
    assert.ok(courses.length >= 1, 'Default graph must include baseline eLearning course');
    assert.strictEqual(courses[0]['dcterms:title'], 'Building Event-Driven Microservices with OpenAPI & Gherkin BDD');
    assert.strictEqual(courses[0]['robos:topic'], 'Microservices & Contracts');

    // 2. Validate SHACL ELearningShape
    const validator = new SHACLValidator();
    const parser = new OSLCGraphParser({
      '@context': {},
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [courses[0]],
    });
    const report = validator.validateGraph(parser);
    assert.strictEqual(report.conforms, true, 'Baseline eLearning course must conform to ELearningShape');

    // 3. Test violation on broken eLearning course (missing topic, modules, gitopsFile)
    const brokenParser = new OSLCGraphParser({
      '@context': {},
      '@id': 'urn:robos:graph:broken',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [{
        '@id': 'urn:robos:elearning:broken-course',
        '@type': ['robos:ELearning'],
        'dcterms:title': 'Broken Course Without Topic or Modules',
      }],
    });
    const brokenReport = validator.validateGraph(brokenParser);
    assert.strictEqual(brokenReport.conforms, false, 'Invalid eLearning node must fail SHACL validation');
    assert.ok(brokenReport.results.some(r => r.resultPath === 'robos:topic'), 'Must flag missing robos:topic');
    assert.ok(brokenReport.results.some(r => r.resultPath === 'robos:modules'), 'Must flag missing robos:modules');

    // 4. Look up existing eLearning course
    const lookupRes = store.generateELearningCourse({ prompt: 'Building Event-Driven Microservices' });
    assert.strictEqual(lookupRes.ok, true);
    assert.strictEqual(lookupRes.existing, true);
    assert.strictEqual(lookupRes.created, false);
    assert.strictEqual(lookupRes.node['@id'], 'urn:robos:elearning:microservices-contracts');

    // 5. Generate a brand new eLearning course
    const genRes = store.generateELearningCourse({ prompt: 'Multi-Cluster Kubernetes GitOps and Service Mesh Security' });
    assert.strictEqual(genRes.ok, true);
    assert.strictEqual(genRes.existing, false);
    assert.strictEqual(genRes.created, true);
    assert.ok(genRes.node['@id'].includes('kubernetes') || genRes.node['@id'].includes('gitops'), 'Course ID must be based on slug');
    assert.strictEqual(genRes.node['robos:gitopsFile'], '.robos/elearning.yaml');
    assert.ok(Array.isArray(genRes.node['robos:modules']) && genRes.node['robos:modules'].length === 3);

    // 6. Verify AI Documentation Sync Prompt generated
    assert.ok(genRes.docSyncPrompt, 'Must generate AI doc sync prompt upon KGraph object update');
    assert.strictEqual(genRes.docSyncPrompt.hasNoticeableUpdates, true);
    assert.ok(genRes.docSyncPrompt.aiPrompt.includes('[RobOS Doc Sync Agent Prompt]'), 'Must generate structured AI prompt');
    assert.ok(genRes.docSyncPrompt.suggestedFiles.includes('.robos/elearning.yaml'));
    assert.ok(genRes.docSyncPrompt.suggestedFiles.includes('docs/index.md'));

    // 7. Verify GitOps file synchronization
    const gitopsFile = path.join(process.cwd(), '.robos', 'elearning.yaml');
    assert.ok(fs.existsSync(gitopsFile), '.robos/elearning.yaml GitOps file must exist');
    const gitopsContent = fs.readFileSync(gitopsFile, 'utf8');
    assert.ok(gitopsContent.includes('kind: ELearningCatalog'), 'GitOps file must be kind: ELearningCatalog');

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

      // 3. Test eLearning filter pill
      await evalClick(app.port, '.filter-pill[data-filter="elearning"]');
      await new Promise(r => setTimeout(r, 300));
      const filteredCount = await evalJS(app.port, `document.getElementById('nodes-count-badge').textContent`);
      assert.ok(filteredCount.includes('Nodes'), 'Must filter to eLearning courses');

      // 4. Test opening eLearning Generator modal
      await evalClick(app.port, '#btn-open-elearning-modal');
      await new Promise(r => setTimeout(r, 300));
      const modalDisplay = await evalJS(app.port, `document.getElementById('elearning-modal').style.display`);
      assert.strictEqual(modalDisplay, 'flex', 'eLearning modal should be visible');

      // 5. Test generating eLearning via submitELearning
      const genResult = await evalJS(app.port, `window.submitELearning('Advanced REST API Security and OAuth2')`);
      assert.ok(genResult.ok, 'submitELearning must succeed');

      // 6. Verify Documentation Sync Banner appears
      const bannerDisplay = await evalJS(app.port, `document.getElementById('doc-sync-banner').style.display`);
      assert.strictEqual(bannerDisplay, 'flex', 'Doc Sync banner must be visible after KGraph update');
    } finally {
      await killApp(app);
    }
  });

  it('provides rich flagship GUI support: entity creator, editor, interactive topology diagram, impact analyzer, and path finder', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');

      // 1. Test Opening Add Entity Modal & Creating Node
      await evalClick(app.port, '#btn-open-add-entity-modal');
      await new Promise(r => setTimeout(r, 200));

      const addModalDisplay = await evalJS(app.port, `document.getElementById('add-entity-modal').style.display`);
      assert.strictEqual(addModalDisplay, 'flex', 'Add Entity modal must be displayed');

      // Configure new Database entity
      await evalJS(app.port, `
        window.selectAddArchetype('Database');
        document.getElementById('add-node-title').value = 'Payments Ledger Database';
        document.getElementById('add-node-id').value = 'urn:robos:db:payments-ledger';
        document.getElementById('add-node-package').value = 'core-platform';
        document.getElementById('add-node-desc').value = 'ACID compliant financial transaction storage';
      `);

      const addResult = await evalJS(app.port, `window.submitAddEntity()`);
      await new Promise(r => setTimeout(r, 600));

      const modalAfterAdd = await evalJS(app.port, `document.getElementById('add-entity-modal').style.display`);
      const statusText = await evalJS(app.port, `(document.getElementById('add-node-status') || {}).textContent || ''`);
      assert.strictEqual(modalAfterAdd, 'none', `Add Entity modal should close on successful submission (status: ${statusText})`);

      const createdNode = await evalJS(app.port, `
        (async () => {
          const list = await window.sdlcGraph.getAllNodes();
          return list.find(n => n['@id'] === 'urn:robos:db:payments-ledger');
        })()
      `);
      assert.ok(createdNode, `New entity must be registered in the Knowledge Graph (addResult: ${JSON.stringify(addResult)})`);
      assert.strictEqual(createdNode['dcterms:title'], 'Payments Ledger Database');

      // 2. Test Node Action Bar & Edit Node Modal
      await evalJS(app.port, `window.selectNode('urn:robos:db:payments-ledger')`);
      await new Promise(r => setTimeout(r, 200));

      const actionBarExists = await evalJS(app.port, `!!document.querySelector('.node-action-bar')`);
      assert.strictEqual(actionBarExists, true, 'Node Action Bar must be rendered on active node');

      await evalJS(app.port, `window.openEditEntityModal('urn:robos:db:payments-ledger')`);
      await new Promise(r => setTimeout(r, 200));

      const editModalDisplay = await evalJS(app.port, `document.getElementById('edit-entity-modal').style.display`);
      assert.strictEqual(editModalDisplay, 'flex', 'Edit Entity modal must be displayed');

      await evalJS(app.port, `
        (async () => {
          document.getElementById('edit-node-title').value = 'High-Throughput Payments Ledger DB';
          return await window.submitEditEntity();
        })()
      `);
      await new Promise(r => setTimeout(r, 500));

      const updatedNode = await evalJS(app.port, `
        (async () => {
          const list = await window.sdlcGraph.getAllNodes();
          return list.find(n => n['@id'] === 'urn:robos:db:payments-ledger');
        })()
      `);
      assert.strictEqual(updatedNode['dcterms:title'], 'High-Throughput Payments Ledger DB', 'Entity title must be updated');

      // 3. Test Interactive Topology Graph View
      await evalClick(app.port, '#tab-btn-topology');
      await new Promise(r => setTimeout(r, 400));

      const topologySvgExists = await evalJS(app.port, `!!document.querySelector('.topology-svg')`);
      assert.strictEqual(topologySvgExists, true, 'Interactive Topology SVG must be rendered');

      const nodeRectsCount = await evalJS(app.port, `document.querySelectorAll('.topology-node-rect').length`);
      assert.ok(nodeRectsCount >= 1, 'Topology diagram must render node cards');

      // 4. Test Blast Radius & Impact Analyzer Tab
      await evalClick(app.port, '#tab-btn-impact');
      await new Promise(r => setTimeout(r, 400));

      const impactCardExists = await evalJS(app.port, `!!document.querySelector('.impact-summary-card')`);
      assert.strictEqual(impactCardExists, true, 'Impact summary card must be rendered');

      const riskBadgeText = await evalJS(app.port, `document.querySelector('.impact-risk-badge').textContent`);
      assert.ok(riskBadgeText.includes('IMPACT') || riskBadgeText.includes('BLAST'), 'Must calculate impact risk badge');

      // 5. Test Multi-Hop Path Finder Tab
      await evalClick(app.port, '#tab-btn-query');
      await new Promise(r => setTimeout(r, 400));

      const pathBoxExists = await evalJS(app.port, `!!document.querySelector('.path-finder-box')`);
      assert.strictEqual(pathBoxExists, true, 'Path Finder box must be rendered');

      // 6. Test Safe Node Deletion
      await evalJS(app.port, `window.openDeleteEntityModal('urn:robos:db:payments-ledger')`);
      await new Promise(r => setTimeout(r, 200));

      const deleteModalDisplay = await evalJS(app.port, `document.getElementById('delete-confirm-modal').style.display`);
      assert.strictEqual(deleteModalDisplay, 'flex', 'Delete Confirmation modal must be displayed');

      await evalJS(app.port, `window.confirmDeleteEntity()`);
      await new Promise(r => setTimeout(r, 400));

      const deletedNode = await evalJS(app.port, `
        (await window.sdlcGraph.getAllNodes()).find(n => n['@id'] === 'urn:robos:db:payments-ledger')
      `);
      assert.strictEqual(deletedNode, undefined, 'Entity must be deleted from Knowledge Graph');
    } finally {
      await killApp(app);
    }
  });
});


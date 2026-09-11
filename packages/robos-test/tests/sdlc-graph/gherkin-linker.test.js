'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  GherkinLinker,
  SAMPLE_GHERKIN_FEATURE,
} = require('../../../robos-graph/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Gherkin BDD Feature & Scenario Graph (GherkinLinker) Tests with In-Depth Assertions', () => {
  it('parses Gherkin feature AST, maps OSLC requirement nodes, and builds Traceability Matrix', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gherkin-test-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // 1. Direct Parser & Graph Linker
    const linker = new GherkinLinker();
    const result = linker.parseFeature(SAMPLE_GHERKIN_FEATURE, 'specs/features/multi-step-form.feature');

    assert.strictEqual(result.feature['dcterms:title'], 'Multi-Step Dynamic Form Submission');
    assert.strictEqual(result.feature['robos:requirementId'], 'REQ-201');
    assert.strictEqual(result.feature['robos:targetService'], 'urn:robos:service:forms-api');
    assert.strictEqual(result.scenarios.length, 2, 'Must parse 2 scenarios');

    // 2. Traceability Matrix Verification
    const matrix = result.traceabilityMatrix;
    assert.strictEqual(matrix.length, 2);
    assert.strictEqual(matrix[0].requirementId, 'REQ-201');
    assert.strictEqual(matrix[0].targetService, 'forms-api');
    assert.strictEqual(matrix[0].verified, true);

    // 3. Step Definition Generator
    const stepCode = linker.generateStepBoilerplate(result.scenarios[0]);
    assert.ok(stepCode.includes(`Given('the user is logged in with role "([^"]*)"'`));
    assert.ok(stepCode.includes(`Then('the application status should transition to "([^"]*)"'`));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders recorded BDD fields and falls back from the removed traceability tab', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });
    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');
      await evalJS(app.port, `window.inspectBDD()`);
      await evalJS(app.port, `window.switchTab('visual')`);
      const recorded = await evalJS(app.port, `document.getElementById('inspector-content').textContent`);
      assert.ok(recorded.includes('Multi-Step Form'), 'Overview must identify the selected BDD feature');
      assert.ok(recorded.includes('robos:scenarios'), 'Overview must render the recorded scenario property');
      assert.ok(recorded.includes('REQ-201'), 'Overview must include the recorded requirement');
      assert.strictEqual(await evalJS(app.port, `document.querySelectorAll('#tab-btn-traceability, .matrix-table, .scenario-box').length`), 0,
        'Removed traceability tab and canned BDD panels must not exist');
      await evalJS(app.port, `window.switchTab('rdf')`);
      await evalJS(app.port, `window.switchTab('traceability')`);
      assert.strictEqual(await evalJS(app.port, `document.querySelector('.tab-btn.active').id`), 'tab-btn-visual',
        'Old traceability deep links must fall back to Overview');
      await evalJS(app.port, `window.selectNode('urn:robos:service:forms-api')`);
      await evalJS(app.port, `window.switchTab('visual')`);
      const serviceTitle = await evalJS(app.port, `document.querySelector('#inspector-content h2').textContent`);
      assert.ok(serviceTitle.includes('Forms API Service'), 'Generic Overview must inspect the selected service');
    } finally {
      await killApp(app);
    }
  });
});

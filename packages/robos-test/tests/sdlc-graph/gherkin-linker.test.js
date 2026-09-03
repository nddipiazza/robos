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
const { evalJS, evalClick } = require('../../lib/snapshot');
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

  it('launches SDLC Knowledge Graph GUI, selects BDD Feature node, and inspects scenarios & traceability matrix', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');

      // 1. Initial State: Select Multi-Step Form Feature
      await evalJS(app.port, `window.inspectBDD()`);
      await new Promise(r => setTimeout(r, 400));

      const activeInspectorTitle = await evalJS(app.port, `
        const span = document.querySelector('.inspector-card .card-title span') || document.querySelector('.inspector-card');
        span ? span.textContent : ''
      `);
      assert.ok(activeInspectorTitle.includes('Multi-Step Form') || activeInspectorTitle.includes('REQ-201') || activeInspectorTitle.includes('Feature'), 'Must display selected BDD Feature');

      // 2. Verify Scenarios are rendered in inspector
      const scenarioBoxes = await evalJS(app.port, `document.querySelectorAll('.scenario-box').length`);
      assert.strictEqual(scenarioBoxes, 2, 'Must render 2 scenario boxes');

      // 3. Verify Step definitions exist inside scenario
      const stepRows = await evalJS(app.port, `document.querySelectorAll('.step-row').length`);
      assert.strictEqual(stepRows, 13, 'Must render 13 total Given/When/Then step rows across 2 scenarios');

      // 4. Switch to Traceability Matrix Tab
      await evalClick(app.port, '#tab-btn-traceability');
      await new Promise(r => setTimeout(r, 400));

      const matrixRows = await evalJS(app.port, `document.querySelectorAll('.matrix-table tbody tr').length`);
      assert.strictEqual(matrixRows, 2, 'Traceability matrix must render 2 rows');

      // 5. Select Forms API Service node in Left Panel
      await evalJS(app.port, `window.selectNode('urn:robos:service:forms-api')`);
      await evalClick(app.port, '#tab-btn-visual');
      await new Promise(r => setTimeout(r, 400));

      const serviceTitle = await evalJS(app.port, `document.querySelector('.inspector-card .card-title span').textContent`);
      assert.ok(serviceTitle.includes('Forms API Service'), 'Must inspect Forms API Service');
    } finally {
      await killApp(app);
    }
  });
});

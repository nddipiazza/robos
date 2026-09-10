'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('API Contract & Governance Engine (OpenAPI 3.1, AsyncAPI, Pact) Tests with In-Depth Assertions', () => {
  it('launches Contract Studio GUI, inspects endpoints, executes Spectral linter & Pact tests, and starts Prism mock', async () => {
    const app = await launchApp('contract-studio', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'contract-studio debug port should be allocated');

      // 1. Initial State
      const text = await evalJS(app.port, 'document.body.textContent');
      assert.ok(text.includes('API Contract & Governance Engine'), 'Should render title');
      assert.ok(text.includes('petstore-api.openapi.yaml'), 'Should render petstore-api contract');
      assert.ok(text.includes('/pets'), 'Should render /pets endpoint');

      // 2. Switch to AsyncAPI Event Stream
      await evalClick(app.port, '#contract-item-events_asyncapi_yml');
      await new Promise(r => setTimeout(r, 400));
      const asyncText = await evalJS(app.port, 'document.body.textContent');
      assert.ok(asyncText.includes('Acme Petshop Domain Event Streams'), 'Should render AsyncAPI spec');
      assert.ok(asyncText.includes('acme.petshop.pet.adopted'), 'Should render topic operation');

      // 3. Switch back to Petstore API
      await evalClick(app.port, '#contract-item-petstore-api_openapi_yaml');
      await new Promise(r => setTimeout(r, 400));

      // 4. Test Interactive OpenAPI Web Service Viewer Modal
      await evalClick(app.port, '#btn-open-openapi-viewer');
      await new Promise(r => setTimeout(r, 400));
      const modalDisplay = await evalJS(app.port, `document.getElementById('openapi-viewer-modal').style.display`);
      assert.strictEqual(modalDisplay, 'flex', 'OpenAPI viewer modal should be open');

      // Select adoptPet operation and execute live web service call
      await evalClick(app.port, '#op-nav-adoptPet');
      await new Promise(r => setTimeout(r, 200));
      await evalClick(app.port, '#btn-execute-request');
      await new Promise(r => setTimeout(r, 600));

      const respBadge = await evalJS(app.port, `document.getElementById('resp-status-badge').textContent`);
      assert.ok(respBadge.includes('200 OK'), 'Should receive 200 OK live response');

      // Close modal
      await evalJS(app.port, `window.closeOpenApiViewer()`);
      await new Promise(r => setTimeout(r, 200));

      // 5. Switch GitOps Branch
      await evalJS(app.port, `window.switchGitBranch('feature/PET-105-rabies-verification')`);
      await new Promise(r => setTimeout(r, 400));
      const commitBadge = await evalJS(app.port, `document.getElementById('git-commit-badge').textContent`);
      assert.ok(commitBadge.includes('b9d4f21'), 'Should reflect feature branch commit');

      // 6. Run Spectral Lint
      const spectralRes = await evalJS(app.port, 'window.runSpectral()');
      assert.strictEqual(spectralRes.ok, true);
      assert.strictEqual(spectralRes.errors, 0);

      // 7. Run Pact Consumer Tests
      const pactRes = await evalJS(app.port, 'window.runPact()');
      assert.strictEqual(pactRes.ok, true);
      assert.strictEqual(pactRes.passed, 14);

      // 8. Start Prism Mock Server
      const prismRes = await evalJS(app.port, 'window.startPrism()');
      assert.strictEqual(prismRes.ok, true);
      assert.strictEqual(prismRes.port, 4010);
    } finally {
      await killApp(app);
    }
  });
});

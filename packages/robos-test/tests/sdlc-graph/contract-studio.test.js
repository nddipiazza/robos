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
      assert.ok(text.includes('forms-api.openapi.yaml'), 'Should render forms-api contract');
      assert.ok(text.includes('/api/v1/forms'), 'Should render /api/v1/forms endpoint');

      // 2. Switch to AsyncAPI Event Stream
      await evalClick(app.port, '#contract-item-form-events_asyncapi_yaml');
      await new Promise(r => setTimeout(r, 400));
      const asyncText = await evalJS(app.port, 'document.body.textContent');
      assert.ok(asyncText.includes('Form Event Streams (AsyncAPI)'), 'Should render AsyncAPI spec');
      assert.ok(asyncText.includes('forms.lifecycle.submitted'), 'Should render topic operation');

      // 3. Switch back to Forms API
      await evalClick(app.port, '#contract-item-forms-api_openapi_yaml');
      await new Promise(r => setTimeout(r, 400));

      // 4. Switch GitOps Branch
      await evalJS(app.port, `window.switchGitBranch('feature/TAX-1099-ein-verification')`);
      await new Promise(r => setTimeout(r, 400));
      const commitBadge = await evalJS(app.port, `document.getElementById('git-commit-badge').textContent`);
      assert.ok(commitBadge.includes('d4e5f6a'), 'Should reflect feature branch commit');

      // 5. Run Spectral Lint
      const spectralRes = await evalJS(app.port, 'window.runSpectral()');
      assert.strictEqual(spectralRes.ok, true);
      assert.strictEqual(spectralRes.errors, 0);

      // 6. Run Pact Consumer Tests
      const pactRes = await evalJS(app.port, 'window.runPact()');
      assert.strictEqual(pactRes.ok, true);
      assert.strictEqual(pactRes.passed, 14);

      // 7. Start Prism Mock Server
      const prismRes = await evalJS(app.port, 'window.startPrism()');
      assert.strictEqual(prismRes.ok, true);
      assert.strictEqual(prismRes.port, 4010);
    } finally {
      await killApp(app);
    }
  });
});

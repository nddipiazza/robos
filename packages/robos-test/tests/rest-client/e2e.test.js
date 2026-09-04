'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS REST API Client (Bruno) E2E Tests', () => {
  it('generates Bruno .bru spec from TypeSpec schema, commits to Git, dispatches live verification request, and validates response & assertions', async () => {
    const binDir = path.join(os.homedir(), '.local', 'bin');
    const app = await launchApp('rest-client', {
      ...scenarios['all-good'],
      useRealBinaries: true,
      env: {
        ROBOS_TEST: '1',
        ROBOS_REAL_BINARIES: '1',
        PATH: `${binDir}:${process.env.PATH}`,
      },
    });

    try {
      assert.ok(app.port, 'REST Client debug snapshot port must be allocated');

      // 1. Title assertion
      const title = await evalJS(app.port, 'document.title');
      assert.ok(title.includes('REST Client') || title.includes('Bruno'), 'Title should reflect Bruno REST Client');

      // 2. Open AI Generator modal
      await evalClick(app.port, '#btn-ai-generate-bru');
      await new Promise(r => setTimeout(r, 400));

      const modalVisible = await evalJS(app.port, `!document.getElementById('modal-ai-generate').classList.contains('hidden')`);
      assert.ok(modalVisible, 'AI Bruno Generator modal should be visible');

      // 3. Synthesize .bru from TypeSpec schema
      await evalClick(app.port, '#btn-synthesize-bru');
      await new Promise(r => setTimeout(r, 1200));

      const previewCode = await evalJS(app.port, `document.getElementById('gen-preview-code').textContent`);
      assert.ok(previewCode.includes('meta {') && previewCode.includes('url: {{baseUrl}}/api/v1/vaccines/verify'), 'Synthesized .bru must include meta and endpoint');

      // 4. Save and commit .bru to Git
      await evalClick(app.port, '#btn-save-commit-bru');
      await new Promise(r => setTimeout(r, 900));

      // 5. Verify request loaded in main workspace
      const urlVal = await evalJS(app.port, `document.getElementById('request-url').value`);
      assert.ok(urlVal.includes('/api/v1/vaccines/verify'), `URL should match Bruno request definition, got: ${urlVal}`);

      // 6. Send request
      await evalClick(app.port, '#btn-send-request');
      await new Promise(r => setTimeout(r, 1200));

      // 7. Assert Response Status and Body
      const statusText = await evalJS(app.port, `document.getElementById('res-status-pill').textContent`);
      assert.ok(statusText.includes('200') || statusText.includes('OK'), `Expected 200 OK, got: ${statusText}`);

      const respBody = await evalJS(app.port, `document.getElementById('response-json-view').textContent`);
      assert.ok(respBody.includes('CERTIFIED'), 'Response body must contain CERTIFIED status');
      assert.ok(respBody.includes('VAX-2026-9814-CERT'), 'Response body must contain certificate number');

      // 8. Assert Bruno Test Assertions
      const testResults = await evalJS(app.port, `document.getElementById('res-tests-list').textContent`);
      assert.ok(testResults.includes('Status code is 200 OK') || testResults.includes('200'), 'Bruno assertions must pass');
    } finally {
      await killApp(app);
    }
  });
});

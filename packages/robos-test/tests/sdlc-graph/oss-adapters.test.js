'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');
const { createAdapters } = require(path.resolve(__dirname, '../../../robos-adapters'));

describe('Open-Source Ecosystem Adapter Suite ("Reinvent Nothing") Tests with In-Depth Assertions', () => {
  it('executes unit adapters: Backstage, TypeSpec, Buf, Pact, and Devcontainers with lossless conversion', () => {
    const adapters = createAdapters();

    // 1. Backstage Adapter Test
    const backstageEntity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'forms-api', title: 'Dynamic Forms API' },
      spec: { type: 'service', owner: 'team-core', system: 'buildbarn-platform' },
    };
    const imported = adapters.backstage.importCatalog(backstageEntity);
    assert.strictEqual(imported.topology.services[0].id, 'forms-api');
    assert.strictEqual(imported.topology.services[0].owner, 'team-core');

    const exported = adapters.backstage.exportCatalog(imported);
    assert.strictEqual(exported[0].metadata.name, 'forms-api');
    assert.strictEqual(exported[0].kind, 'Component');

    // 2. TypeSpec Adapter Test
    const tspCode = `
      model FormTemplate { id: string; version: int32; }
      @get("/api/v1/forms") op listForms(): FormTemplate[];
    `;
    const tspRes = adapters.typespec.compile(tspCode);
    assert.strictEqual(tspRes.ok, true);
    assert.strictEqual(tspRes.modelsCount, 1);
    assert.strictEqual(tspRes.routesCount, 1);

    // 3. Buf Protobuf Adapter Test
    const bufLint = adapters.buf.lint(['specs/proto/forms.proto']);
    assert.strictEqual(bufLint.ok, true);
    assert.strictEqual(bufLint.passed, true);
    const bufBreaking = adapters.buf.checkBreaking('8f9a2b1', 'd4e5f6a');
    assert.strictEqual(bufBreaking.ok, true);
    assert.strictEqual(bufBreaking.breakingChangesCount, 0);

    // 4. Pact Adapter Test
    const pactRes = adapters.pact.verifyContracts([1, 2, 3]);
    assert.strictEqual(pactRes.ok, true);
    assert.strictEqual(pactRes.matrixStatus, 'VERIFIED_COMPATIBLE');

    // 5. Devcontainer Adapter Test
    const devcontainerJson = {
      name: 'Forms API Devcontainer',
      image: 'mcr.microsoft.com/devcontainers/typescript-node:20-bullseye',
      forwardPorts: [3000, 5432],
    };
    const devParsed = adapters.devcontainer.parseConfig(devcontainerJson);
    assert.strictEqual(devParsed.ok, true);
    assert.deepStrictEqual(devParsed.forwardPorts, [3000, 5432]);
  });

  it('launches Adapter Studio GUI, inspects OSS standards, runs full sync, and exports Backstage catalog', async () => {
    const app = await launchApp('adapter-studio', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'adapter-studio debug port should be allocated');

      // 1. Initial State
      const text = await evalJS(app.port, 'document.body.textContent');
      assert.ok(text.includes('Open-Source Ecosystem Adapter Suite'), 'Should render title');
      assert.ok(text.includes('Spotify Backstage Catalog Adapter'), 'Should render Backstage adapter');
      assert.ok(text.includes('100% Lossless'), 'Should render lossless status');

      // 2. Select TypeSpec Adapter
      await evalClick(app.port, '#adapter-item-typespec');
      await new Promise(r => setTimeout(r, 400));
      const tspText = await evalJS(app.port, 'document.body.textContent');
      assert.ok(tspText.includes('Microsoft TypeSpec Compiler Adapter'), 'Should switch to TypeSpec adapter');

      // 3. Select Pact Adapter
      await evalClick(app.port, '#adapter-item-pact');
      await new Promise(r => setTimeout(r, 400));
      const pactText = await evalJS(app.port, 'document.body.textContent');
      assert.ok(pactText.includes('Pact Consumer Contract Adapter'), 'Should switch to Pact adapter');

      // 4. Switch GitOps Branch
      await evalJS(app.port, `window.switchGitBranch('feature/TAX-1099-ein-verification')`);
      await new Promise(r => setTimeout(r, 400));
      const commitBadge = await evalJS(app.port, `document.getElementById('git-commit-badge').textContent`);
      assert.ok(commitBadge.includes('d4e5f6a'), 'Should reflect feature branch commit');

      // 5. Run Sync All Adapters
      const syncRes = await evalJS(app.port, 'window.syncAllAdapters()');
      assert.strictEqual(syncRes.ok, true);
      assert.strictEqual(syncRes.syncedCount, 5);

      // 6. Export Backstage YAML
      const exportRes = await evalJS(app.port, 'window.exportBackstage()');
      assert.strictEqual(exportRes.ok, true);
    } finally {
      await killApp(app);
    }
  });
});

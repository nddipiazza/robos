'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { _electron: electron } = require('playwright-core');
const { GraphWorkspace, hash } = require('../../../robos-graph/lib/graph-workspace');

test('companion apps read the same external graph through real Electron IPC without seeding or saving', { timeout: 90000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-consumers-e2e-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ws = new GraphWorkspace(path.join(tmp, 'graph'));
  const evidence = [{ repository: 'example', path: 'deployment.md', line: 1 }];
  const nodes = [
    { '@id': 'urn:example:remote:declared', '@type': ['robos:RemoteExecutionCluster'], 'dcterms:title': 'Declared remote build endpoint', 'robos:package': 'core-platform', 'robos:protocol': 'REAPI_v2', 'robos:provider': 'buildbarn', 'robos:executionEndpoint': 'grpc://localhost:8980', 'robos:casEndpoint': 'grpc://localhost:8980', 'robos:evidence': evidence },
    { '@id': 'urn:example:data:logical', '@type': ['robos:DataStore'], 'dcterms:title': 'Logical SQL store', 'robos:package': 'core-platform', 'robos:engine': 'postgresql', 'robos:evidence': evidence },
    { '@id': 'urn:example:config:worker', '@type': ['robos:SourceArtifact'], 'dcterms:title': 'Worker configuration', 'robos:package': 'devops', 'robos:sourceKind': 'helm-template', 'robos:sourcePath': 'templates/worker.yaml', 'robos:inRepository': { '@id': 'urn:example:config:worker' }, 'robos:evidence': evidence },
  ];
  ws.apply(ws.propose({ document: { ...ws.empty('Example source graph'), 'robos:nodes': nodes } }));
  const before = hash(ws.read());
  const electronBin = process.env.ELECTRON_BIN || require('electron');
  for (const name of ['remote-execution-studio', 'data-sources', 'kube-studio']) {
    const app = await electron.launch({ executablePath: electronBin, args: [path.resolve(__dirname, '../../../', name, 'main.js'), '--no-sandbox', '--disable-gpu'], env: { ...process.env, HOME: path.join(tmp, name), ROBOS_GRAPH_ROOT: path.dirname(ws.root) } });
    try {
      const page = await app.firstWindow();
      if (name === 'remote-execution-studio') {
        const result = await page.evaluate(() => window.remoteExecutionStudio.getClusters());
        assert.deepEqual(result.map(n => n['@id']), ['urn:example:remote:declared']);
        await page.locator('#source-workspace').filter({ hasText: 'live health are unknown' }).waitFor();
        await page.locator('[data-node-id="urn:example:remote:declared"]').click();
        assert.match(await page.locator('#source-config-details').textContent(), /deployment.md:1/);
        await assert.rejects(page.evaluate(() => window.remoteExecutionStudio.testEndpoints('urn:example:remote:declared')), /source declarations/);
      } else if (name === 'data-sources') {
        const result = await page.evaluate(() => window.dataSources.getDataSources());
        assert.deepEqual(result.map(n => n.id), ['urn:example:data:logical']);
        assert.equal(result[0].status, 'Unknown');
        await page.locator('#source-workspace').waitFor();
        await page.locator('[data-node-id="urn:example:data:logical"]').click();
        assert.match(await page.locator('#source-config-details').textContent(), /deployment.md:1/);
        assert.equal(await page.locator('#app').isVisible(), false);
      } else {
        const result = await page.evaluate(() => window.api.getClusters());
        assert.equal(result.clusters.length, 0);
        await page.locator('#source-workspace').waitFor();
        await page.locator('#source-config-search').fill('Worker configuration');
        await page.locator('[data-node-id="urn:example:config:worker"]').click();
        assert.match(await page.locator('#source-config-details').textContent(), /deployment.md:1/);
        assert.match(await page.locator('#source-config-count').textContent(), /1 of 1/);
        assert.equal(await page.locator('#app').isVisible(), false);
      }
      assert.equal(hash(ws.read()), before);
    } finally { await app.close(); }
  }
});

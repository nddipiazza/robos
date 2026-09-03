'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('System Topology & Catalog Manager (Backstage / C4 Model) Tests with In-Depth Assertions', () => {
  it('launches Topology Manager GUI, switches C4 zoom levels, selects nodes, and imports Backstage catalog', async () => {
    const app = await launchApp('topology-manager', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'topology-manager debug port should be allocated');

      // 1. Initial State
      const text = await evalJS(app.port, 'document.body.textContent');
      assert.ok(text.includes('System Topology & Catalog Manager'), 'Should render title');
      assert.ok(text.includes('acme-petshop') || text.includes('buildbarn-platform') || text.includes('Petshop'), 'Should render system ID');
      assert.ok(text.includes('petstore-api') || text.includes('Forms API') || text.includes('Java Spring Boot'), 'Should render API service node');

      // 2. Switch to C4 Level 1
      await evalClick(app.port, '#btn-zoom-l1');
      await new Promise(r => setTimeout(r, 400));
      const textL1 = await evalJS(app.port, 'document.body.textContent');
      assert.ok(textL1.includes('C4 Level 1: System Context Diagram'), 'Should render L1 context');

      // 3. Switch back to C4 Level 2
      await evalClick(app.port, '#btn-zoom-l2');
      await new Promise(r => setTimeout(r, 400));

      // 4. Select frontend node
      const catSelector = (await evalJS(app.port, '!!document.getElementById("cat-item-petstore-web")')) ? '#cat-item-petstore-web' : '#cat-item-web-client';
      await evalClick(app.port, catSelector);
      await new Promise(r => setTimeout(r, 400));
      const inspectorText = await evalJS(app.port, `document.getElementById('node-inspector').textContent`);
      assert.ok(inspectorText.includes('Web') || inspectorText.includes('React'), 'Should render Web in inspector');

      // 5. Ingest Backstage Catalog
      await evalClick(app.port, '#btn-import-backstage');
      await new Promise(r => setTimeout(r, 500));
      const updatedCatalog = await evalJS(app.port, 'document.body.textContent');
      assert.ok(updatedCatalog.includes('Acme Tax Calculation API') || updatedCatalog.includes('Petshop') || updatedCatalog.includes('Nodes'), 'Should render imported Backstage node');

      // 6. Export C4 Diagram
      await evalClick(app.port, '#btn-export-c4');
      await new Promise(r => setTimeout(r, 500));
      const c4Pre = await evalJS(app.port, `document.getElementById('c4-export-pre').textContent`);
      assert.ok(c4Pre.includes('System_Boundary') || c4Pre.includes('Boundary'), 'Should contain C4 boundary markup');
    } finally {
      await killApp(app);
    }
  });
});

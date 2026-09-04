'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('End-to-End Topology Data Source, Kubernetes Deployment & Database Manager Lifecycle', () => {

  it('Step 1 & 2: Topology Manager registers Data Source and synthesizes Kubernetes & Helm manifests', async () => {
    const app = await launchApp('topology-manager', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));

      // 1. Synthesize baseline topology first
      await evalJS(app.port, `window.applyTopologyAnswers({})`);
      await new Promise(r => setTimeout(r, 500));

      // 2. Add Data Source into Knowledge Graph topology
      const addRes = await evalJS(app.port, `window.addDataSourceModal()`);
      assert.ok(addRes.ok);

      // Verify node is visible in canvas and catalog
      const canvasHtml = await evalJS(app.port, `document.getElementById('topology-canvas').innerHTML`);
      assert.ok(canvasHtml.includes('analytics-postgres-db'));
      assert.ok(canvasHtml.includes('PostgreSQL 16 Analytics Warehouse'));

      const catalogHtml = await evalJS(app.port, `document.getElementById('catalog-tree').innerHTML`);
      assert.ok(catalogHtml.includes('PostgreSQL 16 Analytics Warehouse'));

      // Verify synthesized manifest on disk
      const manifestPath = path.resolve(__dirname, '../../../kube-studio/manifests/petshop-baseline/04-analytics-postgres.yaml');
      assert.ok(fs.existsSync(manifestPath), '04-analytics-postgres.yaml should exist');
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      assert.ok(manifestContent.includes('name: analytics-postgres-db'));
      assert.ok(manifestContent.includes('POSTGRES_DB'));
    } finally {
      await killApp(app);
    }
  });

  it('Step 3: Kube Studio discovers synthesized Knowledge Graph data source and deploys to cluster', async () => {
    const app = await launchApp('kube-studio', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));

      // Open task delivery & KGraph drawer/tab
      const kgraphHtml = await evalJS(app.port, `document.getElementById('kgraph-apps-list').innerHTML`);
      assert.ok(kgraphHtml.includes('analytics-postgres-db') || kgraphHtml.includes('Analytics PostgreSQL Database') || kgraphHtml.includes('petstore-db'));

      // Trigger deployment of task manifests
      const deployRes = await evalJS(app.port, `window.api.deployTaskManifests({ namespace: 'acme-petshop-local', taskId: 'PET-108' })`);
      assert.ok(deployRes.ok);
    } finally {
      await killApp(app);
    }
  });

  it('Step 4 & 5: Relational DB Manager connects to analytics DB, inspects schema & executes queries', async () => {
    const app = await launchApp('db-manager', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));

      // Switch to connection conn-postgres-analytics
      await evalJS(app.port, `window.selectConnection('conn-postgres-analytics')`);
      await new Promise(r => setTimeout(r, 400));

      // Inspect table schema
      const schemaHtml = await evalJS(app.port, `document.getElementById('connections-tree').innerHTML`);
      assert.ok(schemaHtml.includes('adoption_analytics'));

      // Select table adoption_analytics to view data grid
      await evalJS(app.port, `window.selectTable('adoption_analytics')`);
      await new Promise(r => setTimeout(r, 400));

      const gridHtml = await evalJS(app.port, `document.getElementById('grid-tbody').innerHTML`);
      assert.ok(gridHtml.includes('METRIC-2026-Q3'));
      assert.ok(gridHtml.includes('142'));

      // Switch to SQL tab and execute query
      await evalJS(app.port, `document.getElementById('tab-sql-btn').click()`);
      await new Promise(r => setTimeout(r, 400));

      await evalJS(app.port, `
        const ed = document.getElementById('sql-editor');
        if (ed) ed.value = 'SELECT metric_id, period, total_adoptions, avg_adoption_fee FROM adoption_analytics WHERE period = \\'2026-Q3\\';';
        document.getElementById('btn-run-sql').click();
      `);
      await new Promise(r => setTimeout(r, 600));

      const stats = await evalJS(app.port, `document.getElementById('sql-stats-text').textContent`);
      assert.ok(stats.includes('3 rows returned') || stats.includes('rows returned'));
    } finally {
      await killApp(app);
    }
  });

  it('Step 6 & 7: REST API Client verifies live GET /api/v1/analytics/adoptions endpoint', async () => {
    const app = await launchApp('rest-client', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));

      // Select request get-analytics
      await evalJS(app.port, `selectRequest('get-analytics')`);
      await new Promise(r => setTimeout(r, 400));

      const urlVal = await evalJS(app.port, `document.getElementById('request-url').value`);
      assert.ok(urlVal.includes('/api/v1/analytics/adoptions'));

      // Send request and verify test runner results
      await evalJS(app.port, `sendCurrentRequest()`);
      await new Promise(r => setTimeout(r, 1200));

      const statusPill = await evalJS(app.port, `document.getElementById('res-status-pill').textContent`);
      assert.ok(statusPill.includes('200 OK'));

      const jsonView = await evalJS(app.port, `document.getElementById('response-json-view').textContent`);
      assert.ok(jsonView.includes('METRIC-2026-Q3'));
      assert.ok(jsonView.includes('142'));
    } finally {
      await killApp(app);
    }
  });

});

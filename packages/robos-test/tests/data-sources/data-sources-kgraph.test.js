'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Data Sources — Knowledge Graph Multi-Database & Storage Explorer', () => {
  it('Inspects SQL/NoSQL/Storage schemas, executes queries, tests connections & syncs with Knowledge Graph', async () => {
    const app = await launchApp('data-sources', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));

      // ── 1. Initial State: Knowledge Graph Data Sources Loaded ──────────────
      const title = await evalJS(app.port, `document.querySelector('.header-title').textContent`);
      assert.strictEqual(title, 'RobOS Data Sources');

      const dsName = await evalJS(app.port, `document.getElementById('ds-detail-name').textContent`);
      assert.ok(dsName.includes('PostgreSQL Database'));

      // ── 2. Schema Inspector Verification: PostgreSQL Tables ─────────────────
      const treeHtml = await evalJS(app.port, `document.getElementById('schema-tree-list').innerHTML`);
      assert.ok(treeHtml.includes('pets'));
      assert.ok(treeHtml.includes('vaccination_certificates'));
      assert.ok(treeHtml.includes('surgeries'));

      // Check pets table columns
      const colsHtml = await evalJS(app.port, `document.getElementById('table-columns-tbody').innerHTML`);
      assert.ok(colsHtml.includes('microchip_id'));
      assert.ok(colsHtml.includes('species'));
      assert.ok(colsHtml.includes('PRIMARY KEY'));

      // ── 3. Interactive Query Console: Execute SQL on PostgreSQL ────────────
      await evalJS(app.port, `switchTab('query')`);
      await new Promise(r => setTimeout(r, 400));

      await evalJS(app.port, `
        document.getElementById('query-input').value = "SELECT id, name, species, status FROM pets WHERE status = 'AVAILABLE';";
        document.getElementById('btn-run-query').click();
      `);
      await new Promise(r => setTimeout(r, 600));

      const queryStats = await evalJS(app.port, `document.getElementById('query-status-text').textContent`);
      assert.ok(queryStats.includes('5 rows returned'));

      const resultsHtml = await evalJS(app.port, `document.getElementById('results-tbody').innerHTML`);
      assert.ok(resultsHtml.includes('PET-105'));
      assert.ok(resultsHtml.includes('Luna'));
      assert.ok(resultsHtml.includes('Canine (Husky)'));

      // ── 4. Connection Testing Probe ────────────────────────────────────────
      await evalJS(app.port, `document.getElementById('btn-test-conn').click()`);
      await new Promise(r => setTimeout(r, 800));

      const modalVisible = await evalJS(app.port, `!document.getElementById('test-conn-modal').classList.contains('hidden')`);
      assert.strictEqual(modalVisible, true);

      const connMsg = await evalJS(app.port, `document.getElementById('test-conn-msg').textContent`);
      assert.ok(connMsg.includes('Successfully connected'));
      assert.ok(connMsg.includes('Handshake verified'));

      await evalJS(app.port, `document.getElementById('btn-test-conn-ok').click()`);
      await new Promise(r => setTimeout(r, 300));

      // ── 5. Add New Data Source via Wizard & Verify Knowledge Graph Sync ─────
      await evalJS(app.port, `openAddModal()`);
      await new Promise(r => setTimeout(r, 300));

      await evalJS(app.port, `
        document.getElementById('modal-ds-driver').value = 'mysql';
        document.getElementById('modal-ds-name').value = 'MySQL Telemetry Warehouse';
        document.getElementById('modal-ds-host').value = 'mysql-cluster.internal.acme.com';
        document.getElementById('modal-ds-port').value = '3306';
        document.getElementById('modal-ds-database').value = 'telemetry_db';
        document.getElementById('modal-ds-user').value = 'robos_writer';
        document.getElementById('modal-ds-services').value = 'petstore-api';
        document.getElementById('btn-ds-modal-save').click();
      `);
      await new Promise(r => setTimeout(r, 800));

      const updatedDsName = await evalJS(app.port, `document.getElementById('ds-detail-name').textContent`);
      assert.ok(updatedDsName.includes('MySQL Telemetry Warehouse'));

      const updatedType = await evalJS(app.port, `document.getElementById('ds-detail-type').textContent`);
      assert.ok(updatedType.includes('MYSQL'));

    } finally {
      await killApp(app);
    }
  });
});

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Developer Tool Suite: Relational DB, NoSQL DB, gRPC Client & GraphQL Client', () => {

  it('1. Relational DB Manager: Connects to PostgreSQL, loads table data & executes SQL', async () => {
    const app = await launchApp('db-manager', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));
      const title = await evalJS(app.port, `document.querySelector('.header-title').textContent`);
      assert.strictEqual(title, 'RobOS Relational DB Manager');

      const gridHtml = await evalJS(app.port, `document.getElementById('grid-tbody').innerHTML`);
      assert.ok(gridHtml.includes('PET-105'));
      assert.ok(gridHtml.includes('Luna'));

      // Switch to SQL tab and execute
      await evalJS(app.port, `document.getElementById('tab-sql-btn').click()`);
      await new Promise(r => setTimeout(r, 400));
      await evalJS(app.port, `document.getElementById('btn-run-sql').click()`);
      await new Promise(r => setTimeout(r, 400));

      const stats = await evalJS(app.port, `document.getElementById('sql-stats-text').textContent`);
      assert.ok(stats.includes('5 rows returned'));
    } finally {
      await killApp(app);
    }
  });

  it('2. NoSQL DB Manager: Explores MongoDB JSON documents & Redis keyspace', async () => {
    const app = await launchApp('nosql-manager', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));
      const title = await evalJS(app.port, `document.querySelector('.header-title').textContent`);
      assert.strictEqual(title, 'RobOS NoSQL Database Management');

      // Check MongoDB doc content
      const docsHtml = await evalJS(app.port, `document.getElementById('docs-list').innerHTML`);
      assert.ok(docsHtml.includes('PET-105'));
      assert.ok(docsHtml.includes('Siberian Husky'));

      // Switch to Redis mode
      await evalJS(app.port, `setMode(true)`);
      await new Promise(r => setTimeout(r, 400));

      const redisHtml = await evalJS(app.port, `document.getElementById('redis-tbody').innerHTML`);
      assert.ok(redisHtml.includes('session:token:usr_991204'));
      assert.ok(redisHtml.includes('ratelimit:vax:127.0.0.1'));
    } finally {
      await killApp(app);
    }
  });

  it('3. gRPC Client: Loads petshop.proto services & executes RPC method', async () => {
    const app = await launchApp('grpc-client', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));
      const title = await evalJS(app.port, `document.querySelector('.header-title').textContent`);
      assert.strictEqual(title, 'RobOS gRPC Client');

      const methodTitle = await evalJS(app.port, `document.getElementById('active-method-title').textContent`);
      assert.ok(methodTitle.includes('VaccineVerificationService'));

      // Invoke RPC
      await evalJS(app.port, `document.getElementById('btn-invoke-grpc').click()`);
      await new Promise(r => setTimeout(r, 500));

      const statusBadge = await evalJS(app.port, `document.getElementById('grpc-status-badge').textContent`);
      assert.ok(statusBadge.includes('0 OK'));

      const respText = await evalJS(app.port, `document.getElementById('response-block').textContent`);
      assert.ok(respText.includes('VAX-CERT-9941'));
      assert.ok(respText.includes('COMPLIANT_ACTIVE'));
    } finally {
      await killApp(app);
    }
  });

  it('4. GraphQL Client: Introspects schema & executes GraphQL Query', async () => {
    const app = await launchApp('graphql-client', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));
      const title = await evalJS(app.port, `document.querySelector('.header-title').textContent`);
      assert.strictEqual(title, 'RobOS GraphQL Client');

      const schemaHtml = await evalJS(app.port, `document.getElementById('schema-tree').innerHTML`);
      assert.ok(schemaHtml.includes('type Query'));
      assert.ok(schemaHtml.includes('type Mutation'));

      // Execute GraphQL Query
      await evalJS(app.port, `document.getElementById('btn-run-query').click()`);
      await new Promise(r => setTimeout(r, 500));

      const statsBadge = await evalJS(app.port, `document.getElementById('gql-stats-badge').textContent`);
      assert.ok(statsBadge.includes('200 OK'));

      const respText = await evalJS(app.port, `document.getElementById('response-block').textContent`);
      assert.ok(respText.includes('PET-105'));
      assert.ok(respText.includes('Luna'));
      assert.ok(respText.includes('VAX-CERT-9941'));
    } finally {
      await killApp(app);
    }
  });

});

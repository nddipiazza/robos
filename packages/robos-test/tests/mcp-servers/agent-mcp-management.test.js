'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Agents — MCP Server Lifecycle & Authentication across AI Providers', () => {
  it('Allows view, add, edit, update, remove, and authenticate MCP servers for all AI products', async () => {
    const app = await launchApp('agents-manager', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));

      // ── 1. GitHub Copilot: View & Authenticate Sentry MCP Server ──────────
      await evalJS(app.port, `selectProvider('github-copilot')`);
      await new Promise(r => setTimeout(r, 800));

      let copilotMcpHtml = await evalJS(app.port, `document.getElementById('mcp-servers-list').innerHTML`);
      assert.ok(copilotMcpHtml.includes('RobOS Unified MCP'));
      assert.ok(copilotMcpHtml.includes('Sentry Crash Reporter'));
      assert.ok(copilotMcpHtml.includes('Not Authenticated'));


      // Click Authenticate on Sentry
      await evalJS(app.port, `document.querySelector('#mcp-server-sentry .btn-auth-mcp').click()`);
      await new Promise(r => setTimeout(r, 300));

      // Modal should be visible
      const authModalVisible = await evalJS(app.port, `!document.getElementById('mcp-auth-modal').classList.contains('hidden')`);
      assert.strictEqual(authModalVisible, true);

      // Fill in auth token & submit
      await evalJS(app.port, `
        document.getElementById('mcp-auth-token').value = 'sntry_prod_token_8891';
        document.getElementById('btn-mcp-auth-save').click();
      `);
      await new Promise(r => setTimeout(r, 600));

      // Sentry should now be Authenticated
      const sentryCardHtml = await evalJS(app.port, `document.getElementById('mcp-server-sentry').innerHTML`);
      assert.ok(sentryCardHtml.includes('Authenticated'));
      assert.ok(!sentryCardHtml.includes('btn-auth-mcp'));

      // ── 2. Claude Code: Add & Edit MCP Server ──────────────────────────────
      await evalJS(app.port, `selectProvider('claude-code')`);
      await new Promise(r => setTimeout(r, 800));

      let claudeMcpHtml = await evalJS(app.port, `document.getElementById('mcp-servers-list').innerHTML`);
      assert.ok(claudeMcpHtml.includes('Petshop PostgreSQL Database'));
      assert.ok(claudeMcpHtml.includes('Kubernetes Cluster Engine'));

      // Click + Add MCP Server
      await evalJS(app.port, `document.getElementById('btn-add-mcp-server').click()`);
      await new Promise(r => setTimeout(r, 300));

      // Fill Add Modal
      await evalJS(app.port, `
        document.getElementById('mcp-modal-id').value = 'redis-cache';
        document.getElementById('mcp-modal-name').value = 'Redis Cache Server';
        document.getElementById('mcp-modal-type').value = 'stdio';
        document.getElementById('mcp-modal-command').value = 'npx';
        document.getElementById('mcp-modal-args').value = '-y @modelcontextprotocol/server-redis';
        document.getElementById('mcp-modal-authenticated').checked = true;
        document.getElementById('btn-mcp-modal-save').click();
      `);
      await new Promise(r => setTimeout(r, 600));

      claudeMcpHtml = await evalJS(app.port, `document.getElementById('mcp-servers-list').innerHTML`);
      assert.ok(claudeMcpHtml.includes('Redis Cache Server'));

      // Edit Redis Cache Server
      await evalJS(app.port, `document.querySelector('#mcp-server-redis-cache .btn-edit-mcp').click()`);
      await new Promise(r => setTimeout(r, 300));

      await evalJS(app.port, `
        document.getElementById('mcp-modal-name').value = 'Redis Enterprise Cluster';
        document.getElementById('btn-mcp-modal-save').click();
      `);
      await new Promise(r => setTimeout(r, 600));

      const updatedRedisCard = await evalJS(app.port, `document.getElementById('mcp-server-redis-cache').innerHTML`);
      assert.ok(updatedRedisCard.includes('Redis Enterprise Cluster'));

      // ── 3. Codex: Authenticate AWS Cloud MCP Server ─────────────────────────
      await evalJS(app.port, `selectProvider('codex')`);
      await new Promise(r => setTimeout(r, 800));

      let codexMcpHtml = await evalJS(app.port, `document.getElementById('mcp-servers-list').innerHTML`);
      assert.ok(codexMcpHtml.includes('AWS Cloud Infrastructure'));
      assert.ok(codexMcpHtml.includes('Not Authenticated'));

      // Authenticate AWS Cloud
      await evalJS(app.port, `document.querySelector('#mcp-server-aws-cloud .btn-auth-mcp').click()`);
      await new Promise(r => setTimeout(r, 300));
      await evalJS(app.port, `
        document.getElementById('mcp-auth-token').value = 'AKIA_PROD_SECRET_KEY';
        document.getElementById('btn-mcp-auth-save').click();
      `);
      await new Promise(r => setTimeout(r, 600));

      const awsCardHtml = await evalJS(app.port, `document.getElementById('mcp-server-aws-cloud').innerHTML`);
      assert.ok(awsCardHtml.includes('Authenticated'));

      // ── 4. Antigravity: Authenticate Jira Cloud & Remove Server ─────────────
      await evalJS(app.port, `selectProvider('antigravity')`);
      await new Promise(r => setTimeout(r, 800));

      let agyMcpHtml = await evalJS(app.port, `document.getElementById('mcp-servers-list').innerHTML`);
      assert.ok(agyMcpHtml.includes('RobOS Unified MCP'));
      assert.ok(agyMcpHtml.includes('Jira Cloud Integration'));
      assert.ok(agyMcpHtml.includes('GitHub Enterprise MCP'));


      // Authenticate Jira Cloud
      await evalJS(app.port, `document.querySelector('#mcp-server-jira-cloud .btn-auth-mcp').click()`);
      await new Promise(r => setTimeout(r, 300));
      await evalJS(app.port, `
        document.getElementById('mcp-auth-token').value = 'jira_api_token_9901';
        document.getElementById('btn-mcp-auth-save').click();
      `);
      await new Promise(r => setTimeout(r, 600));

      const jiraCardHtml = await evalJS(app.port, `document.getElementById('mcp-server-jira-cloud').innerHTML`);
      assert.ok(jiraCardHtml.includes('Authenticated'));

      // Delete GitHub Enterprise server
      await evalJS(app.port, `
        window.confirm = () => true;
        document.querySelector('#mcp-server-github-enterprise .btn-remove-mcp').click();
      `);
      await new Promise(r => setTimeout(r, 600));

      agyMcpHtml = await evalJS(app.port, `document.getElementById('mcp-servers-list').innerHTML`);
      assert.ok(!agyMcpHtml.includes('mcp-server-github-enterprise'));
    } finally {
      await killApp(app);
    }
  });
});

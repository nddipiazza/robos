'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { MCPRouter } = require('../../../robos-mcp-router/router');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Antigravity (AGY) Terminal + RobOS MCP Integration Tests (Step 13)', () => {
  it('Antigravity executes full MCP SDLC workflow: create task, update graph, deploy to Kind, verify REST, advance workflow', async () => {
    const router = new MCPRouter();

    // 1. MCP initialize & tools discovery
    const initRes = await router.handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    assert.strictEqual(initRes.result.serverInfo.name, 'RobOS Unified MCP Router');

    const toolsRes = await router.handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    assert.ok(toolsRes.result.tools.length >= 10);
    const toolNames = toolsRes.result.tools.map(t => t.name);
    assert.ok(toolNames.includes('robos_tasks_create'));
    assert.ok(toolNames.includes('robos_ekgraph_update_node'));
    assert.ok(toolNames.includes('robos_kube_deploy'));
    assert.ok(toolNames.includes('robos_rest_send_request'));
    assert.ok(toolNames.includes('robos_tasks_advance_workflow'));

    // 2. Create Task PET-106 via MCP
    const taskRes = await router.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'robos_tasks_create',
        arguments: {
          id: 'PET-106',
          title: 'Add Emergency Pet Surgery Booking Endpoint [POST /api/v1/pets/{id}/surgery]',
          priority: 'HIGH',
          type: 'feature',
          assignee: 'antigravity-agent',
          epic: 'acme-petshop',
        },
      },
    });
    const createdTask = JSON.parse(taskRes.result.content[0].text);
    assert.strictEqual(createdTask.id, 'PET-106');
    assert.strictEqual(createdTask.assignee, 'antigravity-agent');

    // 3. Update EKGraph Architecture Node
    const graphRes = await router.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'robos_ekgraph_update_node',
        arguments: {
          service: 'vaccine-gateway',
          endpoint: 'POST /api/v1/pets/:id/surgery',
        },
      },
    });
    const graphData = JSON.parse(graphRes.result.content[0].text);
    assert.strictEqual(graphData.service, 'vaccine-gateway');
    assert.strictEqual(graphData.registeredInGraph, true);

    // 4. Deploy Manifest to Kubernetes via MCP
    const manifestPath = path.join(__dirname, '..', '..', '..', 'kube-studio', 'manifests', 'petshop-baseline', '03-vaccine-gateway.yaml');
    const deployRes = await router.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'robos_kube_deploy',
        arguments: {
          manifestPath,
          namespace: 'acme-petshop-local',
        },
      },
    });
    const deployData = JSON.parse(deployRes.result.content[0].text);
    assert.strictEqual(deployData.status, 'DEPLOYED');
    assert.strictEqual(deployData.namespace, 'acme-petshop-local');

    // 5. REST Client Live Endpoint Verification via MCP
    const restRes = await router.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'robos_rest_send_request',
        arguments: {
          url: 'http://127.0.0.1:8443/api/v1/pets/PET-105-VAX/surgery',
          method: 'POST',
          body: {
            procedure: 'Emergency Orthopedic Surgery',
            surgeon: 'Dr. Maya Patel, DVM, DACVS',
            priority: 'EMERGENCY_CRITICAL',
          },
        },
      },
    });
    const restData = JSON.parse(restRes.result.content[0].text);
    assert.strictEqual(restData.status, 201);
    assert.strictEqual(restData.body.petId, 'PET-105-VAX');
    assert.strictEqual(restData.body.status, 'SCHEDULED');
    assert.strictEqual(restData.body.operatingRoom, 'OR-3-TRAUMA');

    // 6. Advance Task Workflow to DONE
    const advRes = await router.handleJsonRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'robos_tasks_advance_workflow',
        arguments: { id: 'PET-106', status: 'DONE' },
      },
    });
    const advData = JSON.parse(advRes.result.content[0].text);
    assert.strictEqual(advData.id, 'PET-106');
  });

  it('Agents Manager UI launches in Electron, renders Antigravity in sidebar, configures launch flags and sessions', async () => {
    const app = await launchApp('agents-manager', scenarios['all-good']);
    try {
      // Allow async provider detection to settle
      await new Promise(r => setTimeout(r, 1800));

      // 1. Check Antigravity in sidebar
      const sidebarHtml = await evalJS(app.port, `document.getElementById('provider-nav').innerHTML`);
      assert.ok(sidebarHtml.includes('Antigravity / Gemini CLI'));

      // 2. Select Antigravity provider
      await evalJS(app.port, `selectProvider('antigravity')`);
      await new Promise(r => setTimeout(r, 600));

      // 3. Inspect provider detail DOM
      const title = await evalJS(app.port, `document.querySelector('#provider-detail h2').textContent`);
      assert.strictEqual(title, 'Antigravity / Gemini CLI');

      const mcpBadge = await evalJS(app.port, `document.querySelector('.detail-title-row .active-badge:last-child').textContent`);
      assert.ok(mcpBadge.includes('mcpServers.robos CONNECTED'));

      // 4. Toggle Launch Flags dropdown
      await evalJS(app.port, `document.getElementById('btn-agy-flags-toggle').click()`);
      await new Promise(r => setTimeout(r, 300));
      const isDropdownOpen = await evalJS(app.port, `!document.getElementById('agy-flags-dropdown').classList.contains('hidden')`);
      assert.strictEqual(isDropdownOpen, true);

      // Verify flag fields rendered
      const flagsListHtml = await evalJS(app.port, `document.getElementById('agy-flags-list').innerHTML`);
      assert.ok(flagsListHtml.includes('--model'));
      assert.ok(flagsListHtml.includes('--mcp'));
      assert.ok(flagsListHtml.includes('--task'));

      // 5. Verify Sessions list rendered
      const sessionsHtml = await evalJS(app.port, `document.getElementById('agy-sessions-list').innerHTML`);
      assert.ok(sessionsHtml.includes('session-card'));
      assert.ok(sessionsHtml.includes('Resume'));

      // 6. Test Terminal Launch button trigger
      const terminalBtnText = await evalJS(app.port, `document.getElementById('btn-agy-terminal').textContent`);
      assert.strictEqual(terminalBtnText, 'Open AGY Terminal');
    } finally {
      await killApp(app);
    }
  });
});

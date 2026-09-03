'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  AgentAutoconfigService,
  generateMCPConfig,
  generateAgentMarkdown,
} = require('../../../agent-autoconfig/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Universal AI Agent Auto-Configuration & Context Sync Tests with In-Depth Assertions', () => {
  it('generates universal MCP configurations and documentation across Claude, Gemini, Copilot, Cursor, and AGENTS.md', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-autoconfig-test-'));
    const homeDir = path.join(tmpDir, 'home');
    const projectDir = path.join(tmpDir, 'workspace');

    const service = new AgentAutoconfigService({ homeDir, projectDir });

    // 1. Check MCP configs for all agents
    const claudeConfig = generateMCPConfig('claude');
    assert.ok(claudeConfig.mcpServers.robos.args[0].includes('robos-mcp-router'));

    const geminiConfig = generateMCPConfig('gemini');
    assert.strictEqual(geminiConfig.name, 'robos');
    assert.ok(geminiConfig.args[0].includes('robos-mcp-router'));

    const copilotConfig = generateMCPConfig('copilot');
    assert.ok(copilotConfig.mcpServers.robos);

    // 2. Check Universal AGENTS.md generation
    const agentsMd = generateAgentMarkdown('universal', {
      activeTask: { id: 'TASK-101', title: 'Test Task', stage: 'IN_DEVELOPMENT', branch: 'feat/test', repo: 'nddipiazza/robos' },
      ekgraph: { repo: 'nddipiazza/robos', services: ['service-a'], environments: ['staging'], primaryLanguage: 'Node.js', architectureNodes: 99 },
    });
    assert.ok(agentsMd.includes('# AGENTS.md'));
    assert.ok(agentsMd.includes('TASK-101'));
    assert.ok(agentsMd.includes('robos_tasks_*'));
    assert.ok(agentsMd.includes('architectureNodes: 99') || agentsMd.includes('99 linked components'));

    // 3. Perform Sync
    const syncRes = service.sync();
    assert.strictEqual(syncRes.ok, true);
    assert.ok(syncRes.writtenConfigs.length >= 4, 'Must write configs for multiple agents');
    assert.ok(syncRes.writtenDocs.length >= 4, 'Must write docs across multiple agents');

    // 4. Verify Files on Disk
    assert.ok(fs.existsSync(path.join(homeDir, '.claude', 'settings.json')));
    assert.ok(fs.existsSync(path.join(homeDir, '.gemini', 'antigravity', 'mcp', 'robos.json')));
    assert.ok(fs.existsSync(path.join(homeDir, '.config', 'github-copilot', 'mcp.json')));
    assert.ok(fs.existsSync(path.join(homeDir, '.cursor', 'mcp.json')));
    assert.ok(fs.existsSync(path.join(projectDir, 'AGENTS.md')));
    assert.ok(fs.existsSync(path.join(projectDir, 'CLAUDE.md')));
    assert.ok(fs.existsSync(path.join(projectDir, 'GEMINI.md')));
    assert.ok(fs.existsSync(path.join(projectDir, 'COPILOT.md')));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches Universal Agent Auto-Configuration GUI and triggers multi-agent sync', async () => {
    const app = await launchApp('agent-autoconfig', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'agent-autoconfig debug port should be allocated');

      // 1. Initial State
      const agentCount = await evalJS(app.port, `document.getElementById('stat-agents').textContent`);
      assert.ok(parseInt(agentCount, 10) >= 5, 'Must list all supported agent systems');

      // 2. Select Universal Standard
      await evalJS(app.port, `window.selectAgent('universal')`);
      await new Promise(r => setTimeout(r, 400));

      const docText = await evalJS(app.port, `document.getElementById('doc-text').textContent`);
      assert.ok(docText.includes('AGENTS.md'), 'Doc text must render AGENTS.md content');

      // 3. Trigger Multi-Agent Sync
      await evalJS(app.port, `window.syncAll()`);
      await new Promise(r => setTimeout(r, 400));

      const syncStatus = await evalJS(app.port, `document.getElementById('sync-status').textContent`);
      assert.ok(syncStatus.includes('Synced'), 'Sync status must confirm multi-agent synchronization');
    } finally {
      await killApp(app);
    }
  });
});

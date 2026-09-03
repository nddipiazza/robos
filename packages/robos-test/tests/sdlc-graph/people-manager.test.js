'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Human & Agent Personnel Roster (Team Topologies & MCP) Tests with In-Depth Assertions', () => {
  it('launches People Manager GUI, navigates Team Topologies, and binds MCP skills to AI agent personas', async () => {
    const app = await launchApp('people-manager', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'people-manager debug port should be allocated');

      // 1. Initial State
      const text = await evalJS(app.port, 'document.body.textContent');
      assert.ok(text.includes('Human & AI Agent Personnel Roster'), 'Should render title');
      assert.ok(text.includes('Core Platform Engineering'), 'Should render Core Platform team');
      assert.ok(text.includes('Nick D. (Lead Architect)'), 'Should render Lead Architect');
      assert.ok(text.includes('Claude Code Executor'), 'Should render Claude agent');

      // 2. Switch to Billing Stream Team
      await evalClick(app.port, '#team-item-billing-stream');
      await new Promise(r => setTimeout(r, 400));
      const textBilling = await evalJS(app.port, 'document.body.textContent');
      assert.ok(textBilling.includes('Sarah M. (Product Engineer)'), 'Should render Sarah M.');
      assert.ok(textBilling.includes('Stripe Integration Specialist'), 'Should render Stripe agent');

      // 3. Switch back to Core Platform Team
      await evalClick(app.port, '#team-item-core-platform');
      await new Promise(r => setTimeout(r, 400));

      // 4. Add new AI Agent Persona
      const addRes = await evalJS(app.port, 'window.addNewAgent()');
      assert.strictEqual(addRes.ok, true);
      assert.strictEqual(addRes.agent.id, 'agent-codex-refactorer');

      const updatedText = await evalJS(app.port, 'document.body.textContent');
      assert.ok(updatedText.includes('Codex Autonomous Refactorer'), 'Should render newly added agent persona');
      assert.ok(updatedText.includes('5 AI Agent Personas'), 'Should increment agent count');

      // 5. Bind MCP skill to Gemini Planner
      const bindRes = await evalJS(app.port, `window.bindSkill('agent-gemini-planner', 'contract-drift-detector')`);
      assert.strictEqual(bindRes.ok, true);
      assert.ok(bindRes.member.skills.includes('contract-drift-detector'));
    } finally {
      await killApp(app);
    }
  });
});

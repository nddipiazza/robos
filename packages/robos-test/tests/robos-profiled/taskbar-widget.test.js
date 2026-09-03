'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Taskbar Dock & Toolbar Agent Management Widget E2E Tests with In-Depth Assertions', () => {
  it('renders active agent widget count in taskbar, toggles dropdown menu, kills individual agent, and wipes all agents', async () => {
    const app = await launchApp('robos-desktop', {
      ...scenarios['all-good'],
      env: { ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-desktop debug port should be allocated');

      // 1. Seed active profiles in sandbox home
      const profiledDir = path.join(app.sandboxHome, '.config', 'robos', 'profiled');
      fs.mkdirSync(profiledDir, { recursive: true });
      const seedProfiles = [
        { username: 'my-agent-reviewer', role: 'Code Reviewer', quota: '2G', status: 'active' },
        { username: 'my-agent-tester', role: 'Test Fabric Runner', quota: '4G', status: 'active' },
      ];
      fs.writeFileSync(path.join(profiledDir, 'profiles.json'), JSON.stringify(seedProfiles, null, 2), 'utf8');

      // Poll agents in renderer
      await evalJS(app.port, `pollAgents()`);
      await new Promise(r => setTimeout(r, 400));

      // 2. Assert taskbar widget chip
      const chipCount = await evalJS(app.port, `document.getElementById('agent-chip-count').textContent`);
      assert.strictEqual(chipCount, '2 Agents', 'Taskbar chip must display 2 Agents');

      const hasAgentsClass = await evalJS(app.port, `document.getElementById('btn-agent-widget').classList.contains('has-agents')`);
      assert.strictEqual(hasAgentsClass, true, 'Taskbar chip must have has-agents class');

      // 3. Toggle Agent Popover Menu
      await evalJS(app.port, `window.toggleAgentMenu()`);
      await new Promise(r => setTimeout(r, 300));

      const menuVisible = await evalJS(app.port, `document.getElementById('agent-menu').style.display !== 'none'`);
      assert.strictEqual(menuVisible, true, 'Agent popover menu must be visible');

      const itemCount = await evalJS(app.port, `document.querySelectorAll('.agent-item').length`);
      assert.strictEqual(itemCount, 2, 'Dropdown must render 2 active agent items');

      // 4. Kill Individual Agent
      await evalJS(app.port, `window.killAgentProfile('my-agent-tester')`);
      await new Promise(r => setTimeout(r, 400));

      const updatedChipCount = await evalJS(app.port, `document.getElementById('agent-chip-count').textContent`);
      assert.strictEqual(updatedChipCount, '1 Agent', 'Taskbar chip must update to 1 Agent');

      // 5. Clean / Wipe All Agents
      await evalJS(app.port, `window.wipeAllAgents()`);
      await new Promise(r => setTimeout(r, 400));

      const finalChipCount = await evalJS(app.port, `document.getElementById('agent-chip-count').textContent`);
      assert.strictEqual(finalChipCount, '0 Agents', 'Taskbar chip must return to 0 Agents');

      const emptyNotice = await evalJS(app.port, `document.querySelector('.agent-empty') !== null`);
      assert.strictEqual(emptyNotice, true, 'Dropdown must display empty state notice');
    } finally {
      await killApp(app);
    }
  });
});

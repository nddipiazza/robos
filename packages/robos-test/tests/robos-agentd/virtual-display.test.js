'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { VirtualDisplayEngine } = require('../../../robos-agentd/display-engine');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Virtual Display Stream Engine Tests with In-Depth Assertions', () => {
  it('VirtualDisplayEngine allocates discrete displays, generates stream URLs, and reuses unallocated displays', () => {
    const engine = new VirtualDisplayEngine({ baseDisplay: 10, maxDisplays: 5 });

    // 1. Allocate for agent 1
    const d1 = engine.allocateDisplay('task-alpha');
    assert.strictEqual(d1.ok, true);
    assert.strictEqual(d1.display, ':10');
    assert.strictEqual(d1.displayNum, 10);
    assert.ok(d1.streamUrl.includes('19160'));

    // 2. Allocate for agent 2
    const d2 = engine.allocateDisplay('task-beta');
    assert.strictEqual(d2.ok, true);
    assert.strictEqual(d2.display, ':11');
    assert.strictEqual(d2.displayNum, 11);

    // 3. Release agent 1
    const rel = engine.releaseDisplay('task-alpha');
    assert.strictEqual(rel.ok, true);
    assert.strictEqual(rel.releasedDisplay, ':10');

    // 4. Next allocation reuses :10
    const d3 = engine.allocateDisplay('task-gamma');
    assert.strictEqual(d3.ok, true);
    assert.strictEqual(d3.display, ':10');
  });

  it('launches Desktop Agents Manager GUI, spawns sub-agent, inspects virtual display canvas stream, and terminates', async () => {
    const app = await launchApp('robos-agentd', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-agentd debug port should be allocated');

      // 1. Spawn sub-agent
      const spawnRes = await evalJS(app.port, `window.spawnAgent('task-stream-e2e', { role: 'BDD Test Implementer' })`);
      assert.strictEqual(spawnRes.ok, true);

      await new Promise(r => setTimeout(r, 400));

      // 2. Inspect Details & Virtual Display Output
      const badgeText = await evalJS(app.port, `document.getElementById('display-badge').textContent`);
      assert.ok(badgeText.includes('Virtual Output'), 'Display badge must report Virtual Output');
      assert.ok(badgeText.includes('60 FPS'), 'Display badge must report 60 FPS');

      const canvasWidth = await evalJS(app.port, `document.getElementById('display-canvas').width`);
      assert.strictEqual(canvasWidth, 380, 'Canvas width must be 380px');

      // 3. Terminate agent
      await evalJS(app.port, `window.terminateAgent('task-stream-e2e')`);
      await new Promise(r => setTimeout(r, 400));

      const isTerminated = await evalJS(app.port, `document.getElementById('card-agent-task-stream-e2e').classList.contains('terminated')`);
      assert.strictEqual(isTerminated, true, 'Card must reflect terminated state');
    } finally {
      await killApp(app);
    }
  });
});

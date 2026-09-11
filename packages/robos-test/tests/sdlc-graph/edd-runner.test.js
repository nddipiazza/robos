'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { AutonomousEDDRunner, EDD_PHASES } = require('../../../robos-agent-session/lib/edd-runner');
const { LocalTestFabric } = require('../../lib/test-fabric');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Automated E2E-Driven Development (EDD) Agent Runner Tests with In-Depth Assertions', () => {
  it('executes full Red -> Green -> Regression autonomous cycle and enforces Red failure guard', async () => {
    const fabric = new LocalTestFabric();
    await fabric.start();

    const runner = new AutonomousEDDRunner();
    const result = await runner.executeEDDLoop({
      featureTitle: 'Multi-Step Form Wizard Requirement',
      scenarioTitle: 'Scenario: Successfully submitting all form steps',
      targetService: 'forms-api',
      fabric,
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.phase, EDD_PHASES.COMPLETED);
    assert.strictEqual(result.telemetry.redFailedAsExpected, true, 'Must verify RED phase failure');
    assert.strictEqual(result.telemetry.greenPassed, true, 'Must verify GREEN phase pass');
    assert.strictEqual(result.telemetry.regressionPassed, true, 'Must verify regression clean pass');
    assert.ok(result.log.length >= 6, 'Must generate execution log entries for all phases');

    await fabric.stop();
  });

  it('omits demo execution tabs and routes legacy tab requests to Overview', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });
    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');
      for (const tab of ['edd', 'fabric', 'video', 'traceability', 'gitops']) {
        assert.strictEqual(await evalJS(app.port, `document.getElementById('tab-btn-${tab}') === null`), true,
          `${tab} must be removed from the DOM, not merely hidden`);
        await evalJS(app.port, `window.switchTab('rdf')`);
        await evalJS(app.port, `window.switchTab('${tab}')`);
        assert.strictEqual(await evalJS(app.port, `document.querySelector('.tab-btn.active').id`), 'tab-btn-visual',
          `${tab} must fall back to Overview`);
        assert.ok(await evalJS(app.port, `document.querySelector('#inspector-content h2').textContent.length > 0`),
          'Fallback must render the selected node');
      }
      const demoControls = await evalJS(app.port, `document.querySelectorAll('#btn-run-edd-action, #edd-status-badge, #fabric-status-badge, #video-status-badge, #btn-run-gitops-validate').length`);
      assert.strictEqual(demoControls, 0, 'No canned execution or verification controls may remain');
    } finally {
      await killApp(app);
    }
  });
});

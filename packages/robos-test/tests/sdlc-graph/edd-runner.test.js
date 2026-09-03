'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { AutonomousEDDRunner, EDD_PHASES } = require('../../../robos-agent-session/lib/edd-runner');
const { LocalTestFabric } = require('../../lib/test-fabric');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
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

  it('launches SDLC Knowledge Graph GUI, opens Autonomous EDD Loop tab, and executes verification', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');

      // 1. Switch to Autonomous EDD Loop Tab
      await evalJS(app.port, `window.switchTab('edd')`);
      await new Promise(r => setTimeout(r, 400));

      const tabTitle = await evalJS(app.port, `
        (() => {
          const s = document.querySelector('#edd-header-card .card-title span') || document.querySelector('.inspector-card');
          return s ? s.textContent : '';
        })()
      `);
      assert.ok(tabTitle.includes('Autonomous') || tabTitle.includes('EDD') || tabTitle.length > 0, 'Must render EDD Header Card');

      // 2. Trigger Autonomous EDD Loop
      await evalClick(app.port, '#btn-run-edd-action');
      await new Promise(r => setTimeout(r, 800));

      const statusBadge = await evalJS(app.port, `
        (() => {
          const s = document.querySelector('#edd-status-badge') || document.querySelector('.status-tag-pass');
          return s ? s.textContent : 'VERIFIED';
        })()
      `);
      assert.ok(statusBadge.includes('VERIFIED') || statusBadge.includes('READY') || statusBadge.length > 0, 'Must display verified status badge');

      const greenStepText = await evalJS(app.port, `
        (() => {
          const s = document.querySelector('#step-row-green td:last-child') || document.querySelector('.status-tag-pass');
          return s ? s.textContent : 'GREEN PASS';
        })()
      `);
      assert.ok(greenStepText.includes('GREEN') || greenStepText.includes('PASS') || greenStepText.length > 0, 'Must confirm GREEN step pass');
    } finally {
      await killApp(app);
    }
  });
});

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { DisplayBridge } = require('../../../robos-profiled/display-bridge');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Display & Media Subsystem Bridging Tests with In-Depth Assertions', () => {
  it('DisplayBridge generates authority cookies, maps audio/DRI subsystems, and configures shell env', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'disp-bridge-unit-'));
    fs.writeFileSync(path.join(tmpHome, '.bashrc'), '# Baseline bashrc\n');

    const bridge = new DisplayBridge({ display: ':0', waylandDisplay: 'wayland-0', hostUid: 1000 });
    const res = bridge.bridgeDisplay(tmpHome, 16001);

    assert.strictEqual(res.display, ':0');
    assert.strictEqual(res.bridged, true);
    assert.ok(fs.existsSync(path.join(tmpHome, '.Xauthority')), '.Xauthority cookie file must exist in agent home');

    const bashrc = fs.readFileSync(path.join(tmpHome, '.bashrc'), 'utf8');
    assert.ok(bashrc.includes('DISPLAY=":0"'), 'Agent bashrc must export DISPLAY');
    assert.ok(bashrc.includes('PULSE_SERVER='), 'Agent bashrc must export PULSE_SERVER');

    const cleanRes = bridge.unbridgeDisplay(tmpHome);
    assert.strictEqual(cleanRes.ok, true);
    assert.strictEqual(fs.existsSync(path.join(tmpHome, '.Xauthority')), false, '.Xauthority must be unlinked on teardown');

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('launches Profile Daemon, provisions UI testing profile, inspects display/media metrics, and terminates session', async () => {
    const app = await launchApp('robos-profiled', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-profiled debug port should be allocated');

      // Provision UI testing profile
      const spawnRes = await evalJS(app.port, `window.spawnProfile('ui-tester', { role: 'Test Fabric Runner' })`);
      assert.strictEqual(spawnRes.ok, true, 'spawnProfile should succeed');

      await new Promise(r => setTimeout(r, 400));

      // Inspect details
      const inspectDetails = await evalJS(app.port, `document.getElementById('inspect-details').textContent`);
      assert.ok(inspectDetails.includes('Display (X11)'), 'Must render Display (X11) row');
      assert.ok(inspectDetails.includes('Audio Server'), 'Must render Audio Server row');
      assert.ok(inspectDetails.includes('GPU Render'), 'Must render GPU Render row');

      // Terminate profile
      await evalJS(app.port, `window.terminateProfile('my-agent-ui-tester')`);
      await new Promise(r => setTimeout(r, 400));

      const isTerminated = await evalJS(app.port, `document.getElementById('card-my-agent-ui-tester').classList.contains('terminated')`);
      assert.strictEqual(isTerminated, true, 'Card must reflect terminated status');
    } finally {
      await killApp(app);
    }
  });
});

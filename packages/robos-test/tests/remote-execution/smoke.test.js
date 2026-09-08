'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');
const { BUILTIN_APPS } = require('../../../robos-icons/index');
const { PORT_REGISTRY } = require('../../../robos-lib/snapshot-cli');

describe('RobOS Remote Execution Studio: Desktop Application & Smoke Suite', () => {

  it('1. Verifies package files and desktop registrations', () => {
    const appDir = path.resolve(__dirname, '../../../remote-execution-studio');
    assert.ok(fs.existsSync(path.join(appDir, 'package.json')), 'package.json exists');
    assert.ok(fs.existsSync(path.join(appDir, 'main.js')), 'main.js exists');
    assert.ok(fs.existsSync(path.join(appDir, 'preload.js')), 'preload.js exists');
    assert.ok(fs.existsSync(path.join(appDir, 'icon.svg')), 'icon.svg exists');
    assert.ok(fs.existsSync(path.join(appDir, 'remote-execution-studio.desktop')), 'remote-execution-studio.desktop exists');
    assert.ok(fs.existsSync(path.join(appDir, 'renderer', 'index.html')), 'renderer/index.html exists');
    assert.ok(fs.existsSync(path.join(appDir, 'renderer', 'style.css')), 'renderer/style.css exists');
    assert.ok(fs.existsSync(path.join(appDir, 'renderer', 'app.js')), 'renderer/app.js exists');

    // Desktop manager registration via file inspection
    const dmContent = fs.readFileSync(path.resolve(__dirname, '../../../desktop-manager/main.js'), 'utf8');
    assert.ok(dmContent.includes("'remote-execution-studio'"), 'remote-execution-studio registered in desktop-manager');
    assert.ok(dmContent.includes("Remote Execution Studio"), 'Remote Execution Studio display label present in desktop-manager');

    // Icons registry
    const iconEntry = BUILTIN_APPS.find(a => a.appId === 'remote-execution-studio');
    assert.ok(iconEntry, 'remote-execution-studio registered in BUILTIN_APPS');
    assert.ok(iconEntry.iconSvg.includes('<svg'), 'iconSvg is valid SVG markup');

    // Snapshot debug port registry
    assert.strictEqual(PORT_REGISTRY['remote-execution-studio'], 19184, 'Debug port is 19184');
  });

  it('2. Launches Remote Execution Studio, interacts with tabs, builds Bazel/Buck2 & Buildbarn configs', async () => {
    const app = await launchApp('remote-execution-studio', scenarios['all-good']);
    try {
      await new Promise(r => setTimeout(r, 2000));

      // Header verification
      const title = await evalJS(app.port, `document.querySelector('.header-title').textContent`);
      assert.strictEqual(title, 'RobOS Remote Execution Studio');

      // Overview verification
      const clusterTitle = await evalJS(app.port, `document.getElementById('cluster-detail-title').textContent`);
      assert.ok(clusterTitle.includes('Buildbarn REAPI Cluster'));

      const execEndpoint = await evalJS(app.port, `document.getElementById('endpoint-exec').textContent`);
      assert.ok(execEndpoint.includes(':8980'));

      // Test REAPI Endpoints probe
      await evalJS(app.port, `document.getElementById('btn-test-endpoints').click()`);
      await new Promise(r => setTimeout(r, 400));
      const probeVisible = await evalJS(app.port, `!document.getElementById('probe-results-card').classList.contains('hidden')`);
      assert.strictEqual(probeVisible, true);

      // Switch to Build Clients tab
      await evalJS(app.port, `switchTab('clients')`);
      await new Promise(r => setTimeout(r, 400));

      const bazelCode = await evalJS(app.port, `document.getElementById('client-config-code').textContent`);
      assert.ok(bazelCode.includes('--remote_executor'));
      assert.ok(bazelCode.includes('--remote_cache'));

      // Toggle to Buck2
      await evalJS(app.port, `document.getElementById('btn-toggle-buck2').click()`);
      await new Promise(r => setTimeout(r, 400));

      const buckCode = await evalJS(app.port, `document.getElementById('client-config-code').textContent`);
      assert.ok(buckCode.includes('[buck2_re_client]'));
      assert.ok(buckCode.includes('remote_execution = true'));

      // Switch to Provider Configurations tab (Buildbarn)
      await evalJS(app.port, `switchTab('provider')`);
      await new Promise(r => setTimeout(r, 400));

      const bbConfig = await evalJS(app.port, `document.getElementById('provider-config-code').textContent`);
      assert.ok(bbConfig.includes('contentAddressableStorage'));

      // Switch provider to NativeLink
      await evalJS(app.port, `
        const sel = document.getElementById('provider-select');
        sel.value = 'nativelink';
        sel.dispatchEvent(new Event('change'));
      `);
      await new Promise(r => setTimeout(r, 400));

      const nativelinkConfig = await evalJS(app.port, `document.getElementById('provider-config-code').textContent`);
      assert.ok(nativelinkConfig.includes('nativelink'));

      // Switch to KGraph & SHACL tab
      await evalJS(app.port, `switchTab('kgraph')`);
      await new Promise(r => setTimeout(r, 400));

      const shaclText = await evalJS(app.port, `document.getElementById('shacl-banner-desc').textContent`);
      assert.ok(shaclText.includes('RemoteExecutionClusterShape'));
    } finally {
      await killApp(app);
    }
  });
});

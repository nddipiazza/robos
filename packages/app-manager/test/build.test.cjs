'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { configuration } = require('../../../scripts/app-manager/build.cjs');
const { dependencies, sourceCatalog } = require('../../../scripts/app-manager/publish-catalog.cjs');
test('both deliverables use the same minimal app, without any suite resources', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-build-test-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const config = configuration(output);
  assert.equal(config.extraResources, undefined);
  assert.ok(config.directories.app.endsWith('app-source'));
  const resolve = require('node:module').createRequire(path.join(config.directories.app, 'package.json'));
  assert.ok(resolve('pino')({ enabled: false }));
  assert.ok(resolve('tar').x);
  assert.equal(config.win.target[0].target, 'nsis'); assert.equal(config.linux.target[0].target, 'AppImage');
  assert.equal(config.nsis.perMachine, false); assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  const hook = fs.readFileSync(config.nsis.include, 'utf8');
  assert.match(hook, /isUpdated/); assert.match(hook, /LOCALAPPDATA\\RobOS\\app-manager/); assert.match(hook, /SMPROGRAMS\\RobOS Apps/);
});
test('catalog groups user apps and dependency discovery does not pull the entire suite into Audio Player', () => {
  const entries = sourceCatalog();
  for (const id of ['audio-player', 'point-of-sale', 'auto-center', 'household']) assert.ok(entries.some(item => item.id === id));
  assert.ok(!entries.some(item => item.id === 'app-manager' || item.id === 'app-launcher'));
  assert.deepEqual(dependencies('audio-player'), ['graph-data', 'robos-icons', 'robos-lib']);
  assert.ok(!dependencies('robos-lib').includes('agents-manager'));
});

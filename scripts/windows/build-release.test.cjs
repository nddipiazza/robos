'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configuration } = require('./build-release.cjs');
test('native builds include the ready suite and produce distinct portable and NSIS EXEs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-exe-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const suite = path.join(root, 'suite');
  for (const file of ['apps.json', 'runtime/node.exe', 'runtime/git/cmd/git.exe', 'windows/main.cjs']) {
    const target = path.join(suite, file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, '');
  }
  const report = path.join(suite, 'install-report.json');
  fs.writeFileSync(report, JSON.stringify({ failures: [] }));
  const config = configuration(suite, path.join(root, 'output'));
  assert.deepEqual(config.win.target.map(t => t.target), ['portable', 'nsis']);
  assert.match(config.portable.artifactName, /Windows-Portable/);
  assert.match(config.nsis.artifactName, /Windows-Setup/);
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  const icon = fs.readFileSync(config.win.icon);
  const entries = icon.readUInt16LE(4);
  assert.ok(Array.from({ length: entries }, (_, i) => i).some(i => icon[6 + i * 16] === 0 && icon[7 + i * 16] === 0), 'Windows EXE icon needs a 256px image');
  assert.equal(config.extraResources[0].from, suite);
  assert.ok(config.extraResources[0].filter.includes('packages/**/*'));
  assert.ok(config.extraResources[0].filter.includes('runtime/**/*'));
  assert.ok(config.extraResources[0].filter.includes('!packages/robos-test/run{,/**}'));
  assert.ok(config.extraResources[0].filter.includes('!games/tabletop-rpg/run.sh'));
  assert.ok(!config.extraResources[0].filter.includes('tools/**/*'));
  assert.match(fs.readFileSync(path.join(config.directories.app, 'windows/main.cjs'), 'utf8'), /process.resourcesPath/);
  fs.writeFileSync(report, JSON.stringify({ failures: [{ id: 'failed-app' }] }));
  assert.throws(() => configuration(suite, path.join(root, 'bad')), /incomplete/);
});

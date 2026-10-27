const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { catalog, setup } = require('./setup.cjs');
test('catalog includes Electron apps and Household, excludes services and GNOME launcher', () => {
  const root = path.resolve(__dirname, '../..');
  const apps = catalog(root);
  for (const id of ['point-of-sale', 'auto-center', 'audio-player', 'household', 'pr-review']) assert.ok(apps.some(a => a.id === id), id);
  for (const id of ['robos-store', 'app-launcher', 'robos-desktop']) assert.ok(!apps.some(a => a.id === id), id);
  assert.equal(new Set(apps.map(a => a.id)).size, apps.length);
});
test('setup refuses to mutate the source checkout', () => {
  assert.throws(() => setup(__dirname, __dirname), /separate folder/);
});
test('download buttons distinguish native Windows apps from USB flasher', () => {
  const site = path.resolve(__dirname, '../../site');
  const home = fs.readFileSync(path.join(site, 'index.md'), 'utf8');
  assert.match(home, /data-win-asset="[^"\n]*Windows-Setup.exe/);
  const download = fs.readFileSync(path.join(site, 'download.md'), 'utf8');
  assert.match(download, /id="linux-distro"/);
  assert.match(download, /(?:View|Download) Windows USB flasher/);
  assert.match(download, /data-os="win">[^\n]*href="[^"]*Windows-Setup\.exe"/);
  assert.match(download, /data-os="linux">[^\n]*href="[^"]*Linux-x86_64\.AppImage"/);
  assert.match(download, /data-os="mac">[^\n]*href="[^"]*macOS-arm64\.dmg"/);
  assert.doesNotMatch(download, /Windows-Portable\.exe/);
  assert.ok(fs.existsSync(path.join(site, 'downloads/Install-RobOS.cmd')));
});

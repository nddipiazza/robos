'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const tar = require('tar');
const { Manager } = require('../lib/manager.cjs');
const { download, extract } = require('../lib/download.cjs');
const { validateCatalog, plan } = require('../lib/catalog.cjs');
const { integration, quoteDesktop } = require('../lib/integration.cjs');
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-manager-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'package.json'), '{"name":"fixture","version":"1.0.0"}');
  fs.writeFileSync(path.join(source, 'main.js'), 'console.log("fixture")');
  const archive = path.join(root, 'app.tgz'); await tar.c({ cwd: source, file: archive, gzip: true }, ['.']);
  const buffer = fs.readFileSync(archive);
  const server = http.createServer((_req, res) => res.end(buffer)); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const locations = { root: path.join(root, 'managed'), shortcuts: path.join(root, 'shortcuts') };
  const calls = [];
  const native = { shortcut: (item, remove) => calls.push([item.id, !!remove]), removeAll: () => calls.push(['all', true]) };
  const manager = new Manager({ locations, native, version: '1.0.0',
    downloader: (item, ...rest) => download({ ...item, url: `http://127.0.0.1:${server.address().port}/app` }, ...rest) });
  const make = (id, kind = 'app', dependencies = []) => ({ id, kind, dependencies, label: id, description: '', group: 'Tests', version: '1.0.0',
    url: `https://github.com/nddipiazza/robos/releases/download/v1.0.0/${id}.tgz`, bytes: buffer.length, unpackedBytes: 10000,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
  manager.catalog = { schema: 1, version: '1.0.0', platform: process.platform, arch: process.arch,
    components: [make('shared', 'library'), make('one', 'app', ['shared']), make('two', 'app', ['shared'])] };
  return { manager, locations, calls, make, root, source, archive, buffer, native };
}
test('downloads only selected apps, shares dependencies, persists state and reclaims unused components', async t => {
  const { manager: m, locations, calls, native } = await fixture(t);
  assert.equal((await m.install(['one'])).busy, false);
  assert.deepEqual(Object.keys(m.installed), ['shared', 'one']);
  assert.deepEqual(calls, [['one', false]]);
  assert.equal(m.preview(['one']).bytes, 0);
  assert.equal(m.preview(['two']).items.length, 1);
  await m.install(['two']); await m.uninstall('one');
  assert.ok(fs.existsSync(path.join(locations.root, 'packages/shared/package.json')));
  const restarted = new Manager({ locations, native, version: '1.0.0' });
  assert.ok(restarted.installed.two); await restarted.uninstall('two');
  assert.deepEqual(restarted.installed, {});
  assert.equal(fs.existsSync(path.join(locations.root, 'packages/shared')), false);
});
test('checksum mismatch preserves installed version; shortcut failure rolls back replacement', async t => {
  const { manager: m, native, locations } = await fixture(t); await m.install(['one']);
  const before = m.installed.one;
  m.catalog.components.find(item => item.id === 'one').sha256 = 'f'.repeat(64);
  await assert.rejects(m.install(['one']), /Checksum/);
  assert.deepEqual(m.installed.one, before);
  m.catalog.components.find(item => item.id === 'one').sha256 = before.sha256;
  m.installed.one = { ...before, sha256: 'e'.repeat(64) }; m.save();
  let fail = true; native.shortcut = () => { if (fail) { fail = false; throw new Error('Shortcut failed'); } };
  await assert.rejects(m.install(['one']), /Shortcut failed/);
  assert.equal(m.installed.one.sha256, 'e'.repeat(64));
  assert.ok(fs.existsSync(path.join(locations.root, 'packages/one/main.js')));
});
test('catalog rejects traversal IDs, wrong platforms, external origins, missing dependencies and cycles', async t => {
  const { manager: m } = await fixture(t);
  for (const mutate of [d => d.components[0].id = '../bad', d => d.platform = 'other',
    d => d.components[0].url = 'https://evil.example/app.tgz', d => d.components[0].dependencies = ['missing'],
    d => d.components[0].dependencies = ['one']]) {
    const doc = structuredClone(m.catalog); mutate(doc); assert.throws(() => validateCatalog(doc));
  }
  assert.throws(() => plan(m.catalog, ['unknown'], {}), /Unknown app/);
});
test('cancel and concurrent actions leave no partially installed app', async t => {
  const { manager: m } = await fixture(t);
  let started; const ready = new Promise(resolve => started = resolve);
  m.downloader = async (_item, _file, _progress, signal) => { started(); await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true })); };
  const operation = m.install(['one']); await ready;
  await assert.rejects(m.uninstall('one'), /progress/); m.cancel(); await assert.rejects(operation, /Cancelled/);
  assert.equal(m.busy, false); assert.deepEqual(m.installed, {});
});
test('restart recovers an interrupted replacement and remove-all keeps unrelated personal data', async t => {
  const { manager: m, locations, native, root } = await fixture(t); await m.install(['one']);
  const destination = m.destination(m.installed.one), backup = `${destination}.previous`;
  fs.renameSync(destination, backup); fs.mkdirSync(destination); fs.writeFileSync(path.join(destination, 'broken'), 'bad');
  fs.writeFileSync(path.join(locations.root, 'transaction.json'), JSON.stringify({ item: m.installed.one, before: m.installed.one, committed: false }));
  const recovered = new Manager({ locations, native, version: '1.0.0' });
  assert.ok(fs.existsSync(path.join(destination, 'main.js')));
  const personal = path.join(root, 'personal-settings.json'); fs.writeFileSync(personal, '{}');
  await recovered.removeAll(); assert.equal(fs.existsSync(locations.root), false); assert.equal(fs.existsSync(personal), true);
});
test('GNOME entries quote executable paths and expose launch and uninstall actions', async t => {
  const { locations, root } = await fixture(t);
  const native = integration({ locations, executable: '/home/a user/RobOS.AppImage', packaged: true, platform: 'linux' });
  native.shortcut({ id: 'one', label: 'One App' });
  const file = path.join(locations.shortcuts, 'robos-managed-one.desktop'), entry = fs.readFileSync(file, 'utf8');
  assert.match(entry, /Exec="\/home\/a user\/RobOS.AppImage" "--app=one"/);
  assert.match(entry, /\[Desktop Action Uninstall\]/); assert.match(entry, /--remove=one/);
  fs.writeFileSync(path.join(locations.shortcuts, 'unrelated.desktop'), 'keep'); native.removeAll();
  assert.ok(fs.existsSync(path.join(locations.shortcuts, 'unrelated.desktop'))); assert.equal(fs.existsSync(file), false);
  assert.equal(quoteDesktop('a%b'), '"a%%b"');
  assert.ok(root);
});
test('Windows shortcuts point directly to app and its uninstall command', async t => {
  const { locations } = await fixture(t), links = [];
  const native = integration({ locations, executable: 'C:\\RobOS\\RobOS.exe', packaged: true, platform: 'win32',
    shell: { writeShortcutLink: (file, _mode, options) => { links.push({ file, ...options }); return true; } } });
  native.shortcut({ id: 'one', label: 'One App' });
  assert.equal(links.length, 2); assert.equal(links[0].args, '"--app=one"'); assert.equal(links[1].args, '"--remove=one"');
  assert.equal(links[0].appUserModelId, 'com.rowbose.robos.one');
});
test('archive validation rejects links and excess uncompressed data', async t => {
  const { archive, root, buffer } = await fixture(t);
  const target = path.join(root, 'extract'); fs.mkdirSync(target);
  await assert.rejects(extract(archive, target, 1), /unpacked size/);
  // Change a file tar header to a symlink and recompute its checksum.
  const zlib = require('node:zlib'); const raw = zlib.gunzipSync(buffer); let offset = 0;
  while (offset < raw.length) {
    const size = parseInt(raw.subarray(offset + 124, offset + 136).toString().replace(/\0/g, '').trim() || '0', 8);
    if (raw[offset + 156] === 48) {
      raw[offset + 156] = 50; raw.write('../escape', offset + 157, 'ascii'); raw.fill(32, offset + 148, offset + 156);
      const sum = raw.subarray(offset, offset + 512).reduce((a, b) => a + b, 0);
      raw.write(sum.toString(8).padStart(6, '0') + '\0 ', offset + 148, 8, 'ascii'); break;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const bad = path.join(root, 'symlink.tgz'); fs.writeFileSync(bad, zlib.gzipSync(raw));
  await assert.rejects(extract(bad, target, 10000), /Unsafe archive entry/);
});

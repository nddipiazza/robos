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
const { gnome, parseList, formatList } = require('../lib/gnome.cjs');
// Desktop entries escape backslashes, which Windows paths contain when these tests run there.
const desktopPath = file => file.replace(/\\/g, '\\\\');
const fakeDesktop = () => {
  const calls = [];
  return { calls, pin: entry => { calls.push(['pin', entry]); return true; }, unpin: match => calls.push(['unpin', match]),
    addToFolder: entry => calls.push(['folder', entry]), removeFromFolder: entry => calls.push(['unfolder', entry]), removeFolder: () => calls.push(['remove-folder']) };
};
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
    url: `https://github.com/nddipiazza/robos/releases/download/apps-v1.0.0-${process.platform}-${process.arch}/${id}.tgz`, bytes: buffer.length, unpackedBytes: 10000,
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
test('one batch installs and uninstalls multiple apps, removing a shared dependency once', async t => {
  const { manager: m, calls, locations } = await fixture(t);
  await m.install(['one', 'two']);
  assert.deepEqual(new Set(Object.keys(m.installed)), new Set(['shared', 'one', 'two']));
  const progress = []; m.on('progress', event => progress.push(event));
  const result = await m.uninstall(['one', 'two', 'one']);
  assert.equal(result.busy, false); assert.deepEqual(result.installed, {});
  assert.deepEqual(calls.filter(([, remove]) => remove).map(([id]) => id).sort(), ['one', 'two']);
  assert.equal(progress.filter(event => event.id === 'shared').length, 1);
  assert.equal(progress.at(-1).id, 'shared');
  assert.ok(fs.existsSync(locations.root), 'bulk removal retains the manager installation');
});
test('bulk removal validates dependents before deleting anything and uses dependency order', async t => {
  const { manager: m, calls } = await fixture(t);
  m.catalog.components.find(item => item.id === 'two').dependencies = ['one'];
  await m.install(['two']);
  const before = calls.length;
  await assert.rejects(m.uninstall(['one']), /Other installed apps need/);
  assert.equal(calls.length, before); assert.ok(m.installed.one); assert.ok(m.installed.two);
  await assert.rejects(m.uninstall(['two', 'missing']), /not installed/);
  assert.equal(calls.length, before);
  await m.uninstall(['one', 'two']);
  assert.deepEqual(calls.filter(([, remove]) => remove).map(([id]) => id), ['two', 'one']);
  assert.deepEqual(m.installed, {});
});
test('install all and uninstall all work offline and retain personal data and the manager catalog', async t => {
  const { manager: m, locations, root } = await fixture(t);
  await m.install(m.catalog.components.filter(item => item.kind === 'app').map(item => item.id));
  const catalogFile = path.join(locations.root, 'catalog.json'); fs.writeFileSync(catalogFile, JSON.stringify(m.catalog));
  const personal = path.join(root, 'personal.json'); fs.writeFileSync(personal, '{}');
  m.catalog = undefined;
  await m.uninstallAll();
  assert.deepEqual(m.installed, {}); assert.ok(fs.existsSync(catalogFile)); assert.ok(fs.existsSync(personal));
  // Cancellation may leave only shared components. The all-apps action can clean these too.
  m.installed.shared = { id: 'shared', kind: 'library', dependencies: [], label: 'Shared' }; m.save();
  fs.mkdirSync(m.destination(m.installed.shared), { recursive: true });
  await m.uninstallAll(); assert.deepEqual(m.installed, {});
});
test('batch uninstall can be cancelled between apps and resumed without losing remaining state', async t => {
  const { manager: m } = await fixture(t); await m.install(['one', 'two']);
  const cancel = event => { if (event.phase === 'Uninstalling') m.cancel(); };
  m.on('progress', cancel);
  await assert.rejects(m.uninstallAll(), /abort/i);
  assert.equal(m.busy, false);
  assert.equal(Object.values(m.installed).filter(item => item.kind === 'app').length, 1);
  m.removeListener('progress', cancel);
  await m.uninstallAll(); assert.deepEqual(m.installed, {});
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
  const { locations, root } = await fixture(t), desktop = fakeDesktop();
  const native = integration({ locations, executable: '/home/a user/RobOS.AppImage', packaged: true, platform: 'linux', desktop });
  native.shortcut({ id: 'one', label: 'One App' });
  const file = path.join(locations.shortcuts, 'robos-managed-one.desktop'), entry = fs.readFileSync(file, 'utf8');
  assert.match(entry, /Exec="\/home\/a user\/RobOS.AppImage" "--app=one"/);
  assert.match(entry, /TryExec=\/home\/a user\/RobOS.AppImage\n/);
  assert.match(entry, /\[Desktop Action Uninstall\]/); assert.match(entry, /--remove=one/);
  fs.writeFileSync(path.join(locations.shortcuts, 'unrelated.desktop'), 'keep'); native.removeAll();
  assert.ok(fs.existsSync(path.join(locations.shortcuts, 'unrelated.desktop'))); assert.equal(fs.existsSync(file), false);
  assert.equal(quoteDesktop('a%b'), '"a%%b"');
  assert.ok(root);
});
test('GNOME entries tie windows to their icon and place apps in the RobOS menu folder', async t => {
  const { locations } = await fixture(t), desktop = fakeDesktop();
  const native = integration({ locations, executable: '/opt/RobOS/robos-app-manager', packaged: true, platform: 'linux', desktop });
  const packageDir = path.join(locations.root, 'packages/one'); fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'icon.png'), 'png');
  native.shortcut({ id: 'one', label: 'One\\App', description: 'Line one\nline two', group: 'Games & game tools' });
  const file = path.join(locations.shortcuts, 'robos-managed-one.desktop'), entry = fs.readFileSync(file, 'utf8');
  assert.match(entry, /StartupWMClass=robos-one\n/); assert.match(entry, /StartupNotify=true\n/);
  assert.ok(entry.includes(`Icon=${desktopPath(path.join(packageDir, 'icon.png'))}\n`), 'falls back to the PNG icon');
  assert.match(entry, /Categories=Game;\n/);
  assert.ok(entry.includes('Name=One\\\\App\n')); assert.ok(entry.includes('Comment=Line one\\nline two\n'));
  assert.deepEqual(desktop.calls.find(([name]) => name === 'folder'), ['folder', 'robos-managed-one.desktop']);
  fs.writeFileSync(path.join(packageDir, 'icon.svg'), '<svg/>'); native.shortcut({ id: 'one', label: 'One' });
  assert.ok(fs.readFileSync(file, 'utf8').includes(`Icon=${desktopPath(path.join(packageDir, 'icon.svg'))}\n`));
  assert.match(fs.readFileSync(file, 'utf8'), /Categories=Utility;\n/);
  // A startup refresh keeps the entry current without undoing a user's folder changes.
  const placed = desktop.calls.length; native.writeEntry({ id: 'one', label: 'Renamed' });
  assert.match(fs.readFileSync(file, 'utf8'), /Name=Renamed\n/); assert.equal(desktop.calls.length, placed);
  native.shortcut({ id: 'one', label: 'One' }, true);
  assert.equal(fs.existsSync(file), false);
  const [, match] = desktop.calls.find(([name]) => name === 'unpin');
  assert.ok(match('robos-managed-one.desktop')); assert.ok(!match('org.gnome.Nautilus.desktop'));
  assert.deepEqual(desktop.calls.find(([name]) => name === 'unfolder'), ['unfolder', 'robos-managed-one.desktop']);
});
test('the dock pin happens once so a later unpin is respected, and is removed with RobOS', async t => {
  const { locations, root } = await fixture(t), desktop = fakeDesktop();
  locations.data = path.join(root, 'data'); locations.image = path.join(locations.data, 'RobOS.AppImage');
  const native = integration({ locations, executable: '/opt/RobOS/robos-app-manager', packaged: true, platform: 'linux', desktop });
  native.pinManager(); native.pinManager();
  assert.deepEqual(desktop.calls.filter(([name]) => name === 'pin'), [['pin', 'robos-app-manager.desktop']]);
  native.removeManager();
  assert.ok(desktop.calls.find(([name]) => name === 'unpin')[1]('robos-app-manager.desktop'));
  native.pinManager(); assert.equal(desktop.calls.filter(([name]) => name === 'pin').length, 2);
  // A session without GNOME leaves the marker unset so a later GNOME login still pins.
  const absent = fakeDesktop(); absent.pin = () => false; fs.rmSync(path.join(locations.data, 'dock-pinned'));
  integration({ locations, executable: 'x', packaged: true, platform: 'linux', desktop: absent }).pinManager();
  assert.equal(fs.existsSync(path.join(locations.data, 'dock-pinned')), false);
});
test('AppImage installs register the manager with its window class and own icon', async t => {
  const { locations, root } = await fixture(t);
  locations.data = path.join(root, 'data'); locations.image = path.join(locations.data, 'RobOS.AppImage');
  const icon = path.join(__dirname, '../icon.png'), hadIcon = fs.existsSync(icon);
  if (!hadIcon) { fs.writeFileSync(icon, 'png'); t.after(() => fs.rmSync(icon, { force: true })); }
  const source = path.join(root, 'Download.AppImage'); fs.writeFileSync(source, 'image');
  const native = integration({ locations, executable: locations.image, packaged: true, platform: 'linux', desktop: fakeDesktop() });
  native.installManager(source);
  const entry = fs.readFileSync(path.join(locations.shortcuts, 'robos-app-manager.desktop'), 'utf8');
  assert.match(entry, /StartupWMClass=robos-app-manager\n/);
  assert.ok(entry.includes(`Icon=${desktopPath(path.join(locations.data, 'robos-app-manager.png'))}\n`));
  native.adoptSystemManager();
  assert.equal(fs.existsSync(path.join(locations.shortcuts, 'robos-app-manager.desktop')), false);
  assert.equal(fs.existsSync(locations.image), false);
});
test('GNOME settings keep other apps, never rewrite unreadable lists and stay off elsewhere', () => {
  assert.deepEqual(parseList("['a.desktop', 'b.desktop']\n"), ['a.desktop', 'b.desktop']);
  assert.deepEqual(parseList('@as []\n'), []);
  assert.equal(formatList(['a', 'b']), "['a', 'b']");
  const store = { 'org.gnome.shell favorite-apps': "['firefox.desktop']\n", 'org.gnome.desktop.app-folders folder-children': "['Utilities']\n" };
  const writes = [], run = ([verb, schema, key, value]) => {
    if (verb === 'get') return store[`${schema} ${key}`];
    writes.push([verb, schema, key, value]);
    if (verb === 'set' && store[`${schema} ${key}`]) store[`${schema} ${key}`] = value;
    return '';
  };
  const desktop = gnome({ run, env: { XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' } });
  assert.equal(desktop.pin('robos.desktop'), true); writes.length = 0;
  assert.equal(desktop.pin('robos.desktop'), true); assert.deepEqual(writes, []);
  assert.equal(store['org.gnome.shell favorite-apps'], "['firefox.desktop', 'robos.desktop']");
  desktop.unpin(entry => entry === 'robos.desktop');
  assert.equal(store['org.gnome.shell favorite-apps'], "['firefox.desktop']");
  const folderApps = 'org.gnome.desktop.app-folders.folder:/org/gnome/desktop/app-folders/folders/RobOS/ apps';
  store[folderApps] = '@as []\n';
  desktop.addToFolder('robos-one.desktop');
  assert.equal(store['org.gnome.desktop.app-folders folder-children'], "['Utilities', 'RobOS']");
  assert.ok(writes.some(([, schema, key, value]) => schema.endsWith('/folders/RobOS/') && key === 'name' && value === 'RobOS Apps'));
  assert.equal(store[folderApps], "['robos-one.desktop']");
  writes.length = 0; desktop.addToFolder('robos-one.desktop'); assert.deepEqual(writes, []);
  desktop.addToFolder('robos-two.desktop'); desktop.removeFromFolder('robos-one.desktop');
  assert.equal(store[folderApps], "['robos-two.desktop']");
  desktop.removeFolder();
  assert.equal(store['org.gnome.desktop.app-folders folder-children'], "['Utilities']");
  store['org.gnome.shell favorite-apps'] = `["it's.desktop", 'firefox.desktop']\n`; writes.length = 0;
  assert.equal(desktop.pin('robos.desktop'), false); assert.deepEqual(writes, []);
  const other = gnome({ run: () => { throw new Error('gsettings must not run'); }, env: { XDG_CURRENT_DESKTOP: 'KDE' } });
  assert.equal(other.pin('robos.desktop'), false); assert.equal(other.addToFolder('robos.desktop'), false);
  const electronRenamed = gnome({ run, env: { XDG_CURRENT_DESKTOP: 'Unity', ORIGINAL_XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' } });
  store['org.gnome.shell favorite-apps'] = "['firefox.desktop']\n";
  assert.equal(electronRenamed.pin('robos.desktop'), true);
  const missing = gnome({ run: () => { throw new Error('No such schema'); }, env: { XDG_CURRENT_DESKTOP: 'GNOME' } });
  assert.equal(missing.pin('robos.desktop'), false);
});
test('Windows shortcuts point directly to app and its uninstall command', async t => {
  const { locations } = await fixture(t), links = [];
  const native = integration({ locations, executable: 'C:\\RobOS\\RobOS.exe', packaged: true, platform: 'win32',
    shell: { writeShortcutLink: (file, _mode, options) => { links.push({ file, ...options }); return true; } } });
  native.shortcut({ id: 'one', label: 'One App' });
  assert.equal(links.length, 2); assert.equal(links[0].args, '"--app=one"'); assert.equal(links[1].args, '"--remove=one"');
  assert.equal(links[0].appUserModelId, 'com.rowbose.robos.one');
});
test('macOS apps get native application bundles with safely quoted launchers', async t => {
  const { locations } = await fixture(t);
  const native = integration({ locations, executable: "/Applications/RobOS.app/Contents/MacOS/RobOS", packaged: true, platform: 'darwin' });
  native.shortcut({ id: 'one', label: 'One & Two' });
  const bundle = path.join(locations.shortcuts, 'one.app/Contents');
  assert.match(fs.readFileSync(path.join(bundle, 'Info.plist'), 'utf8'), /One &amp; Two/);
  assert.match(fs.readFileSync(path.join(bundle, 'MacOS/launch'), 'utf8'), /exec '\/Applications\/RobOS.app\/Contents\/MacOS\/RobOS' '--app=one'/);
  native.shortcut({ id: 'one', label: 'One & Two' }, true);
  assert.equal(fs.existsSync(bundle), false);
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

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const icons = require('./icons.cjs');
const common = require('./common.cjs');
const { install, remove } = require('./source-shortcuts.cjs');
const { missingDeps } = require('./deps.cjs');
const { decodePng, pngSize } = require('../../packages/app-manager/lib/win-icon.cjs');

const APP = { id: 'camera-watch', label: 'Camera Watch', group: 'Developer tools', description: 'Watch cameras', libs: () => ['robos-lib'] };
const ICON = path.join(common.repo, 'packages/camera-watch/icon.png');

function stubSystem(extra = {}) {
  const calls = [];
  return { calls, run: (cmd, args) => { calls.push([cmd, ...args]); return cmd === 'gsettings' && args[0] === 'get' ? "['Utilities']" : ''; },
    sharedElectron: () => '/opt/electron/electron', windowsDesktop: () => null, linuxDesktop: () => null,
    writeLinks: (_electron, links) => { calls.push(['links', links]); return links.map(link => ({ file: link.file, ok: true })); }, ...extra };
}
const tempHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'robos-src-'));

test('PNG encoder output decodes back to the same pixels', () => {
  const rgba = Buffer.alloc(3 * 3 * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37) & 0xff;
  const decoded = decodePng(icons.encodePng(rgba, 3));
  assert.deepStrictEqual([decoded.width, decoded.height], [3, 3]);
  assert.ok(decoded.rgba.equals(rgba));
});

test('hicolor sizes are scaled down from icon.png and never upscaled', () => {
  const pngs = icons.scaledPngs(fs.readFileSync(ICON), [16, 48, 256, 512]);
  assert.deepStrictEqual([...pngs.keys()], [16, 48, 256]);
  assert.deepStrictEqual(pngSize(pngs.get(48)), { width: 48, height: 48 });
});

test('icns holds PNG entries for 16–256 px including @2x', () => {
  const icns = icons.pngToIcns(fs.readFileSync(ICON));
  assert.strictEqual(icns.toString('latin1', 0, 4), 'icns');
  assert.strictEqual(icns.readUInt32BE(4), icns.length);
  const types = [];
  for (let at = 8; at < icns.length; at += icns.readUInt32BE(at + 4)) types.push(icns.toString('latin1', at, at + 4));
  assert.deepStrictEqual(types, ['icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic11', 'ic12', 'ic13']);
});

test('ico is named by content hash and replaces older ones', () => {
  const dir = tempHome();
  fs.writeFileSync(path.join(dir, 'source-x-0123456789.ico'), 'old');
  const ico = icons.ensureIco(ICON, dir, 'source-x');
  assert.match(path.basename(ico), /^source-x-[0-9a-f]{10}\.ico$/);
  assert.deepStrictEqual(fs.readdirSync(dir), [path.basename(ico)]);
  assert.strictEqual(fs.readFileSync(ico).readUInt16LE(4), 8, '7 small bitmaps + the 256 px PNG');
});

test('Linux: menu entry, desktop icon, hicolor icons and GNOME folder share one identity', () => {
  const home = tempHome(), sys = stubSystem(), env = { XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' };
  install({ ids: ['camera-watch'], desktop: true, platform: 'linux', home, env, sys, apps: [APP], log: () => {} });
  const entry = fs.readFileSync(path.join(home, '.local/share/applications/robos-source-camera-watch.desktop'), 'utf8');
  assert.match(entry, /^Name=RobOS Camera Watch \(From Source\)$/m);
  assert.match(entry, /^StartupWMClass=robos-source-camera-watch$/m);
  assert.match(entry, /^Icon=robos-source-camera-watch$/m);
  assert.match(entry, /--class=robos-source-camera-watch/);
  assert.match(entry, /source-host\.cjs" "--app=camera-watch"$/m);
  for (const size of [16, 22, 24, 32, 48, 64, 96, 128, 256]) {
    assert.ok(fs.existsSync(path.join(home, `.local/share/icons/hicolor/${size}x${size}/apps/robos-source-camera-watch.png`)), `${size}px icon`);
  }
  assert.ok(fs.existsSync(path.join(home, '.local/share/icons/hicolor/scalable/apps/robos-source-camera-watch.svg')));
  const onDesktop = path.join(home, 'Desktop/robos-source-camera-watch.desktop');
  assert.strictEqual(fs.readFileSync(onDesktop, 'utf8'), entry);
  assert.ok(sys.calls.some(call => call[0] === 'gio' && call[2] === onDesktop && call[3] === 'metadata::trusted'));
  assert.ok(sys.calls.some(call => call[0] === 'gtk-update-icon-cache'));
  assert.ok(sys.calls.some(call => call.join(' ').includes("apps ['robos-source-camera-watch.desktop']")));

  remove({ platform: 'linux', home, env, sys, log: () => {} });
  assert.ok(!fs.existsSync(onDesktop));
  assert.ok(!fs.existsSync(path.join(home, '.local/share/applications/robos-source-camera-watch.desktop')));
  assert.ok(!fs.existsSync(path.join(home, '.local/share/icons/hicolor/48x48/apps/robos-source-camera-watch.png')));
});

test('macOS: app bundle with its own icns, bundle ID and launcher', () => {
  const home = tempHome(), sys = stubSystem();
  install({ ids: ['camera-watch'], platform: 'darwin', home, env: {}, sys, apps: [APP], log: () => {} });
  const bundle = path.join(home, 'Applications/RobOS (From Source)/RobOS Camera Watch (From Source).app');
  const plist = fs.readFileSync(path.join(bundle, 'Contents/Info.plist'), 'utf8');
  assert.match(plist, /<string>com\.rowbose\.robos\.source\.camera-watch<\/string>/);
  assert.match(plist, /<key>CFBundleIconFile<\/key><string>icon\.icns<\/string>/);
  assert.strictEqual(fs.readFileSync(path.join(bundle, 'Contents/Resources/icon.icns')).toString('latin1', 0, 4), 'icns');
  assert.match(fs.readFileSync(path.join(bundle, 'Contents/MacOS/launch'), 'utf8'), /exec '\/opt\/electron\/electron' '.*source-host\.cjs' '--app=camera-watch' "\$@"/);
  assert.ok(sys.calls.some(call => call[0].endsWith('lsregister') && call[2] === bundle));
  remove({ platform: 'darwin', home, env: {}, sys, log: () => {} });
  assert.ok(!fs.existsSync(path.join(home, 'Applications/RobOS (From Source)')));
});

test('Windows: Start menu and desktop shortcuts carry the AppUserModelID and the app .ico', () => {
  const home = tempHome(), desktop = path.join(home, 'OneDrive/Desktop');
  const sys = stubSystem({ windowsDesktop: () => desktop });
  const env = { APPDATA: path.join(home, 'Roaming'), LOCALAPPDATA: path.join(home, 'Local') };
  install({ ids: ['camera-watch'], desktop: true, platform: 'win32', home, env, sys, apps: [APP], log: () => {} });
  const links = sys.calls.find(call => call[0] === 'links')[1];
  assert.deepStrictEqual(links.map(link => link.file), [
    path.join(env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/RobOS (From Source)/RobOS Camera Watch (From Source).lnk'),
    path.join(desktop, 'RobOS Camera Watch (From Source).lnk')]);
  for (const link of links) {
    assert.strictEqual(link.appUserModelId, 'com.rowbose.robos.source.camera-watch');
    assert.strictEqual(path.dirname(link.icon), path.join(env.LOCALAPPDATA, 'Programs/RobOS/icons'));
    assert.match(link.args, /source-host\.cjs" --app=camera-watch$/);
  }
  // Refreshing without --desktop keeps the desktop shortcut the user asked for earlier.
  install({ ids: ['camera-watch'], platform: 'win32', home, env, sys, apps: [APP], log: () => {} });
  assert.strictEqual(sys.calls.filter(call => call[0] === 'links').pop()[1].length, 2);
  remove({ platform: 'win32', home, env, sys, log: () => {} });
  assert.deepStrictEqual(fs.readdirSync(path.join(env.LOCALAPPDATA, 'Programs/RobOS/icons')), []);
});

test('missingDeps ignores electron and finds runtime dependencies not yet installed', () => {
  const dir = tempHome();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { electron: '33', marked: '1', diff: '2' }, devDependencies: { esbuild: '1' } }));
  assert.deepStrictEqual(missingDeps(dir), ['marked', 'diff']);
  fs.mkdirSync(path.join(dir, 'node_modules/marked'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules/marked/package.json'), '{}');
  assert.deepStrictEqual(missingDeps(dir), ['diff']);
});

test('shortcuts all run the shared Electron; the manifest records Node and the libraries to set up', () => {
  const home = tempHome(), sys = stubSystem(), env = {};
  install({ ids: ['camera-watch'], platform: 'linux', home, env, sys, apps: [APP], log: () => {}, node: '/opt/node/bin/node' });
  const manifest = JSON.parse(fs.readFileSync(path.join(home, '.local/share/robos/source-shortcuts.json'), 'utf8'));
  assert.strictEqual(manifest.node, '/opt/node/bin/node');
  assert.deepStrictEqual(manifest.apps['camera-watch'].libs, ['robos-lib']);
  const entry = fs.readFileSync(path.join(home, '.local/share/applications/robos-source-camera-watch.desktop'), 'utf8');
  assert.ok(entry.includes('Exec="/opt/electron/electron" "--no-sandbox"'));
  assert.throws(() => install({ ids: ['camera-watch'], platform: 'linux', home, env, sys: stubSystem({ sharedElectron: () => null }), apps: [APP], log: () => {} }), /Could not install Electron/);
});

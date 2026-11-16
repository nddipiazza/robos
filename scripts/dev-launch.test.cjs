'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

function fixture(icons) {
  const { app, BrowserWindow, nativeImage } = require('electron');
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  app.setPath('userData', path.join(__dirname, 'profile'));
  setTimeout(() => process.exit(1), 12000).unref();
  app.whenReady().then(async () => {
    assert.equal(fs.realpathSync(app.getAppPath()), fs.realpathSync(__dirname));
    assert.ok(process.argv.includes('test argument'));
    assert.ok(!process.argv.includes('--require'));
    const window = new BrowserWindow({ title: 'Source icon test', show: false });
    await window.loadURL('about:blank');
    async function waitForFile(ext) {
      const deadline = Date.now() + 8000;
      do {
        const file = (fs.existsSync(icons) ? fs.readdirSync(icons) : []).find(file => file.endsWith(ext));
        if (file) return path.join(icons, file);
        await new Promise(resolve => setTimeout(resolve, 50));
      } while (Date.now() < deadline);
      throw new Error('No generated ' + ext);
    }
    const png = nativeImage.createFromPath(await waitForFile('.png'));
    assert.deepEqual(png.getSize(), { width: 512, height: 512 });
    const centerPixel = image => {
      const { width, height } = image.getSize();
      const pixel = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
      return [...image.toBitmap().subarray(pixel, pixel + 4)];
    };
    assert.deepEqual(centerPixel(png), [212, 188, 0, 255]);
    if (process.platform === 'win32') {
      const ico = nativeImage.createFromPath(await waitForFile('.ico'));
      assert.deepEqual(centerPixel(ico), [212, 188, 0, 255]);
    }
    if (process.platform === 'linux' && process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      const handle = window.getNativeWindowHandle().readUInt32LE(0);
      const properties = spawnSync('xprop', ['-id', '0x' + handle.toString(16), '-len', '64', 'WM_CLASS', '_NET_WM_ICON'], { encoding: 'utf8' });
      assert.equal(properties.status, 0, properties.error?.message || properties.stderr);
      assert.match(properties.stdout, /WM_CLASS.*"fixture"/);
      assert.match(properties.stdout, /_NET_WM_ICON\(CARDINAL\) =/);
    }
    process.exit(0);
  }).catch(error => { console.error(error); process.exit(1); });
}

const electron = process.env.ROBOS_TEST_ELECTRON;
test('source launch gives an SVG-only app a native icon and keeps its app path and arguments', {
  skip: !electron && 'Set ROBOS_TEST_ELECTRON to an Electron executable and run in a desktop session',
}, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos source % '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const scripts = path.join(root, 'scripts');
  const dir = path.join(root, 'packages', 'icon-test');
  const localElectron = path.join(dir, 'node_modules', 'electron');
  const cache = path.join(root, 'cache');
  const icons = path.join(cache, 'robos', 'source-icons');
  fs.mkdirSync(scripts);
  fs.mkdirSync(localElectron, { recursive: true });
  for (const file of ['dev-launch.cjs', 'dev-launch-icons.cjs']) fs.copyFileSync(path.join(__dirname, file), path.join(scripts, file));
  fs.writeFileSync(path.join(localElectron, 'index.js'), 'module.exports = ' + JSON.stringify(path.resolve(electron)));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', main: 'main.js', version: '1.0.0' }));
  fs.writeFileSync(path.join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#00bcd4"/></svg>');
  fs.writeFileSync(path.join(dir, 'main.js'), '(' + fixture.toString() + ')(' + JSON.stringify(icons) + ');');
  const run = spawnSync(process.execPath, [path.join(scripts, 'dev-launch.cjs'), 'icon-test', 'test argument'], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, LOCALAPPDATA: cache, XDG_CACHE_HOME: cache, XDG_DATA_HOME: path.join(root, 'data') },
  });
  assert.equal(run.status, 0, (run.error?.message || '') + '\n' + run.stdout + '\n' + run.stderr);
  assert.doesNotMatch(run.stderr, /Source icon for icon-test:/);
  if (process.platform === 'linux') {
    const entry = fs.readFileSync(path.join(root, 'data/applications/com.rowbose.robos.source.icon-test.desktop'), 'utf8');
    assert.ok(entry.includes('\nIcon=' + path.join(dir, 'icon.svg') + '\n'));
    assert.match(entry, /\nStartupWMClass=fixture\n/);
    assert.match(entry, /%%/);
  }
});

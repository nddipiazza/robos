'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WindowsTools, PACKAGES, NPM_PACKAGES, catalog, wingetArgs, runProcess, explainExit, commandWrappers } = require('./windows-tools');

function fixture(t, initial = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos installer test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = new Set(initial);
  const calls = [];
  const run = async (file, args) => {
    calls.push({ file, args });
    if (args[0] === 'export') {
      fs.writeFileSync(args[args.indexOf('--output') + 1], JSON.stringify({ Sources: [{ Packages: [...installed].map(PackageIdentifier => ({ PackageIdentifier })) }] }));
    } else if (file === 'powershell.exe') return { code: 0, output: '["Google Chrome"]' };
    else if (args[0] === 'install') installed.add(args[args.indexOf('--id') + 1]);
    else if (args[0] === 'uninstall') installed.delete(args[args.indexOf('--id') + 1]);
    return { code: 0, output: '' };
  };
  return { root, installed, calls, run, service: new WindowsTools({ root, run }) };
}

test('every Windows card uses a native provider or explains why it is unavailable', () => {
  const tools = Object.keys({ ...PACKAGES, ...NPM_PACKAGES }).map(id => ({ id, installCmd: 'sudo apt install something', checkCmd: 'which thing' }));
  const all = catalog([...tools, { id: 'kazam' }, { id: 'htop' }, { id: 'github-copilot-cli' }, { id: 'future-tool' }]);
  assert.equal(new Set(all.map(t => t.id)).size, all.length);
  assert.ok(!all.some(t => t.id === 'github-copilot-cli'));
  for (const tool of all) {
    assert.equal(tool.installCmd, undefined);
    assert.equal(tool.checkCmd, undefined);
    assert.ok(tool.supported ? tool.packageId || tool.npmPackage : tool.unavailableReason);
  }
});

test('WinGet uses exact IDs and the selected source without shell interpolation', () => {
  const args = wingetArgs('install', PACKAGES.godot4);
  assert.ok(args.includes('--exact') && args.includes('--disable-interactivity'));
  assert.equal(args[args.indexOf('--source') + 1], 'winget');
  assert.throws(() => wingetArgs('install', 'GodotEngine.GodotEngine & echo injected'));
});

test('installation and removal refresh and verify the inventory', async t => {
  const f = fixture(t);
  let godot = (await f.service.status([])).find(t => t.id === 'godot4');
  assert.equal(godot.installed, false);
  await f.service.perform(godot, 'install', () => {});
  godot = (await f.service.status([])).find(t => t.id === 'godot4');
  assert.equal(godot.installed, true);
  await f.service.perform(godot, 'uninstall', () => {});
  assert.equal((await f.service.status([])).find(t => t.id === 'godot4').installed, false);
});

test('missing WinGet disables those actions but preserves the catalog', async t => {
  const f = fixture(t);
  f.service.run = async () => { throw new Error('spawn winget.exe ENOENT'); };
  const tools = await f.service.status([]);
  assert.ok(tools.length);
  assert.equal(tools[0].supported, false);
  assert.match(tools[0].unavailableReason, /App Installer/);
  await assert.rejects(f.service.perform(tools[0], 'install', () => {}), /WinGet is unavailable/);
});

test('vendor-installed copies are detected without taking over uninstall', async t => {
  const f = fixture(t);
  const chrome = (await f.service.status([{ id: 'google-chrome' }])).find(t => t.id === 'google-chrome');
  assert.equal(chrome.installed, true);
  assert.equal(chrome.externallyManaged, true);
  await assert.rejects(f.service.perform(chrome, 'uninstall', () => {}), /Windows Settings/);
});

test('failed installers release the lock, and exit zero alone is not success', async t => {
  const f = fixture(t);
  const tool = (await f.service.status([]))[0];
  f.service.run = async (file, args) => args[0] === 'install' ? { code: 0x8A15010C, output: '' } : f.run(file, args);
  await assert.rejects(f.service.perform(tool, 'install', () => {}), /cancelled/);
  assert.equal(f.service.busy, false);
  f.service.run = async (file, args) => args[0] === 'install' ? { code: 0, output: '' } : f.run(file, args);
  await assert.rejects(f.service.perform(tool, 'install', () => {}), /could not be verified/);
  assert.equal(f.service.busy, false);
});

test('overlapping installations and unknown packages/actions are rejected', async t => {
  const f = fixture(t);
  const tool = (await f.service.status([]))[0];
  f.service.busy = true;
  await assert.rejects(f.service.perform(tool, 'install', () => {}), /Another installer/);
  f.service.busy = false;
  await assert.rejects(f.service.perform(tool, 'destroy', () => {}), /Unknown installer action/);
  await assert.rejects(f.service.perform({ supported: true, packageId: 'unknown' }, 'install', () => {}), /Unknown Windows package/);
});

test('npm uses the private Node runtime and prefix, including paths with spaces', async t => {
  const f = fixture(t);
  const node = path.join(f.root, 'runtime/node.exe');
  const npm = path.join(f.root, 'runtime/node_modules/npm/bin/npm-cli.js');
  fs.mkdirSync(path.dirname(npm), { recursive: true });
  fs.writeFileSync(node, ''); fs.writeFileSync(npm, '');
  const tool = (await f.service.status([{ id: 'openai-codex' }])).find(t => t.id === 'openai-codex');
  f.service.run = async (file, args, options) => {
    if (file === node) {
      if (args.includes('--version')) return { code: 0, output: 'codex test-version' };
      assert.equal(args[0], npm);
      assert.equal(args[args.indexOf('--prefix') + 1], f.service.prefix);
      assert.equal(args.includes('--ignore-scripts=false'), true);
      assert.ok(options.env.PATH.startsWith(path.dirname(node)));
      const manifest = path.join(f.service.prefix, 'node_modules', tool.npmPackage, 'package.json');
      fs.mkdirSync(path.dirname(manifest), { recursive: true });
      fs.writeFileSync(manifest, JSON.stringify({ bin: { codex: 'cli.js' } }));
      fs.writeFileSync(path.join(path.dirname(manifest), 'cli.js'), '');
      return { code: 0, output: '' };
    }
    return f.run(file, args);
  };
  await f.service.perform(tool, 'install', () => {});
  assert.equal((await f.service.status([{ id: tool.id }])).find(t => t.id === tool.id).installed, true);
});

test('spawn errors and timeouts reject instead of leaving an operation pending', async () => {
  await assert.rejects(runProcess('robos-nonexistent-installer-5678', []), /ENOENT/);
  await assert.rejects(runProcess(process.execPath, ['-e', 'setTimeout(()=>{}, 10000)'], { timeout: 50 }), /timed out/);
  assert.match(explainExit(0x8A15010A), /Restart Windows/);
});

test('portable commands work without symlinks and removal preserves other files', t => {
  const f = fixture(t);
  const pkg = path.join(f.root, 'package with spaces %test%');
  fs.mkdirSync(pkg);
  fs.writeFileSync(path.join(pkg, 'jq-windows-amd64.exe'), 'fake executable');
  const tool = { id: 'jq' };
  const [wrapper] = commandWrappers(f.root, tool, 'install', [pkg]);
  assert.match(fs.readFileSync(wrapper, 'utf8'), /%%test%%/);
  assert.match(fs.readFileSync(wrapper, 'utf8'), /" %\*\r\n$/);
  commandWrappers(f.root, tool, 'uninstall', []);
  assert.equal(fs.existsSync(wrapper), false);
  fs.writeFileSync(wrapper, '@echo This belongs to the user');
  commandWrappers(f.root, tool, 'install', [pkg]);
  commandWrappers(f.root, tool, 'uninstall', []);
  assert.equal(fs.readFileSync(wrapper, 'utf8'), '@echo This belongs to the user');
});

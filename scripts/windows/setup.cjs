'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function catalog(root) {
  const registry = require(path.join(root, 'packages/robos-icons')).getAllIcons();
  return fs.readdirSync(path.join(root, 'packages')).flatMap(id => {
    const dir = path.join(root, 'packages', id);
    const main = path.join(dir, 'main.js');
    if (!fs.existsSync(main) || !/require\(['"]electron['"]\)/.test(fs.readFileSync(main, 'utf8'))) return [];
    // GNOME shell helpers are replaced by the native Windows launcher.
    if (['app-launcher', 'app-manager', 'robos-desktop', 'gnome-desktop-installer', 'pass-unlock'].includes(id)) return [];
    const entry = registry.find(a => a.appId === id);
    return [{ id, label: entry?.label || id, category: entry?.category || 'Apps', iconSvg: entry?.iconSvg || null }];
  }).concat([{ id: 'household', label: 'Household', category: 'Household' }]);
}

function run(node, args, cwd) {
  const result = spawnSync(node, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed in ${cwd} (exit ${result.status})`);
}

function setup(source, target) {
  if (path.resolve(source) === path.resolve(target)) throw new Error('Install into a separate folder, not the source checkout.');
  for (const name of ['packages', '.robos', 'games']) {
    fs.cpSync(path.join(source, name), path.join(target, name), {
      recursive: true,
      filter: file => !['node_modules', '.git'].includes(path.basename(file)),
    });
  }
  fs.cpSync(path.join(source, 'scripts/windows'), path.join(target, 'windows'), { recursive: true });
  fs.copyFileSync(path.join(source, 'site/assets/logo-mark.png'), path.join(target, 'windows/logo.png'));
  fs.copyFileSync(path.join(source, 'scripts/windows/robos.ico'), path.join(target, 'windows/robos.ico'));
  fs.copyFileSync(path.join(source, 'docs/assets/images/logo-sidebar.png'), path.join(target, 'windows/wordmark.png'));
  const npm = path.join(target, 'runtime/node_modules/npm/bin/npm-cli.js');
  const node = path.join(target, 'runtime/node.exe');
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ private: true, dependencies: { electron: '33.4.11', esbuild: '0.28.2' } }));
  run(node, [npm, 'install', '--no-audit', '--no-fund'], target);
  const failures = [];
  const appIds = new Set(catalog(target).map(a => a.id));
  for (const id of fs.readdirSync(path.join(target, 'packages'))) {
    const dir = path.join(target, 'packages', id);
    const manifest = path.join(dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    if (!appIds.has(id) && !(id.startsWith('robos-') && id !== 'robos-test')) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest));
    // Share one Electron binary. Install each app's other runtime dependencies locally.
    delete pkg.dependencies?.electron;
    delete pkg.devDependencies?.electron;
    delete pkg.devDependencies; // Test runners and Linux development tools aren't app requirements.
    fs.writeFileSync(manifest, JSON.stringify(pkg, null, 2));
    if (!Object.keys(pkg.dependencies || {}).length && !pkg.scripts?.postinstall) continue;
    console.log(`Installing ${id}...`);
    try { run(node, [npm, 'install', '--package-lock=false', '--no-audit', '--no-fund'], dir); }
    catch (error) { failures.push({ id, error: error.message }); }
  }
  // Build the JSX music UI using the API, which avoids POSIX shell quoting on Windows.
  try {
    require(path.join(target, 'node_modules/esbuild')).buildSync({
      absWorkingDir: path.join(target, 'packages/audio-player'), entryPoints: ['src/index.jsx'], bundle: true,
      outfile: 'renderer/bundle.js', loader: { '.js': 'jsx', '.jsx': 'jsx' }, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
    });
  } catch (error) { failures.push({ id: 'audio-player', error: error.message }); }
  fs.writeFileSync(path.join(target, 'apps.json'), JSON.stringify(catalog(target), null, 2));
  fs.writeFileSync(path.join(target, 'install-report.json'), JSON.stringify({ failures }, null, 2));
  fs.writeFileSync(path.join(target, 'RobOS.cmd'), '@echo off\r\nset "HOME=%USERPROFILE%"\r\nset "PATH=%~dp0runtime;%~dp0runtime\\git\\cmd;%PATH%"\r\nset "ELECTRON_RUN_AS_NODE="\r\nstart "" "%~dp0node_modules\\electron\\dist\\electron.exe" "%~dp0windows" %*\r\n');
  if (failures.length) throw new Error(`Setup incomplete: ${failures.map(f => f.id).join(', ')}. See install-report.json.`);
}

module.exports = { catalog, setup };
if (require.main === module) setup(path.resolve(process.argv[2]), path.resolve(process.argv[3]));

#!/usr/bin/env node
'use strict';
// Start menu / app grid / Applications entries (and optional desktop icons) that run each
// RobOS app from this git clone. Every entry is named "RobOS <App> (From Source)" and uses
// the app's own icon on the menu entry, the desktop icon, the taskbar/dock and the window.
//
//   node scripts/source-shortcuts/source-shortcuts.cjs install [app-id ...] [--desktop] [--dry-run]
//   node scripts/source-shortcuts/source-shortcuts.cjs remove  [app-id ...]
//   node scripts/source-shortcuts/source-shortcuts.cjs list
//
// With no app IDs, install covers every app and remove covers every entry it created.
// Every shortcut runs source-host.cjs on one shared Electron (installed here once, by npm, in
// scripts/source-shortcuts/node_modules). Apps are not npm-installed up front: the host
// installs a package's dependencies the first time its shortcut is opened. What was created
// is recorded in <RobOS data dir>/source-shortcuts.json so remove deletes exactly that.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const common = require('./common.cjs');
const icons = require('./icons.cjs');
const { missingDeps } = require('./deps.cjs');
const { parseList, formatList } = require('../../packages/app-manager/lib/gnome.cjs');

const MENU_CATEGORIES = { 'Everyday & business': 'Office', 'Games & game tools': 'Game', 'AI & agents': 'Development',
  'Developer tools': 'Development', 'System & security': 'System' };

/** Every Electron app in packages/, named the way App Manager names it. */
function catalog(root = common.repo) {
  const { sourceCatalog, dependencies } = require('../app-manager/publish-catalog.cjs');
  return sourceCatalog(root).map(item => ({ id: item.sourceId, label: item.label, group: item.group, description: item.description,
    // Sibling packages the app loads by path (robos-lib, robos-ui, …); their npm dependencies
    // are set up on first launch along with the app's. Same scan App Manager packages apps by.
    libs: () => dependencies(item.id, root).filter(lib => fs.existsSync(path.join(root, 'packages', lib, 'package.json'))) }));
}

// ── Desktop Entry escaping (same rules as packages/app-manager/lib/integration.cjs) ──
const desktopValue = value => String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, ' ');
const quoteExec = value => '"' + value.replace(/%/g, '%%').replace(/\\/g, '\\\\\\\\').replace(/["`$]/g, '\\\\$&') + '"';
const quoteSh = value => "'" + value.replace(/'/g, "'\\''") + "'";
const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

function defaultSystem() {
  const quiet = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, windowsHide: true }).trim(); } catch { return null; } };
  return {
    run: quiet,
    /** The shared Electron all shortcuts run, npm-installed into scripts/source-shortcuts on first use. */
    sharedElectron({ log }) {
      let bin = common.sharedElectron();
      if (!bin) {
        log('Installing the shared Electron for (From Source) shortcuts (once) …');
        spawnSync('npm install --no-audit --no-fund --package-lock=false', { cwd: __dirname, stdio: ['ignore', 'ignore', 'inherit'], shell: true, windowsHide: true });
        // npm 11 can hold back Electron's postinstall (the binary download), and its unzip step
        // breaks on recent Node; fetch-electron.cjs does that part with the OS's unzip tool.
        if (!common.sharedElectron() && fs.existsSync(path.join(__dirname, 'node_modules/electron/package.json'))) {
          spawnSync(process.execPath, [path.join(__dirname, 'fetch-electron.cjs')], { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
        }
        bin = common.sharedElectron();
      }
      return bin;
    },
    windowsDesktop: () => quiet('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetFolderPath('Desktop')"]),
    linuxDesktop: () => quiet('xdg-user-dir', ['DESKTOP']),
    writeLinks(electron, links) {
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-lnk-'));
      try {
        const job = path.join(work, 'job.json'), result = path.join(work, 'result.json');
        fs.writeFileSync(job, JSON.stringify({ result, links }));
        const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
        spawnSync(electron, [path.join(__dirname, 'win-lnk.cjs'), job], { env, stdio: 'ignore', timeout: 120000, windowsHide: true });
        return fs.existsSync(result) ? JSON.parse(fs.readFileSync(result, 'utf8')) : links.map(link => ({ file: link.file, ok: false }));
      } finally { fs.rmSync(work, { recursive: true, force: true }); }
    },
  };
}

function manifestPath(loc) { return path.join(loc.data, 'source-shortcuts.json'); }
function readManifest(loc) {
  try { return JSON.parse(fs.readFileSync(manifestPath(loc), 'utf8')); } catch { return { apps: {} }; }
}
function writeManifest(loc, manifest) {
  fs.mkdirSync(loc.data, { recursive: true });
  fs.writeFileSync(`${manifestPath(loc)}.tmp`, JSON.stringify(manifest, null, 2));
  fs.renameSync(`${manifestPath(loc)}.tmp`, manifestPath(loc));
}
const rm = file => fs.rmSync(file, { recursive: true, force: true });
const write = (file, data, mode) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data, mode ? { mode } : undefined); if (mode) fs.chmodSync(file, mode); };

// ── GNOME app-grid folder "RobOS (From Source)" ──
const FOLDERS = 'org.gnome.desktop.app-folders', FOLDER_ID = 'RobOSFromSource';
const FOLDER = `${FOLDERS}.folder:/org/gnome/desktop/app-folders/folders/${FOLDER_ID}/`;
function gnomeFolder(sys, env, change) {
  if (!/gnome/i.test(env.ORIGINAL_XDG_CURRENT_DESKTOP || env.XDG_CURRENT_DESKTOP || '')) return;
  try {
    const children = sys.run('gsettings', ['get', FOLDERS, 'folder-children']);
    if (children === null) return;
    let apps = [];
    if (parseList(children).includes(FOLDER_ID)) apps = parseList(sys.run('gsettings', ['get', FOLDER, 'apps']) || '[]');
    const next = change(apps);
    if (next.length) {
      if (!parseList(children).includes(FOLDER_ID)) {
        sys.run('gsettings', ['set', FOLDER, 'name', 'RobOS (From Source)']);
        sys.run('gsettings', ['set', FOLDERS, 'folder-children', formatList([...parseList(children), FOLDER_ID])]);
      }
      sys.run('gsettings', ['set', FOLDER, 'apps', formatList(next)]);
    } else if (parseList(children).includes(FOLDER_ID)) {
      sys.run('gsettings', ['set', FOLDERS, 'folder-children', formatList(parseList(children).filter(id => id !== FOLDER_ID))]);
      sys.run('gsettings', ['reset-recursively', FOLDER]);
    }
  } catch {}
}

// ── Per-platform shortcut writers. Each returns the files it created. ──
function linuxApp(app, { dir, electron, loc, desktopDir }) {
  const files = [], name = common.iconName(app.id);
  const png = path.join(dir, 'icon.png'), svg = path.join(dir, 'icon.svg');
  // Every hicolor size the dock, app grid, Alt+Tab and desktop ask for, plus the SVG.
  if (fs.existsSync(png)) {
    for (const [size, data] of icons.scaledPngs(fs.readFileSync(png), icons.HICOLOR_SIZES)) {
      const file = path.join(loc.icons, `${size}x${size}/apps/${name}.png`); write(file, data); files.push(file);
    }
  }
  if (fs.existsSync(svg)) { const file = path.join(loc.icons, `scalable/apps/${name}.svg`); write(file, fs.readFileSync(svg)); files.push(file); }
  const entry = ['[Desktop Entry]', 'Version=1.5', 'Type=Application',
    `Name=${desktopValue(common.displayName(app.label))}`, `GenericName=${desktopValue(app.label)}`,
    `Comment=${desktopValue(app.description || `${app.label}, run from ${common.repo}`)}`,
    `TryExec=${desktopValue(electron)}`,
    // --class sets WM_CLASS before main.js runs; source-host.cjs keeps it that way.
    `Exec=${[electron, '--no-sandbox', `--class=${common.wmClass(app.id)}`, common.host, `--app=${app.id}`].map(quoteExec).join(' ')}`,
    `Path=${desktopValue(dir)}`, `Icon=${name}`, 'Terminal=false', 'StartupNotify=true',
    `StartupWMClass=${common.wmClass(app.id)}`, `Categories=${MENU_CATEGORIES[app.group] || 'Utility'};`,
    'Keywords=RobOS;Source;Dev;', `X-RobOS-Source-App=${app.id}`, ''].join('\n');
  const menuFile = path.join(loc.menu, `${common.wmClass(app.id)}.desktop`);
  write(menuFile, entry, 0o755); files.push(menuFile);
  if (desktopDir) {
    const file = path.join(desktopDir, `${common.wmClass(app.id)}.desktop`);
    write(file, entry, 0o755); files.push(file);
  }
  return files;
}

function macApp(app, { dir, electron, loc, desktopDir }) {
  const bundle = path.join(loc.menu, `${common.fileName(app.label)}.app`);
  rm(bundle);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>${xml(common.displayName(app.label))}</string>
  <key>CFBundleDisplayName</key><string>${xml(common.displayName(app.label))}</string>
  <key>CFBundleIdentifier</key><string>${common.appUserModelId(app.id)}</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`;
  write(path.join(bundle, 'Contents/Info.plist'), plist);
  write(path.join(bundle, 'Contents/MacOS/launch'),
    `#!/bin/sh\ncd ${quoteSh(dir)} || exit 1\nexec ${[electron, common.host, `--app=${app.id}`].map(quoteSh).join(' ')} "$@"\n`, 0o755);
  const png = path.join(dir, 'icon.png');
  if (fs.existsSync(png)) write(path.join(bundle, 'Contents/Resources/icon.icns'), icons.pngToIcns(fs.readFileSync(png)));
  const files = [bundle];
  if (desktopDir) {
    const link = path.join(desktopDir, `${common.fileName(app.label)}.app`);
    rm(link);
    try { fs.mkdirSync(desktopDir, { recursive: true }); fs.symlinkSync(bundle, link); files.push(link); } catch {}
  }
  return files;
}

function windowsLink(app, { dir, electron, loc, desktopDir }) {
  const png = path.join(dir, 'icon.png');
  const icon = fs.existsSync(png) ? icons.ensureIco(png, loc.icons, common.icoName(app.id)) : electron;
  const base = { target: electron, args: `"${common.host}" --app=${app.id}`, cwd: dir,
    description: `${app.label}, run from ${common.repo}`, icon, appUserModelId: common.appUserModelId(app.id) };
  const links = [{ ...base, file: path.join(loc.menu, `${common.fileName(app.label)}.lnk`) }];
  if (desktopDir) links.push({ ...base, file: path.join(desktopDir, `${common.fileName(app.label)}.lnk`) });
  return { links, icon: icon === electron ? null : icon };
}

function install({ ids = [], desktop = false, dryRun = false, platform = process.platform, home = os.homedir(),
  env = process.env, sys = defaultSystem(), apps = catalog(), log = console.log, node = process.execPath } = {}) {
  const loc = common.locations({ platform, home, env });
  const byId = new Map(apps.map(app => [app.id, app]));
  const unknown = ids.filter(id => !byId.has(id));
  if (unknown.length) throw new Error(`Unknown app${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')} (see "list")`);
  const chosen = ids.length ? ids.map(id => byId.get(id)) : apps;
  const manifest = readManifest(loc);
  const done = [], windows = [];
  const electron = dryRun ? null : sys.sharedElectron({ log });
  if (!dryRun && !electron) throw new Error(`Could not install Electron in ${__dirname} (run npm install there and retry)`);
  // The host puts this Node first on PATH when it installs an app's dependencies, since a
  // desktop menu's PATH can lack a Node installed by nvm, fnm, Volta and the like.
  manifest.node = node;
  let desktopPath = null;
  const desktopFor = () => desktopPath ??= platform === 'win32' ? (sys.windowsDesktop() || path.join(home, 'Desktop')) :
    platform === 'darwin' ? loc.desktop : (sys.linuxDesktop() || path.join(home, 'Desktop'));
  for (const app of chosen) {
    const dir = path.join(common.repo, 'packages', app.id);
    const old = manifest.apps[app.id];
    // A desktop icon, once asked for, is kept when the entry is refreshed later.
    const wantDesktop = desktop || !!old?.desktop;
    if (dryRun) { log(`would install ${common.displayName(app.label)}${wantDesktop ? ' (+ desktop icon)' : ''}`); continue; }
    const options = { dir, electron, loc, desktopDir: wantDesktop ? desktopFor() : null };
    let files;
    if (platform === 'win32') {
      const { links, icon } = windowsLink(app, options);
      windows.push({ app, links });
      files = [...links.map(link => link.file), ...(icon ? [icon] : [])];
    } else files = platform === 'darwin' ? macApp(app, options) : linuxApp(app, options);
    for (const file of old?.files || []) if (!files.includes(file)) rm(file);
    manifest.apps[app.id] = { label: app.label, files, desktop: wantDesktop, repo: common.repo, libs: app.libs ? app.libs() : [] };
    done.push(app);
  }
  if (dryRun) return { done };
  if (platform === 'win32' && windows.length) {
    fs.mkdirSync(loc.menu, { recursive: true });
    const results = sys.writeLinks(electron, windows.flatMap(item => item.links));
    const failed = new Set(results.filter(result => !result.ok).map(result => result.file));
    for (const { app, links } of windows) if (links.some(link => failed.has(link.file))) {
      log(`  ${app.id}: Windows refused to write ${links.filter(link => failed.has(link.file)).map(link => link.file).join(', ')}`);
    }
    if (failed.size) process.exitCode = 1;
  }
  if (platform === 'linux') {
    sys.run('gtk-update-icon-cache', ['-f', '-t', loc.icons]);
    sys.run('update-desktop-database', [loc.menu]);
    for (const app of done) for (const file of manifest.apps[app.id].files) {
      // GNOME's desktop (DING) only launches entries the user — or gio — marked trusted.
      if (file.endsWith('.desktop') && path.dirname(file) !== loc.menu) sys.run('gio', ['set', file, 'metadata::trusted', 'true']);
    }
    gnomeFolder(sys, env, list => [...new Set([...list, ...done.map(app => `${common.wmClass(app.id)}.desktop`)])]);
  }
  if (platform === 'darwin') {
    const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
    for (const app of done) sys.run(lsregister, ['-f', manifest.apps[app.id].files[0]]);
  }
  writeManifest(loc, manifest);
  for (const app of done) log(`  ✓ ${common.displayName(app.label)}`);
  return { done, menu: loc.menu };
}

function remove({ ids = [], platform = process.platform, home = os.homedir(), env = process.env, sys = defaultSystem(), log = console.log } = {}) {
  const loc = common.locations({ platform, home, env });
  const manifest = readManifest(loc);
  const targets = ids.length ? ids : Object.keys(manifest.apps);
  const removed = [];
  for (const id of targets) {
    const record = manifest.apps[id];
    if (!record) { log(`  ${id}: no (From Source) shortcut recorded`); continue; }
    for (const file of record.files) rm(file);
    if (platform === 'win32') icons.removeIcos(loc.icons, common.icoName(id));
    delete manifest.apps[id]; removed.push(id);
    log(`  ✗ ${common.displayName(record.label)}`);
  }
  if (platform === 'linux' && removed.length) {
    sys.run('gtk-update-icon-cache', ['-f', '-t', loc.icons]);
    sys.run('update-desktop-database', [loc.menu]);
    const gone = new Set(removed.map(id => `${common.wmClass(id)}.desktop`));
    gnomeFolder(sys, env, list => list.filter(entry => !gone.has(entry)));
  }
  // The Start menu / Applications folder is ours alone; drop it once empty.
  if (platform !== 'linux') { try { if (!fs.readdirSync(loc.menu).length) fs.rmdirSync(loc.menu); } catch {} }
  writeManifest(loc, manifest);
  return { removed };
}

function list({ platform = process.platform, home = os.homedir(), env = process.env, apps = catalog(), log = console.log } = {}) {
  const manifest = readManifest(common.locations({ platform, home, env }));
  for (const app of apps) {
    const dir = path.join(common.repo, 'packages', app.id);
    // "setup" = dependencies get installed the first time the app is opened.
    const libs = manifest.apps[app.id]?.libs || [];
    const deps = [dir, ...libs.map(lib => path.join(common.repo, 'packages', lib))].some(d => missingDeps(d).length) ? 'setup' : 'ready';
    const mark = manifest.apps[app.id] ? (manifest.apps[app.id].desktop ? 'menu+desktop' : 'menu') : '-';
    log(`${app.id.padEnd(34)} ${deps}  ${mark.padEnd(12)}  ${common.displayName(app.label)}`);
  }
}

function main(argv) {
  const flags = new Set(argv.filter(arg => arg.startsWith('--')));
  const known = new Set(['--desktop', '--dry-run', '--help']);
  const bad = [...flags].filter(flag => !known.has(flag));
  const [command = 'install', ...ids] = argv.filter(arg => !arg.startsWith('--'));
  if (flags.has('--help') || bad.length || !['install', 'remove', 'list'].includes(command)) {
    console.log(`Usage: node scripts/source-shortcuts/source-shortcuts.cjs <install|remove|list> [app-id ...] [--desktop] [--dry-run]
  install   Add "RobOS <App> (From Source)" to the Start menu / app grid / ~/Applications (all apps when no IDs).
            Takes seconds: each app's dependencies are installed the first time it is opened.
            --desktop     also put an icon on the desktop
            --dry-run     only print what would be installed
  remove    Delete the entries, desktop icons and icon files this script created (all when no IDs).
  list      Show every app, "ready" or "setup" (installs on first launch), and which shortcuts exist.`);
    if (bad.length) console.error(`Unknown option: ${bad.join(', ')}`);
    return flags.has('--help') && !bad.length ? 0 : 2;
  }
  if (command === 'list') { list(); return 0; }
  if (command === 'remove') { remove({ ids }); return 0; }
  console.log(`RobOS (From Source) shortcuts for ${common.repo}`);
  const { menu } = install({ ids, desktop: flags.has('--desktop'), dryRun: flags.has('--dry-run') });
  if (menu) console.log(`\nEntries: ${menu}`);
  return process.exitCode || 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { catalog, install, remove, list, linuxApp, macApp, windowsLink, defaultSystem };

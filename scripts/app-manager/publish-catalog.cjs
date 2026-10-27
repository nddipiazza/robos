'use strict';
// Build independent, platform-native downloads, never a whole-suite payload.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const { ID, ORIGIN, validateCatalog } = require('../../packages/app-manager/lib/catalog.cjs');
const tools = name => require(path.join(repo, 'packages/app-manager/node_modules', name));
const ignored = new Set(['node_modules', '.git', '.godot', '__pycache__', 'run', 'test', 'tests', 'demos', 'coverage']);
function walk(dir, visit) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, visit); else visit(file);
  }
}
function dependencies(id, root = repo) {
  const sourceId = id === 'knowledge-graph-explorer' ? 'robos-graph' : id;
  const support = {
    'robos-lib': ['robos-task-client', 'robos-store', 'robos-llm', 'robos-ui'],
    'robos-graph': ['robos-lib', 'robos-store', 'robos-llm'],
    'robos-icons': [], 'robos-llm': [], 'robos-store': [], 'robos-task-client': [], 'robos-ui': [],
  };
  if (support[id]) return support[id];
  const found = new Set(['robos-lib', 'robos-icons', 'graph-data']);
  const apps = new Set(sourceCatalog(root).map(item => item.sourceId));
  walk(path.join(root, 'packages', sourceId), file => {
    if (!/\.(?:c?js|mjs|html)$/.test(file) || /(?:\.test\.|test-|bundle\.js)/.test(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    // Actual imports and renderer assets, not links that merely offer to open another app.
    for (const match of text.matchAll(/(?:require\(\s*['"]|(?:src|href)=['"])(?:\/usr\/local\/share\/robos\/|\.\.\/)([a-z][a-z0-9-]+)(?:\/|['"])/g)) {
      const dep = match[1];
      if (dep !== id && dep !== 'app-manager' && ID.test(dep) && fs.existsSync(path.join(root, 'packages', dep, 'package.json'))) found.add(dep);
    }
    // Some older apps resolve a list of candidate paths before calling require.
    // Include referenced libraries without turning optional app links into installs.
    for (const match of text.matchAll(/(?:\/usr\/local\/share\/robos\/|['"]\.\.\/)(robos-[a-z0-9-]+)(?:\/|['"])/g)) {
      const dep = match[1];
      if (dep !== sourceId && dep !== 'robos-test' && (!apps.has(dep) || support[dep]) && fs.existsSync(path.join(root, 'packages', dep, 'package.json'))) found.add(dep);
    }
  });
  const games = { 'robos-tabletop': 'tabletop-rpg', 'tabletop-blockmap-creator': 'tabletop-rpg', 'tabletop-quest-editor': 'tabletop-rpg',
    'crpg-editor': 'crpg-realm', 'game-playthrough': 'quest-warrior-dragon' };
  if (games[id]) found.add(`game-data-${games[id]}`);
  return [...found].sort();
}
function sourceCatalog(root = repo, platform = process.platform) {
  const icons = require(path.join(root, 'packages/robos-icons')).getAllIcons();
  const exclude = new Set(['app-manager', 'app-launcher', 'robos-desktop', 'pass-unlock']);
  if (platform !== 'linux') exclude.add('gnome-desktop-installer');
  return fs.readdirSync(path.join(root, 'packages')).flatMap(id => {
    const dir = path.join(root, 'packages', id);
    if (exclude.has(id) || !fs.existsSync(path.join(dir, 'package.json'))) return [];
    const main = path.join(dir, 'main.js');
    if (id !== 'household' && !(fs.existsSync(main) && /require\(['"]electron['"]\)/.test(fs.readFileSync(main, 'utf8')))) return [];
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))), icon = icons.find(item => item.appId === id);
    const group = ['point-of-sale', 'auto-center', 'household', 'audio-player', 'home-speaker'].includes(id) ? 'Everyday & business' :
      /game|crpg|tabletop/.test(id) ? 'Games & game tools' : /agent|claude|ai-|context|prompt/.test(id) ? 'AI & agents' :
        /System|Security|Internet/.test(icon?.category || '') ? 'System & security' : 'Developer tools';
    return [{ id: id === 'robos-graph' ? 'knowledge-graph-explorer' : id, sourceId: id, kind: 'app',
      label: id === 'robos-graph' ? 'Knowledge Graph Explorer' : icon?.label || id, iconSvg: icon?.iconSvg || null, group, description: pkg.description || '' }];
  });
}
function runNpm(dir) {
  const args = ['install', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false'];
  const cli = process.env.ROBOS_NPM_CLI || process.env.npm_execpath;
  if (cli && /npm-cli\.js$/.test(cli)) execFileSync(process.execPath, [cli, ...args], { cwd: dir, stdio: 'inherit', windowsHide: true });
  else execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: dir, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
}
async function publish({ output = path.join(repo, 'release/app-manager'), selected, install = true } = {}) {
  const platform = process.platform, arch = process.arch, version = fs.readFileSync(path.join(repo, 'VERSION'), 'utf8').trim();
  fs.mkdirSync(output, { recursive: true });
  const stage = fs.mkdtempSync(path.join(output, '.payloads-'));
  const appEntries = sourceCatalog();
  const byId = new Map(appEntries.map(item => [item.id, item]));
  const chosen = new Map(), visiting = new Set();
  function add(id) {
    if (chosen.has(id)) return;
    if (visiting.has(id)) return; // Resolve optional back-references below.
    visiting.add(id);
    const isData = id === 'graph-data' || id.startsWith('game-data-');
    const item = byId.get(id) || { id, kind: isData ? 'data' : 'library', label: id, group: 'Shared components', description: 'Shared RobOS component' };
    const deps = (isData ? [] : dependencies(id)).filter(dep => !visiting.has(dep));
    deps.forEach(add); visiting.delete(id); chosen.set(id, { ...item, dependencies: deps });
  }
  for (const item of selected ? appEntries.filter(item => selected.includes(item.id)) : appEntries) add(item.id);
  const components = [];
  try {
    for (const item of chosen.values()) {
      console.log(`Packaging ${item.id} (${platform})`);
      const dir = path.join(stage, item.id);
      const source = item.id === 'graph-data' ? path.join(repo, '.robos') : item.id.startsWith('game-data-') ? path.join(repo, 'games', item.id.slice(10)) : path.join(repo, 'packages', item.sourceId || item.id);
      const gameData = item.id.startsWith('game-data-');
      // Game Playthrough executes the game's own E2E driver as an app feature.
      fs.cpSync(source, dir, { recursive: true, filter: file => (!ignored.has(path.basename(file)) || gameData && path.basename(file) === 'tests') &&
        (gameData || !/\.(?:test|spec)\.[cm]?js$/.test(file)) });
      if (item.id === 'robos-graph') for (const name of ['renderer', 'main.js', 'preload.js']) fs.rmSync(path.join(dir, name), { force: true, recursive: true });
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
        if (item.id === 'robos-graph') pkg.main = 'index.js';
        delete pkg.dependencies?.electron; delete pkg.devDependencies;
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
        if (install && (Object.keys(pkg.dependencies || {}).length || pkg.scripts?.postinstall)) runNpm(dir);
      }
      if (item.id === 'audio-player') tools('esbuild').buildSync({ absWorkingDir: dir, entryPoints: ['src/index.jsx'], bundle: true, outfile: 'renderer/bundle.js',
        platform: 'browser', loader: { '.js': 'jsx', '.jsx': 'jsx' }, define: { 'process.env.NODE_ENV': '"production"' } });
      const name = `robos-${item.id}-v${version}-${platform}-${arch}.tgz`, file = path.join(output, name);
      // tar dereferences only the npm links created in this isolated staging tree.
      await tools('tar').c({ cwd: dir, file, gzip: true, portable: true, follow: true,
        filter: name => !/(?:^|\/)node_modules\/electron(?:\/|$)/.test(name) }, ['.']);
      let unpackedBytes = 0;
      await tools('tar').t({ file, onReadEntry: entry => { unpackedBytes += entry.size; } });
      const hash = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
      components.push({ ...item, version, bytes: fs.statSync(file).size, unpackedBytes: Math.max(1, unpackedBytes), sha256: hash.digest('hex'), url: `${ORIGIN}v${version}/${name}` });
    }
    const doc = { schema: 1, version, platform, arch, components };
    validateCatalog(doc, platform, arch);
    fs.writeFileSync(path.join(output, `robos-catalog-${platform}-${arch}.json`), JSON.stringify(doc, null, 2));
    return doc;
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
module.exports = { dependencies, sourceCatalog, publish };
if (require.main === module) publish({ selected: process.argv.includes('--apps') ? process.argv[process.argv.indexOf('--apps') + 1].split(',') : undefined })
  .catch(error => { console.error(error); process.exitCode = 1; });

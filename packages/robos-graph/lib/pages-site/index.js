'use strict';

// GitHub Pages site builder for a kgraph folder.
//
// Point it at any folder with a `.robos/` graph (or at the `.robos/` folder
// itself). It writes a static viewer: index.html, the viewer runtime, the
// graph as data/graph.json and every renderer the folder brings in
// site/renderers/. Each node is drawn by its own renderer, else its type's,
// else its nearest parent type's, else the generic one. Pages serves it as is.

const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { createRegistry, scanRendererSource } = require('./runtime/registry');

const RUNTIME = path.join(__dirname, 'runtime');
const SCHEMA_URI = 'https://schema.org/';

function compactType(t) {
  const s = String(t || '');
  return s.startsWith(SCHEMA_URI) ? `schema:${s.slice(SCHEMA_URI.length)}` : s;
}

// kgraph.yaml is JSON-formatted YAML in generated graphs; the RobOS workspace
// catalog is block YAML. Read either: we only need package paths and titles.
function readCatalog(file) {
  const raw = fs.readFileSync(file, 'utf8');
  try { return JSON.parse(raw); } catch { /* block YAML */ }
  const out = { packages: [] };
  const title = raw.match(/^title:\s*"?([^"\n]+)"?/m);
  if (title) out.title = title[1].trim();
  const desc = raw.match(/^description:\s*"?([^"\n]+)"?/m);
  if (desc) out.description = desc[1].trim();
  const block = raw.split(/^packages:\s*$/m)[1] || '';
  let cur = null;
  for (const line of block.split('\n')) {
    if (/^\S/.test(line)) break;
    const id = line.match(/^\s*-\s*id:\s*"?([^"\s]+)"?/);
    if (id) { cur = { id: id[1] }; out.packages.push(cur); continue; }
    const kv = line.match(/^\s+(path|title|description|namespace):\s*"?([^"\n]*)"?/);
    if (kv && cur) cur[kv[1]] = kv[2].trim();
  }
  return out;
}

function readOntology(file) {
  const types = {};
  if (!file || !fs.existsSync(file)) return types;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const classes = doc['robos:classes'] || doc['@graph'] || [];
  for (const c of classes) {
    const t = [].concat(c['@type'] || []);
    if (!t.some(x => /Class$/.test(x))) continue;
    const parents = [].concat(c['rdfs:subClassOf'] || []).map(p => compactType(typeof p === 'object' ? p['@id'] : p)).filter(Boolean);
    types[compactType(c['@id'])] = {
      label: c['rdfs:label'] || undefined,
      comment: c['rdfs:comment'] || c['dcterms:description'] || undefined,
      parents,
    };
  }
  return types;
}

function loadKgraphFolder(dir) {
  const abs = path.resolve(dir);
  const root = path.basename(abs) === '.robos' ? abs : path.join(abs, '.robos');
  const catalogFile = path.join(root, 'kgraph.yaml');
  if (!fs.existsSync(catalogFile)) throw new Error(`No kgraph catalog at ${catalogFile}`);
  const catalog = readCatalog(catalogFile);
  const nodes = [];
  const packages = [];
  const seen = new Set();
  for (const p of catalog.packages || []) {
    if (!p.path) continue;
    const file = path.join(root, p.path);
    if (!fs.existsSync(file)) continue;
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const pkgNodes = doc['robos:nodes'] || doc['@graph'] || [];
    for (const n of pkgNodes) {
      if (!n || !n['@id'] || seen.has(n['@id'])) continue;
      seen.add(n['@id']);
      nodes.push({ ...n, '@type': [].concat(n['@type'] || []).map(compactType), 'robos:package': n['robos:package'] || p.id });
    }
    packages.push({ id: p.id, title: p.title || doc['dcterms:title'] || p.id, description: p.description || doc['dcterms:description'] || '', nodeCount: pkgNodes.length });
  }
  const ontology = readOntology(path.join(root, catalog.ontology || 'ontology.jsonld'));
  return { dir: path.dirname(root), root, catalog, nodes, packages, ontology };
}

// Renderer files in load order: generic, then extra packs, then the graph's
// own site/renderers (last, so a graph can override a pack for a type).
function collectRenderers(graph, extraDirs = []) {
  const files = [{ origin: 'builtin', file: path.join(RUNTIME, 'renderers', 'generic.js') }];
  const add = (origin, dir) => {
    if (!dir || !fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort()) files.push({ origin, file: path.join(dir, f) });
  };
  extraDirs.forEach((d, i) => add(`pack${i + 1}`, d));
  add('graph', path.join(graph.dir, 'site', 'renderers'));
  return files.map(f => ({ ...f, source: fs.readFileSync(f.file, 'utf8'), declared: scanRendererSource(fs.readFileSync(f.file, 'utf8')) }));
}

// Which renderer each type (and each node with its own renderer) resolves to.
function resolutionTable(graph, renderers) {
  const reg = createRegistry(graph.ontology);
  for (const r of renderers) for (const d of r.declared) reg.registerRenderer({ ...d, render: () => '', origin: r.origin });
  const counts = new Map();
  for (const n of graph.nodes) for (const t of n['@type']) counts.set(t, (counts.get(t) || 0) + 1);
  const types = [...counts.keys()].sort().map(t => {
    const res = reg.resolveType([t]);
    return { type: t, count: counts.get(t), renderer: res.renderer ? res.renderer.id : null, via: res.via, viaType: res.type, origin: res.renderer ? res.renderer.origin || 'builtin' : null };
  });
  const nodes = graph.nodes.filter(n => reg.resolve(n).via === 'node').map(n => ({ id: n['@id'], renderer: reg.resolve(n).renderer.id }));
  return { types, nodes };
}

function writeFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) n += copyDir(s, d);
    else { fs.mkdirSync(dest, { recursive: true }); fs.copyFileSync(s, d); n++; }
  }
  return n;
}

function escAttr(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function pagesWorkflow(siteRel) {
  return `# Publishes the KGraph viewer in ${siteRel}/ to GitHub Pages.
# Built by RobOS KGraph Explorer (Pages site). Rebuild the site and push to update it.
# One-time setup: Settings → Pages → Source: GitHub Actions.
name: KGraph Pages
on:
  push:
    branches: [main]
    paths: ['${siteRel}/**', '.github/workflows/kgraph-pages.yml']
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${siteRel}
      - id: deployment
        uses: actions/deploy-pages@v4
`;
}

function buildKgraphSite({ graphDir, outDir, title, description, home, footer, rendererDirs = [], workflow = false, log = () => {} } = {}) {
  if (!graphDir) throw new Error('buildKgraphSite needs graphDir');
  const graph = loadKgraphFolder(graphDir);
  const out = path.resolve(outDir || path.join(graph.dir, 'docs'));
  if (out === graph.dir || out === graph.root) throw new Error('Choose an output folder other than the graph folder itself');
  const siteTitle = title || graph.catalog.title || 'Knowledge Graph';
  const homeId = home || graph.catalog.game || graph.catalog.home || null;
  log(`Loaded ${graph.nodes.length} nodes in ${graph.packages.length} packages from ${graph.root}`);

  // Clear only what this builder writes.
  for (const p of ['index.html', '404.html', 'viewer.js', 'viewer.css', 'registry.js', 'renderers', 'data', '.nojekyll']) fs.rmSync(path.join(out, p), { recursive: true, force: true });

  const renderers = collectRenderers(graph, rendererDirs);
  const names = [];
  for (const r of renderers) {
    const name = `${r.origin}-${path.basename(r.file)}`;
    writeFile(path.join(out, 'renderers', name), r.source);
    names.push(`renderers/${name}`);
  }
  writeFile(path.join(out, 'renderers', 'manifest.js'), `KGraphSite.load(${JSON.stringify(names, null, 2)});\n`);
  const table = resolutionTable(graph, renderers);
  writeFile(path.join(out, 'renderers', 'resolution.json'), JSON.stringify(table, null, 2) + '\n');

  const data = {
    meta: { title: siteTitle, description: description || graph.catalog.description || '', home: homeId, ...(footer ? { footer } : {}), generator: 'RobOS KGraph Explorer Pages site' },
    packages: graph.packages,
    ontology: graph.ontology,
    nodes: graph.nodes,
  };
  writeFile(path.join(out, 'data', 'graph.json'), JSON.stringify(data));

  const index = fs.readFileSync(path.join(RUNTIME, 'index.html'), 'utf8').replace(/__SITE_TITLE__/g, escAttr(siteTitle)).replace(/__SITE_DESCRIPTION__/g, escAttr(data.meta.description));
  writeFile(path.join(out, 'index.html'), index);
  writeFile(path.join(out, '404.html'), index);
  for (const f of ['viewer.js', 'viewer.css', 'registry.js']) fs.copyFileSync(path.join(RUNTIME, f), path.join(out, f));
  writeFile(path.join(out, '.nojekyll'), '');
  const assets = copyDir(path.join(graph.dir, 'assets'), path.join(out, 'assets'));

  let workflowFile = null;
  if (workflow) {
    const rel = path.relative(graph.dir, out).split(path.sep).join('/');
    if (rel.startsWith('..')) throw new Error('The Pages workflow needs the site inside the graph repository');
    workflowFile = path.join(graph.dir, '.github', 'workflows', 'kgraph-pages.yml');
    writeFile(workflowFile, pagesWorkflow(rel || '.'));
  }
  const generic = table.types.filter(t => t.via === 'generic');
  log(`Site written to ${out}: ${graph.nodes.length} nodes, ${renderers.length} renderer files, ${generic.length} types on the generic renderer`);
  return { outDir: out, nodeCount: graph.nodes.length, packages: graph.packages, renderers: renderers.map(r => ({ origin: r.origin, file: path.basename(r.file), declared: r.declared })), resolution: table, assets, workflow: workflowFile };
}

// ── Robos agent: write renderers for types that only get the generic one ──

const RENDERER_CONTRACT = `Renderer contract (browser, plain JavaScript, no modules, no imports):

KGraphSite.registerRenderer({
  id: 'unique-id',                 // string literal
  types: ['prefix:Type'],          // string literals; subtypes inherit the renderer
  render(node, c) { return '<h1>…</h1>'; },        // detail page HTML
  card(node, c) { return '<a class="card" …>'; },  // optional list card
  collection(nodes, c, type) { return '…'; },      // optional type index page
});

Helpers on c: h(text) escapes HTML; title(node); link(idOrNode, text?); value(v) renders any property value;
propsTable(node, {omit:[props]}); stats(object) → stat tiles; table(columns, rows, {raw}) → data table
(raw:true when cells already hold HTML); images(node) → schema:ImageObject list; img(image); figure(image);
refs(value) → nodes for {"@id"} references; get(id); nodesOfType(type); incomingList(node); typeBadges(node);
card(node) → the card another renderer draws; parent() → HTML of the renderer this one overrides; nodeHref(id); typeHref(type).
CSS classes: card, thumb, title, meta, grid, panel, split, figure, stats, timeline, coverage, table-wrap, badge, muted, lead, subtitle, pixel.
Rules: escape every text value with c.h or use c.value/c.link; never fetch, eval, use storage or cookies; no external scripts or styles.`;

function rendererBrief({ type, graph, samples, parentRenderer }) {
  const info = graph.ontology[type] || {};
  return [
    `Write a KGraph site renderer for nodes of type ${type}${info.label ? ` (${info.label})` : ''} in the graph "${graph.catalog.title || ''}".`,
    info.comment ? `What the type means: ${info.comment}` : '',
    '',
    RENDERER_CONTRACT,
    '',
    `Example nodes (JSON):\n${JSON.stringify(samples, null, 1).slice(0, 6000)}`,
    parentRenderer ? `\nThe renderer currently used (for a parent type), for style reference:\n${parentRenderer.slice(0, 3000)}` : '',
    '',
    `Answer with the JavaScript file only, in one \`\`\`js block. Use id "${type.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}" and types ['${type}'].`,
  ].join('\n');
}

const FORBIDDEN = [/\bfetch\s*\(/, /XMLHttpRequest/, /\bimport\s*\(/, /\beval\s*\(/, /new\s+Function/, /localStorage|sessionStorage|indexedDB/, /document\.cookie/, /<script/i, /\brequire\s*\(/, /navigator\.sendBeacon/, /WebSocket/];

function validateRendererSource(code, type) {
  const errors = [];
  try { new vm.Script(code, { filename: 'renderer.js' }); } catch (error) { errors.push(`syntax: ${error.message}`); }
  const declared = scanRendererSource(code);
  if (!declared.length) errors.push('no KGraphSite.registerRenderer({ id, types }) call with literal values');
  else if (type && !declared.some(d => d.types.includes(type))) errors.push(`does not declare types: ['${type}']`);
  for (const re of FORBIDDEN) if (re.test(code)) errors.push(`uses a forbidden API (${re.source})`);
  return { ok: errors.length === 0, errors, declared };
}

function extractCode(text) {
  const m = String(text || '').match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/);
  return (m ? m[1] : String(text || '')).trim() + '\n';
}

function loadAiAgent() {
  for (const p of [process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ai-agent'), path.resolve(__dirname, '..', '..', '..', 'robos-lib', 'ai-agent'), '/usr/local/share/robos/robos-lib/ai-agent'].filter(Boolean)) {
    try { return require(p); } catch { /* next */ }
  }
  return null;
}

// For each requested type (default: every type left on the generic renderer)
// ask the agent for a renderer, validate it and save it to site/renderers.
async function authorRenderersWithAgent({ graphDir, types, ask, providerId, rendererDirs = [], log = () => {} } = {}) {
  const graph = loadKgraphFolder(graphDir);
  const renderers = collectRenderers(graph, rendererDirs);
  const table = resolutionTable(graph, renderers);
  const targets = types && types.length ? types : table.types.filter(t => t.via === 'generic').map(t => t.type);
  const agent = ask ? { ask } : loadAiAgent();
  if (!agent || typeof agent.ask !== 'function') throw new Error('No robos agent available: install robos-lib or pass ask()');
  const results = [];
  for (const type of targets) {
    const samples = graph.nodes.filter(n => n['@type'].includes(type)).slice(0, 3);
    const current = table.types.find(t => t.type === type);
    const parent = current && current.renderer && current.renderer !== 'generic' ? renderers.find(r => r.declared.some(d => d.id === current.renderer)) : renderers[0];
    log(`Asking the robos agent for a ${type} renderer`);
    const res = await agent.ask(rendererBrief({ type, graph, samples, parentRenderer: parent && parent.source }), providerId ? { providerId } : undefined);
    if (!res || !res.ok) { results.push({ type, ok: false, errors: [`agent did not answer: ${(res && res.error) || 'no response'}`] }); continue; }
    const code = extractCode(res.text);
    const check = validateRendererSource(code, type);
    if (!check.ok) { results.push({ type, ok: false, errors: check.errors }); log(`Rejected ${type}: ${check.errors.join('; ')}`); continue; }
    const file = path.join(graph.dir, 'site', 'renderers', `agent-${type.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.js`);
    writeFile(file, `/* Written by the robos agent for ${type}; reviewed by the site builder's checks. */\n${code}`);
    results.push({ type, ok: true, file, declared: check.declared });
    log(`Saved ${path.relative(graph.dir, file)}`);
  }
  return { results, targets };
}

// Small static server for previewing a built site.
function serveSite(dir, { port = 0, host = '127.0.0.1' } = {}) {
  const root = path.resolve(dir);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(root, url);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, host, () => resolve({ server, url: `http://${host}:${server.address().port}/` })));
}

module.exports = { buildKgraphSite, loadKgraphFolder, collectRenderers, resolutionTable, authorRenderersWithAgent, validateRendererSource, rendererBrief, serveSite, RENDERER_CONTRACT, pagesWorkflow };

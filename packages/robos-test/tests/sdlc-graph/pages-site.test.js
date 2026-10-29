'use strict';

// KGraph Explorer's GitHub Pages site builder: renderer resolution (node →
// own type → nearest parent type → generic), renderer checks, the built site
// and robos-agent-written renderers.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const site = require('../../../robos-graph/lib/pages-site');
const { createRegistry, scanRendererSource } = require('../../../robos-graph/lib/pages-site/runtime/registry');

const ONTOLOGY = {
  'x:Thing': { parents: [] },
  'x:Character': { parents: ['x:Thing'] },
  'x:Enemy': { parents: ['x:Character'] },
  'x:Boss': { parents: ['x:Enemy'] },
  'x:Item': { parents: ['x:Thing'] },
};

function graphFolder(root, { renderers = {} } = {}) {
  const dir = path.join(root, 'graph');
  const nodes = [
    { '@id': 'urn:t:game', '@type': ['x:Game'], 'dcterms:title': 'Test Quest' },
    { '@id': 'urn:t:slime', '@type': ['x:Enemy'], 'dcterms:title': 'Slime' },
    { '@id': 'urn:t:dragon', '@type': ['x:Boss'], 'dcterms:title': 'Dragon', 'x:guards': { '@id': 'urn:t:sword' } },
    { '@id': 'urn:t:sword', '@type': ['x:Item'], 'dcterms:title': 'Sword' },
  ];
  fs.mkdirSync(path.join(dir, '.robos/kgraphs/main'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.robos/kgraph.yaml'), JSON.stringify({ title: 'Test Quest Graph', game: 'urn:t:game', packages: [{ id: 'main', title: 'Main', path: 'kgraphs/main/package.jsonld' }] }));
  fs.writeFileSync(path.join(dir, '.robos/kgraphs/main/package.jsonld'), JSON.stringify({ 'robos:nodes': nodes }));
  fs.writeFileSync(path.join(dir, '.robos/ontology.jsonld'), JSON.stringify({ 'robos:classes': Object.entries(ONTOLOGY).map(([id, v]) => ({ '@id': id, '@type': 'rdfs:Class', ...(v.parents[0] ? { 'rdfs:subClassOf': { '@id': v.parents[0] } } : {}) })) }));
  fs.mkdirSync(path.join(dir, 'site/renderers'), { recursive: true });
  for (const [name, code] of Object.entries(renderers)) fs.writeFileSync(path.join(dir, 'site/renderers', name), code);
  return dir;
}

const ENEMY_RENDERER = "KGraphSite.registerRenderer({ id: 'enemy', types: ['x:Enemy'], render(n, c) { return `<h1>${c.h(c.title(n))}</h1>`; } });\n";
const SWORD_RENDERER = "KGraphSite.registerRenderer({ id: 'legendary', nodes: ['urn:t:sword'], render(n, c) { return c.parent(); } });\n";

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-site-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('renderer resolution', () => {
  const reg = createRegistry(ONTOLOGY);
  const noop = () => '';
  reg.registerRenderer({ id: 'generic', render: noop });
  reg.registerRenderer({ id: 'character', types: ['x:Character'], render: noop });
  reg.registerRenderer({ id: 'enemy', types: ['x:Enemy'], render: noop });
  reg.registerRenderer({ id: 'special', nodes: ['urn:t:dragon'], render: noop });

  it('prefers a node renderer, then the type, then the nearest parent, then generic', () => {
    assert.deepEqual([reg.resolve({ '@id': 'urn:t:dragon', '@type': ['x:Boss'] })].map(r => [r.renderer.id, r.via]), [['special', 'node']]);
    assert.deepEqual([reg.resolve({ '@id': 'a', '@type': ['x:Enemy'] })].map(r => [r.renderer.id, r.via]), [['enemy', 'type']]);
    const boss = reg.resolve({ '@id': 'b', '@type': ['x:Boss'] });
    assert.deepEqual([boss.renderer.id, boss.via, boss.type], ['enemy', 'parent', 'x:Enemy'], 'Boss uses Enemy, not the farther Character');
    assert.equal(reg.resolve({ '@id': 'c', '@type': ['x:Item'] }).renderer.id, 'generic');
    assert.equal(reg.resolve({ '@id': 'd', '@type': ['x:Unknown'] }).via, 'generic');
  });

  it('honours a site:renderer property on the node', () => {
    assert.equal(reg.resolve({ '@id': 'e', '@type': ['x:Item'], 'site:renderer': 'character' }).renderer.id, 'character');
  });

  it('lets a renderer hand off to the one it overrides', () => {
    assert.equal(reg.resolveParent({ '@id': 'f', '@type': ['x:Boss'] }, 'enemy').id, 'character');
    assert.equal(reg.resolveParent({ '@id': 'urn:t:dragon', '@type': ['x:Boss'] }, 'special').id, 'enemy');
    assert.equal(reg.resolveParent({ '@id': 'g', '@type': ['x:Item'] }, 'generic'), null);
  });

  it('reads declared ids, types and nodes without running renderer code', () => {
    assert.deepEqual(scanRendererSource(ENEMY_RENDERER + SWORD_RENDERER), [{ id: 'enemy', types: ['x:Enemy'], nodes: [] }, { id: 'legendary', types: [], nodes: ['urn:t:sword'] }]);
  });
});

describe('site build', () => {
  let dir; let res;
  before(() => {
    dir = graphFolder(tmp, { renderers: { 'enemy.js': ENEMY_RENDERER, 'sword.js': SWORD_RENDERER } });
    res = site.buildKgraphSite({ graphDir: dir, workflow: true });
  });

  it('writes a static viewer with the graph, renderers and a Pages workflow', () => {
    const out = path.join(dir, 'docs');
    assert.equal(res.outDir, out);
    for (const f of ['index.html', '404.html', '.nojekyll', 'viewer.js', 'registry.js', 'data/graph.json', 'renderers/manifest.js', 'renderers/resolution.json']) assert.ok(fs.existsSync(path.join(out, f)), f);
    const graph = JSON.parse(fs.readFileSync(path.join(out, 'data/graph.json'), 'utf8'));
    assert.equal(graph.meta.home, 'urn:t:game');
    assert.deepEqual(graph.ontology['x:Boss'].parents, ['x:Enemy']);
    assert.match(fs.readFileSync(path.join(out, 'renderers/manifest.js'), 'utf8'), /builtin-generic\.js[\s\S]*graph-enemy\.js/);
    assert.match(fs.readFileSync(path.join(dir, '.github/workflows/kgraph-pages.yml'), 'utf8'), /path: docs/);
    assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /<title>Test Quest Graph<\/title>/);
  });

  it('reports which renderer each type gets', () => {
    const by = Object.fromEntries(res.resolution.types.map(t => [t.type, `${t.renderer}/${t.via}`]));
    assert.deepEqual(by, { 'x:Boss': 'enemy/parent', 'x:Enemy': 'enemy/type', 'x:Game': 'generic/generic', 'x:Item': 'generic/generic' });
    assert.deepEqual(res.resolution.nodes, [{ id: 'urn:t:sword', renderer: 'legendary' }]);
  });

  it('refuses to write the site over the graph folder', () => {
    assert.throws(() => site.buildKgraphSite({ graphDir: dir, outDir: dir }), /other than the graph folder/);
  });

  it('opens the RobOS workspace catalog, which is block YAML', () => {
    const repo = path.resolve(__dirname, '../../../..');
    const g = site.loadKgraphFolder(repo);
    assert.ok(g.packages.length >= 8);
    assert.ok(g.nodes.length > 100);
    assert.ok(Object.keys(g.ontology).length > 50);
  });
});

describe('robos agent renderers', () => {
  it('rejects renderers that break the contract or reach outside the page', () => {
    assert.equal(site.validateRendererSource(ENEMY_RENDERER, 'x:Enemy').ok, true);
    assert.match(site.validateRendererSource('KGraphSite.registerRenderer({ id: "a", types: ["x:Item"], render() { fetch("/x"); return ""; } });', 'x:Item').errors.join(), /forbidden/);
    assert.match(site.validateRendererSource('KGraphSite.registerRenderer({ id: "a", types: ["x:Other"], render() {} });', 'x:Item').errors.join(), /does not declare/);
    assert.match(site.validateRendererSource('this is not javascript {', 'x:Item').errors.join(), /syntax/);
  });

  it('asks for each type left on the generic renderer and saves only valid answers', async () => {
    const dir = graphFolder(path.join(tmp, 'agent'), { renderers: { 'enemy.js': ENEMY_RENDERER } });
    const briefs = [];
    const ask = async brief => {
      briefs.push(brief);
      if (/type x:Game/.test(brief)) return { ok: true, text: '```js\nKGraphSite.registerRenderer({ id: "x-game", types: ["x:Game"], render(n, c) { return `<h1>${c.h(c.title(n))}</h1>`; } });\n```' };
      return { ok: true, text: '```js\nKGraphSite.registerRenderer({ id: "x-item", types: ["x:Item"], render() { return localStorage.x; } });\n```' };
    };
    const res = await site.authorRenderersWithAgent({ graphDir: dir, ask });
    assert.deepEqual(res.targets.sort(), ['x:Game', 'x:Item']);
    assert.match(briefs[0], /Renderer contract/);
    assert.match(briefs.find(b => /x:Game/.test(b)), /"Test Quest"/, 'the brief carries example nodes');
    const ok = res.results.find(r => r.type === 'x:Game');
    assert.equal(ok.ok, true);
    assert.ok(fs.existsSync(ok.file));
    assert.equal(res.results.find(r => r.type === 'x:Item').ok, false);
    const table = site.resolutionTable(site.loadKgraphFolder(dir), site.collectRenderers(site.loadKgraphFolder(dir)));
    assert.equal(table.types.find(t => t.type === 'x:Game').renderer, 'x-game');
  });
});

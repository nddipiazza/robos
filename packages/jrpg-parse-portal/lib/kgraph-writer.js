'use strict';

// Writes an acquired game as a standalone kgraph folder:
//
//   <out>/.robos/kgraph.yaml                   package catalog (JSON-formatted YAML)
//   <out>/.robos/ontology.jsonld               JRPG type hierarchy (rdfs:subClassOf)
//   <out>/.robos/kgraphs/<pkg>/package.jsonld  nodes, one package per asset group
//   <out>/coverage.json                        asset-type coverage report
//   <out>/README.md                            what is in it and who to credit
//
// The same layout as the RobOS workspace (.robos/kgraphs), so KGraph Explorer
// and its Pages site builder can open it directly.

const fs = require('fs');
const path = require('path');
const { PACKAGES, ontologyDocument, coverage, ASSET_TYPES } = require('./asset-types');

const CONTEXT = {
  robos: 'https://robos.dev/ns/sdlc#',
  jrpg: 'https://robos.dev/ns/jrpg#',
  dcterms: 'http://purl.org/dc/terms/',
  schema: 'https://schema.org/',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

function slug(value) {
  return String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function writeKgraphFolder(outDir, { game, nodes, sources = [], warnings = [], namespace, generator = 'jrpg-parse-portal' }) {
  if (!game || !game['@id']) throw new Error('writeKgraphFolder needs a game node');
  const all = [game, ...sources, ...nodes];
  const ids = new Set();
  for (const n of all) {
    if (!n['@id']) throw new Error(`Node without @id: ${JSON.stringify(n).slice(0, 120)}`);
    if (ids.has(n['@id'])) throw new Error(`Duplicate node id ${n['@id']}`);
    ids.add(n['@id']);
  }
  const ns = namespace || `jrpg.${slug(game['dcterms:title'])}`;
  const robosDir = path.join(outDir, '.robos');
  fs.mkdirSync(path.join(robosDir, 'kgraphs'), { recursive: true });

  const byPackage = new Map(PACKAGES.map(p => [p.id, []]));
  for (const n of all) {
    const pkg = n['robos:package'] || 'game';
    if (!byPackage.has(pkg)) byPackage.set(pkg, []);
    byPackage.get(pkg).push({ ...n, 'robos:package': pkg, 'robos:namespace': `${ns}.${pkg}` });
  }

  const catalog = [];
  for (const [pkgId, pkgNodes] of byPackage) {
    if (!pkgNodes.length) continue;
    const meta = PACKAGES.find(p => p.id === pkgId) || { id: pkgId, title: pkgId, description: '' };
    pkgNodes.sort((a, b) => String(a['@id']).localeCompare(String(b['@id'])));
    const doc = {
      '@context': CONTEXT,
      '@id': `urn:robos:package:${slug(game['dcterms:title'])}:${pkgId}`,
      '@type': ['robos:Package'],
      'robos:package': pkgId,
      'robos:namespace': `${ns}.${pkgId}`,
      'robos:version': '1.0.0',
      'dcterms:title': `${game['dcterms:title']}: ${meta.title}`,
      'dcterms:description': meta.description,
      'robos:nodes': pkgNodes,
    };
    const rel = `kgraphs/${pkgId}/package.jsonld`;
    fs.mkdirSync(path.join(robosDir, 'kgraphs', pkgId), { recursive: true });
    fs.writeFileSync(path.join(robosDir, rel), stableJson(doc));
    catalog.push({ id: pkgId, namespace: `${ns}.${pkgId}`, title: meta.title, description: meta.description, path: rel, nodeCount: pkgNodes.length });
  }

  const manifest = {
    version: '1.0.0',
    title: `${game['dcterms:title']} Knowledge Graph`,
    description: game['dcterms:description'] || '',
    game: game['@id'],
    generator,
    ontology: 'ontology.jsonld',
    repositories: [{ id: 'local', path: '.robos', packagesPath: 'kgraphs', default: true }],
    dependencies: [],
    packages: catalog,
  };
  fs.writeFileSync(path.join(robosDir, 'kgraph.yaml'), stableJson(manifest));
  fs.writeFileSync(path.join(robosDir, 'ontology.jsonld'), stableJson(ontologyDocument()));

  const cov = coverage(all);
  fs.writeFileSync(path.join(outDir, 'coverage.json'), stableJson({ game: game['@id'], nodeCount: all.length, assetTypes: cov, warnings }));
  fs.writeFileSync(path.join(outDir, 'README.md'), readme(game, catalog, cov, sources, warnings));
  const gi = path.join(outDir, '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, 'cache/\nnode_modules/\n');
  return { outDir, nodeCount: all.length, packages: catalog, coverage: cov, warnings };
}

function readme(game, catalog, cov, sources, warnings) {
  const title = game['dcterms:title'];
  const lines = [
    `# ${title} Knowledge Graph`,
    '',
    game['dcterms:description'] || '',
    '',
    'Everything a remake needs, acquired from fan resources by the RobOS JRPG Parse Portal and stored as a RobOS knowledge graph (JSON-LD).',
    '',
    '## Asset coverage',
    '',
    '| Asset type | Nodes | Covered |',
    '| --- | ---: | :---: |',
    ...cov.map(c => `| ${c.label} | ${c.count} | ${c.covered ? 'yes' : 'no'} |`),
    '',
    '## Packages',
    '',
    '| Package | Nodes | What it holds |',
    '| --- | ---: | --- |',
    ...catalog.map(p => `| \`${p.id}\` | ${p.nodeCount} | ${p.description} |`),
    '',
    '## Layout',
    '',
    '```',
    '.robos/kgraph.yaml                   package catalog',
    '.robos/ontology.jsonld               JRPG types and their parents',
    '.robos/kgraphs/<package>/package.jsonld',
    'coverage.json                        asset-type coverage',
    'site/renderers/                      custom renderers for the Pages viewer',
    '```',
    '',
    '## Sources and credit',
    '',
    'Facts (stats, prices, formulas, story order) were gathered from these fan resources. Text quoted from wikis keeps its license. Images and maps are linked from where they are hosted, with credit, and are not copied into this repository; the portal can keep a local cache for remake work (`cache/`, git-ignored).',
    '',
    ...sources.map(s => `- [${s['dcterms:title']}](${s['schema:url']})${s['jrpg:license'] ? ` — ${s['jrpg:license']}` : ''}`),
    '',
    `${title} is a trademark of its owners. This is an unofficial fan research project.`,
    '',
  ];
  if (warnings.length) lines.push('## Acquisition notes', '', ...warnings.map(w => `- ${w}`), '');
  return lines.join('\n');
}

// Read a kgraph folder back: all nodes, the catalog and the ontology.
function readKgraphFolder(dir) {
  const root = path.basename(dir) === '.robos' ? dir : path.join(dir, '.robos');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'kgraph.yaml'), 'utf8'));
  const nodes = [];
  for (const p of manifest.packages || []) {
    const file = path.join(root, p.path);
    if (!fs.existsSync(file)) continue;
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    nodes.push(...(doc['robos:nodes'] || []));
  }
  let ontology = null;
  const ontPath = path.join(root, manifest.ontology || 'ontology.jsonld');
  if (fs.existsSync(ontPath)) ontology = JSON.parse(fs.readFileSync(ontPath, 'utf8'));
  return { root, manifest, nodes, ontology };
}

module.exports = { writeKgraphFolder, readKgraphFolder, slug, CONTEXT, ASSET_TYPES };

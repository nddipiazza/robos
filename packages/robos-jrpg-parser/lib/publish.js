'use strict';

// Builds the only folder of a parsed game that is meant to leave this machine.
//
// A working folder holds what a person downloaded, or text copied from it: source
// file names, hashes and paths, quotes used as evidence, descriptions taken from
// guides, and agent replies. None of that may be published. What may be is what we
// made ourselves: facts parsed into the graph, and generated images.

const fs = require('fs');
const path = require('path');
const { PACKAGES, ontologyDocument } = require('./ontology');

// Links back to the files something was made from.
const SOURCE_PROPS = ['jrpg:source', 'jrpg:references', 'jrpg:referenceMap', 'jrpg:evidence', 'jrpg:promptSha256'];
// Text a guide wrote, or the agent drew closely from one. Screen layouts describe a
// screenshot in the agent's own words, so those stay.
const COPIED_TEXT_PROPS = ['dcterms:description'];
const KEEPS_DESCRIPTION = ['jrpg:MenuScreen', 'jrpg:Game'];

function publicNode(node) {
  const types = [].concat(node['@type'] || []);
  if (types.includes('jrpg:Source')) return null;
  const out = { ...node };
  // "Battle backdrop from battle2.jpeg" names a downloaded file.
  if (types.includes('jrpg:GeneratedImage')) out['dcterms:title'] = String(out['dcterms:title']).replace(/\s+from\s+.*$/, '');
  for (const prop of SOURCE_PROPS) delete out[prop];
  if (!types.some(t => KEEPS_DESCRIPTION.includes(t))) for (const prop of COPIED_TEXT_PROPS) delete out[prop];
  return out;
}

// Images of a screenshot, and menu layouts, are named after the file they came from.
// The published copy numbers them instead. Maps and sprites are named after what they show.
const RENUMBERED_KINDS = ['battle-backdrop', 'menu-screen'];

function neutralNames(images, docs) {
  const renames = new Map();
  const counts = {};
  for (const image of images) {
    if (!RENUMBERED_KINDS.includes(image.kind)) continue;
    counts[image.kind] = (counts[image.kind] || 0) + 1;
    const id = `${image.kind}-${counts[image.kind]}`;
    renames.set(`:image:${image.id}"`, `:image:${id}"`);
    renames.set(`/${image.kind}/${image.id}.png`, `/${image.kind}/${id}.png`);
  }
  let menus = 0;
  for (const { doc } of docs) {
    for (const node of doc['robos:nodes']) {
      if ([].concat(node['@type']).includes('jrpg:MenuScreen')) {
        const prefix = node['@id'].slice(0, node['@id'].lastIndexOf(':') + 1);
        renames.set(`"${node['@id']}"`, `"${prefix}screen-${++menus}"`);
      }
    }
  }
  return renames;
}

function applyRenames(text, renames) {
  let out = text;
  for (const [from, to] of renames) out = out.split(from).join(to);
  return out;
}

function readPackages(outDir) {
  const root = path.join(outDir, '.robos');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'kgraph.yaml'), 'utf8'));
  return { root, catalog, docs: catalog.packages.map(p => ({ entry: p, doc: JSON.parse(fs.readFileSync(path.join(root, p.path), 'utf8')) })) };
}

// A list of towns is a fact. A sentence someone wrote is what must not be copied.
function isSentence(text) {
  return !!text && String(text).trim().split(/\s+/).length >= 8;
}

function walkFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, found);
    else found.push(full);
  }
  return found;
}

/** Text in the published folder that came from a source, as a list of problems. */
function findLeaks(toDir, parsed) {
  const needles = new Map();
  for (const s of parsed.sources) {
    // A generic name such as "menu.webp" still identifies a downloaded file.
    needles.set(s.name, `source file name ${s.name}`);
    needles.set(path.basename(s.name), `source file name ${path.basename(s.name)}`);
    needles.set(s.sha256, `hash of ${s.name}`);
    if (s.path) needles.set(path.dirname(s.path), 'a local path');
    if (s.savedFrom) needles.set(s.savedFrom, `the address ${s.name} came from`);
  }
  for (const kind of ['classes', 'places', 'milestones', 'equipment', 'shops', 'rules']) {
    for (const row of parsed[kind] || []) if (isSentence(row.evidence)) needles.set(row.evidence, `a quote: "${row.evidence.slice(0, 50)}"`);
  }
  for (const spell of parsed.spells || []) if (isSentence(spell.description)) needles.set(spell.description, `a copied description of ${spell.name}`);
  const problems = [];
  for (const file of walkFiles(toDir)) {
    if (!/\.(json|jsonld|yaml|md|txt|html)$/i.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const [needle, label] of needles) {
      if (text.includes(needle) || text.includes(JSON.stringify(needle).slice(1, -1))) problems.push(`${path.relative(toDir, file)} contains ${label}`);
    }
  }
  return problems;
}

/**
 * Writes the publishable copy of a working folder.
 * @param {string} outDir working folder
 * @param {string} toDir empty or new folder, outside the working folder
 * @param {{ kinds?: string[] }} [opts] which kinds of image to include; default all
 */
function publish(outDir, toDir, { kinds } = {}) {
  const from = path.resolve(outDir);
  const to = path.resolve(toDir);
  if (to === from || to.startsWith(from + path.sep)) throw new Error('Publish to a folder outside the working folder');
  if (fs.existsSync(to) && fs.readdirSync(to).filter(n => n !== '.git').length) throw new Error(`${to} is not empty`);

  const parsed = JSON.parse(fs.readFileSync(path.join(from, 'parsed.json'), 'utf8'));
  const { catalog, docs } = readPackages(from);
  const manifestFile = path.join(from, 'assets', 'generated', 'manifest.json');
  const images = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')).images : [];
  const included = images.filter(i => !kinds || kinds.includes(i.kind));
  const includedFiles = new Set(included.map(i => i.file));
  const allFiles = new Set(images.map(i => i.file));

  const renames = neutralNames(included, docs);
  const robos = path.join(to, '.robos');
  fs.mkdirSync(path.join(robos, 'kgraphs'), { recursive: true });
  const packages = [];
  let nodeCount = 0;
  for (const { entry, doc } of docs) {
    const nodes = doc['robos:nodes'].map(publicNode).filter(Boolean)
      .filter(n => !allFiles.has(n['schema:contentUrl']) || includedFiles.has(n['schema:contentUrl']));
    if (!nodes.length) continue;
    const meta = PACKAGES.find(p => p.id === entry.id) || entry;
    const description = entry.id === 'game' ? 'The game.' : meta.description;
    fs.mkdirSync(path.dirname(path.join(robos, entry.path)), { recursive: true });
    fs.writeFileSync(path.join(robos, entry.path), applyRenames(JSON.stringify({ ...doc, 'dcterms:description': description, 'robos:nodes': nodes }, null, 2) + '\n', renames));
    packages.push({ ...entry, description, nodeCount: nodes.length });
    nodeCount += nodes.length;
  }
  fs.writeFileSync(path.join(robos, 'kgraph.yaml'), JSON.stringify({ ...catalog, packages }, null, 2) + '\n');
  fs.writeFileSync(path.join(robos, 'ontology.jsonld'), JSON.stringify(ontologyDocument(), null, 2) + '\n');

  for (const image of included) {
    const target = path.join(to, applyRenames(image.file, renames));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(from, image.file), target);
  }

  fs.writeFileSync(path.join(to, 'README.md'), [
    `# ${parsed.game.title} Knowledge Graph`,
    '',
    `Facts about ${parsed.game.title} (${parsed.game.edition}) as a RobOS knowledge graph, with images generated by an AI model. This is an unofficial fan project. ${parsed.game.title} is a trademark of its owners.`,
    '',
    '| Package | Nodes |',
    '| --- | ---: |',
    ...packages.map(p => `| \`${p.id}\` | ${p.nodeCount} |`),
    '',
  ].join('\n'));

  const problems = findLeaks(to, parsed);
  if (problems.length) {
    fs.rmSync(to, { recursive: true, force: true });
    throw new Error(`Nothing was published, because the copy still held downloaded material:\n  ${problems.join('\n  ')}`);
  }
  return { nodeCount, packages, images: included.length };
}

module.exports = { publish, publicNode, findLeaks };

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../../.robos');
const aggregateFile = path.join(root, 'knowledge-graph.jsonld');
const kgraphsDir = path.join(root, 'kgraphs');

function clone(val) {
  return JSON.parse(JSON.stringify(val));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}

function normalize(doc) {
  const result = clone(doc);
  delete result['@graph'];
  delete result['robos:generatedAt'];
  result['robos:nodes'].sort((a, b) => String(a['@id']).localeCompare(String(b['@id'])));
  return result;
}

const aggregate = fs.existsSync(aggregateFile) ? JSON.parse(fs.readFileSync(aggregateFile, 'utf8')) : {
  '@context': {},
  '@id': 'urn:robos:graph:workspace',
  '@type': ['oslc:ServiceProvider', 'robos:SystemGraph'],
  'dcterms:title': 'RobOS Workspace Knowledge Graph',
  'robos:nodes': []
};

const nodes = [];
for (const entry of fs.readdirSync(kgraphsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const pkgFile = path.join(kgraphsDir, entry.name, 'package.jsonld');
  if (!fs.existsSync(pkgFile)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  if (Array.isArray(pkg['robos:nodes'])) {
    for (const n of pkg['robos:nodes']) {
      nodes.push(n);
    }
  }
}

const doc = normalize({ ...aggregate, 'robos:nodes': nodes });
doc['@graph'] = doc['robos:nodes'];
fs.writeFileSync(aggregateFile, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`Synced ${nodes.length} nodes from ${fs.readdirSync(kgraphsDir).length} packages to ${aggregateFile}`);

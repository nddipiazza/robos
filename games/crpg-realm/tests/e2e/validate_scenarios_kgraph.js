#!/usr/bin/env node
'use strict';
// Validates robos:CRPGTestScenario files with the KGraph's own SHACL validator.
// Nested typed nodes (combatants, directives, player inputs, battle maps) are
// flattened so each one is checked against its shape too.
// Usage: node validate_scenarios_kgraph.js <file.jsonld>...   (prints JSON)
const fs = require('node:fs');
const path = require('node:path');
const { SHACLValidator } = require(path.resolve(__dirname, '../../../../packages/robos-graph/lib/shacl-validator'));

function collect(node, out) {
  if (Array.isArray(node)) { node.forEach(n => collect(n, out)); return; }
  if (!node || typeof node !== 'object') return;
  if (node['@type']) out.push(node);
  for (const [k, v] of Object.entries(node)) if (!k.startsWith('@')) collect(v, out);
}

const report = [];
for (const file of process.argv.slice(2)) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const nodes = [];
  collect(doc, nodes);
  nodes.forEach((n, i) => { if (!n['@id']) n['@id'] = `${doc['@id'] || file}#node${i}`; });
  const res = new SHACLValidator().validate({ nodes });
  const types = {};
  for (const n of nodes) for (const t of [].concat(n['@type'])) types[t] = (types[t] || 0) + 1;
  report.push({ file: path.basename(file), conforms: res.conforms, nodes: nodes.length, types, violations: res.violations });
}
console.log(JSON.stringify(report, null, 1));
process.exit(report.every(r => r.conforms) ? 0 : 1);

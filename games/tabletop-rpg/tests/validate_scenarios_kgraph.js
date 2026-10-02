#!/usr/bin/env node
'use strict';
/**
 * validate_scenarios_kgraph.js
 * Validates robos:TabletopTestScenario JSON-LD files with the RobOS KGraph SHACL validator.
 * Nested typed nodes (combatants, directives, commands) are collected so each one is checked
 * against its respective W3C SHACL shape.
 *
 * Usage: node games/tabletop-rpg/tests/validate_scenarios_kgraph.js games/tabletop-rpg/scenarios/*.jsonld
 */

const fs = require('node:fs');
const path = require('node:path');
const { SHACLValidator } = require(path.resolve(__dirname, '../../../packages/robos-graph/lib/shacl-validator'));

function collect(node, out) {
  if (Array.isArray(node)) {
    node.forEach(n => collect(n, out));
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (node['@type']) out.push(node);
  for (const [k, v] of Object.entries(node)) {
    if (!k.startsWith('@')) collect(v, out);
  }
}

const report = [];
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node validate_scenarios_kgraph.js <file.jsonld>...");
  process.exit(1);
}

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const doc = JSON.parse(content);
  const nodes = [];
  collect(doc, nodes);
  nodes.forEach((n, i) => {
    if (!n['@id']) n['@id'] = `${doc['@id'] || file}#node${i}`;
  });
  const res = new SHACLValidator().validate({ nodes });
  const types = {};
  for (const n of nodes) {
    for (const t of [].concat(n['@type'])) {
      types[t] = (types[t] || 0) + 1;
    }
  }
  report.push({
    file: path.basename(file),
    conforms: res.conforms,
    nodes: nodes.length,
    types,
    violations: res.violations
  });
}

console.log(JSON.stringify(report, null, 2));
const allConform = report.every(r => r.conforms);
if (allConform) {
  console.log(`\n✔ All ${report.length} Tabletop Test Scenario file(s) conform 100% to W3C SHACL shapes!`);
  process.exit(0);
} else {
  console.error(`\n❌ Validation failed for one or more scenario files.`);
  process.exit(1);
}

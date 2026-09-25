#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function findRepoRoot(startDir) {
  let curr = startDir;
  while (curr && curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, '.robos')) || fs.existsSync(path.join(curr, 'packages'))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return path.resolve(__dirname, '../../../../..');
}

const rootDir = findRepoRoot(__dirname);
let SchemaRegistry;
try {
  SchemaRegistry = require(path.join(rootDir, 'packages/schema-studio/lib/schema-registry')).SchemaRegistry;
} catch (e) {
  try {
    SchemaRegistry = require('/usr/local/share/robos/schema-studio/lib/schema-registry').SchemaRegistry;
  } catch (err) {
    console.error('Could not load SchemaRegistry:', e.message, err.message);
    process.exit(1);
  }
}

const registry = new SchemaRegistry();
registry.init();

const args = process.argv.slice(2);
const command = args[0] || 'help';

function printHelp() {
  console.log(`
RobOS Schema Query CLI — Query Schema.org, OSLC & Definitive Schemas

Usage:
  node schema-query.js search <query> [--standard <OSLC|C4|ROBOS_ONLY|ALL>]
  node schema-query.js type <typeName>
  node schema-query.js property <propertyName>
  node schema-query.js validate <file.jsonld | inline-json>
  node schema-query.js synthesize <typeName> [--name <CustomEntityName>]

Examples:
  node schema-query.js search SoftwareApplication
  node schema-query.js type SoftwareApplication
  node schema-query.js property operatingSystem
  node schema-query.js synthesize SoftwareApplication --name PaymentService
`);
}

const isJson = args.includes('--json');

switch (command) {
  case 'search': {
    const query = args[1] && !args[1].startsWith('--') ? args[1] : '';
    let standard = 'ALL';
    const stdIdx = args.indexOf('--standard');
    if (stdIdx !== -1 && args[stdIdx + 1]) {
      standard = args[stdIdx + 1];
    }
    let limit = 25;
    const limIdx = args.indexOf('--limit');
    if (limIdx !== -1 && args[limIdx + 1]) {
      limit = parseInt(args[limIdx + 1], 10) || 25;
    }
    const res = registry.search(query, { standard, limit });
    if (isJson) {
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    console.log(`Found ${res.count} classes matching "${query}" (out of ${res.totalClasses} total):`);
    for (const item of res.results) {
      const robosTag = item.robosShapesCount > 0 ? ` [${item.robosShapesCount} RobOS Shapes]` : '';
      console.log(`- ${item.id} (${item.uri}): ${(item.comment || '').slice(0, 70)}...${robosTag}`);
    }
    break;
  }

  case 'type': {
    const typeName = args[1];
    if (!typeName || typeName.startsWith('--')) {
      console.error('Error: typeName is required.');
      process.exit(1);
    }
    const details = registry.getClass(typeName);
    if (!details) {
      console.error(`Error: Schema.org class "${typeName}" not found.`);
      process.exit(1);
    }
    if (isJson) {
      console.log(JSON.stringify(details, null, 2));
      break;
    }
    console.log(`\n=== Schema.org Class: ${details.id} ===`);
    console.log(`URI: ${details.uri}`);
    console.log(`Inheritance Lineage: ${details.lineage.join(' -> ')}`);
    console.log(`Description: ${details.comment}`);
    console.log(`\nDirect Properties (${details.directProperties.length}):`);
    for (const p of details.directProperties) {
      console.log(`  - ${p.id} [${(p.rangeIncludes || []).join('|') || 'Text'}]: ${(p.comment || '').slice(0, 60)}...`);
    }
    if (details.robosShapes && details.robosShapes.length > 0) {
      console.log(`\nLinked RobOS SHACL Shapes (${details.robosShapes.length}):`);
      for (const s of details.robosShapes) {
        console.log(`  * ${s.shapeId} (Target: ${s.targetClass}) -> Standard: ${s.domainStandard}`);
      }
    }
    break;
  }

  case 'property': {
    const propName = args[1];
    if (!propName || propName.startsWith('--')) {
      console.error('Error: propName is required.');
      process.exit(1);
    }
    const prop = registry.getProperty(propName);
    if (!prop) {
      console.error(`Error: Property "${propName}" not found.`);
      process.exit(1);
    }
    if (isJson) {
      console.log(JSON.stringify(prop, null, 2));
      break;
    }
    console.log(`\n=== Schema.org Property: ${prop.id} ===`);
    console.log(`URI: ${prop.uri}`);
    console.log(`Domains: ${(prop.domainIncludes || []).join(', ')}`);
    console.log(`Ranges: ${(prop.rangeIncludes || []).join(', ')}`);
    console.log(`Description: ${prop.comment}`);
    break;
  }

  case 'validate': {
    const target = args[1];
    if (!target) {
      console.error('Error: file path or JSON string required.');
      process.exit(1);
    }
    let payload;
    try {
      if (fs.existsSync(target)) {
        payload = JSON.parse(fs.readFileSync(target, 'utf-8'));
      } else {
        payload = JSON.parse(target);
      }
    } catch (e) {
      console.error(`Error parsing JSON payload: ${e.message}`);
      process.exit(1);
    }
    const res = registry.validateJsonLd(payload);
    if (isJson) {
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    console.log(`\n=== Validation Result ===`);
    console.log(`Status: ${res.valid ? 'VALID (PASSED)' : 'INVALID (FAILED)'}`);
    console.log(`Matched Class: ${res.matchedClass || 'None'}`);
    if (res.errors.length > 0) {
      console.log(`\nErrors (${res.errors.length}):`);
      res.errors.forEach(e => console.log(`  ❌ ${e}`));
    }
    if (res.warnings.length > 0) {
      console.log(`\nWarnings (${res.warnings.length}):`);
      res.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    }
    break;
  }

  case 'synthesize': {
    const typeName = args[1];
    if (!typeName || typeName.startsWith('--')) {
      console.error('Error: typeName is required.');
      process.exit(1);
    }
    let entityName = `My${typeName}`;
    const nameIdx = args.indexOf('--name');
    if (nameIdx !== -1 && args[nameIdx + 1]) {
      entityName = args[nameIdx + 1];
    }
    const synth = registry.synthesizeKGraphEntity(typeName, { entityName });
    if (isJson) {
      console.log(JSON.stringify(synth, null, 2));
      break;
    }
    console.log(`\n=== Synthesized RobOS Entity: ${synth.entityName} ===`);
    console.log(`Base Schema.org Class: ${synth.schemaOrgClass} (${synth.schemaOrgUri})`);
    console.log(`Domain Standard: ${synth.domainStandard}`);
    console.log(`\n--- JSON-LD ---`);
    console.log(JSON.stringify(synth.jsonLd, null, 2));
    console.log(`\n--- TypeSpec 0.61 ---`);
    console.log(synth.typeSpec);
    console.log(`\n--- W3C SHACL Shape ---`);
    console.log(JSON.stringify(synth.shaclShape, null, 2));
    break;
  }

  default:
    printHelp();
}

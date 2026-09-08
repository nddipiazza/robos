#!/usr/bin/env node
'use strict';

const path = require('path');
const { SchemaDocGenerator } = require('../packages/robos-graph/lib/schema-doc-generator');

const rootDir = path.resolve(__dirname, '..');
const generator = new SchemaDocGenerator({ rootDir });

console.log('Generating tiered RobOS Knowledge Graph schema documentation...');
const result = generator.generateAll();

if (result.ok) {
  console.log(`\n✅ Successfully generated schema documentation:`);
  console.log(`   - Total documentation files generated: ${result.generatedCount}`);
  console.log(`   - Packages documented: ${result.packageCount}`);
  console.log(`   - Schema constraint shapes documented: ${result.shapeCount}`);
  console.log(`   - Hub index: docs/schemas.md (/schemas.html)`);
  console.log(`   - Tiered packages directory: docs/schemas/`);
} else {
  console.error('❌ Failed to generate schema documentation:', result.error);
  process.exit(1);
}

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { SchemaDocGenerator, PACKAGE_DISPLAY_TITLES } = require('../../../robos-graph/lib/schema-doc-generator');
const { DEFAULT_PACKAGES } = require('../../../robos-graph/lib/package-manager');
const { BUILTIN_SHACL_SHAPES } = require('../../../robos-graph/lib/shacl-validator');

describe('RobOS Knowledge Graph: Automated Tiered Schema Doc Generator', () => {

  it('1. Generates 3-tier schema documentation tree across all 6 standard packages', () => {
    const rootDir = path.resolve(__dirname, '../../../..');
    const generator = new SchemaDocGenerator({ rootDir });

    const result = generator.generateAll();

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.packageCount, 6);
    assert.strictEqual(result.shapeCount, BUILTIN_SHACL_SHAPES.length);
    assert.strictEqual(result.generatedCount, 1 + 6 + BUILTIN_SHACL_SHAPES.length);

    // Verify Tier 1 hub file
    const hubPath = path.join(rootDir, 'docs', 'schemas.md');
    assert.ok(fs.existsSync(hubPath), 'docs/schemas.md exists');
    const hubContent = fs.readFileSync(hubPath, 'utf8');
    assert.ok(hubContent.includes('title: KGraph Schemas'));
    assert.ok(hubContent.includes('has_children: true'));
    assert.ok(hubContent.includes('permalink: /schemas.html'));

    // Verify all 6 Tier 2 package files
    for (const pkg of DEFAULT_PACKAGES) {
      const pkgPath = path.join(rootDir, 'docs', 'schemas', `${pkg.id}.md`);
      assert.ok(fs.existsSync(pkgPath), `${pkgPath} exists`);
      const pkgContent = fs.readFileSync(pkgPath, 'utf8');
      assert.ok(pkgContent.includes('parent: KGraph Schemas'), `${pkg.id}.md has parent: KGraph Schemas`);
      assert.ok(pkgContent.includes('has_children: true'), `${pkg.id}.md has has_children: true`);
      assert.ok(pkgContent.includes(pkg.namespace), `${pkg.id}.md contains namespace ${pkg.namespace}`);
    }
  });

  it('2. Enforces Just the Docs 3-tier navigation hierarchy in child schema pages', () => {
    const rootDir = path.resolve(__dirname, '../../../..');
    const generator = new SchemaDocGenerator({ rootDir });

    for (const shape of BUILTIN_SHACL_SHAPES) {
      const pkgId = generator.getSchemaPackage(shape.targetClass);
      const slug = generator.getEntitySlug(shape.targetClass);
      const expectedPkgTitle = PACKAGE_DISPLAY_TITLES[pkgId] || pkgId;

      const schemaPath = path.join(rootDir, 'docs', 'schemas', pkgId, `${slug}.md`);
      assert.ok(fs.existsSync(schemaPath), `Schema page exists at ${schemaPath}`);

      const content = fs.readFileSync(schemaPath, 'utf8');

      // Check hierarchy links
      assert.ok(content.includes('grand_parent: KGraph Schemas'), `${slug}.md has grand_parent: KGraph Schemas`);
      assert.ok(content.includes(`parent: ${expectedPkgTitle}`), `${slug}.md has parent: ${expectedPkgTitle}`);
      assert.ok(content.includes(`permalink: /schemas/${pkgId}/${slug}.html`), `${slug}.md has correct permalink`);

      // Check sections
      assert.ok(content.includes('## Property Constraints & SHACL Rules'), `${slug}.md has property constraints table`);
      assert.ok(content.includes('## Canonical OSLC JSON-LD Example'), `${slug}.md has JSON-LD example`);
      assert.ok(content.includes('## Programmatic SHACL Validation'), `${slug}.md has validation snippet`);

      // Check required property paths from shape
      for (const prop of shape.properties) {
        assert.ok(content.includes(`\`${prop.path}\``), `${slug}.md includes property path ${prop.path}`);
      }
    }
  });

  it('3. Validates that all canonical JSON-LD blocks in generated docs are valid JSON', () => {
    const rootDir = path.resolve(__dirname, '../../../..');
    const generator = new SchemaDocGenerator({ rootDir });

    for (const shape of BUILTIN_SHACL_SHAPES) {
      const pkgId = generator.getSchemaPackage(shape.targetClass);
      const slug = generator.getEntitySlug(shape.targetClass);
      const schemaPath = path.join(rootDir, 'docs', 'schemas', pkgId, `${slug}.md`);
      const content = fs.readFileSync(schemaPath, 'utf8');

      // Extract JSON block
      const match = content.match(/```json\n([\s\S]*?)\n```/);
      assert.ok(match, `JSON block found in ${slug}.md`);

      let parsed = null;
      try {
        parsed = JSON.parse(match[1]);
      } catch (err) {
        assert.fail(`Invalid JSON-LD in ${slug}.md: ${err.message}`);
      }

      assert.ok(parsed['@id'], `${slug}.md JSON has @id`);
      assert.ok(parsed['@type'], `${slug}.md JSON has @type`);
      assert.strictEqual(parsed['robos:package'], pkgId, `${slug}.md JSON has correct robos:package`);
    }
  });
});

'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { SchemaDocGenerator, PACKAGE_DISPLAY_TITLES, EXTRA_DOC_PACKAGES, yamlValue } = require('../../../robos-graph/lib/schema-doc-generator');
const { DEFAULT_PACKAGES } = require('../../../robos-graph/lib/package-manager');
const { BUILTIN_SHACL_SHAPES, SHACLValidator } = require('../../../robos-graph/lib/shacl-validator');

describe('RobOS Knowledge Graph: Automated Tiered Schema Doc Generator', () => {

  it('1. Generates 3-tier schema documentation tree across all documented packages', () => {
    const rootDir = path.resolve(__dirname, '../../../..');
    const generator = new SchemaDocGenerator({ rootDir });

    const result = generator.generateAll();

    assert.strictEqual(result.ok, true);
    const documentedPackages = [...DEFAULT_PACKAGES, ...EXTRA_DOC_PACKAGES];
    assert.strictEqual(result.packageCount, documentedPackages.length);
    assert.strictEqual(result.shapeCount, BUILTIN_SHACL_SHAPES.length);
    assert.strictEqual(result.generatedCount, 1 + documentedPackages.length + BUILTIN_SHACL_SHAPES.length);

    // Verify Tier 1 hub file
    const hubPath = path.join(rootDir, 'docs', 'schemas.md');
    assert.ok(fs.existsSync(hubPath), 'docs/schemas.md exists');
    const hubContent = fs.readFileSync(hubPath, 'utf8');
    assert.ok(hubContent.includes('title: Schemas\n'));
    assert.ok(hubContent.includes('parent: Build on RobOS'));
    assert.ok(hubContent.includes('nav_order: 2'));
    assert.ok(hubContent.includes('has_children: true'));
    assert.ok(hubContent.includes('permalink: /schemas.html'));

    // Verify all Tier 2 package files
    for (const pkg of documentedPackages) {
      const pkgPath = path.join(rootDir, 'docs', 'schemas', `${pkg.id}.md`);
      assert.ok(fs.existsSync(pkgPath), `${pkgPath} exists`);
      const pkgContent = fs.readFileSync(pkgPath, 'utf8');
      assert.ok(pkgContent.includes('parent: Schemas\n'), `${pkg.id}.md has parent: Schemas`);
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
      assert.ok(content.includes('grand_parent: Schemas\n'), `${slug}.md has grand_parent: Schemas`);
      assert.ok(content.includes(`parent: ${yamlValue(expectedPkgTitle)}\n`), `${slug}.md has parent: ${expectedPkgTitle}`);
      assert.ok(content.includes(`permalink: /schemas/${pkgId}/${slug}.html`), `${slug}.md has correct permalink`);

      // Check sections
      assert.ok(content.includes('## Properties'), `${slug}.md has property table`);
      assert.ok(content.includes('## Example node'), `${slug}.md has JSON-LD example`);
      assert.ok(content.includes('## Validate the example'), `${slug}.md has validation snippet`);

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
      assert.strictEqual(typeof parsed['robos:package'], 'string', `${slug}.md JSON has robos:package`);
      assert.ok(
        fs.existsSync(path.join(rootDir, '.robos', 'kgraphs', parsed['robos:package'])) || parsed['robos:package'] === pkgId,
        `${slug}.md JSON robos:package ${parsed['robos:package']} names a real package`
      );
      assert.strictEqual(new SHACLValidator().validate([parsed]).conforms, true, `${slug}.md example passes the validator`);
    }
  });

  it('4. Accurately formats acronyms and compounds (GraphQLContract, NoSQLDatabase, MCPServer, APIEndpoint, CICDPipeline)', () => {
    const rootDir = path.resolve(__dirname, '../../../..');
    const generator = new SchemaDocGenerator({ rootDir });

    assert.strictEqual(generator.getEntitySlug('robos:GraphQLContract'), 'graphql-contract');
    assert.strictEqual(generator.getEntityTitle('robos:GraphQLContract'), 'GraphQL Contract');

    assert.strictEqual(generator.getEntitySlug('robos:NoSQLDatabase'), 'nosql-database');
    assert.strictEqual(generator.getEntityTitle('robos:NoSQLDatabase'), 'NoSQL Database');

    assert.strictEqual(generator.getEntitySlug('robos:NoSQLCollection'), 'nosql-collection');
    assert.strictEqual(generator.getEntityTitle('robos:NoSQLCollection'), 'NoSQL Collection');

    assert.strictEqual(generator.getEntitySlug('robos:MCPServer'), 'mcp-server');
    assert.strictEqual(generator.getEntityTitle('robos:MCPServer'), 'MCP Server');

    assert.strictEqual(generator.getEntitySlug('robos:APIEndpoint'), 'api-endpoint');
    assert.strictEqual(generator.getEntityTitle('robos:APIEndpoint'), 'API Endpoint');

    assert.strictEqual(generator.getEntitySlug('robos:CICDPipeline'), 'cicd-pipeline');
    assert.strictEqual(generator.getEntityTitle('robos:CICDPipeline'), 'CI/CD Pipeline');

    assert.strictEqual(generator.getEntitySlug('robos:CLICommand'), 'cli-command');
    assert.strictEqual(generator.getEntitySlug('robos:CLIFlag'), 'cli-flag');
    assert.strictEqual(generator.getEntitySlug('robos:ADROption'), 'adr-option');
    assert.strictEqual(generator.getEntitySlug('robos:PCGame'), 'pc-game');
    assert.strictEqual(generator.getEntitySlug('robos:GitOpsDeployment'), 'gitops-deployment');

    // Confirm that proper files exist and old typo files are purged
    assert.ok(fs.existsSync(path.join(rootDir, 'docs/schemas/services/graphql-contract.md')), 'graphql-contract.md exists');
    assert.ok(!fs.existsSync(path.join(rootDir, 'docs/schemas/services/graph-qlcontract.md')), 'graph-qlcontract.md does not exist');
    assert.ok(fs.existsSync(path.join(rootDir, 'docs/schemas/core-platform/nosql-database.md')), 'nosql-database.md exists');
    assert.ok(!fs.existsSync(path.join(rootDir, 'docs/schemas/core-platform/no-sqldatabase.md')), 'no-sqldatabase.md does not exist');
  });

  it('5. Generated pages have unique titles, valid nav links and no emoji or hype wording', () => {
    const rootDir = path.resolve(__dirname, '../../../..');
    const generator = new SchemaDocGenerator({ rootDir });
    generator.generateAll();

    const files = [path.join(rootDir, 'docs', 'schemas.md')];
    for (const pkgId of Object.keys(PACKAGE_DISPLAY_TITLES)) {
      files.push(path.join(rootDir, 'docs', 'schemas', `${pkgId}.md`));
      const dir = path.join(rootDir, 'docs', 'schemas', pkgId);
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) if (f.endsWith('.md')) files.push(path.join(dir, f));
      }
    }

    const titles = new Map();
    const emoji = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    const hype = /\b(seamless(ly)?|powerful|robust|comprehensive|cutting-edge|state-of-the-art|revolutionary|supercharge|unlock|leverage|empower|effortless|enterprise-grade|holistic|streamline)\b/i;
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const title = (content.match(/^title: (.*)$/m) || [])[1];
      assert.ok(title, `${file} has a title`);
      const parsedTitle = title.startsWith('"') ? JSON.parse(title) : title;
      assert.ok(!titles.has(parsedTitle), `duplicate title "${parsedTitle}" in ${file} and ${titles.get(parsedTitle)}`);
      titles.set(parsedTitle, file);
      assert.ok(!emoji.test(content), `${file} contains an emoji or decorative symbol`);
      assert.ok(!hype.test(content), `${file} contains hype wording`);
    }
  });

  it('6. Every package page parents its schema pages, and the hub lists every shape', () => {
    const rootDir = path.resolve(__dirname, '../../../..');
    const generator = new SchemaDocGenerator({ rootDir });
    generator.generateAll();
    const hub = fs.readFileSync(path.join(rootDir, 'docs', 'schemas.md'), 'utf8');
    for (const shape of BUILTIN_SHACL_SHAPES) {
      const pkgId = generator.getSchemaPackage(shape.targetClass);
      const slug = generator.getEntitySlug(shape.targetClass);
      assert.ok(hub.includes(`/schemas/${pkgId}/${slug}.html`), `hub links to ${shape.targetClass}`);
    }
    for (const pkg of EXTRA_DOC_PACKAGES) {
      const pkgPath = path.join(rootDir, 'docs', 'schemas', `${pkg.id}.md`);
      assert.ok(fs.readFileSync(pkgPath, 'utf8').includes(`\`${pkg.namespace}\``), `${pkg.id}.md names its namespace`);
    }
  });
});

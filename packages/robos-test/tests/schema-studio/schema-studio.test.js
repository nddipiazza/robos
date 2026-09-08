'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execSync } = require('child_process');

const { SchemaRegistry } = require('../../../schema-studio/lib/schema-registry');

describe('Schema Studio & Schema.org Registry Test Suite', () => {
  const registry = new SchemaRegistry();

  it('initializes and indexes bundled Schema.org dataset', () => {
    registry.init();
    assert.ok(registry.initialized, 'SchemaRegistry should be initialized');
    assert.ok(registry.data.totalClasses >= 1000, `Expected >= 1000 classes, got ${registry.data.totalClasses}`);
    assert.ok(registry.data.totalProperties >= 1600, `Expected >= 1600 properties, got ${registry.data.totalProperties}`);
    assert.ok(registry.data.classes['SoftwareApplication'], 'SoftwareApplication class should exist');
    assert.ok(registry.data.classes['WebApplication'], 'WebApplication class should exist');
    assert.ok(registry.data.properties['applicationCategory'], 'applicationCategory property should exist');
  });

  it('searches for classes by term and filters by domain standards', () => {
    const results = registry.search('SoftwareApplication');
    assert.ok(results.count > 0, 'Search for SoftwareApplication should return results');
    const match = results.results.find(r => r.id === 'SoftwareApplication');
    assert.ok(match, 'SoftwareApplication should be in search results');
    assert.strictEqual(match.id, 'SoftwareApplication');
    assert.ok(match.propertyCount > 0, 'SoftwareApplication should have properties');
  });

  it('retrieves detailed class metadata and calculates inheritance lineage', () => {
    const cls = registry.getClass('WebApplication');
    assert.ok(cls, 'WebApplication class should be found');
    assert.strictEqual(cls.id, 'WebApplication');
    assert.ok(Array.isArray(cls.lineage), 'Lineage should be an array');
    assert.ok(cls.lineage.includes('SoftwareApplication'), 'Lineage should contain SoftwareApplication');
    assert.ok(cls.lineage.includes('CreativeWork'), 'Lineage should contain CreativeWork');
    assert.ok(cls.lineage.includes('Thing'), 'Lineage should contain Thing');
    assert.ok(cls.directProperties.length >= 0, 'Direct properties should be present');
    assert.ok(cls.inheritedProperties.length > 0, 'Inherited properties should be present');
    assert.ok(cls.totalPropertiesCount > cls.directProperties.length, 'Total properties should exceed direct properties');
  });

  it('validates JSON-LD payloads against Schema.org constraints', () => {
    // Valid entity
    const validEntity = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'RobOS Desktop',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Ubuntu 26.04',
    };
    const validResult = registry.validateJsonLd(validEntity);
    assert.strictEqual(validResult.valid, true, 'Valid payload should pass validation');
    assert.strictEqual(validResult.errors.length, 0, 'Should have no errors');

    // Invalid entity missing @type
    const invalidMissingType = {
      '@context': 'https://schema.org',
      name: 'No Type App',
    };
    const invalidResult1 = registry.validateJsonLd(invalidMissingType);
    assert.strictEqual(invalidResult1.valid, false, 'Missing @type should fail validation');
    assert.ok(invalidResult1.errors.some(e => e.includes('@type')), 'Error should mention @type');

    // Invalid entity with unknown class
    const invalidUnknownClass = {
      '@context': 'https://schema.org',
      '@type': 'CompletelyNonExistentClassXYZ',
      name: 'Bad App',
    };
    const invalidResult2 = registry.validateJsonLd(invalidUnknownClass);
    assert.strictEqual(invalidResult2.valid, false, 'Unknown class should fail validation');
  });

  it('synthesizes KGraph entity JSON-LD referencing Schema.org', () => {
    const synthesized = registry.synthesizeKGraphEntity({
      entityName: 'PaymentGatewayService',
      schemaOrgType: 'Service',
      robosNamespace: 'services',
      robosType: 'Microservice',
      description: 'Stripe and PayPal processor',
      properties: {
        port: 8080,
        protocol: 'REST',
      },
    });

    assert.ok(synthesized, 'Synthesis result should exist');
    assert.strictEqual(synthesized.jsonLd['@type'], 'robos:Microservice');
    assert.strictEqual(synthesized.jsonLd['schema:additionalType'], 'https://schema.org/Service');
    assert.strictEqual(synthesized.jsonLd['robos:name'], 'PaymentGatewayService');
    assert.strictEqual(synthesized.jsonLd['robos:description'], 'Stripe and PayPal processor');
    assert.strictEqual(synthesized.jsonLd['rdfs:isDefinedBy'], 'https://schema.org/Service');
    assert.strictEqual(synthesized.jsonLd['robos:refersFrom'], 'https://schema.org/Service');
  });

  it('executes schema-lookup CLI tool successfully', () => {
    const cliScript = path.join(__dirname, '../../../../plugins/robos/skills/schema-lookup/scripts/schema-query.js');

    // 1. Search
    const searchOut = execSync(`node "${cliScript}" search "SoftwareApplication" --limit 3 --json`, { encoding: 'utf-8' });
    const parsedSearch = JSON.parse(searchOut);
    assert.ok(parsedSearch.count > 0, 'CLI search should return matches');
    assert.ok(parsedSearch.results.some(r => r.id === 'SoftwareApplication'), 'CLI search should find SoftwareApplication');

    // 2. Type lookup
    const typeOut = execSync(`node "${cliScript}" type "WebApplication" --json`, { encoding: 'utf-8' });
    const parsedType = JSON.parse(typeOut);
    assert.strictEqual(parsedType.id, 'WebApplication');
    assert.ok(parsedType.lineage.includes('SoftwareApplication'), 'CLI type lookup should show lineage');

    // 3. Validation
    const testJson = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Web IDE',
      browserRequirements: 'Requires HTML5 support',
    });
    const valOut = execSync(`node "${cliScript}" validate '${testJson}' --json`, { encoding: 'utf-8' });
    const parsedVal = JSON.parse(valOut);
    assert.strictEqual(parsedVal.valid, true, 'CLI validate should succeed on valid payload');
  });
});

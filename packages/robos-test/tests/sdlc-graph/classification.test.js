'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const c = require('../../../robos-graph/lib/classification');
const { BUILTIN_SHACL_SHAPES: shapes } = require('../../../robos-graph/lib/shacl-validator');
const { PROPERTY_METADATA } = require('../../../robos-graph/lib/schema-doc-generator');
const { DEPENDENCY_PREDICATES, REFERENCE_PREDICATES } = require('../../../robos-graph/lib/relationships');
const ref = code => ({ '@id': 'https://robos.dev/ns/sdlc#classification/' + code });
const node = (id, type, extra = {}) => ({ '@id': 'urn:test:' + id, '@type': type, 'dcterms:title': id, ...extra });

test('every built-in shape, target class and registered predicate has catalog and ontology classification', () => {
  const ontology = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../docs/schemas/ontology.jsonld')));
  const byId = new Map(ontology['@graph'].map(n => [n['@id'], n]));
  const predicates = new Set([...Object.keys(PROPERTY_METADATA), ...DEPENDENCY_PREDICATES, ...REFERENCE_PREDICATES]);
  for (const shape of shapes) {
    const resolved = c.resolveClassification(node('shape', shape.targetClass));
    assert.equal(resolved.status, 'inferred', shape.targetClass);
    assert.deepEqual(resolved.warnings, [], shape.targetClass);
    assert.deepEqual(shape['robos:classification'], resolved.references);
    assert.deepEqual(c.resolveSchemaElement(shape.shapeId), resolved.references, shape.shapeId);
    assert.deepEqual(byId.get(shape.targetClass)['robos:classification'], resolved.references);
    for (const property of shape.properties) {
      predicates.add(property.path);
      assert.ok(property['robos:classification'].length, property.path);
    }
  }
  for (const predicate of predicates) {
    assert.ok(c.resolveSchemaElement(predicate).length, predicate);
    if (PROPERTY_METADATA[predicate]) assert.deepEqual(PROPERTY_METADATA[predicate]['robos:classification'], c.resolveSchemaElement(predicate), predicate);
    assert.deepEqual(byId.get(predicate)?.['robos:classification'], c.resolveSchemaElement(predicate), predicate);
  }
  for (const element of ontology['@graph'].filter(n => ['rdfs:Class', 'rdf:Property'].includes(n['@type']))) {
    assert.ok(element['robos:classification'].length, element['@id']);
    assert.equal(c.resolveClassification(element).valid, true);
  }
  assert.deepEqual(byId.get('robos:classification')['rdfs:subPropertyOf'], { '@id': 'schema:category' });
  assert.equal(byId.get(c.CODE_SET_ID)['@type'], 'schema:CategoryCodeSet');
  assert.equal(new Set(c.CATALOG.map(code => code.id)).size, c.CATALOG.length);
  assert.equal(ontology['robos:totalClasses'], ontology['@graph'].filter(n => n['@type'] === 'rdfs:Class').length);
});

test('multi-type inference is order independent, deduplicated and uses exact namespace identities', () => {
  const a = node('multi', ['robos:Microservice', 'robos:DataStore', 'robos:Microservice']);
  assert.deepEqual(c.resolveClassification(a).references, [ref('services'), ref('data')]);
  assert.deepEqual(c.resolveClassification({ ...a, '@type': a['@type'].slice().reverse() }), c.resolveClassification(a));
  assert.deepEqual(c.resolveClassification(node('iri', 'https://robos.dev/ns/sdlc#DataStore')).references, [ref('data')]);
  assert.equal(c.resolveClassification(node('spoof', 'custom:Microservice')).primary, 'unclassified');
  assert.equal(c.resolveClassification(node('spoof', 'robos:NotAMicroservice')).primary, 'unclassified');
});

test('explicit validated references override inference and unknown custom types remain visible with warnings', () => {
  const custom = node('custom', 'example:Special', { 'robos:classification': ref('documentation') });
  assert.equal(c.resolveClassification(custom).status, 'declared');
  assert.equal(c.resolveClassification(custom).primary, 'documentation');
  assert.equal(c.resolveClassification(custom).warnings[0].code, 'unknown-type');
  const mixed = c.resolveClassification(node('mixed', ['robos:DataStore', 'example:Special']));
  assert.equal(mixed.status, 'inferred'); assert.equal(mixed.primary, 'data'); assert.equal(mixed.warnings.length, 1);
  const explicit = c.resolveClassification(node('override', 'robos:DataStore', { 'robos:classification': [ref('testing'), ref('services'), ref('testing')] }));
  assert.deepEqual(explicit.references, [ref('services'), ref('testing')]);
  assert.deepEqual(explicit.inferredReferences, [ref('data')]);
  assert.equal(c.resolveClassification(node('full', 'example:Special', { 'https://robos.dev/ns/sdlc#classification': 'robos:classification/data' })).primary, 'data');
});

test('invalid declarations never fall back silently, and absent types do not crash', () => {
  for (const id of ['custom:Unknown', '__proto__', 'constructor', null]) assert.deepEqual(c.resolveSchemaElement(id), []);
  assert.equal(c.resolveClassification(null).status, 'unclassified');
  for (const value of [null, [], '', 'data', ref('missing'), 42, { '@id': ref('data')['@id'], 'schema:codeValue': 'spoof' }, [ref('data'), ref('missing')]]) {
    const result = c.resolveClassification(node('bad', 'robos:DataStore', { 'robos:classification': value }));
    assert.equal(result.valid, false, JSON.stringify(value)); assert.equal(result.status, 'unclassified');
    assert.ok(result.warnings.some(w => w.code === 'invalid-classification'));
  }
  for (const type of [null, undefined, [], {}, 4, 'example:Custom']) {
    const result = c.resolveClassification(node('unknown', type));
    assert.equal(result.status, 'unclassified'); assert.ok(result.warnings.length);
  }
});

test('tree sorting, combined filters, one placement, search expansion and mode-scoped collapse counts', () => {
  const nodes = [node('Zulu', ['robos:Microservice', 'robos:DataStore'], { 'robos:package': 'alpha' }), node('Alpha', 'robos:DataStore', { 'robos:package': 'beta' }), node('Custom', 'example:New')];
  const tree = c.buildTree(nodes);
  assert.equal(tree.count, 3); assert.equal(tree.groups.reduce((sum, g) => sum + g.count, 0), 3);
  assert.deepEqual(tree.groups.map(g => g.key), ['services', 'data', 'unclassified']);
  assert.deepEqual(c.buildTree(nodes.slice().reverse()), tree);
  assert.equal(c.buildTree(nodes, { classification: 'data' }).count, 2);
  assert.equal(c.buildTree(nodes, { classification: 'data', package: 'alpha', type: 'robos:Microservice' }).count, 1);
  assert.equal(c.buildTree(nodes, { search: 'Data stores' }).count, 2);
  assert.equal(c.buildTree(nodes, { search: 'new' }).count, 1);
  assert.equal(c.buildTree(nodes, { collapsed: ['classification:services'] }).groups[0].collapsed, true);
  assert.equal(c.buildTree(nodes, { search: 'Zulu', collapsed: ['classification:services'] }).groups[0].collapsed, false);
  assert.ok(c.buildTree(nodes, { mode: 'type', collapsed: ['classification:services'] }).groups.every(g => !g.collapsed));
  for (const mode of ['classification', 'package', 'type', 'flat']) assert.equal(c.buildTree(nodes, { mode }).count, 3);
  assert.equal(c.buildTree(nodes, { search: 'not present' }).groups.length, 0);
});

test('browser and Node execute the identical module with identical results', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../../robos-graph/lib/classification.js'), 'utf8'), context);
  for (const type of shapes.map(s => s.targetClass).concat('example:Custom')) {
    const input = node('parity', type);
    assert.equal(JSON.stringify(context.RobosClassification.resolveClassification(input)), JSON.stringify(c.resolveClassification(input)));
  }
});

test('sourceKind protobuf-enum follows SourceArtifact classification without extractor-specific guessing', () => {
  const input = node('enum', 'robos:SourceArtifact', { 'robos:sourceKind': 'protobuf-enum' });
  assert.equal(c.resolveClassification(input).primary, 'source');
  assert.equal(c.buildTree([input], { search: 'protobuf-enum' }).count, 1);
});

test('persisted inference retains provenance and stale inference is rejected instead of relabeled declared', () => {
  const base = node('cached', 'robos:DataStore', { 'robos:classification': [ref('data')], 'robos:classificationOrigin': 'inferred' });
  assert.equal(c.resolveClassification(base).status, 'inferred');
  assert.equal(c.resolveClassification(base).valid, true);
  const stale = c.resolveClassification({ ...base, '@type': ['robos:Microservice'] });
  assert.equal(stale.valid, false); assert.equal(stale.status, 'unclassified');
  assert.ok(stale.warnings.some(w => w.code === 'stale-inferred-classification'));
  assert.equal(c.resolveClassification({ ...base, 'robos:classificationOrigin': 'declared' }).status, 'declared');
  assert.equal(c.resolveClassification({ ...base, 'robos:classificationOrigin': 'invalid' }).valid, false);
  assert.equal(c.resolveClassification(node('marker-only', 'robos:DataStore', { 'robos:classificationOrigin': 'inferred' })).valid, false);
});

test('every alternate SHACL target class has deterministic inference and published metadata', () => {
  for (const shape of shapes) for (const alias of shape.targetClasses || []) {
    const result = c.resolveClassification(node('alias', alias));
    assert.equal(result.status, 'inferred', alias);
    assert.deepEqual(result.references, c.resolveClassification(node('canonical', shape.targetClass)).references, alias);
  }
  const ontology = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../.robos/ontology.jsonld')));
  for (const element of ontology['@graph'].filter(n => ['rdfs:Class', 'rdf:Property'].includes(n['@type']))) {
    assert.deepEqual(element['robos:classification'], c.resolveSchemaElement(element['@id']), element['@id']);
    assert.ok(element['robos:classification'].length);
  }
});

test('workspace validation accepts compact and expanded classification predicates with the same strict reference rules', () => {
  const { validateDocument } = require('../../../robos-graph/lib/graph-workspace');
  const { OSLC_CONTEXT } = require('../../../robos-graph/lib/oslc-parser');
  const report = extra => validateDocument({ '@context': OSLC_CONTEXT, 'robos:nodes': [node('expanded', 'example:Custom', { 'robos:package': 'services', ...extra })] });
  for (const property of ['robos:classification', 'https://robos.dev/ns/sdlc#classification']) {
    for (const value of [ref('data'), [ref('data')], 'https://robos.dev/ns/sdlc#classification/data', { '@id': 'robos:classification/data' }]) {
      const result = report({ [property]: value });
      assert.equal(result.conforms, true, JSON.stringify(result.errors));
    }
    for (const value of [ref('missing'), { '@id': 'https://example.org/custom-code' }, 'https://example.org/custom-code']) {
      assert.equal(report({ [property]: value }).conforms, false);
    }
  }
  assert.equal(report({ 'robos:relatedTo': ref('data') }).conforms, false, 'catalog IDs only bypass node resolution for the classification predicate');
});

test('expanded classification origin retains inference and rejects stale or conflicting origins', () => {
  const ns = 'https://robos.dev/ns/sdlc#';
  const base = node('expanded-origin', 'robos:DataStore', { [ns + 'classification']: [ref('data')], [ns + 'classificationOrigin']: 'inferred' });
  const result = c.resolveClassification(base);
  assert.equal(result.valid, true);
  assert.equal(result.status, 'inferred');
  assert.equal(c.resolveClassification({ ...base, '@type': 'robos:Microservice' }).valid, false);
  assert.equal(c.resolveClassification({ ...base, 'robos:classificationOrigin': 'declared' }).valid, false);
  assert.equal(c.resolveClassification({ ...base, [ns + 'classificationOrigin']: 'invalid' }).valid, false);
});

test('compact and expanded declarations are both validated, deduplicated and cannot hide invalid references', () => {
  const ns = 'https://robos.dev/ns/sdlc#';
  const input = node('both', 'example:Custom', { 'robos:classification': ref('data'), [ns + 'classification']: ref('documentation') });
  assert.deepEqual(c.resolveClassification(input).references, [ref('data'), ref('documentation')]);
  assert.deepEqual(c.resolveClassification({ ...input, [ns + 'classification']: ref('data') }).references, [ref('data')]);
  assert.equal(c.resolveClassification({ ...input, [ns + 'classification']: ref('missing') }).valid, false);
  assert.equal(c.resolveClassification({ ...input, [ns + 'classification']: [] }).valid, false);
});

test('CreativeWork is an explicit artifact mapping without overriding a more specific registered type', () => {
  for (const type of ['schema:CreativeWork', 'https://schema.org/CreativeWork']) {
    const artifact = c.resolveClassification(node('artifact', ['robos:SourceArtifact', type]));
    assert.deepEqual(artifact.references, [ref('source')]);
    assert.deepEqual(artifact.warnings, []);
    assert.deepEqual(c.resolveClassification(node('generic', type)).references, [ref('source')]);
    const skill = node('skill', ['robos:AgentSkill', type], { 'robos:classification': [ref('agents')], 'robos:classificationOrigin': 'inferred' });
    assert.equal(c.resolveClassification(skill).valid, true);
    assert.deepEqual(c.resolveClassification(skill).references, [ref('agents')]);
    assert.deepEqual(c.resolveClassification(skill).warnings, []);
  }
  for (const type of ['custom:CreativeWork', 'schema:UnknownWork']) {
    assert.equal(c.resolveClassification(node('unknown', type)).status, 'unclassified');
    assert.deepEqual(c.resolveClassification(node('mixed', ['robos:SourceArtifact', type])).unknownTypes, [type]);
  }
});

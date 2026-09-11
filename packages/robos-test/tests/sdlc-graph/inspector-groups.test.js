'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { GROUPS } = require('../../../robos-graph/lib/inspector-groups');
const { BUILTIN_SHACL_SHAPES } = require('../../../robos-graph/lib/shacl-validator');
const { DEPENDENCY_PREDICATES, REFERENCE_PREDICATES } = require('../../../robos-graph/lib/relationships');
const root = path.resolve(__dirname, '../../../..');
const catalogPath = path.join(root, 'packages/robos-graph/lib/inspector-groups.js');
const standardFields = new Set(['dcterms:title', 'dcterms:description', 'robos:sourcePath',
  'robos:evidence', 'robos:inRepository', 'robos:repository']);

test('catalog is available in CommonJS and an isolated browser without runtime dependencies', () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync(catalogPath, 'utf8'), browser);
  assert.deepEqual(JSON.parse(JSON.stringify(browser.RobosInspectorGroups)), { GROUPS });
  assert.ok(GROUPS.length >= 15 && GROUPS.length <= 25);
  assert.equal(new Set(GROUPS.map(g => g.id)).size, GROUPS.length);
  for (const group of GROUPS) {
    assert.match(group.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(group.label.trim());
    for (const key of ['types', 'properties', 'incoming']) {
      assert.ok(Array.isArray(group[key]));
      assert.equal(new Set(group[key]).size, group[key].length, `${group.id}.${key} duplicates`);
      for (const value of group[key]) assert.match(value, /^[a-z_]+:[A-Za-z][A-Za-z0-9]*$/);
    }
    assert.ok(group.types.length && group.properties.length);
  }
});

test('all actual SHACL targets and aliases have deliberate domain-field coverage', () => {
  for (const shape of BUILTIN_SHACL_SHAPES) {
    for (const type of new Set([shape.targetClass, ...(shape.targetClasses || [])])) {
      const eligible = GROUPS.filter(g => g.types.includes(type));
      assert.ok(eligible.length, `Uncovered schema target: ${type}`);
      for (const { path: predicate } of shape.properties) {
        if (['robos:docPath', 'robos:slug', 'robos:imagePath'].includes(predicate) &&
            ['robos:DocumentationPage', 'robos:DocArticle', 'robos:FlowDiagram', 'robos:InteractiveWalkthrough'].includes(type)) continue; // Standard Documentation view.
        if (standardFields.has(predicate)) continue; // Overview/provenance metadata, not domain triggers.
        assert.ok(eligible.some(g => g.properties.includes(predicate)), `${type}: missing ${predicate}`);
      }
    }
  }
});

test('predicates have schema, source, hierarchy or explicitly requested MCP evidence', () => {
  const known = new Set([...DEPENDENCY_PREDICATES, ...REFERENCE_PREDICATES,
    ...BUILTIN_SHACL_SHAPES.flatMap(s => s.properties.map(p => p.path))]);
  for (const file of ['packages/robos-graph/lib/graph-store.js', 'packages/robos-graph/lib/source-extractor.js', 'packages/robos-graph/lib/source-dependencies.js', 'AGENTS.md']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/\b(?:robos|oslc_qm|oslc_rm):[a-z][A-Za-z0-9]*/g)) known.add(match[0]);
  }
  // User-requested legacy compatibility spellings. The current schema records
  // these children through mcpServer; do not claim these aliases are SHACL paths.
  const requestedAliases = new Set(['robos:resourceOfServer', 'robos:promptOfServer']);
  // Explicit per-type extensions requested for parent SHACL additions. Standard
  // fields: https://modelcontextprotocol.io/specification/2025-11-25/schema
  // Availability/gates are recorded graph metadata, not MCP protocol properties.
  const pendingMcp = {
    'mcp-server': [],
    'mcp-tool': ['inputSchema', 'outputSchema', 'annotations'],
    'mcp-resource': ['uri', 'mimeType', 'annotations'],
    'mcp-prompt': ['arguments'],
  };
  for (const fields of Object.values(pendingMcp)) fields.push('registrationCondition', 'availabilityStatus');
  // Optional source-declaration metadata. These extensions do not assert
  // runtime availability and are exercised using portable fixtures.
  const recordedExtensions = {
    'services': ['stateScope'], 'testing': ['stateScope'],
    'pipeline': ['stateScope'],
    'configuration': ['stateScope', 'configurationKind'],
    'data-model': ['modelKind'],
    'mcp-server': ['runtimePrerequisites'],
    'mcp-tool': ['runtimePrerequisites', 'toolAnnotations'],
    'mcp-resource': ['runtimePrerequisites'],
    'mcp-prompt': ['runtimePrerequisites'],
  };
  for (const group of GROUPS) for (const predicate of [...group.properties, ...group.incoming]) {
    const recorded = (recordedExtensions[group.id] || []).some(field => predicate === `robos:${field}`);
    const requestedMcp = (pendingMcp[group.id] || []).some(field => predicate === `robos:${field}`) && group.properties.includes(predicate);
    assert.ok(known.has(predicate) || requestedAliases.has(predicate) || requestedMcp || recorded, `${group.id}: unverified ${predicate}`);
  }
});

test('common title and provenance metadata cannot open domain tabs', () => {
  for (const group of GROUPS) {
    for (const predicate of ['dcterms:title', 'dcterms:description', 'robos:sourcePath', 'robos:evidence']) {
      assert.ok(!group.properties.includes(predicate), `${group.id} triggered by ${predicate}`);
    }
    assert.ok(!group.types.includes('oslc:Resource'));
    assert.ok(!group.types.includes('schema:Thing'));
  }
});

test('MCP server discovers actual child references in both current and legacy representations', () => {
  const server = GROUPS.find(g => g.id === 'mcp-server');
  assert.equal(server.label, 'MCP Server');
  assert.deepEqual(server.types, ['robos:MCPServer', 'robos:ToolProvider']);
  assert.ok(server.properties.includes('robos:toolsProvided'));
  assert.deepEqual(server.incoming, ['robos:mcpServer', 'robos:toolOfServer', 'robos:resourceOfServer', 'robos:promptOfServer']);
  for (const [id, type, label] of [['mcp-tool', 'MCPTool', 'Tool'], ['mcp-resource', 'MCPResource', 'Resource'], ['mcp-prompt', 'MCPPrompt', 'Prompt']]) {
    const child = GROUPS.find(g => g.id === id);
    assert.deepEqual(child.types, [`robos:${type}`]);
    assert.equal(child.label, label);
    assert.ok(child.properties.includes('robos:mcpServer'));
  }
});

test('application service refs get Services, while framework-only application data does not', () => {
  const services = GROUPS.find(g => g.id === 'services');
  assert.equal(services.label, 'Services');
  for (const type of ['robos:Application', 'robos:Microservice', 'robos:FrontEndApp', 'robos:DesktopApp']) {
    assert.ok(services.types.includes(type));
  }
  for (const predicate of ['robos:service', 'robos:targetService', 'robos:implementsContract', 'robos:consumesContract']) {
    assert.ok(services.properties.includes(predicate));
  }
  assert.ok(!services.properties.includes('robos:frontendFramework'));
  assert.ok(!services.properties.includes('robos:technology'));
  assert.ok(!services.types.includes('robos:Database'));
});


test('MCP payload schemas, resource metadata and prompt arguments remain type-specific', () => {
  const expected = {
    'mcp-tool': ['inputSchema', 'outputSchema', 'annotations'],
    'mcp-resource': ['uri', 'mimeType', 'annotations'],
    'mcp-prompt': ['arguments'],
  };
  for (const [id, fields] of Object.entries(expected)) {
    const group = GROUPS.find(g => g.id === id);
    for (const field of fields) assert.ok(group.properties.includes(`robos:${field}`), `${id}: missing ${field}`);
  }
  for (const group of GROUPS.filter(g => g.id.startsWith('mcp-'))) {
    assert.ok(group.properties.includes('robos:registrationCondition'));
    assert.ok(group.properties.includes('robos:availabilityStatus'));
    assert.ok(!group.properties.includes('dcterms:description'), 'Description alone must not trigger an MCP tab');
    if (group.id !== 'mcp-tool') assert.ok(!group.properties.includes('robos:inputSchema'));
    if (group.id !== 'mcp-prompt') assert.ok(!group.properties.includes('robos:arguments'));
  }
});


test('source-backed service, proto, configuration and MCP fixtures expose substantive recorded fields', () => {
  const { groups } = require('../../../robos-graph/lib/inspector-property-groups');
  const fixtures = [
    ['Microservice', 'services', { provides: ['urn:test:api'], uses: ['urn:test:lib'], dependsOn: ['urn:test:db'], hosts: ['urn:test:worker'], implementedBy: ['urn:test:lib'], stateScope: 'source-declaration', publishesTo: ['urn:test:topic'], runs: ['urn:test:worker'], readsFrom: ['urn:test:db'] }],
    ['TestPlan', 'testing', { targets: ['urn:test:service'], stateScope: 'source-declaration' }],
    ['EnvironmentProfile', 'configuration', { stateScope: 'source-declaration' }],
    ['SourceArtifact', 'source', { definedInContract: { '@id': 'urn:test:proto' }, inputType: { '@id': 'urn:test:request' }, outputType: { '@id': 'urn:test:response' }, declaredName: 'ReadBuild', version: 'v1', targets: ['urn:test:service'] }],
    ['MCPTool', 'mcp-tool', { toolAnnotations: { readOnlyHint: false }, registrationCondition: 'capability enabled', availabilityStatus: 'source-declaration', runtimePrerequisites: 'queryService required', uses: ['urn:test:lib'] }],
    ['DataModel', 'data-model', { modelKind: 'ent-schema', relatesTo: ['urn:test:entity'] }],
    ['CICDPipeline', 'pipeline', { validates: ['urn:test:service'], hasConfiguration: ['urn:test:config'], publishes: ['urn:test:image'], stateScope: 'source-declaration' }],
    ['SourceArtifact', 'configuration', { configurationKind: 'buildbarn', authenticationBoundary: ['urn:test:auth'], routesTo: ['urn:test:service'], sendsBuildEventsTo: ['urn:test:bep'], sendsCompletedActionsTo: ['urn:test:actions'], executesOn: ['urn:test:cluster'], stateScope: 'source-declaration' }],
    ['ConsumerGroup', 'messaging', { consumesFrom: ['urn:test:topic'], deadLettersTo: ['urn:test:dead'], writesTo: ['urn:test:db'], writesModel: ['urn:test:model'] }],
    ['LearningModule', 'learning', { teaches: ['urn:test:service'], usesSkill: ['urn:test:skill'] }],
    ['WebRoute', 'routes-cli', { uses: ['urn:test:service'], renders: ['urn:test:component'] }],
    ['GitRepository', 'source-control', { currentBranch: 'main', branchMetadataStatus: 'known' }],
  ];
  for (const [type, groupId, properties] of fixtures) {
    const node = { '@id': `urn:test:${type}`, '@type': `robos:${type}`, 'dcterms:title': type,
      ...Object.fromEntries(Object.entries(properties).map(([key, value]) => [`robos:${key}`, value])) };
    const found = groups(node, [node]).find(g => g.id === groupId);
    assert.ok(found, `${type} must expose ${groupId}`);
    assert.deepEqual(found.fields.map(f => f.predicate).sort(), Object.keys(properties).map(k => `robos:${k}`).sort());
  }
});

test('document path and generic status do not duplicate Documentation; decisions and structure still appear', () => {
  const { groups } = require('../../../robos-graph/lib/inspector-property-groups');
  const page = { '@id': 'urn:test:doc', '@type': 'robos:DocumentationPage', 'dcterms:title': 'Guide',
    'robos:docPath': 'docs/guide.md', 'robos:slug': 'guide', 'robos:status': 'implemented', 'robos:content': 'Body' };
  assert.deepEqual(groups(page, [page]), []);
  const section = { '@id': 'urn:test:section', '@type': 'robos:DocSection', 'robos:docPage': { '@id': page['@id'] }, 'robos:sectionId': 'start' };
  assert.equal(groups(page, [page, section])[0].label, 'Content & Structure');
  const adr = { '@id': 'urn:test:adr', '@type': 'robos:ADR', 'robos:decision': 'Use the queue', 'robos:status': 'accepted' };
  assert.equal(groups(adr, [adr])[0].id, 'decisions');
});


test('metadata-only fields stay displayable without triggering unrelated domain tabs', () => {
  const excluded = {
    application: ['ownerTeam'], messaging: ['technology', 'pipelineEngine'],
    deployment: ['namespace'], organization: ['status', 'ownerTeam', 'assignedTeam'],
    'source-control': ['inRepository', 'repository'],
  };
  for (const [id, fields] of Object.entries(excluded)) {
    const group = GROUPS.find(g => g.id === id);
    assert.ok(group.triggerProperties.length);
    assert.equal(new Set(group.triggerProperties).size, group.triggerProperties.length);
    for (const predicate of group.triggerProperties) assert.ok(group.properties.includes(predicate));
    for (const field of fields) {
      assert.ok(group.properties.includes(`robos:${field}`));
      assert.ok(!group.triggerProperties.includes(`robos:${field}`), `${id}: metadata trigger ${field}`);
    }
  }
});


test('engine excludes metadata-only groups even when metadata resolves to an outgoing node', () => {
  const { groups } = require('../../../robos-graph/lib/inspector-property-groups');
  for (const [type, id, properties] of [
    ['Microservice', 'application', ['ownerTeam']],
    ['DataPipeline', 'messaging', ['technology', 'pipelineEngine']],
    ['Project', 'organization', ['status', 'ownerTeam', 'assignedTeam']],
    ['GitRepository', 'source-control', ['inRepository', 'repository']],
    ['KubernetesDeployment', 'deployment', ['namespace']],
  ]) {
    for (const key of properties) for (const value of ['recorded metadata', { '@id': 'urn:test:related' }]) {
      const node = { '@id': 'urn:test:selected', '@type': `robos:${type}`, [`robos:${key}`]: value };
      const related = { '@id': 'urn:test:related', '@type': 'robos:Team', 'dcterms:title': 'Team' };
      assert.ok(!groups(node, [node, related]).some(g => g.id === id), `${type}.${key} must not trigger ${id}`);
    }
  }
});

test('every inspector display, trigger and inverse predicate has explicit classification in both ontologies', () => {
  const classification = require('../../../robos-graph/lib/classification');
  const predicates = new Set(GROUPS.flatMap(group => [
    ...group.properties, ...group.incoming, ...(group.triggerProperties || []),
  ]));
  const codeIds = new Set(classification.CATALOG.map(category => category.id));
  const ontologies = ['docs/schemas/ontology.jsonld', '.robos/ontology.jsonld'].map(relative => {
    const document = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    return new Map(document['@graph'].map(node => [node['@id'], node]));
  });
  for (const predicate of predicates) {
    assert.ok(Object.hasOwn(classification.PREDICATE_CODES, predicate), `${predicate}: missing explicit mapping`);
    const references = classification.resolveSchemaElement(predicate);
    assert.ok(references.length, `${predicate}: unclassified inspector field`);
    for (const reference of references) assert.ok(codeIds.has(reference['@id']), `${predicate}: unknown classification code`);
    if (predicate.startsWith('robos:')) assert.deepEqual(
      classification.resolveSchemaElement(predicate.replace('robos:', 'https://robos.dev/ns/sdlc#')), references);
    for (const ontology of ontologies) {
      assert.equal(ontology.get(predicate)?.['@type'], 'rdf:Property', predicate);
      assert.deepEqual(ontology.get(predicate)['robos:classification'], references, predicate);
    }
  }
  for (const [predicate, category] of [
    ['robos:toolOfServer', 'agents'], ['robos:endpointOf', 'contracts'],
    ['robos:columnOfTable', 'data'], ['robos:appVersion', 'applications'],
    ['robos:stageOfPipeline', 'infrastructure'], ['robos:stateScope', 'schema'],
  ]) assert.ok(classification.PREDICATE_CODES[predicate].includes(category), `${predicate}: incorrect domain`);
});

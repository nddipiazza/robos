'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const runner = require('../../../robos-graph/renderer/try-it-runner');
const groupsHelper = require('../../../robos-graph/lib/inspector-property-groups');

const root = path.resolve(__dirname, '../../../..');
const kgraphDoc = JSON.parse(fs.readFileSync(path.join(root, '.robos/knowledge-graph.jsonld'), 'utf8'));
const kgraphNodes = kgraphDoc['@graph'] || kgraphDoc['robos:nodes'] || [];

test('hasEndpoints discovers REST contracts, services, gRPC, GraphQL, MCP and APIEndpoints', () => {
  const cases = [
    ['urn:robos:contract:payment-gateway-v1', true, 'rest'],
    ['urn:robos:service:billing-api', true, 'grpc'], // implements orders-grpc and has rest endpoints
    ['urn:robos:contract:orders-grpc', true, 'grpc'],
    ['urn:robos:contract:catalog-graphql', true, 'graphql'],
    ['urn:robos:mcp:context-engine', true, 'mcp'],
    ['urn:robos:endpoint:billing-invoices-list', true, 'rest'],
    ['urn:robos:team:order-processing', false, null]
  ];

  for (const [id, expectedHasEndpoints, expectedProtocol] of cases) {
    const node = kgraphNodes.find(n => n['@id'] === id);
    assert.ok(node, `Node ${id} must exist in knowledge-graph.jsonld`);
    assert.equal(runner.hasEndpoints(node, kgraphNodes), expectedHasEndpoints, `hasEndpoints for ${id}`);
    if (expectedHasEndpoints) {
      const def = runner.extractDefinition(node, kgraphNodes);
      assert.ok(def, `Definition must be extracted for ${id}`);
      if (expectedProtocol) {
        assert.equal(def.protocol, expectedProtocol, `Protocol for ${id}`);
      }
    }
  }
});

test('extractDefinition parses OpenAPI YAML and extracts parameters and responses', () => {
  const contract = kgraphNodes.find(n => n['@id'] === 'urn:robos:contract:payment-gateway-v1');
  assert.ok(contract);
  const def = runner.extractDefinition(contract, kgraphNodes);
  assert.equal(def.protocol, 'rest');
  assert.ok(def.endpoints.length >= 4, 'Must extract at least 4 endpoints from contract');

  const getById = def.endpoints.find(e => e.path.includes('{id}'));
  assert.ok(getById, 'Must find {id} endpoint');
  assert.equal(getById.method, 'GET');
  assert.ok(getById.parameters.some(p => p.name === 'id' && p.in === 'path'), 'Must extract path parameter');

  const postEp = def.endpoints.find(e => e.method === 'POST');
  assert.ok(postEp, 'Must find POST endpoint');
  assert.ok(postEp.requestBody, 'POST endpoint must have requestBody');
});

test('extractDefinition extracts gRPC methods with package and RPC details', () => {
  const grpcContract = kgraphNodes.find(n => n['@id'] === 'urn:robos:contract:orders-grpc');
  assert.ok(grpcContract);
  const def = runner.extractDefinition(grpcContract, kgraphNodes);
  assert.equal(def.protocol, 'grpc');
  assert.equal(def.grpcMethods.length, 4);

  const createOrder = def.grpcMethods.find(m => m.name === 'CreateOrder');
  assert.ok(createOrder);
  assert.equal(createOrder.packageName, 'acme.orders.v1');
  assert.ok(createOrder.sampleRequest, 'Must have sample request payload');
  assert.ok(createOrder.sampleResponse, 'Must have sample response payload');
});

test('extractDefinition extracts GraphQL operations and SDL schema', () => {
  const gqlContract = kgraphNodes.find(n => n['@id'] === 'urn:robos:contract:catalog-graphql');
  assert.ok(gqlContract);
  const def = runner.extractDefinition(gqlContract, kgraphNodes);
  assert.equal(def.protocol, 'graphql');
  assert.ok(def.graphql.sdlSchema.includes('type Query'));
  assert.ok(def.graphql.operations.length >= 2);
});

test('extractDefinition extracts MCP tools and parameter schemas', () => {
  const mcpServer = kgraphNodes.find(n => n['@id'] === 'urn:robos:mcp:context-engine');
  assert.ok(mcpServer);
  const def = runner.extractDefinition(mcpServer, kgraphNodes);
  assert.equal(def.protocol, 'mcp');
  assert.ok(def.mcp.tools.length >= 3);
  const astTool = def.mcp.tools.find(t => t.name === 'ast_search');
  assert.ok(astTool);
  assert.ok(astTool.inputSchema.properties.query);
});

test('executeRest replaces path parameters, appends query params, and formats cURL command', async () => {
  const ep = {
    path: '/api/v1/invoices/{id}',
    method: 'GET',
    description: 'Get invoice details',
    parameters: [
      { name: 'id', in: 'path', required: true },
      { name: 'fields', in: 'query' }
    ]
  };
  const res = await runner.executeRest(ep, 'http://localhost:8080', { id: 'inv_4002', fields: 'status,amount' }, '');
  assert.equal(res.url, 'http://localhost:8080/api/v1/invoices/inv_4002?fields=status%2Camount');
  assert.equal(res.method, 'GET');
  assert.equal(res.status, 200);
  assert.ok(res.curl.includes('curl -X GET "http://localhost:8080/api/v1/invoices/inv_4002?fields=status%2Camount"'));
  assert.ok(res.data, 'Must return response data');
});

test('enriched kgraph nodes eliminate single-property groups, leaving only intentional hidden stubs', () => {
  const singlePropGroups = [];
  for (const node of kgraphNodes) {
    const grps = groupsHelper.groups(node, kgraphNodes);
    for (const g of grps) {
      if (g.fields.length + g.related.length <= 1) {
        singlePropGroups.push({ id: node['@id'], group: g.id });
      }
    }
  }
  // All teams, console apps, test suites, sources, and walkthroughs were enriched with substantive data
  assert.ok(singlePropGroups.length <= 1, `Expected at most 1 single-property group stub, got ${singlePropGroups.length}`);
});

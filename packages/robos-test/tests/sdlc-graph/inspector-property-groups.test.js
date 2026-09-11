'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { groups, present } = require('../../../robos-graph/lib/inspector-property-groups');
const node = (id, type, properties = {}) => ({ '@id': id, '@type': type, ...properties });
test('domain groups require recorded data, not just a type or empty values', () => {
  for (const value of [null, '', ' ', [], {}, { input: [] }]) assert.equal(present(value), false);
  for (const value of [false, 0, { required: false }, ['value']]) assert.equal(present(value), true);
  assert.deepEqual(groups(node('a', 'robos:MCPServer')), []);
  assert.deepEqual(groups(node('a', 'robos:MCPServer', { 'robos:transport': ' ', 'robos:toolsProvided': [] })), []);
  assert.deepEqual(groups(node('a', 'example:Unrelated', { 'robos:transport': 'stdio' })), []);
});
test('MCP server discovers inverse tool declarations without requiring duplicate forward links', () => {
  const server = node('urn:server', 'robos:MCPServer');
  const tool = node('urn:tool', 'robos:MCPTool', { 'robos:toolOfServer': [{ '@id': 'urn:server' }, { '@id': 'urn:server' }], 'robos:toolName': 'search' });
  const result = groups(server, [server, tool]);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'MCP Server');
  assert.equal(result[0].related.length, 1);
  assert.equal(result[0].related[0].node, tool);
  assert.equal(result[0].related[0].direction, 'incoming');
});
test('full namespace IRIs and multi-typed objects retain domain groups', () => {
  const server = node('urn:server', ['example:Marker', 'https://robos.dev/ns/sdlc#MCPServer'], { 'https://robos.dev/ns/sdlc#transport': 'stdio' });
  const result = groups(server, [server]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, [{ predicate: 'robos:transport', value: 'stdio' }]);
});
test('unresolved references remain visible facts while absent related nodes are never invented', () => {
  const server = node('urn:server', 'robos:MCPServer', { 'robos:toolsProvided': [{ '@id': 'urn:missing' }] });
  const result = groups(server, [server]);
  assert.equal(result.length, 1);
  assert.equal(result[0].fields.length, 1);
  assert.deepEqual(result[0].related, []);
});
test('new graph snapshots refresh inverse indexes and remove obsolete contextual groups', () => {
  const server = node('urn:server', 'robos:MCPServer');
  const tool = node('urn:tool', 'robos:MCPTool', { 'robos:toolOfServer': { '@id': 'urn:server' } });
  assert.ok(groups(server, [server, tool]).length);
  assert.deepEqual(groups(server, [server]), []);
});

test('schema child membership is navigable but does not become dependency impact',()=>{
 const {predicateKind,dependencyEdges,nodeRelations}=require('../../../robos-graph/lib/relationships');
 const parent=node('urn:server','robos:MCPServer');
 const tool=node('urn:tool','robos:MCPTool',{'robos:toolOfServer':{'@id':'urn:server'}});
 assert.equal(predicateKind('robos:toolOfServer'),'reference');
 assert.equal(predicateKind('robos:tableOfSchema'),'reference');
 assert.equal(predicateKind('oslc_qm:reportsOnTestCase'),'reference');
 assert.equal(nodeRelations(tool,new Set([parent['@id'],tool['@id']])).length,1);
 assert.deepEqual(dependencyEdges([parent,tool]),[]);
});

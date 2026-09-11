'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { buildTopology } = require('../../../robos-graph/lib/topology');
const { nodeRelations } = require('../../../robos-graph/lib/relationships');
const nodes = [
 { '@id': 'urn:test:root', 'robos:package': 'one', 'robos:uses': { '@id': 'urn:test:data' }, 'robos:calls': ['urn:test:api'], 'robos:relatedTo': { '@id': 'urn:test:doc' } },
 { '@id': 'urn:test:data', 'robos:package': 'one' }, { '@id': 'urn:test:api', 'robos:package': 'two' },
 { '@id': 'urn:test:doc', 'robos:package': 'one' }, { '@id': 'urn:test:false', 'robos:package': 'one', 'dcterms:description': 'mentions urn:test:root but is not a link' }
];
const ids = new Set(nodes.map(n => n['@id'])), edges = nodes.flatMap(n => nodeRelations(n, ids));
test('topology uses exact resolved object/array/string links and excludes prose matches', () => {
 const graph = buildTopology(nodes, edges, { rootId: 'urn:test:root' });
 assert.equal(graph.nodes.length, 4); assert.equal(graph.edges.length, 3);
 assert.ok(!graph.nodes.some(n => n['@id'] === 'urn:test:false'));
 assert.equal(graph.edges.filter(e=>e.kind==='dependency').length,2);
 assert.equal(graph.edges.filter(e=>e.kind==='reference').length,1);
 assert.deepEqual(buildTopology(nodes.slice().reverse(),edges.slice().reverse(),{rootId:'urn:test:root'}),graph);
});
test('package scope excludes external endpoints; bounded all scope prioritizes connected nodes over isolates', () => {
 assert.equal(buildTopology(nodes,edges,{rootId:'urn:test:root',scope:'package'}).edges.length,2);
 const universe = Array.from({length:70},(_,i)=>({'@id':`urn:isolate:${i}`})).concat(nodes);
 const graph = buildTopology(universe,edges,{rootId:'urn:test:root',scope:'all',maxNodes:4});
 assert.equal(graph.edges.length,3); assert.equal(graph.omittedNodes,71);
 assert.ok(graph.nodes.every(n=>!n['@id'].startsWith('urn:isolate:')));
 assert.equal(buildTopology(nodes,edges,{rootId:'urn:test:root',maxEdges:1}).omittedEdges,2);
});

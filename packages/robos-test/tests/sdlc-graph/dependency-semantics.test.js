'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OSLCGraphParser } = require('../../../robos-graph/lib/oslc-parser');
const { nodeRelations } = require('../../../robos-graph/lib/relationships');
const { linkProtobufDependencies } = require('../../../robos-graph/lib/source-dependencies');
const ref = id => ({ '@id': id });
const node = (id, props = {}) => ({ '@id': id, '@type': ['robos:SourceArtifact'], 'dcterms:title': id, ...props });
test('impact separates dependencies from repository membership and supports JSON-LD refs and cycles', () => {
  const a = node('urn:x:a', { 'robos:calls': ref('urn:x:b'), 'robos:inRepository': ref('urn:x:repo') });
  const b = node('urn:x:b', { 'robos:uses': ref('urn:x:c'), 'robos:dependsOn': [ref('urn:x:a')] });
  const c = node('urn:x:c');
  const parser = new OSLCGraphParser({ 'robos:nodes': [a,b,c,node('urn:x:repo')] });
  const impact = parser.findDependents('urn:x:c', 3);
  assert.deepEqual(impact.dependents.map(d => [d.node['@id'],d.depth]), [['urn:x:b',1],['urn:x:a',2]]);
  assert.equal(parser.findDependents('urn:x:repo').dependents.length, 0);
  assert.deepEqual(parser.findDependents('urn:x:a',1).dependencies.map(d => d.node['@id']), ['urn:x:b']);
  assert.ok(!parser.findDependents('urn:x:a').dependents.some(d => d.node['@id']==='urn:x:a'));
});
test('arbitrary literal URNs and nested evidence are not relationships', () => {
  const n = node('urn:x:a', { 'dcterms:description': 'urn:x:b', 'robos:relationshipEvidence': [{ target: ref('urn:x:c') }], 'robos:customLink': ref('urn:x:d') });
  assert.deepEqual(nodeRelations(n).map(e => [e.predicate,e.to,e.kind]), [['robos:customLink','urn:x:d','unclassified']]);
});
test('proto imports, scoped field references and RPC IO produce directed evidenced dependencies', () => {
  const evidence = line => [{ repository:'x',path:'api.proto',line }];
  const artifact = 'urn:x:api'; const common = 'urn:x:common';
  const c = node(artifact+'#contract',{'robos:derivedFrom':ref(artifact)});
  const imported = node(common+'#contract',{'robos:derivedFrom':ref(common)});
  const msg = (id,name,source) => node(id,{'@type':['robos:DataModel'],'robos:derivedFrom':ref(source),'robos:modelName':name});
  const request=msg(artifact+'#req','Request',artifact), entry=msg(common+'#entry','Entry',common);
  const rpc=node(artifact+'#get',{'robos:derivedFrom':ref(artifact),'robos:sourceKind':'protobuf-rpc','dcterms:title':'Catalog.Get'});
  const sources=[{repository:'x',file:'api.proto',text:'package api;\nimport "common.proto";\nmessage Request { common.Entry item = 1; }\nservice Catalog { rpc Get(Request) returns (common.Entry); }',contract:c,evidence}, {repository:'x',file:'common.proto',text:'package common;\nmessage Entry { string name = 1; }',contract:imported,evidence}];
  const warnings=[]; linkProtobufDependencies([c,imported,request,entry,rpc],sources,warnings);
  assert.deepEqual(c['robos:imports'],[ref(imported['@id'])]);
  assert.deepEqual(request['robos:fieldType'],[ref(entry['@id'])]);
  assert.deepEqual(rpc['robos:inputType'],[ref(request['@id'])]);
  assert.deepEqual(rpc['robos:outputType'],[ref(entry['@id'])]);
  assert.equal(rpc['robos:relationshipEvidence'][0].evidence[0].line,4);
  assert.deepEqual(warnings,[]);
  // Missing import must not resolve merely because the symbol exists elsewhere.
  delete request['robos:fieldType']; delete request['robos:relationshipEvidence'];
  sources[0].text='package api; message Request { common.Entry item = 1; }';
  linkProtobufDependencies([c,imported,request,entry,rpc],sources,warnings);
  assert.equal(request['robos:fieldType'],undefined);
  assert.ok(warnings.some(w=>w.code==='unresolved-protobuf-type'));
});

test('public import traversal terminates on cycles and is independent of source order', () => {
  for (const reverse of [false, true]) {
    const nodes = [];
    const source = (file, text, modelName) => {
      const artifact = 'urn:cycle:' + file;
      const contract = node(artifact + '#contract', { 'robos:derivedFrom': ref(artifact) });
      const model = node(artifact + '#model', {
        '@type': ['robos:DataModel'], 'robos:derivedFrom': ref(artifact), 'robos:modelName': modelName,
      });
      nodes.push(contract, model);
      return { repository: 'cycle', file, text, contract, evidence: line => [{ repository: 'cycle', path: file, line }] };
    };
    const sources = [
      source('a.proto', 'package cycle;\nimport "b.proto";\nmessage A { C child = 1; }', 'A'),
      source('b.proto', 'package cycle;\nimport public "c.proto";\nmessage B {}', 'B'),
      source('c.proto', 'package cycle;\nimport public "b.proto";\nmessage C {}', 'C'),
    ];
    if (reverse) sources.reverse();
    const warnings = [];
    linkProtobufDependencies(nodes, sources, warnings);
    const a = nodes.find(n => n['robos:modelName'] === 'A');
    const c = nodes.find(n => n['robos:modelName'] === 'C');
    assert.deepEqual(a['robos:fieldType'], [ref(c['@id'])]);
    assert.deepEqual(warnings, []);
  }
});

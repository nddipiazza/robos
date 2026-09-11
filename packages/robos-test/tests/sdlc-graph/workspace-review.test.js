'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { WorkspaceReview } = require('../../../robos-graph/lib/workspace-review');
const { hash } = require('../../../robos-graph/lib/graph-workspace');
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const review = new WorkspaceReview(root), ws = review.workspace;
  const nodes = ['one', 'two'].map(name => ({ '@id': `urn:example:${name}`, '@type': ['robos:Project'], 'dcterms:title': name, 'robos:package': 'organization', 'robos:status': 'active', 'robos:evidence': [{ repository: 'example', path: 'README.md', line: 1 }] }));
  nodes[0]['robos:dependsOn'] = { '@id': nodes[1]['@id'] };
  ws.apply(ws.propose({ document: { ...ws.empty(), 'robos:nodes': nodes } }));
  return { review, ws };
}
test('scoped agent context includes object-reference neighbors, relevant shapes and evidence', t => {
  const { review } = setup(t);
  const brief = review.context({ query: 'one', limit: 1 });
  assert.equal(brief.nodes.length, 1);
  assert.equal(brief.relatedNodes[0]['@id'], 'urn:example:two');
  assert.ok(brief.shapes.length);
  assert.equal(brief.nodes[0]['robos:evidence'][0].path, 'README.md');
  assert.throws(() => review.context({ limit: 201 }), /limit/);
  assert.throws(() => review.context({ prompt: 'x'.repeat(20001) }), /20,000/);
});
test('configured agent HTTP response creates only a proposal; malformed and stale results cannot save', async t => {
  const { review, ws } = setup(t);
  let body, response = '{bad', changeWhileRunning = false;
  const server = http.createServer((req, res) => {
    let data = ''; req.on('data', b => { data += b; });
    req.on('end', () => {
      body = JSON.parse(data);
      if (changeWhileRunning) ws.apply(ws.propose({ mode: 'refine', edits: [{ op: 'update', id: 'urn:example:two', set: { 'dcterms:title': 'Concurrent edit' } }] }));
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ output: response }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const config = { url: `http://127.0.0.1:${server.address().port}`, harnessId: 'test-contract', model: 'test-contract' };
  const initial = hash(ws.read());
  await assert.rejects(review.askAgent({ query: 'one' }, config), /structured JSON/);
  assert.equal(hash(ws.read()), initial);
  response = JSON.stringify({ edits: [{ op: 'update', id: 'urn:example:one', set: { 'dcterms:title': 'Reviewed name' } }], questions: ['Who owns this project?'] });
  const result = await review.askAgent({ prompt: 'Clarify title', query: 'one' }, config);
  assert.equal(JSON.parse(body.input).prompt, 'Clarify title');
  assert.equal(result.proposal.delta.changed.length, 1);
  assert.equal(result.questions.length, 1);
  assert.equal(hash(ws.read()), initial);
  changeWhileRunning = true;
  await assert.rejects(review.askAgent({ query: 'one' }, config), /Graph changed/);
  assert.equal(ws.read()['robos:nodes'].find(n => n['@id'] === 'urn:example:one')['dcterms:title'], 'one');
});

test('source shapes are registered in the ontology and generic technologies are separate identities', () => {
  const { SOURCE_SHAPES } = require('../../../robos-graph/lib/source-shapes');
  const root = path.resolve(__dirname, '../../../..');
  const ontology = JSON.parse(fs.readFileSync(path.join(root, '.robos/ontology.jsonld')));
  for (const shape of SOURCE_SHAPES) {
    const term = ontology['@graph'].find(n => n['@id'] === shape.targetClass);
    assert.ok(term, shape.targetClass);
    assert.equal(term['rdfs:subClassOf']['@id'], shape.schemaOrgType);
    assert.equal(term['robos:shaclShape'], shape.shapeId);
  }
  const { SchemaRegistry } = require('../../../schema-studio/lib/schema-registry');
  const registry = new SchemaRegistry(); registry.init();
  assert.ok(registry.robosClassMap.Service.some(s => s.shapeId === 'robos:BrokerDefinitionShape'));
  assert.equal(registry.validateJsonLd({ '@type': 'robos:BrokerDefinition' }).matchedClass, 'Service');
  const core = JSON.parse(fs.readFileSync(path.join(root, '.robos/kgraphs/core-platform/package.jsonld')));
  const nats = core['robos:nodes'].find(n => n['@id'] === 'https://robos.dev/ns/technology#nats-jetstream');
  assert.ok(nats);
  assert.equal(nats['robos:endpoint'], undefined);
  assert.equal(nats['robos:ownerTeam'], undefined);
});
test('review prompt metadata cannot change graph content during unchanged source reimport', t => {
  const {review,ws}=setup(t);
  const before=hash(ws.read());
  const proposal=review.propose({...ws.read(),prompt:'Reimport the unchanged source baseline',questions:[]});
  assert.equal(proposal.prompt,'Reimport the unchanged source baseline');
  assert.equal(proposal.candidate.prompt,undefined);
  assert.equal(proposal.candidate.questions,undefined);
  assert.equal(hash(proposal.candidate),before);
  assert.equal(ws.apply(proposal).changed,false);
});

test('multi-property import proposal survives canonical JSON save/load before apply', t => {
  const {ws}=setup(t);
  const doc=ws.read();doc['robos:nodes'][0]['robos:zNew']='last';doc['robos:nodes'][0]['robos:aNew']='first';
  const {serialize}=require('../../../robos-graph/lib/graph-workspace');
  const proposal=JSON.parse(serialize(ws.propose({document:doc,requireEvidence:true})));
  assert.equal(ws.apply(proposal).changed,true);
  assert.equal(ws.read()['robos:nodes'][0]['robos:aNew'],'first');
});

test('IPC review sends only changed evidence and applies only the retained reviewed proposal', t => {
  const { review, ws } = setup(t);
  const proposal = review.propose({ edits: [{op:'update', id:'urn:example:one', set:{'dcterms:title':'reviewed'}}] });
  const preview = review.preview(proposal);
  assert.equal(preview.baseline, undefined);
  assert.equal(preview.request, undefined);
  assert.equal(preview.candidate['robos:nodes'].length, 1);
  assert.throws(() => review.applyReviewed('unreviewed'), /reviewed ID/);
  review.applyReviewed(preview.id);
  assert.equal(ws.read()['robos:nodes'].find(n => n['@id']==='urn:example:one')['dcterms:title'], 'reviewed');
  assert.throws(() => review.applyReviewed(preview.id), /reviewed ID/);
});

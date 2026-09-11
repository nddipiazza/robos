'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSDLCTools } = require('../../../ekgraph-mcp/sdlc-tools');
const { GraphWorkspace, hash } = require('../../../robos-graph/lib/graph-workspace');
const { workspaceCommand } = require('../../../robos-graph/lib/workspace-commands');
const { MCPServer } = require('../../../robos-mcp-lib/index');

const node = (index, properties = {}) => ({
  '@id': `urn:sample:item:${index}`, '@type': ['robos:DocumentationPage'], 'dcterms:title': `Document ${index}`,
  'robos:package': 'documentation', 'robos:slug': `doc-${index}`, 'robos:docPath': `docs/${index}.md`,
  'robos:sourcePath': `docs/${index}.md`, 'robos:evidenceStatus': 'documented',
  'robos:evidence': [{ repository: 'sample', path: `docs/${index}.md`, line: 1, revision: 'a'.repeat(40), sha256: 'b'.repeat(64) }], ...properties,
});
function fixture(t, nodes = [node(0), node(1, { 'robos:dependsOn': { '@id': 'urn:sample:item:0' } })]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-mcp-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = new GraphWorkspace(root);
  const document = { ...workspace.empty('Sample system'), '@id': 'urn:sample:graph:system', 'robos:nodes': nodes };
  workspace.apply(workspace.propose({ document, mode: 'replace', requireEvidence: true }));
  const definitions = createSDLCTools({ graphRoot: root });
  return { root, workspace, definitions, call: (name, args) => definitions.find(t => t.name === `robos_sdlc_${name}`).handler(args) };
}
function canonicalSnapshot(workspace) {
  const files = ['knowledge-graph.jsonld', 'import-state.json', 'kgraph.yaml', ...fs.readdirSync(path.join(workspace.root, 'kgraphs')).map(p => `kgraphs/${p}/package.jsonld`)];
  return Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(workspace.root, file), 'utf8')]));
}

test('exposes existing MCP definition format, safe annotations and shared CLI graph identity', async t => {
  const { root, workspace, definitions, call } = fixture(t);
  assert.deepEqual(definitions.map(t => t.name), ['robos_sdlc_inspect', 'robos_sdlc_query', 'robos_sdlc_propose', 'robos_sdlc_apply']);
  const before = canonicalSnapshot(workspace);
  const output = path.join(root, 'cli-inspect.json');
  const cli = workspaceCommand('inspect', { 'graph-root': root, output });
  const inspect = await call('inspect');
  assert.equal(inspect.revision, cli.revision);
  assert.equal(inspect.nodeCount, cli.nodes);
  assert.equal(inspect.graphId, 'urn:sample:graph:system');
  assert.equal(inspect.title, cli.title);
  assert.ok(!JSON.stringify(inspect).includes(root));
  assert.deepEqual(canonicalSnapshot(workspace), before);
  assert.equal(definitions[0].annotations.readOnlyHint, true);
  assert.equal(definitions[2].annotations.readOnlyHint, false);
  assert.equal(definitions[2].annotations.destructiveHint, false);
  assert.equal(definitions[3].annotations.destructiveHint, true);
  assert.equal(definitions[3].annotations.idempotentHint, false);
  const server = new MCPServer({ tools: definitions });
  const response = await server.handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'robos_sdlc_query', arguments: { id: 'urn:sample:item:0' } } });
  assert.equal(response.result.isError, undefined);
  assert.deepEqual(JSON.parse(response.result.content[0].text).nodes[0]['robos:evidence'], node(0)['robos:evidence']);
});

test('absent configuration exposes no tools; invalid or uninitialized roots never load demo data', t => {
  assert.deepEqual(createSDLCTools(), []);
  assert.deepEqual(createSDLCTools({ graphRoot: null }), []);
  for (const graphRoot of ['', '.', 1, '/nonexistent-sample-sdlc-root']) assert.throws(() => createSDLCTools({ graphRoot }), /configured|Configured|explicit/);
  const { root } = fixture(t);
  const uninitialized = path.join(root, 'uninitialized');
  fs.mkdirSync(path.join(uninitialized, '.robos'), { recursive: true });
  assert.throws(() => createSDLCTools({ graphRoot: uninitialized }), /initialize/);
  assert.deepEqual(fs.readdirSync(path.join(uninitialized, '.robos')), []);
});

test('query filters and pagination preserve evidence and traverse object references in either direction', async t => {
  const { call } = fixture(t, [node(0), node(1, { 'robos:dependsOn': { '@id': 'urn:sample:item:0' } }), node(2, { 'robos:dependsOn': [{ '@id': 'urn:sample:item:1' }] })]);
  const page1 = await call('query', { limit: 1, offset: 0, type: 'DocumentationPage', package: 'documentation', path: 'docs' });
  assert.equal(page1.total, 3); assert.equal(page1.nextOffset, 1);
  assert.equal(page1.nodes[0]['@id'], 'urn:sample:item:0');
  const page2 = await call('query', { limit: 1, offset: page1.nextOffset });
  assert.equal(page2.nodes[0]['@id'], 'urn:sample:item:1');
  assert.equal((await call('query', { search: 'Document 2' })).nodes.length, 1);
  assert.equal((await call('query', { id: 'urn:sample:missing' })).nodes.length, 0);
  assert.equal((await call('query', { path: 'docs/0.md' })).nodes.length, 1);
  const traversal = await call('query', { id: 'urn:sample:item:0', direction: 'incoming', depth: 2 });
  assert.equal(traversal.total, 3);
  assert.deepEqual(traversal.nodes[0]['robos:evidence'], node(0)['robos:evidence']);
  const outgoing = await call('query', { id: 'urn:sample:item:2', direction: 'outgoing', depth: 1 });
  assert.deepEqual(outgoing.nodes.map(n => n['@id']), ['urn:sample:item:1', 'urn:sample:item:2']);
  assert.equal((await call('query', { offset: 99 })).nextOffset, null);
});

test('enforces runtime bounds and rejects arbitrary root/path arguments even without schema validation', async t => {
  const { call, root } = fixture(t);
  for (const args of [{ limit: 101 }, { limit: 0 }, { limit: 1.5 }, { limit: '2' }, { offset: -1 }, { offset: Number.MAX_SAFE_INTEGER + 1 }, { depth: 6, id: 'urn:sample:item:0' }, { direction: 'sideways' }, { direction: 'incoming' }, { graphRoot: root }, { path: '../secrets' }, { path: '/etc/passwd' }, { search: {} }]) await assert.rejects(call('query', args));
  await assert.rejects(call('inspect', { limit: 101 }));
  await assert.rejects(call('apply', { proposalId: '../outside' }), /hash/);
  await assert.rejects(call('apply', { proposalId: 'a'.repeat(64), file: '/some/file' }), /unsupported/);
  await assert.rejects(call('apply', { proposalId: 'a'.repeat(64) }), /not found/);
});

test('propose persists a hash-addressed draft only; apply updates the same canonical CLI graph', async t => {
  const { root, workspace, call } = fixture(t);
  const before = canonicalSnapshot(workspace), revision = (await call('inspect')).revision;
  const args = { baseRevision: revision, edits: [{ op: 'update', id: 'urn:sample:item:0', set: { 'dcterms:title': 'Revised document' } }] };
  const proposal = await call('propose', args);
  assert.match(proposal.proposalId, /^[a-f0-9]{64}$/);
  assert.equal(proposal.candidate, undefined);
  assert.equal(proposal.validation.conforms, true);
  assert.deepEqual(proposal.delta, { added: 0, changed: 1, removed: 0 });
  assert.deepEqual(canonicalSnapshot(workspace), before);
  const file = path.join(workspace.root, 'proposals', `${proposal.proposalId}.json`);
  const draft = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(draft.requireEvidence, true);
  assert.equal(draft.base, revision);
  assert.equal(draft.candidate['robos:nodes'][0]['dcterms:title'], 'Revised document');
  assert.equal((await call('propose', args)).proposalId, proposal.proposalId);
  const applied = await call('apply', { proposalId: proposal.proposalId });
  assert.equal(applied.changed, true);
  const cli = workspaceCommand('inspect', { 'graph-root': root, output: path.join(root, 'after.json') });
  assert.equal(cli.revision, applied.revision);
  assert.equal((await call('query', { id: 'urn:sample:item:0' })).nodes[0]['dcterms:title'], 'Revised document');
  await assert.rejects(call('apply', { proposalId: proposal.proposalId }), /Stale proposal/);
});

test('rejects stale base revisions, stale saved drafts and tampered proposal content', async t => {
  const { workspace, call } = fixture(t);
  const baseRevision = (await call('inspect')).revision;
  const edits = [{ op: 'update', id: 'urn:sample:item:0', set: { 'dcterms:title': 'First draft' } }];
  await assert.rejects(call('propose', { baseRevision: 'f'.repeat(64), edits }), /Stale baseRevision/);
  assert.equal(fs.existsSync(path.join(workspace.root, 'proposals')), false);
  const first = await call('propose', { baseRevision, edits });
  const second = await call('propose', { baseRevision, edits: [{ op: 'update', id: 'urn:sample:item:1', set: { 'dcterms:title': 'Second draft' } }] });
  await call('apply', { proposalId: second.proposalId });
  await assert.rejects(call('apply', { proposalId: first.proposalId }), /Stale proposal/);
  const file = path.join(workspace.root, 'proposals', `${first.proposalId}.json`), draft = JSON.parse(fs.readFileSync(file));
  draft.candidate['robos:nodes'][0]['dcterms:title'] = 'Tampered';
  fs.writeFileSync(file, JSON.stringify(draft));
  await assert.rejects(call('apply', { proposalId: first.proposalId }), /does not match its ID/);
});

test('invalid edits and evidence-less candidates cannot modify canonical graph', async t => {
  const { workspace, call } = fixture(t);
  const before = canonicalSnapshot(workspace), baseRevision = hash(workspace.read());
  for (const edits of [[], [{ op: 'execute', command: 'anything' }], [{ op: 'update', id: 'urn:sample:item:0', set: [] }], [{ op: 'remove' }], Array.from({ length: 101 }, () => ({ op: 'remove', id: 'urn:sample:item:0' }))]) await assert.rejects(call('propose', { baseRevision, edits }));
  const missingEvidence = node(3); delete missingEvidence['robos:evidence'];
  const proposal = await call('propose', { baseRevision, edits: [{ op: 'add', node: missingEvidence }] });
  assert.equal(proposal.validation.conforms, false);
  await assert.rejects(call('apply', { proposalId: proposal.proposalId }), /missing evidence/);
  assert.deepEqual(canonicalSnapshot(workspace), before);
});

test('proposal storage rejects directory and file symlinks', async t => {
  const { root, workspace, call } = fixture(t);
  const elsewhere = path.join(root, 'elsewhere'); fs.mkdirSync(elsewhere);
  const directory = path.join(workspace.root, 'proposals'); fs.symlinkSync(elsewhere, directory);
  const baseRevision = hash(workspace.read()), edits = [{ op: 'update', id: 'urn:sample:item:0', set: { 'dcterms:title': 'Update' } }];
  await assert.rejects(call('propose', { baseRevision, edits }), /symbolic link/);
  assert.deepEqual(fs.readdirSync(elsewhere), []);
  fs.unlinkSync(directory); fs.mkdirSync(directory);
  fs.symlinkSync(workspace.file, path.join(directory, `${'a'.repeat(64)}.json`));
  await assert.rejects(call('apply', { proposalId: 'a'.repeat(64) }), /unreadable/);
});

test('context byte budget paginates whole nodes without losing evidence and refuses oversized nodes', async t => {
  const payload = 'x'.repeat(150 * 1024);
  const { call } = fixture(t, [node(0, { 'dcterms:description': payload }), node(1, { 'dcterms:description': payload })]);
  const result = await call('query', { limit: 100 });
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nextOffset, 1);
  assert.deepEqual(result.nodes[0]['robos:evidence'], node(0)['robos:evidence']);
  const oversized = fixture(t, [node(0, { 'dcterms:description': payload.repeat(2) })]);
  await assert.rejects(oversized.call('query'), /context budget/);
});

test('traversal caps discovered nodes and reports partial totals while pages stay bounded', async t => {
  const nodes = Array.from({ length: 1005 }, (_, index) => node(index));
  nodes[0]['robos:dependsOn'] = nodes.slice(1).map(n => ({ '@id': n['@id'] }));
  const { call } = fixture(t, nodes);
  const result = await call('query', { id: nodes[0]['@id'], direction: 'outgoing', limit: 100 });
  assert.equal(result.total, 1000);
  assert.equal(result.nodes.length, 100);
  assert.equal(result.traversalTruncated, true);
  assert.equal(result.totalIsExact, false);
  assert.equal(result.nextOffset, 100);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 256 * 1024);
});

test('source import state changes invalidate saved drafts even if graph revision is unchanged', async t => {
  const { workspace, call } = fixture(t);
  const baseRevision = hash(workspace.read());
  const proposal = await call('propose', { baseRevision, edits: [{ op: 'update', id: 'urn:sample:item:0', set: { 'dcterms:title': 'New title' } }] });
  const state = workspace.state(); state.extracted = [node(0)];
  fs.writeFileSync(workspace.stateFile, JSON.stringify(state));
  assert.equal(hash(workspace.read()), baseRevision);
  await assert.rejects(call('apply', { proposalId: proposal.proposalId }), /Stale proposal/);
});

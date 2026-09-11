'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const { GraphWorkspace, hash, serialize, validateDocument } = require('../../../robos-graph/lib/graph-workspace');
const { SDLCKnowledgeGraphStore } = require('../../../robos-graph/lib/graph-store');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-workspace-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, ws: new GraphWorkspace(path.join(dir, 'project')) };
}
const node = (id = 'urn:example:project:one', title = 'One') => ({ '@id': id, '@type': ['robos:Project'], 'dcterms:title': title, 'robos:status': 'active', 'robos:package': 'organization' });
const doc = (ws, nodes) => ({ ...ws.empty('Example'), 'robos:nodes': nodes });

test('external inspection stays empty and creates no files, including through the legacy store', t => {
  const { dir, ws } = fixture(t);
  assert.deepEqual(ws.read()['robos:nodes'], []);
  const store = new SDLCKnowledgeGraphStore({ graphRoot: path.join(dir, 'project') });
  assert.deepEqual(store.query({}), []);
  assert.equal(store.listBranches().length, 1);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('initialization, all standard packages, custom packages and fresh-location round trip', t => {
  const { dir, ws } = fixture(t);
  ws.apply(ws.propose({ mode: 'replace', document: ws.empty() }));
  assert.equal(fs.readdirSync(path.join(ws.root, 'kgraphs')).length, 8);
  const n = { ...node(), 'robos:package': 'custom-domain' };
  ws.apply(ws.propose({ document: doc(ws, [n]) }));
  assert.equal(ws.read()['robos:nodes'][0]['robos:package'], 'custom-domain');
  const copied = path.join(dir, 'copied');
  fs.cpSync(ws.root, path.join(copied, '.robos'), { recursive: true });
  assert.equal(hash(new GraphWorkspace(copied).read()), hash(ws.read()));
});

test('no-op reimport, accepted correction, changed source and conflict', t => {
  const { ws } = fixture(t);
  const initial = doc(ws, [node()]);
  ws.apply(ws.propose({ document: initial }));
  assert.equal(ws.apply(ws.propose({ document: initial })).changed, false);
  ws.apply(ws.propose({ mode: 'refine', edits: [{ op: 'update', id: node()['@id'], set: { 'dcterms:title': 'Curated' } }] }));
  assert.equal(ws.propose({ document: initial }).candidate['robos:nodes'][0]['dcterms:title'], 'Curated');
  const changed = doc(ws, [{ ...node(), 'robos:status': 'planned' }]);
  const p = ws.propose({ document: changed });
  assert.equal(p.conflicts.length, 0);
  ws.apply(p);
  assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'Curated');
  const conflict = ws.propose({ document: doc(ws, [node(undefined, 'New source title')]) });
  assert.equal(conflict.conflicts.length, 1);
  assert.throws(() => ws.apply(conflict), /Resolve import conflicts/);
});

test('package moves, property removal, stale sources and explicit retirement', t => {
  const { ws } = fixture(t);
  ws.apply(ws.propose({ document: doc(ws, [{ ...node(), 'dcterms:description': 'Old' }]) }));
  ws.apply(ws.propose({ document: doc(ws, [{ ...node(), 'robos:package': 'documentation' }]) }));
  assert.equal(ws.read()['robos:nodes'][0]['dcterms:description'], undefined);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ws.root, 'kgraphs/organization/package.jsonld')))['robos:nodes'].length, 0);
  const absent = ws.propose({ document: doc(ws, []) });
  assert.equal(absent.stale.length, 1);
  assert.equal(absent.delta.removed.length, 0);
  ws.apply(ws.propose({ mode: 'refine', edits: [{ op: 'remove', id: node()['@id'] }] }));
  assert.equal(ws.propose({ document: doc(ws, [node()]) }).conflicts.length, 1);
});

test('invalid shape, dangling reference, duplicate ID, evidence and traversal rejected', t => {
  const { ws } = fixture(t);
  assert.throws(() => ws.propose({ document: doc(ws, [node(), node()]) }), /Duplicate node ID/);
  for (const nodes of [[{ ...node(), 'robos:dependsOn': 'urn:example:missing' }], [{ ...node(), 'robos:status': '' }], [{ ...node(), 'robos:package': '../escape' }]]) {
    const p = ws.propose({ document: doc(ws, nodes) });
    assert.equal(p.validation.conforms, false);
    assert.throws(() => ws.apply(p), /Invalid graph/);
  }
  assert.equal(validateDocument(doc(ws, [node()]), { requireEvidence: true }).conforms, false);
  assert.ok(!fs.existsSync(ws.root));
});

test('stale and tampered proposals fail without changing accepted graph', t => {
  const { ws } = fixture(t);
  const a = ws.propose({ document: doc(ws, [node()]) });
  const b = ws.propose({ document: doc(ws, [node('urn:example:project:two')]) });
  ws.apply(a);
  assert.throws(() => ws.apply(b), /Stale proposal/);
  const altered = ws.propose({ mode: 'refine', edits: [{ op: 'update', id: node()['@id'], set: { 'dcterms:title': 'Two' } }] });
  altered.candidate['robos:nodes'][0]['dcterms:title'] = 'Tampered';
  assert.throws(() => ws.apply(altered), /does not match/);
  assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'One');
});

test('interrupted multi-file write blocks reads and recovers a validated journal', t => {
  const { ws } = fixture(t);
  ws.apply(ws.propose({ document: doc(ws, [node()]) }));
  const p = ws.propose({ mode: 'refine', edits: [{ op: 'update', id: node()['@id'], set: { 'dcterms:title': 'Recovered' } }] });
  const finish = ws.finish;
  ws.finish = () => { throw new Error('Simulated interruption'); };
  assert.throws(() => ws.apply(p), /interruption/);
  assert.throws(() => ws.read(), /needs recovery/);
  ws.finish = finish;
  assert.equal(ws.recover().recovered, true);
  assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'Recovered');
});

test('malformed packages and aggregate drift are not replaced by demonstration data', t => {
  const { ws } = fixture(t);
  ws.apply(ws.propose({ document: doc(ws, [node()]) }));
  const file = path.join(ws.root, 'kgraphs/organization/package.jsonld');
  fs.writeFileSync(file, '{');
  assert.throws(() => ws.read(), SyntaxError);
  assert.equal(fs.readFileSync(file, 'utf8'), '{');
});

test('CLI supports init/inspect/propose/apply and invalid JSON validation exits nonzero', t => {
  const { dir, ws } = fixture(t);
  const cli = path.resolve(__dirname, '../../../robos-graph/bin/kgraph-cli.js');
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args, '--graph-root', ws.root], { encoding: 'utf8' }));
  run('init');
  assert.equal(run('inspect').nodes, 0);
  const source = path.join(dir, 'source.json'), proposal = path.join(dir, 'proposal.json');
  fs.writeFileSync(source, serialize(doc(ws, [node()])));
  execFileSync(process.execPath, [cli, 'propose', '--file', source, '--output', proposal, '--graph-root', ws.root]);
  run('apply', '--file', proposal);
  assert.equal(run('inspect').nodes, 1);
  const bad = { ...doc(ws, [node()]), 'robos:nodes': [{ ...node(), 'robos:status': '' }] };
  fs.writeFileSync(ws.file, serialize(bad));
  fs.writeFileSync(path.join(ws.root, 'kgraphs/organization/package.jsonld'), serialize({ 'robos:package': 'organization', 'robos:nodes': bad['robos:nodes'] }));
  assert.equal(spawnSync(process.execPath, [cli, 'validate', '--json', '--graph-root', ws.root]).status, 1);
});

const workspaceModule = path.resolve(__dirname, '../../../robos-graph/lib/graph-workspace.js');
function rehash(proposal) {
  delete proposal.id;
  proposal.id = hash(proposal);
  return proposal;
}

// The child uses the actual filesystem and persistence implementation. The only
// interception selects an exact crash boundary; SIGKILL bypasses every finally.
function crashWriter(ws, point) {
  return spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const path = require('node:path');
    const { GraphWorkspace } = require(process.argv[1]);
    const ws = new GraphWorkspace(process.argv[2]);
    const point = process.argv[3];
    const p = ws.propose({ mode: 'refine', edits: [{ op: 'update', id: 'urn:example:project:one', set: { 'dcterms:title': 'Recovered after SIGKILL', 'robos:package': 'custom-domain' } }] });
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (point === 'journal-before-publish' && to === ws.journal) process.kill(process.pid, 'SIGKILL');
      rename(from, to);
      if ((point === 'journal' && to === ws.journal) ||
          (point === 'package' && to === path.join(ws.root, 'kgraphs/custom-domain/package.jsonld')) ||
          (point === 'aggregate' && to === ws.file) ||
          (point === 'state' && to === ws.stateFile)) process.kill(process.pid, 'SIGKILL');
    };
    ws.apply(p);
    process.exit(99);
  `, workspaceModule, ws.root, point], { encoding: 'utf8', timeout: 10000 });
}

for (const point of ['journal-before-publish', 'journal', 'package', 'aggregate', 'state']) {
  test(`real SIGKILL at ${point} leaves a recoverable workspace`, t => {
    const { ws } = fixture(t);
    ws.apply(ws.propose({ document: doc(ws, [node()]) }));
    const child = crashWriter(ws, point);
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    assert.ok(fs.existsSync(path.join(ws.root, 'write.lock')));
    if (point === 'journal-before-publish') {
      assert.equal(fs.existsSync(ws.journal), false, 'partial journal never becomes visible');
      assert.equal(ws.recover().recovered, false);
      assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'One');
    } else {
      assert.throws(() => ws.read(), /needs recovery/);
      // A fresh process must recover, not merely the process that created ws.
      const recovered = spawnSync(process.execPath, ['-e', `
        const { GraphWorkspace } = require(process.argv[1]);
        process.stdout.write(JSON.stringify(new GraphWorkspace(process.argv[2]).recover()));
      `, workspaceModule, ws.root], { encoding: 'utf8', timeout: 10000 });
      assert.equal(recovered.status, 0, recovered.stderr);
      assert.equal(JSON.parse(recovered.stdout).recovered, true);
      assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'Recovered after SIGKILL');
      const oldPackage = JSON.parse(fs.readFileSync(path.join(ws.root, 'kgraphs/organization/package.jsonld')));
      const movedPackage = JSON.parse(fs.readFileSync(path.join(ws.root, 'kgraphs/custom-domain/package.jsonld')));
      assert.equal(oldPackage['robos:nodes'].length, 0);
      assert.equal(movedPackage['robos:nodes'].length, 1);
      assert.equal(ws.state().revision, hash(ws.read()));
    }
    assert.equal(fs.existsSync(path.join(ws.root, 'write.lock')), false);
    assert.equal(ws.recover().recovered, false);
    const p = ws.propose({ mode: 'refine', edits: [{ op: 'update', id: node()['@id'], set: { 'robos:status': 'planned' } }] });
    assert.equal(ws.apply(p).changed, true, 'workspace remains writable');
  });
}

test('recovery never removes a live subprocess writer lock', async t => {
  const { ws } = fixture(t);
  ws.apply(ws.propose({ document: doc(ws, [node()]) }));
  const child = spawn(process.execPath, ['-e', `
    const { GraphWorkspace } = require(process.argv[1]);
    const ws = new GraphWorkspace(process.argv[2]);
    const p = ws.propose({ mode: 'refine', edits: [{ op: 'update', id: 'urn:example:project:one', set: { 'dcterms:title': 'Live writer' } }] });
    ws.finish = () => {
      process.send({ locked: true });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    };
    ws.apply(p);
  `, workspaceModule, ws.root], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  t.after(() => clearTimeout(timer));
  const ready = await Promise.race([once(child, 'message'), exited.then(() => { throw new Error('writer exited before locking'); })]);
  assert.equal(ready[0].locked, true);
  const lock = fs.readFileSync(path.join(ws.root, 'write.lock'), 'utf8');
  assert.throws(() => ws.recover(), /writer is active/);
  assert.equal(fs.readFileSync(path.join(ws.root, 'write.lock'), 'utf8'), lock);
  child.kill('SIGKILL');
  await exited;
  assert.equal(ws.recover().recovered, true);
  assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'Live writer');
});

test('retirement and stale-source history survive repeated absent-source imports and reopening', t => {
  const { ws } = fixture(t);
  const initial = doc(ws, [node()]);
  ws.apply(ws.propose({ document: initial }));
  for (let i = 0; i < 2; i++) {
    const absent = ws.propose({ document: doc(ws, []) });
    assert.equal(absent.stale.length, 1);
    ws.apply(absent);
  }
  ws.apply(ws.propose({ mode: 'refine', edits: [{ op: 'remove', id: node()['@id'] }] }));
  ws.apply(ws.propose({ document: doc(ws, []) }));
  const reopened = new GraphWorkspace(ws.root);
  assert.equal(reopened.propose({ document: initial }).conflicts.length, 1);
  reopened.apply(reopened.propose({ mode: 'refine', edits: [{ op: 'add', node: node() }] }));
  assert.equal(reopened.propose({ document: initial }).conflicts.length, 0, 'explicit restoration clears retirement');
  const manual = node('urn:example:project:manual');
  reopened.apply(reopened.propose({ mode: 'refine', edits: [{ op: 'add', node: manual }, { op: 'remove', id: manual['@id'] }] }));
  assert.equal(reopened.propose({ document: doc(reopened, [manual]) }).conflicts.length, 1, 'manual nodes also have tombstones');
});

test('package envelopes and manifest metadata survive edits, and metadata edits invalidate proposals', t => {
  const { ws } = fixture(t);
  ws.apply(ws.propose({ document: doc(ws, [node()]) }));
  const manifestPath = path.join(ws.root, 'kgraph.yaml');
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  manifest.dependencies = [{ id: 'schema', version: 'v1.2.3' }];
  manifest.repositories.push({ id: 'external', url: 'https://example.org/schema.git' });
  manifest.extra = { retain: true };
  manifest.packages[0].custom = 'preserve catalog metadata';
  fs.writeFileSync(manifestPath, serialize(manifest));
  const file = path.join(ws.root, 'kgraphs/organization/package.jsonld');
  const envelope = JSON.parse(fs.readFileSync(file));
  envelope['dcterms:title'] = 'Curated organization';
  envelope['robos:documentation'] = ['Manual context'];
  fs.writeFileSync(file, serialize(envelope));
  const p = ws.propose({ mode: 'refine', edits: [{ op: 'update', id: node()['@id'], set: { 'dcterms:title': 'Changed' } }] });
  ws.apply(p);
  const saved = JSON.parse(fs.readFileSync(manifestPath));
  assert.deepEqual(saved.dependencies, manifest.dependencies);
  assert.deepEqual(saved.repositories, manifest.repositories);
  assert.deepEqual(saved.extra, manifest.extra);
  assert.equal(saved.packages[0].custom, 'preserve catalog metadata');
  assert.equal(JSON.parse(fs.readFileSync(file))['dcterms:title'], 'Curated organization');
  assert.deepEqual(JSON.parse(fs.readFileSync(file))['robos:documentation'], ['Manual context']);
  const stale = ws.propose({ mode: 'refine', edits: [{ op: 'update', id: node()['@id'], set: { 'dcterms:title': 'Stale' } }] });
  saved.dependencies.push({ id: 'new-schema', version: 'v2' });
  fs.writeFileSync(manifestPath, serialize(saved));
  assert.throws(() => ws.apply(stale), /Stale proposal/);
  assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'Changed');
});

test('block YAML metadata is preserved while new custom packages are cataloged', t => {
  const { ws } = fixture(t);
  ws.apply(ws.propose({ document: doc(ws, [node()]) }));
  const file = path.join(ws.root, 'kgraph.yaml');
  const prefix = 'version: "1.0.0"\n# Keep this comment\ndependencies:\n  - id: schema\n    version: v1.2.3\nrepositories:\n  - id: external\n    url: https://example.org/schema.git\n';
  fs.writeFileSync(file, prefix + 'packages:\n  - id: organization\n    title: Curated catalog title\n    path: kgraphs/organization/package.jsonld\nextra: preserved\n');
  ws.apply(ws.propose({ mode: 'refine', edits: [{ op: 'update', id: node()['@id'], set: { 'robos:package': 'custom-domain' } }] }));
  const saved = fs.readFileSync(file, 'utf8');
  assert.ok(saved.startsWith(prefix));
  assert.ok(saved.includes('title: Curated catalog title'));
  assert.ok(saved.includes('"id":"custom-domain"'));
  assert.ok(saved.endsWith('extra: preserved\n'));
  assert.equal(ws.read()['robos:nodes'][0]['robos:package'], 'custom-domain');
});

test('rehashed derived fields and unreviewed IDs are rejected before writing', t => {
  const { ws } = fixture(t);
  ws.apply(ws.propose({ document: doc(ws, [node()]) }));
  const options = { mode: 'refine', edits: [{ op: 'update', id: node()['@id'], set: { 'dcterms:title': 'Reviewed' } }] };
  for (const mutate of [
    p => { p.candidate['robos:nodes'][0]['dcterms:title'] = 'Unreviewed'; },
    p => { p.delta = { added: [], changed: [], removed: [] }; },
    p => { p.extracted[0]['dcterms:title'] = 'Poisoned baseline'; },
    p => { p.retired = [node()['@id']]; },
  ]) {
    const p = JSON.parse(serialize(ws.propose(options)));
    mutate(p);
    assert.throws(() => ws.apply(rehash(p)), /inconsistent/);
    assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'One');
    assert.equal(fs.existsSync(ws.journal), false);
  }
  const p = ws.propose(options);
  assert.throws(() => ws.apply(p, { expectedProposalId: 'different-reviewed-id' }), /reviewed ID/);
  assert.equal(ws.apply(p, { expectedProposalId: p.id }).changed, true);
});

test('recovery rejects rehashed inconsistent journals and replay after a newer commit', t => {
  const { ws } = fixture(t);
  ws.apply(ws.propose({ document: doc(ws, [node()]) }));
  const p = ws.propose({ mode: 'refine', edits: [{ op: 'update', id: node()['@id'], set: { 'dcterms:title': 'Second' } }] });
  ws.apply(p);
  ws.apply(ws.propose({ mode: 'refine', edits: [{ op: 'update', id: node()['@id'], set: { 'dcterms:title': 'Third' } }] }));
  fs.writeFileSync(ws.journal, serialize(p));
  assert.throws(() => ws.recover(), /stale/);
  assert.equal(JSON.parse(fs.readFileSync(ws.file))['robos:nodes'][0]['dcterms:title'], 'Third');
  const forged = JSON.parse(serialize(p));
  forged.delta = { added: [], changed: [], removed: [] };
  fs.writeFileSync(ws.journal, serialize(rehash(forged)));
  assert.throws(() => ws.recover(), /Inconsistent recovery journal/);
});

test('complete identifier syntax is checked without canonicalizing identity', t => {
  const { ws } = fixture(t);
  for (const id of ['urn:', 'urn:example:', 'urn:example:contains space', 'urn:example:bad%xx', 'https://', 'https:///missing-host', 'https://example.org/white space', 'https://user:pass@example.org/id']) {
    const report = validateDocument(doc(ws, [node(id)]));
    assert.equal(report.conforms, false, id);
    assert.ok(report.errors.some(e => e.includes('Invalid node ID')), id);
  }
  for (const id of ['urn:example:project:a', 'urn:uuid:12345678-1234-1234-1234-123456789abc', 'https://example.org/a%20b#c']) {
    assert.equal(validateDocument(doc(ws, [node(id)])).conforms, true, id);
  }
});

test('relationship evidence accepts string/object references and checks the actual edge and provenance', t => {
  const { ws } = fixture(t);
  const target = node('urn:example:project:target');
  const evidence = [{ repository: 'example', path: 'src/main.go', line: 1, revision: 'abc123', sha256: 'a'.repeat(64) }];
  for (const parentRef of [target['@id'], { '@id': target['@id'] }]) for (const targetRef of [target['@id'], { '@id': target['@id'] }]) {
    const n = { ...node(), 'robos:dependsOn': [parentRef], 'robos:relationshipEvidence': [{ predicate: 'robos:dependsOn', target: targetRef, evidence, note: 'Source declaration', condition: 'When enabled' }] };
    assert.equal(validateDocument(doc(ws, [n, target])).conforms, true, JSON.stringify(n));
  }
  const base = { ...node(), 'robos:evidence': evidence, 'robos:dependsOn': target['@id'], 'robos:relationshipEvidence': [{ predicate: 'robos:dependsOn', target: target['@id'], evidence }] };
  for (const mutate of [
    n => { n['robos:relationshipEvidence'][0].target = 'urn:example:missing'; },
    n => { n['robos:relationshipEvidence'][0].predicate = 'robos:other'; },
    n => { delete n['robos:relationshipEvidence'][0].evidence; },
    n => { n['robos:relationshipEvidence'][0].evidence = []; },
    n => { n['robos:relationshipEvidence'][0].evidence[0].path = '../escape'; },
    n => { n['robos:relationshipEvidence'][0].evidence[0].path = 'C:\\escape'; },
    n => { n['robos:relationshipEvidence'][0].evidence[0].line = 0; },
    n => { n['robos:relationshipEvidence'][0].evidence[0].sha256 = 'invalid'; },
    n => { n['robos:relationshipEvidence'][0].condition = { hidden: true }; },
  ]) {
    const n = JSON.parse(JSON.stringify(base)); mutate(n);
    assert.equal(validateDocument(doc(ws, [n, target])).conforms, false, JSON.stringify(n));
  }
});


test('package context upgrades retain local terms and do not leave stale RDF semantics on no-op refresh', t => {
  const { ws } = fixture(t);
  ws.apply(ws.propose({ document: doc(ws, [node()]) }));
  const file = path.join(ws.root, 'kgraphs/organization/package.jsonld');
  const envelope = JSON.parse(fs.readFileSync(file));
  envelope['@context'] = { ...envelope['@context'], local: 'https://example.test/vocab#' };
  delete envelope['@context']['robos:relationshipEvidence'];
  fs.writeFileSync(file, serialize(envelope));
  const p = ws.propose({ document: doc(ws, [node()]) });
  assert.equal(ws.apply(p).changed, true);
  const saved = JSON.parse(fs.readFileSync(file));
  assert.equal(saved['@context'].local, 'https://example.test/vocab#');
  assert.ok(saved['@context']['robos:relationshipEvidence']);
  assert.equal(ws.apply(ws.propose({ document: doc(ws, [node()]) })).changed, false);
});

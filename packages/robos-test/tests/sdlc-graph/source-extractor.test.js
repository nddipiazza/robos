'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { extractSources } = require('../../../robos-graph/lib/source-extractor');
const { SHACLValidator } = require('../../../robos-graph/lib/shacl-validator');

const manifest = ids => ({ namespace: 'sample', title: 'Sample system', sources: ids.map(id => ({ id })) });
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function write(root, file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
function fixture(t, files, remote = 'https://example.test/sample/repository.git') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--initial-branch=trunk');
  git(root, 'config', 'commit.gpgsign', 'false');
  for (const [file, content] of Object.entries(files)) write(root, file, content);
  git(root, 'add', '--all');
  git(root, 'commit', '--allow-empty', '-m', 'Fixture');
  if (remote) {
    git(root, 'remote', 'add', 'origin', remote);
    git(root, 'update-ref', 'refs/remotes/origin/trunk', 'HEAD');
    git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
  }
  return root;
}
const nodesOf = result => result.document['robos:nodes'];
const typeNodes = (result, type) => nodesOf(result).filter(node => node['@type'].includes(type));
function validates(result) {
  const validation = new SHACLValidator().validate(nodesOf(result));
  assert.equal(validation.conforms, true, JSON.stringify(validation.violations));
  assert.equal(validation.nodesEvaluated, nodesOf(result).length);
  assert.equal(new Set(nodesOf(result).map(node => node['@id'])).size, nodesOf(result).length);
}

test('extracts all eight packages from real declarations, with strict SHACL and evidence', t => {
  const root = fixture(t, {
    'README.md': '# Sample system\n',
    'web/package.json': JSON.stringify({ name: '@sample/web', dependencies: { react: '^19', '@sample/shared': 'workspace:*' } }),
    'lib/package.json': JSON.stringify({ name: '@sample/shared', main: 'index.js' }),
    'api/go.mod': 'module example.test/sample/api\n\ngo 1.24\n',
    'api/catalog.proto': 'syntax = "proto3";\npackage sample;\nmessage Request { message Entry {} }\nmessage Response {}\nservice Catalog {\n rpc Get(Request) returns (Response);\n}\n',
    'api/ent/schema/item.go': 'package schema\nimport "entgo.io/ent"\ntype Item struct { ent.Schema }\n',
    'charts/sample/Chart.yaml': 'apiVersion: v2\nname: sample\nversion: 1.2.3\n',
    'compose.yaml': 'services:\n  api:\n    image: sample:latest\n',
    'infra/Pulumi.yaml': 'name: sample\nruntime: nodejs\n',
    'Makefile': 'test:\n\tnode --test\n',
    '.github/workflows/check.yml': 'name: Check\non: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n',
    'training/lesson.md': '# First lesson\n',
    'skills/sample/SKILL.md': '---\nname: sample-skill\ndescription: Sample skill\n---\n# Steps\n',
    'tests/api.test.js': 'const { test } = require("node:test");\ntest("sample", () => {});\n',
    'notes.txt': 'Unstructured notes\n',
  });
  const result = extractSources(manifest(['sample']), { sample: root });
  validates(result);
  assert.equal(result.document['@id'], 'urn:sample:graph:system');
  assert.deepEqual([...new Set(nodesOf(result).map(n => n['robos:package']))].sort(), ['applications', 'core-platform', 'devops', 'documentation', 'learning', 'organization', 'services', 'testing']);
  for (const type of ['robos:FrontEndApp', 'robos:Library', 'robos:Contract', 'robos:DataModel', 'robos:GitRepository', 'robos:CICDPipeline', 'robos:BuildSystem', 'robos:DocumentationPage', 'robos:AgentSkill', 'robos:TestSuite']) assert.ok(typeNodes(result, type).length, type);
  assert.ok(typeNodes(result, 'robos:DataModel').some(n => n['robos:modelName'] === 'Request.Entry'));
  const rpc = nodesOf(result).find(n => n['robos:sourceKind'] === 'protobuf-rpc');
  assert.equal(rpc['dcterms:title'], 'Catalog.Get');
  assert.equal(rpc['robos:evidence'][0].line, 6);
  const repo = typeNodes(result, 'robos:GitRepository')[0];
  assert.equal(repo['robos:evidence'][0].path, 'README.md');
  assert.equal(repo['robos:defaultBranch'], 'trunk');
  const frontend = typeNodes(result, 'robos:FrontEndApp')[0];
  assert.equal(frontend['robos:provenance'].module, 'web');
  assert.equal(frontend['robos:dependsOn'].length, 1);
  assert.equal(result.coverage[0].unsupportedFiles, 1);
  assert.equal(result.coverage[0].trackedFiles, 15);
  assert.equal(result.coverage[0].inspectedFiles, 15);
  assert.equal(result.coverage[0].artifactFiles, 14);
  assert.equal(result.coverage[0].extractedFiles, 14);
  assert.equal(result.coverage[0].semanticFiles + result.coverage[0].noSemanticExtractionFiles, 15);
  for (const node of nodesOf(result)) {
    assert.ok(node['robos:evidence'].length);
    const evidence = node['robos:evidence'][0];
    assert.equal(evidence.revision, git(root, 'rev-parse', 'HEAD'));
    assert.equal(evidence.sha256, createHash('sha256').update(fs.readFileSync(path.join(root, evidence.path))).digest('hex'));
  }
});

test('links package and Go dependencies across sources independent of collection order', t => {
  const consumer = fixture(t, {
    'package.json': JSON.stringify({ name: 'consumer', dependencies: { 'shared-lib': 'file:../shared' } }),
    'go.mod': 'module example.test/consumer\nrequire (\n example.test/shared v1.0.0\n)\n',
  });
  const producer = fixture(t, { 'package.json': '{"name":"shared-lib"}', 'go.mod': 'module example.test/shared\n' });
  const result = extractSources(manifest(['consumer', 'producer']), { consumer, producer });
  validates(result);
  const consumers = typeNodes(result, 'robos:Library').filter(n => n['dcterms:title'].includes('consumer'));
  assert.equal(consumers.length, 2);
  for (const n of consumers) assert.ok(n['robos:dependsOn'][0]['@id'].includes(':producer:'));
});

test('counts exclusions, untracked files, tracked deletion and modifications honestly', t => {
  const root = fixture(t, { 'README.md': 'before', 'gone.md': 'gone', 'vendor/lib.go': 'bulk', 'generated/x.js': 'bulk', '.env': 'PASSWORD=hidden', 'skip/item.md': 'excluded', 'skip-other.md': 'kept', 'local/item.md': 'excluded', 'package.json': '{"name":"sample"}' });
  fs.unlinkSync(path.join(root, 'gone.md'));
  write(root, 'README.md', 'after');
  write(root, 'untracked.md', 'not inspected');
  const m = manifest(['sample']); m.exclude = ['skip']; m.sources[0].exclude = ['local'];
  const result = extractSources(m, { sample: root });
  validates(result);
  const count = result.coverage[0];
  assert.equal(count.trackedFiles, 9);
  assert.equal(count.excludedFiles, 5);
  assert.equal(count.missingFiles, 1);
  assert.equal(count.extractedFiles, 3);
  assert.equal(count.untrackedFiles, 1);
  assert.equal(count.modifiedFiles, 2);
  assert.equal(result.sources[0].dirty, true);
  assert.ok(nodesOf(result).find(n => n['robos:sourcePath'] === 'skip-other.md'));
  assert.ok(!JSON.stringify(result).includes('untracked.md'));
  assert.ok(!JSON.stringify(result).includes('PASSWORD'));
  const evidence = nodesOf(result).find(n => n['robos:sourcePath'] === 'README.md')['robos:evidence'][0];
  assert.equal(evidence.workingTreeStatus, ' M');
});

test('does not leak credential values, origin authentication, commands or checkout locations', t => {
  const secret = 'DO_NOT_EXPORT_12345';
  const root = fixture(t, {
    'README.md': '# Password ' + secret,
    'package.json': JSON.stringify({ name: 'safe-name', scripts: { prepare: `touch ${secret}` }, dependencies: { dep: `https://login:${secret}@example.test/dep` } }),
    'compose.yaml': 'services:\n  api:\n    environment:\n      PASSWORD: ' + secret,
    'infra/Pulumi.dev.yaml': 'config:\n  password: ' + secret,
    '.npmrc': '//example.test/:_authToken=' + secret,
  }, `https://login:${secret}@example.test/sample/repo.git?token=${secret}#${secret}`);
  const result = extractSources(manifest(['sample']), { sample: root });
  validates(result);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes(root));
  assert.ok(!serialized.includes('login'));
  assert.equal(result.sources[0].origin, 'https://example.test/sample/repo.git');
  assert.equal(fs.existsSync(path.join(root, secret)), false);
});

test('portable IDs survive checkout relocation and include complete monorepo paths', t => {
  const files = { 'a/package.json': '{"name":"a"}', 'b/package.json': '{"name":"b"}', 'docs/a b.md': '# Document' };
  const first = fixture(t, files), second = fixture(t, files);
  const a = extractSources(manifest(['sample']), { sample: first });
  const b = extractSources(manifest(['sample']), { sample: second });
  assert.deepEqual(nodesOf(a).map(n => n['@id']), nodesOf(b).map(n => n['@id']));
  assert.ok(nodesOf(a).some(n => n['@id'] === 'urn:sample:artifact:sample:docs%2Fa%20b.md'));
});

test('unknown default branch and missing origin do not manufacture repository facts', t => {
  const root = fixture(t, { 'README.md': '# Detached sample' }, null);
  git(root, 'checkout', '--detach');
  const result = extractSources(manifest(['sample']), { sample: root });
  validates(result);
  assert.equal(result.sources[0].defaultBranch, null);
  assert.equal(result.sources[0].currentBranch, null);
  assert.equal(result.sources[0].branchMetadataStatus, 'unknown-detached');
  assert.equal(typeNodes(result, 'robos:GitRepository').length, 0);
  assert.ok(result.warnings.some(w => w.code === 'default-branch-unknown'));
});

test('rejects missing repos, relative roots, duplicate IDs, traversal exclusions and nested directories', t => {
  assert.throws(() => extractSources(manifest(['missing']), {}), /Missing absolute checkout/);
  assert.throws(() => extractSources(manifest(['missing']), { missing: '/nonexistent-sample-checkout' }), /missing or is not a Git checkout/);
  assert.throws(() => extractSources(manifest(['missing']), { missing: '.' }), /absolute checkout/);
  assert.throws(() => extractSources(manifest(['same', 'same']), { same: '/sample' }), /unique/);
  const m = manifest(['sample']); m.exclude = ['../escape'];
  assert.throws(() => extractSources(m, { sample: '/sample' }), /relative path prefixes/);
  const root = fixture(t, { 'nested/README.md': 'sample' });
  assert.throws(() => extractSources(manifest(['sample']), { sample: path.join(root, 'nested') }), /checkout root/);
});

test('skips tracked symlinks and malformed manifests without exporting file content', t => {
  const root = fixture(t, { 'README.md': 'sample', 'package.json': '{ malformed SECRET_VALUE' });
  fs.symlinkSync('README.md', path.join(root, 'linked.md'));
  git(root, 'add', 'linked.md');
  const result = extractSources(manifest(['sample']), { sample: root });
  validates(result);
  assert.equal(result.coverage[0].excludedFiles, 1);
  assert.ok(result.warnings.some(w => w.code === 'semantic-extraction-failed'));
  assert.ok(!JSON.stringify(result).includes('SECRET_VALUE'));
});

test('ignores commented and quoted declarations and generated bulk', t => {
  const root = fixture(t, {
    'api.proto': 'syntax = "proto3";\n// message Fake {}\noption note = "service Fake { rpc Secret }";\n/* message Other {} */\nmessage Real {}\n',
    'ent/schema/item.go': 'package schema\n// type Fake struct { ent.Schema }\nvar example = `type Fake struct { ent.Schema }`\ntype Real struct { ent.Schema }\n',
    'output.go': '// Code generated by sample. DO NOT EDIT.\npackage sample\n',
  });
  const result = extractSources(manifest(['sample']), { sample: root });
  validates(result);
  assert.deepEqual(typeNodes(result, 'robos:DataModel').map(n => n['dcterms:title']), ['Real', 'Real']);
  assert.ok(!nodesOf(result).some(n => n['dcterms:title'].includes('Fake')));
  assert.equal(result.coverage[0].excludedFiles, 1);
});

test('handles empty repositories and current branches without inventing defaults', t => {
  const root = fixture(t, {}, null);
  const result = extractSources(manifest(['sample']), { sample: root });
  validates(result);
  assert.equal(result.sources[0].currentBranch, 'trunk');
  assert.equal(result.sources[0].defaultBranch, null);
  assert.equal(result.coverage[0].trackedFiles, 0);
  assert.equal(nodesOf(result).length, 0);
  assert.equal(result.sources[0].represented, false);
  assert.equal(result.sources[0].evidenceStatus, 'unresolved');
  assert.equal(result.coverage[0].representedRepositories, 0);
  assert.ok(result.warnings.some(w => w.code === 'repository-evidence-unavailable'));
});

test('does not run checkout fsmonitor hooks and preserves hostile filenames as data', t => {
  const root = fixture(t, { 'README.md': 'sample', 'docs/$(touch injected);.md': 'sample' });
  write(root, 'monitor.sh', '#!/bin/sh\ntouch "$(dirname "$0")/hook-executed"\n');
  fs.chmodSync(path.join(root, 'monitor.sh'), 0o755);
  git(root, 'config', 'core.fsmonitor', './monitor.sh');
  const result = extractSources(manifest(['sample']), { sample: root });
  validates(result);
  assert.equal(fs.existsSync(path.join(root, 'hook-executed')), false);
  assert.equal(fs.existsSync(path.join(root, 'injected')), false);
  assert.ok(nodesOf(result).some(n => n['robos:sourcePath'] === 'docs/$(touch injected);.md'));
});

test('reports ambiguous internal dependencies instead of guessing a repository', t => {
  const root = fixture(t, {
    'package.json': '{"name":"consumer","dependencies":{"shared":"*"}}',
    'a/package.json': '{"name":"shared"}',
    'b/package.json': '{"name":"shared"}',
  });
  const result = extractSources(manifest(['sample']), { sample: root });
  validates(result);
  assert.ok(result.warnings.some(w => w.code === 'ambiguous-module-dependency'));
  const consumer = typeNodes(result, 'robos:Library').find(n => n['dcterms:title'] === 'consumer');
  assert.equal(consumer['robos:dependsOn'], undefined);
});

test('unsupported files remain inventoried and hashed with explicit opt-in for graph artifacts', t => {
  const root = fixture(t, { 'README.md': '# Sample', 'src/main.js': 'export const value = 1;', 'notes.txt': 'notes', 'Chart.yaml': 'name: sample\nversion: 1.0.0\n' });
  const m = manifest(['sample']);
  const result = extractSources(m, { sample: root });
  const explicitFalse = extractSources({ ...m, includeUnsupported: false }, { sample: root });
  assert.deepEqual(result, explicitFalse);
  validates(result);
  const count = result.coverage[0];
  assert.equal(count.inspectedFiles, 4);
  assert.equal(count.artifactFiles, 2);
  assert.equal(count.extractedFiles, count.artifactFiles);
  assert.equal(count.unsupportedFiles, 2);
  assert.equal(count.semanticFiles, 1);
  assert.equal(count.noSemanticExtractionFiles, 3);
  assert.equal(result.inventory.length, 4);
  assert.equal(result.document.inventory, undefined);
  for (const file of ['src/main.js', 'notes.txt']) {
    const entry = result.inventory.find(e => e.path === file);
    assert.equal(entry.disposition, 'unsupported');
    assert.equal(entry.type, 'unsupported');
    assert.equal(entry.represented, false);
    assert.equal(entry.semanticExtraction, false);
    assert.deepEqual(entry.nodeIds, []);
    assert.equal(entry.sha256, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'));
    assert.ok(!nodesOf(result).some(n => n['robos:sourcePath'] === file));
  }
  const optIn = extractSources({ ...m, includeUnsupported: true }, { sample: root });
  validates(optIn);
  assert.equal(optIn.coverage[0].artifactFiles, 4);
  for (const key of ['inspectedFiles', 'unsupportedFiles', 'semanticFiles', 'noSemanticExtractionFiles', 'byKind']) assert.deepEqual(optIn.coverage[0][key], count[key]);
  const sourceEntry = optIn.inventory.find(e => e.path === 'src/main.js');
  assert.equal(sourceEntry.disposition, 'represented');
  assert.equal(sourceEntry.reason, 'unsupported-opt-in');
  assert.equal(sourceEntry.semanticExtraction, false);
  assert.equal(sourceEntry.nodeIds.length, 1);
  for (const node of nodesOf(optIn)) {
    assert.equal(node['robos:evidenceStatus'], node['robos:status']);
    assert.ok(['implemented', 'declared', 'documented'].includes(node['robos:evidenceStatus']));
  }
  assert.ok(!JSON.stringify(optIn).includes(root));
  assert.throws(() => extractSources({ ...m, includeUnsupported: 'true' }, { sample: root }), /boolean/);
});

test('inventory partitions tracked files and distinguishes exclusions, missing files and partial extraction', t => {
  const root = fixture(t, {
    'README.md': 'sample', 'gone.md': 'deleted', 'vendor/code.js': 'excluded', '.env': 'TOKEN=DO_NOT_EXPORT',
    'raw.bin': Buffer.from([0, 1, 2]), 'package.json': '{broken', 'code.js': 'unmodeled',
  });
  fs.unlinkSync(path.join(root, 'gone.md'));
  const result = extractSources(manifest(['sample']), { sample: root });
  validates(result);
  const count = result.coverage[0];
  assert.equal(result.inventory.length, count.trackedFiles);
  assert.equal(count.trackedFiles, count.excludedFiles + count.missingFiles + count.unreadableFiles + count.inspectedFiles);
  assert.equal(count.inspectedFiles, count.semanticFiles + count.noSemanticExtractionFiles);
  assert.equal(count.artifactFiles, result.inventory.filter(e => e.represented).length);
  const entries = Object.fromEntries(result.inventory.map(e => [e.path, e]));
  assert.equal(entries['gone.md'].disposition, 'missing');
  assert.equal(entries['gone.md'].sha256, null);
  assert.equal(entries['.env'].disposition, 'excluded');
  assert.equal(entries['.env'].sha256, null);
  assert.equal(entries['raw.bin'].reason, 'binary');
  assert.match(entries['raw.bin'].sha256, /^[a-f0-9]{64}$/);
  assert.equal(entries['package.json'].disposition, 'represented');
  assert.equal(entries['package.json'].semanticExtraction, false);
  assert.equal(entries['README.md'].reason, 'partial-declarations');
  assert.equal(entries['README.md'].nodeIds.length, 2);
  assert.ok(!JSON.stringify(result).includes('DO_NOT_EXPORT'));
});

test('repositories with only excluded files have metadata and inventory but no evidence-less node', t => {
  const root = fixture(t, { '.env': 'TOKEN=not-exported', 'vendor/lib.js': 'bulk' });
  const result = extractSources(manifest(['sample']), { sample: root });
  validates(result);
  assert.deepEqual(nodesOf(result), []);
  assert.equal(result.inventory.length, 2);
  assert.equal(result.sources[0].represented, false);
  assert.equal(result.sources[0].evidenceStatus, 'unresolved');
  assert.equal(result.coverage[0].representedRepositories, 0);
  assert.ok(result.warnings.some(w => w.code === 'repository-evidence-unavailable'));
});

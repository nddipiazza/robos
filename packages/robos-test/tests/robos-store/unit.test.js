'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const STORE_PATH = path.resolve(__dirname, '../../../robos-store');
const { GitBackend } = require(path.join(STORE_PATH, 'git-backend'));
const { SchemaValidator } = require(path.join(STORE_PATH, 'schema'));
const { RobosStore } = require(STORE_PATH);

// ── GitBackend tests ─────────────────────────────────────────────────────────

describe('GitBackend', () => {
  let tmpDir, backend;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
    backend = new GitBackend({ localPath: tmpDir, autoPush: false });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('init: creates a local git repo', async () => {
    const result = await backend.init();
    assert.strictEqual(result.ok, true);
    assert.ok(fs.existsSync(path.join(tmpDir, '.git')));
  });

  it('init: returns existing for already-initialized repo', async () => {
    const result = await backend.init();
    assert.strictEqual(result.status, 'existing');
  });

  it('set + get: stores and retrieves a file', async () => {
    await backend.set('test/config.json', '{"key":"value"}', 'Add config');
    const content = await backend.get('test/config.json');
    assert.strictEqual(content, '{"key":"value"}');
  });

  it('set: creates nested directories', async () => {
    await backend.set('deep/nested/file.txt', 'hello');
    assert.ok(fs.existsSync(path.join(tmpDir, 'deep', 'nested', 'file.txt')));
  });

  it('set: auto-commits', async () => {
    await backend.set('committed.txt', 'data', 'Test commit');
    const log = await backend.history('committed.txt');
    assert.ok(log.length > 0, 'should have commit history');
    assert.ok(log[0].message.includes('Test commit'));
  });

  it('get: returns null for nonexistent file', async () => {
    const content = await backend.get('nonexistent.txt');
    assert.strictEqual(content, null);
  });

  it('list: lists files under prefix', async () => {
    await backend.set('workflows/bug.yaml', 'states: []');
    await backend.set('workflows/story.yaml', 'states: []');
    await backend.set('other/file.txt', 'x');

    const files = await backend.list('workflows');
    assert.ok(files.includes('workflows/bug.yaml'));
    assert.ok(files.includes('workflows/story.yaml'));
    assert.ok(!files.includes('other/file.txt'));
  });

  it('list: returns empty for nonexistent prefix', async () => {
    const files = await backend.list('nope');
    assert.deepStrictEqual(files, []);
  });

  it('delete: removes a file and commits', async () => {
    await backend.set('to-delete.txt', 'bye');
    assert.ok(fs.existsSync(path.join(tmpDir, 'to-delete.txt')));

    const result = await backend.delete('to-delete.txt', 'Remove file');
    assert.strictEqual(result.deleted, true);
    assert.ok(!fs.existsSync(path.join(tmpDir, 'to-delete.txt')));
  });

  it('delete: returns deleted=false for nonexistent file', async () => {
    const result = await backend.delete('does-not-exist.txt');
    assert.strictEqual(result.deleted, false);
  });

  it('history: returns commit log for a file', async () => {
    await backend.set('history-test.txt', 'v1', 'Version 1');
    await backend.set('history-test.txt', 'v2', 'Version 2');
    const log = await backend.history('history-test.txt');
    assert.ok(log.length >= 2);
    assert.ok(log[0].message.includes('Version 2'));
    assert.ok(log[1].message.includes('Version 1'));
  });

  it('diff: returns empty for clean working tree', async () => {
    const d = await backend.diff();
    assert.strictEqual(d, '');
  });

  it('diff: returns changes for modified file', async () => {
    // Modify without committing
    fs.writeFileSync(path.join(tmpDir, 'history-test.txt'), 'v3-uncommitted');
    const d = await backend.diff('history-test.txt');
    assert.ok(d.includes('v3-uncommitted') || d.includes('v2'));
  });

  it('sync: returns local-only when no remote', async () => {
    const result = await backend.sync();
    assert.strictEqual(result.status, 'local-only');
  });
});

// ── SchemaValidator tests ────────────────────────────────────────────────────

describe('SchemaValidator', () => {
  const validator = new SchemaValidator();

  it('hasSchema: returns true for known patterns', () => {
    assert.ok(validator.hasSchema('settings.json'));
    assert.ok(validator.hasSchema('task-servers.json'));
    assert.ok(validator.hasSchema('workflows/bug.json'));
    assert.ok(validator.hasSchema('workflows/story.yaml'));
  });

  it('hasSchema: returns false for unknown files', () => {
    assert.ok(!validator.hasSchema('random.txt'));
    assert.ok(!validator.hasSchema('notes/readme.md'));
  });

  it('validates valid settings.json', () => {
    assert.deepStrictEqual(validator.validate('settings.json', '{"key":"value"}'), []);
  });

  it('rejects invalid JSON for settings.json', () => {
    const errors = validator.validate('settings.json', 'not json');
    assert.ok(errors.length > 0);
    assert.ok(errors[0].includes('Invalid JSON'));
  });

  it('validates valid task-servers.json', () => {
    const content = JSON.stringify([{ id: 'gh-1', type: 'github' }]);
    assert.deepStrictEqual(validator.validate('task-servers.json', content), []);
  });

  it('rejects task-servers.json that is not array', () => {
    const errors = validator.validate('task-servers.json', '{}');
    assert.ok(errors.some(e => e.includes('must be an array')));
  });

  it('rejects task-server with missing type', () => {
    const content = JSON.stringify([{ id: 'x' }]);
    const errors = validator.validate('task-servers.json', content);
    assert.ok(errors.some(e => e.includes('missing type')));
  });

  it('validates workflow JSON with states', () => {
    const content = JSON.stringify({ id: 'wf-1', name: 'Bug', states: [{ id: 's1', is_initial: true }] });
    assert.deepStrictEqual(validator.validate('workflows/bug.json', content), []);
  });

  it('rejects workflow JSON without states', () => {
    const content = JSON.stringify({ id: 'wf-1', name: 'Bug', states: [] });
    const errors = validator.validate('workflows/bug.json', content);
    assert.ok(errors.some(e => e.includes('no states')));
  });

  it('validates workflow YAML with states keyword', () => {
    assert.deepStrictEqual(validator.validate('workflows/story.yaml', 'states:\n  - id: s1'), []);
  });

  it('rejects empty workflow YAML', () => {
    const errors = validator.validate('workflows/story.yaml', '');
    assert.ok(errors.length > 0);
  });
});

// ── RobosStore integration test ──────────────────────────────────────────────

describe('RobosStore (integration)', () => {
  let tmpDir, store;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-store-'));
    store = new RobosStore({ localPath: tmpDir, autoPush: false });
    await store.init();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('set + get: round-trips a config file', async () => {
    await store.set('test.txt', 'hello world');
    const content = await store.get('test.txt');
    assert.strictEqual(content, 'hello world');
  });

  it('set: rejects invalid settings.json', async () => {
    await assert.rejects(
      () => store.set('settings.json', 'not json'),
      /Validation failed/
    );
  });

  it('set: accepts valid settings.json', async () => {
    await store.set('settings.json', '{"myProfileUid":"test"}');
    const content = await store.get('settings.json');
    assert.ok(content.includes('test'));
  });

  it('list + delete: manages files', async () => {
    await store.set('a.txt', '1');
    await store.set('b.txt', '2');
    let files = await store.list();
    assert.ok(files.includes('a.txt'));
    assert.ok(files.includes('b.txt'));

    await store.delete('a.txt');
    files = await store.list();
    assert.ok(!files.includes('a.txt'));
  });
});

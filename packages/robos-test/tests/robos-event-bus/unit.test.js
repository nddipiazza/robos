'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EVENT_BUS_PATH = path.resolve(__dirname, '../../../robos-event-bus');
const { EventBus, getCategory, getKnownTypes, getCategories, TYPE_TO_CATEGORY } = require(EVENT_BUS_PATH);

// ── Category mapping tests ──────────────────────────────────────────────────

describe('Category Mapping', () => {
  it('maps PR event types to pr_review', () => {
    assert.strictEqual(getCategory('pr_review_requested'), 'pr_review');
    assert.strictEqual(getCategory('pr_review_received'), 'pr_review');
    assert.strictEqual(getCategory('pr_merged'), 'pr_review');
    assert.strictEqual(getCategory('pr_opened'), 'pr_review');
  });

  it('maps CI/CD event types to ci_cd', () => {
    assert.strictEqual(getCategory('ci_started'), 'ci_cd');
    assert.strictEqual(getCategory('ci_completed'), 'ci_cd');
    assert.strictEqual(getCategory('deploy'), 'ci_cd');
  });

  it('maps task event types to task', () => {
    assert.strictEqual(getCategory('task_started'), 'task');
    assert.strictEqual(getCategory('task_status_changed'), 'task');
  });

  it('maps agent event types to agent', () => {
    assert.strictEqual(getCategory('agent_session'), 'agent');
  });

  it('maps system event types to system', () => {
    assert.strictEqual(getCategory('disk_low'), 'system');
    assert.strictEqual(getCategory('service_crash'), 'system');
    assert.strictEqual(getCategory('update_available'), 'system');
    assert.strictEqual(getCategory('scheduled_job_executed'), 'system');
  });

  it('maps git event types to git', () => {
    assert.strictEqual(getCategory('branch_created'), 'git');
    assert.strictEqual(getCategory('commit'), 'git');
    assert.strictEqual(getCategory('file_edited'), 'git');
  });

  it('maps journal event types to journal', () => {
    assert.strictEqual(getCategory('manual_note'), 'journal');
  });

  it('returns unknown for unmapped event types', () => {
    assert.strictEqual(getCategory('some_random_type'), 'unknown');
    assert.strictEqual(getCategory(''), 'unknown');
  });

  it('getKnownTypes returns all mapped types', () => {
    const types = getKnownTypes();
    assert.ok(types.includes('ci_completed'));
    assert.ok(types.includes('pr_merged'));
    assert.ok(types.includes('manual_note'));
    assert.strictEqual(types.length, Object.keys(TYPE_TO_CATEGORY).length);
  });

  it('getCategories returns unique category list', () => {
    const cats = getCategories();
    assert.ok(cats.includes('pr_review'));
    assert.ok(cats.includes('ci_cd'));
    assert.ok(cats.includes('system'));
    // No duplicates
    assert.strictEqual(cats.length, new Set(cats).size);
  });
});

// ── Event envelope creation tests ───────────────────────────────────────────

describe('Event Envelope', () => {
  let bus, tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evtbus-test-'));
    bus = new EventBus({
      socketPath: path.join(tmpDir, 'test.sock'),
      logDir: path.join(tmpDir, 'event-log'),
    });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates envelope with auto-generated id', () => {
    const env = bus.createEnvelope({ type: 'ci_completed', source: 'test' });
    assert.ok(env.id.startsWith('evt_'));
    assert.strictEqual(env.type, 'ci_completed');
    assert.strictEqual(env.source, 'test');
    assert.strictEqual(env.category, 'ci_cd');
    assert.ok(env.ts);
    assert.deepStrictEqual(env.payload, {});
  });

  it('auto-derives category from type', () => {
    const env = bus.createEnvelope({ type: 'pr_merged' });
    assert.strictEqual(env.category, 'pr_review');
  });

  it('preserves explicit category', () => {
    const env = bus.createEnvelope({ type: 'custom', category: 'my_cat' });
    assert.strictEqual(env.category, 'my_cat');
  });

  it('preserves explicit id', () => {
    const env = bus.createEnvelope({ id: 'evt_custom123', type: 'test' });
    assert.strictEqual(env.id, 'evt_custom123');
  });

  it('includes payload', () => {
    const env = bus.createEnvelope({ type: 'ci_completed', payload: { status: 'failure', repo: 'test' } });
    assert.strictEqual(env.payload.status, 'failure');
    assert.strictEqual(env.payload.repo, 'test');
  });
});

// ── Event persistence tests ─────────────────────────────────────────────────

describe('Event Persistence', () => {
  let bus, tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evtbus-persist-'));
    bus = new EventBus({
      socketPath: path.join(tmpDir, 'test.sock'),
      logDir: path.join(tmpDir, 'event-log'),
    });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists events to daily JSONL files', () => {
    const event = bus.createEnvelope({
      type: 'ci_completed',
      source: 'test',
      payload: { status: 'success' },
    });
    bus.persistEvent(event);

    const date = event.ts.slice(0, 10);
    const filePath = path.join(tmpDir, 'event-log', `${date}.jsonl`);
    assert.ok(fs.existsSync(filePath));

    const content = fs.readFileSync(filePath, 'utf8').trim();
    const parsed = JSON.parse(content);
    assert.strictEqual(parsed.type, 'ci_completed');
    assert.strictEqual(parsed.payload.status, 'success');
  });

  it('appends multiple events to same file', () => {
    bus.persistEvent(bus.createEnvelope({ type: 'pr_merged', source: 'test1' }));
    bus.persistEvent(bus.createEnvelope({ type: 'deploy', source: 'test2' }));

    const date = new Date().toISOString().slice(0, 10);
    const filePath = path.join(tmpDir, 'event-log', `${date}.jsonl`);
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    // At least 3 lines (1 from previous test + 2 new)
    assert.ok(lines.length >= 3);
  });

  it('publish returns envelope with id', () => {
    const envelope = bus.publish({ type: 'task_started', source: 'test', payload: { taskId: 't1' } });
    assert.ok(envelope.id.startsWith('evt_'));
    assert.strictEqual(envelope.type, 'task_started');
    assert.strictEqual(envelope.category, 'task');
  });
});

// ── Query filtering tests ───────────────────────────────────────────────────

describe('Event Query', () => {
  let bus, tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evtbus-query-'));
    bus = new EventBus({
      socketPath: path.join(tmpDir, 'test.sock'),
      logDir: path.join(tmpDir, 'event-log'),
    });

    // Publish some test events
    bus.publish({ type: 'ci_completed', source: 'ci', payload: { status: 'success' } });
    bus.publish({ type: 'ci_completed', source: 'ci', payload: { status: 'failure' } });
    bus.publish({ type: 'pr_merged', source: 'github', payload: { prNumber: 42 } });
    bus.publish({ type: 'deploy', source: 'cd', payload: { env: 'prod' } });
    bus.publish({ type: 'task_started', source: 'jira', payload: { taskId: 't1' } });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('query without filter returns all buffered events', () => {
    const results = bus.query({});
    assert.strictEqual(results.length, 5);
  });

  it('query by category filters correctly', () => {
    const results = bus.query({ category: 'ci_cd' });
    assert.strictEqual(results.length, 3); // 2 ci_completed + 1 deploy
    assert.ok(results.every(e => e.category === 'ci_cd'));
  });

  it('query by type filters correctly', () => {
    const results = bus.query({ type: 'ci_completed' });
    assert.strictEqual(results.length, 2);
  });

  it('query respects limit', () => {
    const results = bus.query({ limit: 2 });
    assert.strictEqual(results.length, 2);
  });

  it('query with since reads from disk', () => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3600000);
    const results = bus.query({ since: hourAgo.toISOString(), until: now.toISOString() });
    // Events were published by this bus instance, so they're on disk
    assert.ok(results.length >= 5, `Expected >= 5 events from disk, got ${results.length}`);
  });

  it('query returns results sorted newest first', () => {
    const results = bus.query({});
    for (let i = 1; i < results.length; i++) {
      assert.ok(new Date(results[i - 1].ts) >= new Date(results[i].ts));
    }
  });
});

// ── Cleanup tests ───────────────────────────────────────────────────────────

describe('Event Cleanup', () => {
  let bus, tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evtbus-cleanup-'));
    bus = new EventBus({
      socketPath: path.join(tmpDir, 'test.sock'),
      logDir: path.join(tmpDir, 'event-log'),
      retention: 7,
    });

    // Create some old log files
    const logDir = path.join(tmpDir, 'event-log');
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, '2020-01-01.jsonl'), '{"old":"event"}\n');
    fs.writeFileSync(path.join(logDir, '2020-06-15.jsonl'), '{"old":"event2"}\n');
    // Create a recent one
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(logDir, `${today}.jsonl`), '{"recent":"event"}\n');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('cleanup removes old files', () => {
    const removed = bus.cleanup();
    assert.strictEqual(removed, 2);
  });

  it('cleanup keeps recent files', () => {
    const today = new Date().toISOString().slice(0, 10);
    const logDir = path.join(tmpDir, 'event-log');
    assert.ok(fs.existsSync(path.join(logDir, `${today}.jsonl`)));
  });
});

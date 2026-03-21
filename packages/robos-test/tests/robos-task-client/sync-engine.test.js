'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const LIB_PATH = path.resolve(__dirname, '../../../robos-task-client/sync-engine');
const {
  robosToExternal, externalToRobos,
  recordTransition, readTracking, writeTracking, getTotalTimeSpent,
  formatComment, COMMENT_TEMPLATES,
  SyncEngine,
} = require(LIB_PATH);

const STATUS_MAP = [
  { robos: 'backlog', external: 'To Do' },
  { robos: 'in_progress', external: 'In Progress' },
  { robos: 'in_review', external: 'In Review' },
  { robos: 'deploying', external: 'Deploying' },
  { robos: 'deployed', external: 'Done' },
];

// ── Status mapping tests ─────────────────────────────────────────────────────

describe('Status mapping', () => {
  it('robosToExternal: maps known stages', () => {
    assert.strictEqual(robosToExternal(STATUS_MAP, 'in_progress'), 'In Progress');
    assert.strictEqual(robosToExternal(STATUS_MAP, 'deployed'), 'Done');
  });

  it('robosToExternal: returns stage as-is for unknown', () => {
    assert.strictEqual(robosToExternal(STATUS_MAP, 'custom_stage'), 'custom_stage');
  });

  it('robosToExternal: handles empty/null map', () => {
    assert.strictEqual(robosToExternal([], 'test'), 'test');
    assert.strictEqual(robosToExternal(null, 'test'), 'test');
  });

  it('externalToRobos: maps known statuses (case-insensitive)', () => {
    assert.strictEqual(externalToRobos(STATUS_MAP, 'In Progress'), 'in_progress');
    assert.strictEqual(externalToRobos(STATUS_MAP, 'in progress'), 'in_progress');
    assert.strictEqual(externalToRobos(STATUS_MAP, 'Done'), 'deployed');
  });

  it('externalToRobos: returns status as-is for unknown', () => {
    assert.strictEqual(externalToRobos(STATUS_MAP, 'Blocked'), 'Blocked');
  });
});

// ── Time tracking tests ──────────────────────────────────────────────────────

describe('Time tracking', () => {
  let tmpHome;
  const origHome = process.env.HOME;

  before(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'));
    process.env.HOME = tmpHome;
  });

  after(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('readTracking: returns default for new issue', () => {
    const t = readTracking('NEW-1');
    assert.strictEqual(t.issueKey, 'NEW-1');
    assert.strictEqual(t.entries.length, 0);
    assert.strictEqual(t.currentStage, null);
  });

  it('recordTransition: records first transition', () => {
    const timeSpent = recordTransition('TEST-1', null, 'in_progress');
    assert.strictEqual(timeSpent, 0); // no previous stage
    const t = readTracking('TEST-1');
    assert.strictEqual(t.currentStage, 'in_progress');
    assert.ok(t.stageStartedAt);
  });

  it('recordTransition: records subsequent transition with time', () => {
    // Manually set a start time 2 hours ago
    const tracking = readTracking('TEST-1');
    tracking.stageStartedAt = new Date(Date.now() - 7200000).toISOString();
    writeTracking('TEST-1', tracking);

    const timeSpent = recordTransition('TEST-1', 'in_progress', 'in_review');
    assert.ok(timeSpent >= 7190 && timeSpent <= 7210, `Expected ~7200s, got ${timeSpent}`);

    const t = readTracking('TEST-1');
    assert.strictEqual(t.currentStage, 'in_review');
    assert.strictEqual(t.entries.length, 1);
    assert.strictEqual(t.entries[0].stage, 'in_progress');
  });

  it('getTotalTimeSpent: sums all entries plus current', () => {
    writeTracking('TEST-2', {
      issueKey: 'TEST-2',
      entries: [
        { stage: 'backlog', timeSpentSeconds: 3600 },
        { stage: 'in_progress', timeSpentSeconds: 7200 },
      ],
      currentStage: 'in_review',
      stageStartedAt: new Date(Date.now() - 1800000).toISOString(), // 30 min ago
    });

    const total = getTotalTimeSpent('TEST-2');
    // 3600 + 7200 + ~1800 = ~12600
    assert.ok(total >= 12590 && total <= 12610, `Expected ~12600, got ${total}`);
  });
});

// ── Comment templates ────────────────────────────────────────────────────────

describe('Comment templates', () => {
  it('formatComment: fills template variables', () => {
    assert.strictEqual(
      formatComment('stage_change', { from: 'backlog', to: 'in_progress' }),
      '[RobOS] Status changed: backlog → in_progress'
    );
  });

  it('formatComment: fills PR template', () => {
    assert.strictEqual(
      formatComment('pr_created', { prUrl: 'https://github.com/org/repo/pull/42' }),
      '[RobOS] PR https://github.com/org/repo/pull/42 created'
    );
  });

  it('formatComment: fills deploy template', () => {
    const result = formatComment('deployed', { env: 'staging', version: 'v1.3.0' });
    assert.ok(result.includes('staging'));
    assert.ok(result.includes('v1.3.0'));
  });

  it('formatComment: handles missing vars gracefully', () => {
    const result = formatComment('stage_change', {});
    assert.ok(result.includes('[RobOS]'));
  });

  it('formatComment: accepts raw string template', () => {
    assert.strictEqual(formatComment('Custom: {{x}}', { x: 'hello' }), 'Custom: hello');
  });

  it('COMMENT_TEMPLATES: has all expected keys', () => {
    assert.ok(COMMENT_TEMPLATES.stage_change);
    assert.ok(COMMENT_TEMPLATES.pr_created);
    assert.ok(COMMENT_TEMPLATES.ci_passed);
    assert.ok(COMMENT_TEMPLATES.ci_failed);
    assert.ok(COMMENT_TEMPLATES.deployed);
    assert.ok(COMMENT_TEMPLATES.time_logged);
  });
});

// ── SyncEngine tests (with mock adapter) ─────────────────────────────────────

describe('SyncEngine', () => {
  let tmpHome;
  const origHome = process.env.HOME;

  before(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-eng-'));
    process.env.HOME = tmpHome;
  });

  after(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function mockAdapter() {
    const calls = [];
    return {
      type: 'github',
      calls,
      transitionIssueTo: async (id, status, removeLabel) => { calls.push({ fn: 'transition', id, status, removeLabel }); },
      logWork: async (id, seconds, comment) => { calls.push({ fn: 'logWork', id, seconds, comment }); },
      addComment: async (id, body) => { calls.push({ fn: 'addComment', id, body }); },
      getIssue: async (id) => { return { key: `#${id}`, status: 'open' }; },
    };
  }

  it('constructor: sets defaults', () => {
    const adapter = mockAdapter();
    const engine = new SyncEngine(adapter, STATUS_MAP);
    assert.strictEqual(engine.pollIntervalMs, 60000);
    assert.strictEqual(engine.autoLogHours, true);
  });

  it('transitionAndSync: calls adapter and records time', async () => {
    const adapter = mockAdapter();
    const synced = [];
    const engine = new SyncEngine(adapter, STATUS_MAP, { onSync: e => synced.push(e) });

    // First transition (no previous stage)
    const r1 = await engine.transitionAndSync('#100', 'in_progress');
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.externalStatus, 'In Progress');
    assert.ok(adapter.calls.some(c => c.fn === 'transition' && c.status === 'In Progress'));
    // No comment for first transition (no fromStage)
    assert.ok(!adapter.calls.some(c => c.fn === 'addComment'));

    // Second transition
    adapter.calls.length = 0;
    // Set stage start to 2 hours ago
    const tracking = readTracking('#100');
    tracking.stageStartedAt = new Date(Date.now() - 7200000).toISOString();
    writeTracking('#100', tracking);

    const r2 = await engine.transitionAndSync('#100', 'in_review');
    assert.strictEqual(r2.externalStatus, 'In Review');
    assert.ok(r2.timeSpent >= 7190);
    // Should log hours (> 60 seconds)
    assert.ok(adapter.calls.some(c => c.fn === 'logWork'), 'should log work');
    // Should add stage change comment
    assert.ok(adapter.calls.some(c => c.fn === 'addComment' && c.body.includes('in_progress') && c.body.includes('in_review')));
    assert.strictEqual(synced.length, 2);
  });

  it('transitionAndSync: skips hours logging when autoLogHours=false', async () => {
    const adapter = mockAdapter();
    const engine = new SyncEngine(adapter, STATUS_MAP, { autoLogHours: false });

    // Set up a transition with time
    recordTransition('#200', null, 'backlog');
    const t = readTracking('#200');
    t.stageStartedAt = new Date(Date.now() - 3600000).toISOString();
    writeTracking('#200', t);

    await engine.transitionAndSync('#200', 'in_progress');
    assert.ok(!adapter.calls.some(c => c.fn === 'logWork'), 'should not log work');
  });

  it('pollExternalChanges: detects external status change', async () => {
    let currentStatus = 'open';
    const adapter = {
      type: 'github',
      getIssue: async () => ({ key: '#300', status: currentStatus }),
    };
    const conflicts = [];
    const engine = new SyncEngine(adapter, STATUS_MAP, { onConflict: c => conflicts.push(c) });

    // First poll — establishes baseline
    await engine.pollExternalChanges(['#300']);
    assert.strictEqual(conflicts.length, 0);

    // External change
    currentStatus = 'closed';
    const changes = await engine.pollExternalChanges(['#300']);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].currentExternal, 'closed');
    assert.strictEqual(conflicts.length, 1);
    assert.ok(conflicts[0].message.includes('closed'));
  });

  it('addMilestoneComment: adds comment via adapter', async () => {
    const adapter = mockAdapter();
    const engine = new SyncEngine(adapter, STATUS_MAP);

    const result = await engine.addMilestoneComment('#400', 'pr_created', { prUrl: 'https://github.com/test/pr/1' });
    assert.strictEqual(result.ok, true);
    assert.ok(adapter.calls.some(c => c.fn === 'addComment' && c.body.includes('PR')));
  });
});

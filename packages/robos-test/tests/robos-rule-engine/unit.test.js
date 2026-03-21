'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const RULE_ENGINE_PATH = path.resolve(__dirname, '../../../robos-rule-engine');
const { RuleEngine, evaluateCondition, evaluateConditions, operators, getField, DEFAULT_RULES } = require(RULE_ENGINE_PATH);

// ── Condition operator tests ────────────────────────────────────────────────

describe('Condition Operators', () => {
  it('eq: returns true for equal values', () => {
    assert.strictEqual(operators.eq('failure', 'failure'), true);
    assert.strictEqual(operators.eq(42, 42), true);
  });

  it('eq: returns false for unequal values', () => {
    assert.strictEqual(operators.eq('failure', 'success'), false);
  });

  it('neq: returns true for unequal values', () => {
    assert.strictEqual(operators.neq('dev', 'prod'), true);
  });

  it('neq: returns false for equal values', () => {
    assert.strictEqual(operators.neq('dev', 'dev'), false);
  });

  it('contains: returns true when string contains substring', () => {
    assert.strictEqual(operators.contains('frontend-app', 'frontend'), true);
  });

  it('contains: returns false when string does not contain substring', () => {
    assert.strictEqual(operators.contains('backend-api', 'frontend'), false);
  });

  it('contains: returns false for non-string', () => {
    assert.strictEqual(operators.contains(42, 'foo'), false);
  });

  it('matches: returns true for regex match', () => {
    assert.strictEqual(operators.matches('fix/login-bug', '^fix/'), true);
  });

  it('matches: returns false for no match', () => {
    assert.strictEqual(operators.matches('feature/new-ui', '^fix/'), false);
  });

  it('matches: returns false for non-string', () => {
    assert.strictEqual(operators.matches(42, '\\d+'), false);
  });

  it('gt: returns true when actual > expected', () => {
    assert.strictEqual(operators.gt(301, 300), true);
  });

  it('gt: returns false when actual <= expected', () => {
    assert.strictEqual(operators.gt(300, 300), false);
    assert.strictEqual(operators.gt(299, 300), false);
  });

  it('lt: returns true when actual < expected', () => {
    assert.strictEqual(operators.lt(5, 10), true);
  });

  it('lt: returns false when actual >= expected', () => {
    assert.strictEqual(operators.lt(10, 10), false);
    assert.strictEqual(operators.lt(11, 10), false);
  });

  it('exists: returns true when value is defined', () => {
    assert.strictEqual(operators.exists('hello'), true);
    assert.strictEqual(operators.exists(0), true);
    assert.strictEqual(operators.exists(false), true);
  });

  it('exists: returns false when value is null/undefined', () => {
    assert.strictEqual(operators.exists(null), false);
    assert.strictEqual(operators.exists(undefined), false);
  });
});

// ── Field access tests ──────────────────────────────────────────────────────

describe('getField', () => {
  const event = {
    type: 'ci_completed',
    payload: {
      status: 'failure',
      repo: 'my-repo',
      nested: { deep: { value: 42 } },
    },
  };

  it('gets top-level field', () => {
    assert.strictEqual(getField(event, 'type'), 'ci_completed');
  });

  it('gets nested field with dot notation', () => {
    assert.strictEqual(getField(event, 'payload.status'), 'failure');
  });

  it('gets deeply nested field', () => {
    assert.strictEqual(getField(event, 'payload.nested.deep.value'), 42);
  });

  it('returns undefined for missing field', () => {
    assert.strictEqual(getField(event, 'payload.missing'), undefined);
  });

  it('returns undefined for null intermediate', () => {
    assert.strictEqual(getField(event, 'payload.missing.deep'), undefined);
  });
});

// ── evaluateCondition tests ─────────────────────────────────────────────────

describe('evaluateCondition', () => {
  const event = {
    type: 'ci_completed',
    payload: { status: 'failure', duration: 301, repo: 'frontend-app', reviewer: 'alice' },
  };

  it('evaluates eq condition', () => {
    assert.strictEqual(evaluateCondition(event, { field: 'payload.status', op: 'eq', value: 'failure' }), true);
    assert.strictEqual(evaluateCondition(event, { field: 'payload.status', op: 'eq', value: 'success' }), false);
  });

  it('evaluates contains condition', () => {
    assert.strictEqual(evaluateCondition(event, { field: 'payload.repo', op: 'contains', value: 'frontend' }), true);
  });

  it('evaluates gt condition', () => {
    assert.strictEqual(evaluateCondition(event, { field: 'payload.duration', op: 'gt', value: 300 }), true);
  });

  it('evaluates exists condition', () => {
    assert.strictEqual(evaluateCondition(event, { field: 'payload.reviewer', op: 'exists' }), true);
    assert.strictEqual(evaluateCondition(event, { field: 'payload.missing', op: 'exists' }), false);
  });
});

// ── evaluateConditions (AND-combined) ───────────────────────────────────────

describe('evaluateConditions', () => {
  const event = {
    type: 'ci_completed',
    payload: { status: 'failure', env: 'prod', duration: 500 },
  };

  it('returns true when all conditions pass', () => {
    const conditions = [
      { field: 'payload.status', op: 'eq', value: 'failure' },
      { field: 'payload.env', op: 'eq', value: 'prod' },
    ];
    assert.strictEqual(evaluateConditions(event, conditions), true);
  });

  it('returns false when any condition fails', () => {
    const conditions = [
      { field: 'payload.status', op: 'eq', value: 'failure' },
      { field: 'payload.env', op: 'eq', value: 'dev' },
    ];
    assert.strictEqual(evaluateConditions(event, conditions), false);
  });

  it('returns true for empty conditions', () => {
    assert.strictEqual(evaluateConditions(event, []), true);
    assert.strictEqual(evaluateConditions(event, null), true);
  });
});

// ── Rule matching tests ─────────────────────────────────────────────────────

describe('Rule Matching', () => {
  let engine, tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-test-'));
    engine = new RuleEngine({
      rulesPath: path.join(tmpDir, 'event-rules.json'),
      logDir: path.join(tmpDir, 'event-log'),
    });

    const rules = [
      {
        id: 'rule_1',
        name: 'CI failure alert',
        enabled: true,
        trigger: {
          eventType: 'ci_completed',
          conditions: [{ field: 'payload.status', op: 'eq', value: 'failure' }],
        },
        actions: [{ type: 'notify', params: { tier: 'critical', category: 'ci_cd', title: 'CI Failed' } }],
        cooldown: 0,
        lastFired: null,
      },
      {
        id: 'rule_2',
        name: 'Disabled rule',
        enabled: false,
        trigger: { eventType: 'ci_completed', conditions: [] },
        actions: [],
        cooldown: 0,
        lastFired: null,
      },
      {
        id: 'rule_3',
        name: 'Cooldown rule',
        enabled: true,
        trigger: { eventType: 'file_edited', conditions: [] },
        actions: [{ type: 'notify', params: { tier: 'info', category: 'git', title: 'File edited' } }],
        cooldown: 60,
        lastFired: new Date().toISOString(),
      },
    ];

    fs.mkdirSync(path.dirname(engine.rulesPath), { recursive: true });
    fs.writeFileSync(engine.rulesPath, JSON.stringify(rules));
    engine.loadRules();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('matches rule when event type and conditions match', () => {
    const event = { type: 'ci_completed', payload: { status: 'failure' } };
    const matches = engine.evaluate(event);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].rule.id, 'rule_1');
  });

  it('does not match when conditions fail', () => {
    const event = { type: 'ci_completed', payload: { status: 'success' } };
    const matches = engine.evaluate(event);
    assert.strictEqual(matches.length, 0);
  });

  it('skips disabled rules', () => {
    const event = { type: 'ci_completed', payload: {} };
    const matches = engine.evaluate(event);
    // rule_2 is disabled, should not match even though eventType matches with no conditions
    assert.ok(!matches.some(m => m.rule.id === 'rule_2'));
  });

  it('skips rules within cooldown window', () => {
    const event = { type: 'file_edited', payload: {} };
    const matches = engine.evaluate(event);
    assert.strictEqual(matches.length, 0); // rule_3 is within cooldown
  });

  it('matches rules outside cooldown window', () => {
    // Set lastFired to 2 minutes ago
    const rules = engine.getRules();
    const rule3 = rules.find(r => r.id === 'rule_3');
    rule3.lastFired = new Date(Date.now() - 120000).toISOString();

    const event = { type: 'file_edited', payload: {} };
    const matches = engine.evaluate(event);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].rule.id, 'rule_3');
  });

  it('does not match unrelated event types', () => {
    const event = { type: 'pr_merged', payload: {} };
    const matches = engine.evaluate(event);
    assert.strictEqual(matches.length, 0);
  });
});

// ── Default rules tests ─────────────────────────────────────────────────────

describe('Default Rules', () => {
  it('has 4 default rules', () => {
    assert.strictEqual(DEFAULT_RULES.length, 4);
  });

  it('all defaults have required fields', () => {
    for (const rule of DEFAULT_RULES) {
      assert.ok(rule.id, 'should have id');
      assert.ok(rule.name, 'should have name');
      assert.strictEqual(rule.enabled, true, 'should be enabled');
      assert.ok(rule.trigger, 'should have trigger');
      assert.ok(rule.trigger.eventType, 'should have eventType');
      assert.ok(Array.isArray(rule.actions), 'should have actions array');
      assert.ok(rule.actions.length > 0, 'should have at least one action');
    }
  });

  it('CI failure rule triggers on ci_completed', () => {
    const rule = DEFAULT_RULES.find(r => r.id === 'rule_default_ci_failure');
    assert.ok(rule);
    assert.strictEqual(rule.trigger.eventType, 'ci_completed');
    assert.ok(rule.trigger.conditions.length > 0);
    assert.strictEqual(rule.actions[0].params.tier, 'critical');
  });

  it('PR review rule triggers on pr_review_requested', () => {
    const rule = DEFAULT_RULES.find(r => r.id === 'rule_default_pr_review');
    assert.ok(rule);
    assert.strictEqual(rule.trigger.eventType, 'pr_review_requested');
    assert.strictEqual(rule.actions[0].params.tier, 'warning');
  });

  it('PR merged rule triggers on pr_merged', () => {
    const rule = DEFAULT_RULES.find(r => r.id === 'rule_default_pr_merged');
    assert.ok(rule);
    assert.strictEqual(rule.trigger.eventType, 'pr_merged');
    assert.strictEqual(rule.actions[0].params.tier, 'info');
  });

  it('Deploy rule triggers on deploy', () => {
    const rule = DEFAULT_RULES.find(r => r.id === 'rule_default_deploy');
    assert.ok(rule);
    assert.strictEqual(rule.trigger.eventType, 'deploy');
    assert.strictEqual(rule.actions[0].params.tier, 'info');
  });
});

// ── Rule loading tests ──────────────────────────────────────────────────────

describe('Rule Loading', () => {
  it('creates default rules when file does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-load-'));
    const engine = new RuleEngine({
      rulesPath: path.join(tmpDir, 'event-rules.json'),
      logDir: path.join(tmpDir, 'event-log'),
    });

    engine.loadRules();
    assert.strictEqual(engine.getRules().length, DEFAULT_RULES.length);
    assert.ok(fs.existsSync(path.join(tmpDir, 'event-rules.json')));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles malformed JSON gracefully', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-bad-'));
    const rulesPath = path.join(tmpDir, 'event-rules.json');
    fs.writeFileSync(rulesPath, '{ invalid json }}');

    const engine = new RuleEngine({ rulesPath, logDir: path.join(tmpDir, 'log') });
    engine.loadRules(); // Should not throw
    assert.strictEqual(engine.getRules().length, 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

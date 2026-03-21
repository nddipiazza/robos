'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const REGISTRY_PATH = path.resolve(__dirname, '../../../robos-action-registry');
const { ActionRegistry, resolveTemplate, resolveParams } = require(REGISTRY_PATH);

// ── Template resolution tests ───────────────────────────────────────────────

describe('Template Resolution', () => {
  it('resolves simple field', () => {
    const result = resolveTemplate('Hello {{name}}', { name: 'World' });
    assert.strictEqual(result, 'Hello World');
  });

  it('resolves nested payload field', () => {
    const ctx = { payload: { repo: 'my-repo', branch: 'main' } };
    const result = resolveTemplate('Repo: {{payload.repo}}, Branch: {{payload.branch}}', ctx);
    assert.strictEqual(result, 'Repo: my-repo, Branch: main');
  });

  it('resolves {{type}} and {{source}}', () => {
    const ctx = { type: 'ci_completed', source: 'github' };
    const result = resolveTemplate('{{type}} from {{source}}', ctx);
    assert.strictEqual(result, 'ci_completed from github');
  });

  it('resolves {{now}} to ISO timestamp', () => {
    const result = resolveTemplate('Time: {{now}}', {});
    assert.ok(result.startsWith('Time: 20'));
    assert.ok(result.includes('T'));
  });

  it('resolves {{user}} to current user', () => {
    const result = resolveTemplate('User: {{user}}', {});
    assert.strictEqual(result, `User: ${os.userInfo().username}`);
  });

  it('resolves {{steps[N].output}}', () => {
    const ctx = { steps: [{ output: 'step0 result' }, { output: 'step1 result' }] };
    const result = resolveTemplate('Got: {{steps[0].output}}', ctx);
    assert.strictEqual(result, 'Got: step0 result');
  });

  it('preserves unresolvable templates', () => {
    const result = resolveTemplate('{{missing.field}}', {});
    assert.strictEqual(result, '{{missing.field}}');
  });

  it('resolves non-string values to string', () => {
    const result = resolveTemplate('Count: {{payload.count}}', { payload: { count: 42 } });
    assert.strictEqual(result, 'Count: 42');
  });

  it('resolveParams resolves all string values', () => {
    const params = { title: '{{type}} alert', count: 5, message: 'From {{source}}' };
    const ctx = { type: 'ci_failed', source: 'github' };
    const resolved = resolveParams(params, ctx);
    assert.strictEqual(resolved.title, 'ci_failed alert');
    assert.strictEqual(resolved.message, 'From github');
    assert.strictEqual(resolved.count, 5);
  });
});

// ── Registry API tests ──────────────────────────────────────────────────────

describe('ActionRegistry', () => {
  let registry;

  before(() => {
    registry = new ActionRegistry();
    registry.loadBuiltins();
  });

  it('listTypes returns all built-in types', () => {
    const types = registry.listTypes();
    assert.ok(types.includes('notify'));
    assert.ok(types.includes('run_script'));
    assert.ok(types.includes('launch_app'));
    assert.ok(types.includes('webhook'));
    assert.ok(types.includes('journal_append'));
    assert.ok(types.includes('launch_agent'));
    assert.strictEqual(types.length, 6);
  });

  it('getType returns full definition', () => {
    const def = registry.getType('notify');
    assert.strictEqual(def.type, 'notify');
    assert.ok(def.label);
    assert.ok(def.description);
    assert.ok(def.params);
    assert.ok(typeof def.execute === 'function');
  });

  it('getType returns null for unknown type', () => {
    assert.strictEqual(registry.getType('nonexistent'), null);
  });

  it('getParamSchema returns params for known type', () => {
    const schema = registry.getParamSchema('notify');
    assert.ok(schema.tier);
    assert.strictEqual(schema.tier.type, 'enum');
    assert.ok(schema.tier.values.includes('critical'));
  });

  it('getParamSchema returns null for unknown type', () => {
    assert.strictEqual(registry.getParamSchema('nonexistent'), null);
  });
});

// ── Validation tests ────────────────────────────────────────────────────────

describe('Validation', () => {
  let registry;

  before(() => {
    registry = new ActionRegistry();
    registry.loadBuiltins();
  });

  it('validates valid notify params', () => {
    const result = registry.validate('notify', {
      tier: 'critical',
      category: 'ci_cd',
      title: 'Test',
    });
    assert.deepStrictEqual(result, { valid: true });
  });

  it('rejects missing required params', () => {
    const result = registry.validate('notify', { tier: 'info' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('category')));
    assert.ok(result.errors.some(e => e.includes('title')));
  });

  it('rejects invalid enum value', () => {
    const result = registry.validate('notify', {
      tier: 'emergency',
      category: 'ci_cd',
      title: 'Test',
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('tier')));
  });

  it('rejects unknown action type', () => {
    const result = registry.validate('unknown_type', {});
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Unknown')));
  });

  it('validates run_script params', () => {
    const result = registry.validate('run_script', { command: 'echo hello' });
    assert.deepStrictEqual(result, { valid: true });
  });

  it('rejects run_script without command', () => {
    const result = registry.validate('run_script', {});
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('command')));
  });
});

// ── Action execution tests ──────────────────────────────────────────────────

describe('Action Execution', () => {
  let registry, tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'action-test-'));
    registry = new ActionRegistry();
    registry.loadBuiltins();

    // Override HOME for notifications file
    process.env._ORIG_HOME = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  after(() => {
    process.env.HOME = process.env._ORIG_HOME;
    delete process.env._ORIG_HOME;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('notify action writes to notifications.json', async () => {
    const result = await registry.execute('notify', {
      tier: 'info',
      category: 'system',
      title: 'Test Notification',
      message: 'Hello from test',
    });
    assert.strictEqual(result.success, true);

    const notifFile = path.join(tmpDir, '.config', 'robos', 'notifications.json');
    assert.ok(fs.existsSync(notifFile));
    const notifications = JSON.parse(fs.readFileSync(notifFile, 'utf8'));
    assert.ok(notifications.length >= 1);
    assert.strictEqual(notifications[notifications.length - 1].title, 'Test Notification');
  });

  it('run_script executes shell command', async () => {
    const result = await registry.execute('run_script', {
      command: 'echo hello_world',
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, 'hello_world');
  });

  it('run_script returns failure for bad command', async () => {
    const result = await registry.execute('run_script', {
      command: 'nonexistent_command_xyz',
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('journal_append writes journal entry', async () => {
    const result = await registry.execute('journal_append', {
      text: 'Test journal entry',
      type: 'note',
    });
    assert.strictEqual(result.success, true);

    const date = new Date().toISOString().slice(0, 10);
    const journalFile = path.join(tmpDir, '.config', 'robos', 'journal', `${date}.jsonl`);
    assert.ok(fs.existsSync(journalFile));
    const content = fs.readFileSync(journalFile, 'utf8').trim();
    const entry = JSON.parse(content);
    assert.strictEqual(entry.text, 'Test journal entry');
    assert.strictEqual(entry.type, 'note');
  });

  it('launch_agent returns placeholder result', async () => {
    const result = await registry.execute('launch_agent', {
      prompt: 'Analyze this issue',
    });
    assert.strictEqual(result.success, true);
    assert.ok(result.output.includes('placeholder'));
  });

  it('execute resolves template variables', async () => {
    const result = await registry.execute('run_script', {
      command: 'echo {{type}}',
    }, { type: 'ci_completed' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, 'ci_completed');
  });

  it('execute returns failure for unknown type', async () => {
    const result = await registry.execute('unknown_type', {});
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Unknown'));
  });
});

'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const LIB_PATH = path.resolve(__dirname, '../../../robos-agent-client');

// ── Agent Registry ───────────────────────────────────────────────────────────

describe('Agent Registry', () => {
  const { listAgents, detectInstalled, createSession, BACKENDS } = require(path.join(LIB_PATH, 'agent-registry'));

  it('listAgents returns claude and copilot entries', () => {
    const agents = listAgents();
    assert.ok(Array.isArray(agents));
    assert.ok(agents.length >= 2);

    const ids = agents.map((a) => a.id);
    assert.ok(ids.includes('claude'), 'should include claude');
    assert.ok(ids.includes('copilot'), 'should include copilot');

    for (const agent of agents) {
      assert.ok(agent.id);
      assert.ok(agent.name);
      assert.ok(agent.command);
      assert.ok(agent.description);
      assert.strictEqual(typeof agent.installed, 'boolean');
    }
  });

  it('detectInstalled returns object keyed by agent id with boolean values', () => {
    const result = detectInstalled();
    assert.strictEqual(typeof result, 'object');
    assert.ok('claude' in result);
    assert.ok('copilot' in result);
    assert.strictEqual(typeof result.claude, 'boolean');
    assert.strictEqual(typeof result.copilot, 'boolean');
  });

  it('BACKENDS has expected structure', () => {
    assert.ok(BACKENDS.claude);
    assert.ok(BACKENDS.copilot);
    assert.strictEqual(BACKENDS.claude.command, 'claude');
    assert.strictEqual(BACKENDS.copilot.command, 'gh');
  });

  it('createSession returns an AgentSession for a valid agent', () => {
    const session = createSession('claude');
    assert.strictEqual(session.agentId, 'claude');
    assert.ok(session.id);
    assert.strictEqual(session.getStatus(), 'idle');
  });

  it('createSession throws for unknown agent', () => {
    assert.throws(() => createSession('nonexistent'), /Unknown agent/);
  });
});

// ── AgentSession ─────────────────────────────────────────────────────────────

describe('AgentSession state management', () => {
  const { AgentSession } = require(path.join(LIB_PATH, 'agent-session'));

  it('initial status is idle', () => {
    const s = new AgentSession({ agentId: 'claude' });
    assert.strictEqual(s.getStatus(), 'idle');
    assert.strictEqual(s.getDuration(), null);
  });

  it('start transitions to running (with mock backend)', () => {
    const { EventEmitter } = require('node:events');
    const mockProc = new EventEmitter();
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.kill = () => {};

    const mockBackend = { spawn: () => mockProc };
    const s = new AgentSession({ agentId: 'claude', backend: mockBackend });
    s.start('/tmp', [], 'test prompt');
    assert.strictEqual(s.getStatus(), 'running');
    assert.ok(s.startedAt);
  });

  it('stop transitions to stopped', () => {
    const { EventEmitter } = require('node:events');
    const mockProc = new EventEmitter();
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.kill = () => {};

    const mockBackend = { spawn: () => mockProc };
    const s = new AgentSession({ agentId: 'claude', backend: mockBackend });
    s.start('/tmp', [], 'test');
    s.stop();
    assert.strictEqual(s.getStatus(), 'stopped');
    assert.ok(s.stoppedAt);
  });

  it('start without backend throws', () => {
    const s = new AgentSession({ agentId: 'claude' });
    assert.throws(() => s.start('/tmp', [], 'test'), /No backend configured/);
  });

  it('start when already running throws', () => {
    const { EventEmitter } = require('node:events');
    const mockProc = new EventEmitter();
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.kill = () => {};

    const mockBackend = { spawn: () => mockProc };
    const s = new AgentSession({ agentId: 'claude', backend: mockBackend });
    s.start('/tmp', [], 'test');
    assert.throws(() => s.start('/tmp', [], 'again'), /already running/);
  });

  it('onOutput receives data from stdout', (_, done) => {
    const { EventEmitter } = require('node:events');
    const mockProc = new EventEmitter();
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.kill = () => {};

    const mockBackend = { spawn: () => mockProc };
    const s = new AgentSession({ agentId: 'claude', backend: mockBackend });
    s.start('/tmp', [], 'test');

    s.onOutput((data) => {
      assert.strictEqual(data, 'hello');
      done();
    });

    mockProc.stdout.emit('data', Buffer.from('hello'));
  });

  it('onComplete fires on process close', (_, done) => {
    const { EventEmitter } = require('node:events');
    const mockProc = new EventEmitter();
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.kill = () => {};

    const mockBackend = { spawn: () => mockProc };
    const s = new AgentSession({ agentId: 'claude', backend: mockBackend });
    s.start('/tmp', [], 'test');

    s.onComplete((result) => {
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(s.getStatus(), 'stopped');
      done();
    });

    mockProc.emit('close', 0);
  });
});

describe('AgentSession persistence', () => {
  const { AgentSession } = require(path.join(LIB_PATH, 'agent-session'));

  it('save and load round-trip', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-agent-test-'));
    // Temporarily override SESSION_DIR via a custom session
    const s = new AgentSession({ agentId: 'claude', id: 'test-persist-001' });
    s.status = 'stopped';
    s.startedAt = 1000;
    s.stoppedAt = 5000;
    s.tokenUsage = { input: 100, output: 200 };
    s.filesChanged = ['src/foo.js'];
    s.exitCode = 0;
    s._outputBuffer = 'some output';

    // Write directly to tmpDir to avoid polluting real config
    const filePath = path.join(tmpDir, 'test-persist-001.json');
    fs.writeFileSync(filePath, JSON.stringify(s.toJSON(), null, 2));

    // Read it back
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    assert.strictEqual(data.id, 'test-persist-001');
    assert.strictEqual(data.agentId, 'claude');
    assert.strictEqual(data.status, 'stopped');
    assert.strictEqual(data.startedAt, 1000);
    assert.strictEqual(data.stoppedAt, 5000);
    assert.deepStrictEqual(data.tokenUsage, { input: 100, output: 200 });
    assert.deepStrictEqual(data.filesChanged, ['src/foo.js']);
    assert.strictEqual(data.exitCode, 0);
    assert.strictEqual(data.output, 'some output');
    assert.strictEqual(data.duration, 4000);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('toJSON includes all expected fields', () => {
    const s = new AgentSession({ agentId: 'copilot', id: 'json-test' });
    const json = s.toJSON();
    assert.ok('id' in json);
    assert.ok('agentId' in json);
    assert.ok('status' in json);
    assert.ok('startedAt' in json);
    assert.ok('stoppedAt' in json);
    assert.ok('duration' in json);
    assert.ok('tokenUsage' in json);
    assert.ok('filesChanged' in json);
    assert.ok('exitCode' in json);
    assert.ok('output' in json);
  });
});

// ── Prompt Templates ─────────────────────────────────────────────────────────

describe('Prompt Templates', () => {
  const {
    QUESTIONNAIRE_PROMPT, DRAFT_PROMPT, QUIZ_PROMPT,
    REVIEW_FIX_PROMPT, PR_DESCRIPTION_PROMPT, interpolate,
  } = require(path.join(LIB_PATH, 'prompt-templates'));

  it('all templates are defined and non-empty', () => {
    assert.ok(QUESTIONNAIRE_PROMPT.length > 0);
    assert.ok(DRAFT_PROMPT.length > 0);
    assert.ok(QUIZ_PROMPT.length > 0);
    assert.ok(REVIEW_FIX_PROMPT.length > 0);
    assert.ok(PR_DESCRIPTION_PROMPT.length > 0);
  });

  it('QUESTIONNAIRE_PROMPT contains expected placeholders', () => {
    assert.ok(QUESTIONNAIRE_PROMPT.includes('{{taskTitle}}'));
    assert.ok(QUESTIONNAIRE_PROMPT.includes('{{taskDescription}}'));
  });

  it('interpolate replaces variables', () => {
    const result = interpolate('Hello {{name}}, you have {{count}} tasks.', {
      name: 'Alice',
      count: 3,
    });
    assert.strictEqual(result, 'Hello Alice, you have 3 tasks.');
  });

  it('interpolate replaces missing keys with empty string', () => {
    const result = interpolate('{{greeting}} {{name}}!', { greeting: 'Hi' });
    assert.strictEqual(result, 'Hi !');
  });

  it('interpolate handles null/undefined vars gracefully', () => {
    const result = interpolate('Hello {{name}}', null);
    assert.strictEqual(result, 'Hello {{name}}');
  });

  it('interpolate throws on non-string template', () => {
    assert.throws(() => interpolate(42, {}), /template must be a string/);
  });
});

// ── Workflow Stages ──────────────────────────────────────────────────────────

describe('Workflow Stages — pure logic', () => {
  const {
    _parseNumberedList, _taskVars, _reviewCycles,
    getReviewCycleCount, resetReviewCycles,
  } = require(path.join(LIB_PATH, 'workflow-stages'));

  it('_parseNumberedList extracts numbered items', () => {
    const text = `Here are my questions:
1. What framework should we use?
2. How should errors be handled?
3) Are there performance constraints?

Some trailing text.`;
    const items = _parseNumberedList(text);
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[0], 'What framework should we use?');
    assert.strictEqual(items[1], 'How should errors be handled?');
    assert.strictEqual(items[2], 'Are there performance constraints?');
  });

  it('_parseNumberedList returns empty array for empty input', () => {
    assert.deepStrictEqual(_parseNumberedList(''), []);
    assert.deepStrictEqual(_parseNumberedList(null), []);
  });

  it('_taskVars builds template variables from context', () => {
    const ctx = {
      title: 'Fix login bug',
      description: 'Users cannot log in',
      repoUrl: 'https://github.com/test/repo',
      branch: 'fix/login',
      contextFiles: ['src/auth.js', 'src/session.js'],
    };
    const vars = _taskVars(ctx);
    assert.strictEqual(vars.taskTitle, 'Fix login bug');
    assert.strictEqual(vars.taskDescription, 'Users cannot log in');
    assert.strictEqual(vars.repoUrl, 'https://github.com/test/repo');
    assert.strictEqual(vars.branch, 'fix/login');
    assert.ok(vars.contextFiles.includes('src/auth.js'));
  });

  it('reviewFix cycle tracking increments', () => {
    const testId = 'cycle-test-' + Date.now();
    assert.strictEqual(getReviewCycleCount(testId), 0);

    // Simulate setting cycles directly
    _reviewCycles.set(testId, 1);
    assert.strictEqual(getReviewCycleCount(testId), 1);

    _reviewCycles.set(testId, 2);
    assert.strictEqual(getReviewCycleCount(testId), 2);

    resetReviewCycles(testId);
    assert.strictEqual(getReviewCycleCount(testId), 0);
  });
});

// ── Claude Backend ───────────────────────────────────────────────────────────

describe('Claude Backend — output parsing', () => {
  const { ClaudeBackend } = require(path.join(LIB_PATH, 'claude-backend'));

  it('parseOutput handles JSON lines', () => {
    const backend = new ClaudeBackend();
    const output = [
      '{"type":"text","text":"Hello world"}',
      '{"type":"tool_use","name":"read_file","input":{"path":"foo.js"}}',
      '{"type":"result","usage":{"input_tokens":100,"output_tokens":50}}',
    ].join('\n');

    const events = backend.parseOutput(output);
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].type, 'text');
    assert.strictEqual(events[0].data.text, 'Hello world');
    assert.strictEqual(events[1].type, 'tool_use');
    assert.strictEqual(events[2].type, 'result');
  });

  it('parseOutput handles non-JSON lines as text', () => {
    const backend = new ClaudeBackend();
    const events = backend.parseOutput('plain text line');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'text');
    assert.strictEqual(events[0].data.text, 'plain text line');
  });

  it('parseOutput handles empty input', () => {
    const backend = new ClaudeBackend();
    assert.deepStrictEqual(backend.parseOutput(''), []);
    assert.deepStrictEqual(backend.parseOutput(null), []);
  });

  it('parseMetrics extracts token usage', () => {
    const backend = new ClaudeBackend();
    const output = '{"type":"result","usage":{"input_tokens":500,"output_tokens":200}}';
    const metrics = backend.parseMetrics(output);
    assert.deepStrictEqual(metrics.tokenUsage, { input: 500, output: 200 });
  });

  it('parseMetrics extracts file changes from tool_use events', () => {
    const backend = new ClaudeBackend();
    const output = [
      '{"type":"tool_use","name":"write_to_file","input":{"path":"src/new.js"}}',
      '{"type":"tool_use","name":"edit_file","input":{"path":"src/old.js"}}',
      '{"type":"tool_use","name":"write_to_file","input":{"path":"src/new.js"}}',
    ].join('\n');
    const metrics = backend.parseMetrics(output);
    assert.deepStrictEqual(metrics.filesChanged, ['src/new.js', 'src/old.js']);
  });

  it('parseMetrics handles empty input', () => {
    const backend = new ClaudeBackend();
    const metrics = backend.parseMetrics('');
    assert.strictEqual(metrics.tokenUsage, null);
    assert.deepStrictEqual(metrics.filesChanged, []);
  });
});

// ── Copilot Backend ──────────────────────────────────────────────────────────

describe('Copilot Backend — output parsing', () => {
  const { CopilotBackend } = require(path.join(LIB_PATH, 'copilot-backend'));

  it('parseOutput returns text events for each line', () => {
    const backend = new CopilotBackend();
    const output = 'Line one\nLine two\nLine three';
    const events = backend.parseOutput(output);
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].type, 'text');
    assert.strictEqual(events[0].data.text, 'Line one');
    assert.strictEqual(events[2].data.text, 'Line three');
  });

  it('parseOutput handles empty input', () => {
    const backend = new CopilotBackend();
    assert.deepStrictEqual(backend.parseOutput(''), []);
    assert.deepStrictEqual(backend.parseOutput(null), []);
  });

  it('parseMetrics tokenUsage is always null', () => {
    const backend = new CopilotBackend();
    const metrics = backend.parseMetrics('some output');
    assert.strictEqual(metrics.tokenUsage, null);
  });

  it('parseMetrics detects file-path-like lines', () => {
    const backend = new CopilotBackend();
    const output = 'src/index.js\npackage.json\nNot a file path at all';
    const metrics = backend.parseMetrics(output);
    assert.ok(metrics.filesChanged.includes('src/index.js'));
    assert.ok(metrics.filesChanged.includes('package.json'));
  });
});

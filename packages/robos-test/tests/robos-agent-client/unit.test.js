'use strict';
// Unit tests for the shared <robos-agent-selector> provider catalog (Codex, AGY, Claude Code,
// GitHub Copilot) and the work-task invocations and streaming runner.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const providers = require(path.resolve(__dirname, '../../../robos-agent-client/providers'));
const backend = require(path.resolve(__dirname, '../../../robos-agent-client/work-task/backend'));
const runner = require(path.resolve(__dirname, '../../../robos-agent-client/work-task/runner'));

test('provider catalog lists Codex, AGY, Claude Code and GitHub Copilot', () => {
  assert.deepStrictEqual(providers.IDS, ['codex', 'agy', 'claude', 'copilot']);
  assert.strictEqual(providers.LABELS.claude, 'Claude Code');
  assert.strictEqual(providers.LABELS.copilot, 'GitHub Copilot');
});

test('parses Copilot model choices from copilot --help output', () => {
  const help = [
    'Options:',
    '  --model <model>  Set the AI model to use (choices: "claude-sonnet-4.5", "gpt-5",',
    '                   "gpt-5-mini")',
    '  -p, --prompt <text>  Execute a prompt in programmatic mode',
  ].join('\n');
  assert.deepStrictEqual(providers.parseCopilotModels(help), [
    { id: 'claude-sonnet-4.5', label: 'claude-sonnet-4.5' },
    { id: 'gpt-5', label: 'gpt-5' },
    { id: 'gpt-5-mini', label: 'gpt-5-mini' },
  ]);
});

test('checks Claude Code and GitHub Copilot sign-in files and environment overrides', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-providers-test-'));
  const prevClaude = process.env.CLAUDE_CONFIG_DIR;
  const prevCopilot = process.env.COPILOT_HOME;
  const prevApi = process.env.ANTHROPIC_API_KEY;
  const prevGh = process.env.GH_TOKEN;
  const prevGithub = process.env.GITHUB_TOKEN;
  const prevCopilotToken = process.env.COPILOT_GITHUB_TOKEN;
  try {
    process.env.CLAUDE_CONFIG_DIR = path.join(dir, '.claude');
    process.env.COPILOT_HOME = path.join(dir, '.copilot');
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.COPILOT_GITHUB_TOKEN;

    fs.mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, '.credentials.json'), '{}');
    assert.deepStrictEqual(providers.authentication('claude'), { source: 'credentials' });

    fs.mkdirSync(process.env.COPILOT_HOME, { recursive: true });
    fs.writeFileSync(path.join(process.env.COPILOT_HOME, 'config.json'), JSON.stringify({
      logged_in_users: [{ host: 'https://github.com', login: 'octocat' }],
    }));
    assert.deepStrictEqual(providers.authentication('copilot'), { source: 'account' });
  } finally {
    if (prevClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = prevClaude;
    if (prevCopilot === undefined) delete process.env.COPILOT_HOME; else process.env.COPILOT_HOME = prevCopilot;
    if (prevApi === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevApi;
    if (prevGh === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = prevGh;
    if (prevGithub === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = prevGithub;
    if (prevCopilotToken === undefined) delete process.env.COPILOT_GITHUB_TOKEN; else process.env.COPILOT_GITHUB_TOKEN = prevCopilotToken;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backend.invocation builds plan and implement commands for all four agents', () => {
  const codex = backend.invocation('codex', 'implement', 'fix bug', { model: 'gpt-5.5', effort: 'high', bin: '/bin/codex' });
  assert.strictEqual(codex.bin, '/bin/codex');
  assert.ok(codex.args.includes('workspace-write'));
  assert.deepStrictEqual(codex.args.slice(codex.args.indexOf('--model'), codex.args.indexOf('--model') + 2), ['--model', 'gpt-5.5']);
  assert.ok(codex.args.includes('model_reasoning_effort="high"'));
  assert.strictEqual(codex.args.at(-1), 'fix bug');

  const claudeImpl = backend.invocation('claude', 'implement', 'fix bug', { model: 'opus', autoApprove: true, bin: '/bin/claude' });
  assert.ok(claudeImpl.args.includes('--dangerously-skip-permissions'));
  assert.deepStrictEqual(claudeImpl.args.slice(claudeImpl.args.indexOf('--model'), claudeImpl.args.indexOf('--model') + 2), ['--model', 'opus']);
  const claudePlan = backend.invocation('claude', 'plan', 'order tasks', { bin: '/bin/claude' });
  assert.ok(claudePlan.args.includes('plan'));
  assert.ok(!claudePlan.args.includes('--dangerously-skip-permissions'));

  const copilotImpl = backend.invocation('copilot', 'implement', 'fix bug', { model: 'gpt-5', bin: '/bin/copilot' });
  assert.strictEqual(copilotImpl.format, 'text');
  assert.deepStrictEqual(copilotImpl.args, ['--model', 'gpt-5', '-p', 'fix bug', '--allow-all-tools']);
  const copilotPlan = backend.invocation('copilot', 'plan', 'order tasks', { bin: '/bin/copilot' });
  assert.deepStrictEqual(copilotPlan.args.slice(-4), ['--deny-tool', 'write', '--deny-tool', 'shell']);

  const agyImpl = backend.invocation('agy', 'implement', 'fix bug', { model: 'gemini-4', effort: 'high', autoApprove: true, bin: '/bin/agy' });
  assert.ok(agyImpl.args.includes('--dangerously-skip-permissions'));
  assert.deepStrictEqual(agyImpl.args.slice(0, 4), ['--model', 'gemini-4', '--effort', 'high']);
  assert.deepStrictEqual(agyImpl.args.slice(-2), ['--print', 'fix bug']);
  const agyPlan = backend.invocation('agy', 'plan', 'order tasks', { bin: '/bin/agy' });
  assert.ok(!agyPlan.args.includes('--dangerously-skip-permissions'));
  assert.ok(!agyPlan.args.includes('accept-edits'));
});

test('runner.start streams JSONL and plain-text agent output and reports the final text on exit', async () => {
  const events = [];
  const exit = await new Promise(resolve => {
    runner.start({
      provider: 'claude',
      mode: 'implement',
      model: 'sonnet',
      autoApprove: true,
      prompt: 'implement login',
      authenticate: () => {},
      resolveBinary: () => '/bin/claude',
      guard: text => ({ blocked: false, text }),
      spawnCLI: () => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {};
        setImmediate(() => {
          child.stdout.emit('data', JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Working on it' }] } }) + '\n');
          child.stdout.emit('data', JSON.stringify({ type: 'result', result: 'Done implementing login.' }) + '\n');
          child.emit('close', 0);
        });
        return child;
      },
      onEvent: e => events.push(e),
      onExit: resolve,
    });
  });

  assert.strictEqual(exit.code, 0);
  assert.strictEqual(exit.text, 'Done implementing login.');
  assert.deepStrictEqual(events.map(e => e.text.trim()), ['Working on it', 'Done implementing login.']);
});

'use strict';
// One-shot prompts through the agent picked in <robos-agent-selector> (Codex / AGY).
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { EventEmitter } = require('events');

const oneShot = require(path.resolve(__dirname, '../../../robos-agent-client/one-shot'));

// Fake child process: records the command and replays scripted output.
function fakeSpawn(script) {
  const calls = [];
  const spawnCLI = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => {
      if (step.stdout) child.stdout.emit('data', step.stdout);
      if (step.stderr) child.stderr.emit('data', step.stderr);
      child.emit('close', step.code || 0);
    });
    return child;
  };
  return { spawnCLI, calls };
}
const noAuth = () => {};

test('runs AGY with the chosen model, the prompt last and stdin closed', async () => {
  const { spawnCLI, calls } = fakeSpawn([{ stdout: '{"picks":[1]}\n' }]);
  const res = await oneShot.ask({ provider: 'agy', model: 'gemini-3-pro', prompt: 'pick songs', spawnCLI, authenticate: noAuth, agyBinary: '/opt/agy' });
  assert.deepStrictEqual(res, { ok: true, text: '{"picks":[1]}', error: null, provider: 'agy' });
  assert.strictEqual(calls[0].bin, '/opt/agy');
  assert.deepStrictEqual(calls[0].args.slice(0, 3), ['--model', 'gemini-3-pro', '--print']);
  assert.ok(calls[0].args[3].endsWith('pick songs'), 'prompt is the last argument');
  assert.deepStrictEqual(calls[0].opts.stdio, ['ignore', 'pipe', 'pipe']);
});

test('falls back to the AGY default model when the CLI has no --model flag', async () => {
  const { spawnCLI, calls } = fakeSpawn([{ code: 2, stderr: 'Error: unknown flag: --model' }, { stdout: 'ok' }]);
  const res = await oneShot.ask({ provider: 'agy', model: 'x', prompt: 'p', spawnCLI, authenticate: noAuth, agyBinary: '/opt/agy' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(calls[1].args.slice(0, 1), ['--print']);
});

test('reports AGY printing nothing instead of returning an empty answer', async () => {
  const { spawnCLI } = fakeSpawn([{ stdout: '' }]);
  const res = await oneShot.ask({ provider: 'agy', prompt: 'p', spawnCLI, authenticate: noAuth, agyBinary: '/opt/agy' });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /no output/);
});

test('runs Codex read-only with model and effort, and reads its final message', async () => {
  const events = [
    JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'thinking' } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"lines":[]}' } }),
  ].join('\n');
  const { spawnCLI, calls } = fakeSpawn([{ stdout: events }]);
  const res = await oneShot.ask({ provider: 'codex', model: 'gpt-5.5', effort: 'low', prompt: 'p', spawnCLI, authenticate: noAuth });
  assert.deepStrictEqual([res.ok, res.text], [true, '{"lines":[]}']);
  const args = calls[0].args;
  assert.ok(args.includes('read-only'), 'Codex runs in its read-only sandbox');
  assert.deepStrictEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2), ['--model', 'gpt-5.5']);
  assert.ok(args.includes('model_reasoning_effort="low"'));
  assert.strictEqual(args[args.indexOf('--') + 1].endsWith('p'), true);
});

test('requires a chosen agent and surfaces sign-in problems', async () => {
  assert.strictEqual((await oneShot.ask({ provider: '', prompt: 'p' })).error, 'Choose an AI agent.');
  const res = await oneShot.ask({ provider: 'agy', prompt: 'p', authenticate: () => { throw new Error('AGY login unavailable.'); } });
  assert.deepStrictEqual([res.ok, res.error], [false, 'AGY login unavailable.']);
});

test('runs Claude Code in plan mode with the chosen model', async () => {
  const { spawnCLI, calls } = fakeSpawn([{ stdout: '[{"key":"A"}]\n' }]);
  const res = await oneShot.ask({ provider: 'claude', model: 'sonnet', prompt: 'order tasks', spawnCLI, authenticate: noAuth, binary: '/opt/claude' });
  assert.deepStrictEqual(res, { ok: true, text: '[{"key":"A"}]', error: null, provider: 'claude' });
  assert.strictEqual(calls[0].bin, '/opt/claude');
  const args = calls[0].args;
  assert.deepStrictEqual(args.slice(0, 6), ['-p', '--output-format', 'text', '--permission-mode', 'plan', '--model']);
  assert.strictEqual(args[6], 'sonnet');
  assert.strictEqual(args[args.indexOf('--') + 1].endsWith('order tasks'), true);
});

test('runs GitHub Copilot without write or shell tools, and retries without optional flags', async () => {
  const { spawnCLI, calls } = fakeSpawn([
    { code: 1, stderr: 'error: unknown option --model' },
    { stdout: 'answer\n' },
  ]);
  const res = await oneShot.ask({ provider: 'copilot', model: 'gpt-5', prompt: 'explain', spawnCLI, authenticate: noAuth, binary: '/opt/copilot' });
  assert.deepStrictEqual(res, { ok: true, text: 'answer', error: null, provider: 'copilot' });
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(calls[0].args.slice(0, 2), ['--model', 'gpt-5']);
  assert.ok(calls[0].args.includes('-s'));
  assert.ok(calls[1].args.includes('--allow-all-tools'));
  assert.deepStrictEqual(calls[1].args.slice(-4), ['--deny-tool', 'write', '--deny-tool', 'shell']);
  assert.ok(!calls[1].args.includes('--model'));
});

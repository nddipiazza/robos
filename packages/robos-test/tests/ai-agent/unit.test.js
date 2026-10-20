'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Sandbox HOME, fake agent CLIs on PATH, and a stub robos-llm, all before loading ai-agent.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-home-'));
process.env.HOME = HOME;
const BIN = path.join(HOME, 'bin');
fs.mkdirSync(BIN);
for (const name of ['copilot', 'claude', 'codex', 'gemini']) {
  // Each fake CLI records its arguments so tests can see the prompt it received.
  fs.writeFileSync(path.join(BIN, name), `#!/bin/sh\nprintf '%s' "$*" > "$HOME/${name}.args"\necho "${name}-cli-answer"\n`, { mode: 0o755 });
}
process.env.PATH = BIN + path.delimiter + process.env.PATH;

const STUB = path.join(HOME, 'robos-llm-stub');
fs.mkdirSync(STUB);
fs.writeFileSync(path.join(STUB, 'index.js'), `
'use strict';
module.exports = {
  PROVIDERS: { anthropic: { label: 'Anthropic (Claude)' }, ollama: { label: 'Ollama (local)' } },
  readConfig: () => ({ enabled: !!globalThis.__api.enabled, provider: globalThis.__api.provider || 'anthropic', model: '' }),
  complete: async (prompt) => { globalThis.__api.prompts.push(prompt); return globalThis.__api.result; },
};
`);
process.env.ROBOS_LLM_PATH = STUB;

const aiAgent = require(path.resolve(__dirname, '../../../robos-lib/ai-agent'));
const { buildQuickAskPrompt, registerQuickAskIPC } = require(path.resolve(__dirname, '../../../robos-lib/quick-ask'));

function setActiveProvider(id) {
  fs.mkdirSync(path.join(HOME, '.config', 'robos'), { recursive: true });
  fs.writeFileSync(path.join(HOME, '.config', 'robos', 'ai-provider.json'), JSON.stringify({ activeProvider: id }));
}
function notifications() {
  try { return JSON.parse(fs.readFileSync(path.join(HOME, '.config', 'robos', 'notifications.json'), 'utf8')); } catch { return []; }
}

beforeEach(() => {
  globalThis.__api = { enabled: false, prompts: [], result: { ok: true, text: 'api-answer', error: null, via: 'api', provider: 'anthropic', model: 'm' } };
  setActiveProvider('claude-code');
});

describe('ai-agent: CLI is the default', () => {
  it('uses the active CLI when API mode is off', async () => {
    const res = await aiAgent.ask('hello');
    assert.deepStrictEqual(res, { ok: true, text: 'claude-cli-answer', error: null, via: 'cli', provider: 'claude-code' });
    assert.strictEqual(globalThis.__api.prompts.length, 0, 'API must not be called');
  });

  it('runs Gemini CLI / Antigravity when it is the active provider', async () => {
    setActiveProvider('antigravity');
    const res = await aiAgent.ask('hello');
    assert.strictEqual(res.text, 'gemini-cli-answer');
    assert.strictEqual(res.provider, 'antigravity');
  });

  it('lists the four CLI providers', () => {
    assert.deepStrictEqual(aiAgent.PROVIDERS.map(p => p.id), ['github-copilot', 'claude-code', 'codex', 'antigravity']);
    const { activeName, api } = aiAgent.listProviders();
    assert.strictEqual(activeName, 'Claude Code');
    assert.strictEqual(api, null);
  });
});

describe('ai-agent: optional API mode', () => {
  it('answers through the API when it is on', async () => {
    globalThis.__api.enabled = true;
    const res = await aiAgent.ask('hello');
    assert.strictEqual(res.via, 'api');
    assert.strictEqual(res.text, 'api-answer');
    assert.ok(globalThis.__api.prompts[0].endsWith('hello'));
  });

  it('labels the default as API first, then the CLI', () => {
    globalThis.__api.enabled = true;
    const { activeName, api } = aiAgent.listProviders();
    assert.strictEqual(activeName, 'Anthropic (Claude) API, then Claude Code');
    assert.strictEqual(api.provider, 'anthropic');
  });

  it('keeps an explicitly chosen CLI on the CLI', async () => {
    globalThis.__api.enabled = true;
    const res = await aiAgent.ask('hello', { providerId: 'codex' });
    assert.strictEqual(res.text, 'codex-cli-answer');
    assert.strictEqual(globalThis.__api.prompts.length, 0);
  });

  it('honors allowApi: false', async () => {
    globalThis.__api.enabled = true;
    const res = await aiAgent.ask('hello', { allowApi: false });
    assert.strictEqual(res.via, 'cli');
  });

  it('falls back to the CLI and posts one notification when the API call fails', async () => {
    globalThis.__api.enabled = true;
    globalThis.__api.result = { ok: false, text: '', error: 'No Anthropic (Claude) API key.', code: 'missing_key', via: 'api' };
    const first = await aiAgent.ask('hello');
    assert.strictEqual(first.via, 'cli');
    assert.strictEqual(first.text, 'claude-cli-answer');
    assert.strictEqual(first.apiFallback, 'No Anthropic (Claude) API key.');
    await aiAgent.ask('again');
    const entries = notifications().filter(n => n.source === 'robos-llm');
    assert.strictEqual(entries.length, 1, 'repeated failures must not flood notifications');
    assert.match(entries[0].title, /used Claude Code/);
  });

  it('does not retry through a CLI when the prompt security policy blocked it', async () => {
    globalThis.__api.enabled = true;
    globalThis.__api.result = { ok: false, text: '', error: 'Blocked: secret found', code: 'prompt_security_violation', via: 'api' };
    const res = await aiAgent.ask('hello');
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'prompt_security_violation');
  });
});

describe('ai-agent: prompt security', () => {
  const lastArgs = name => fs.readFileSync(path.join(HOME, `${name}.args`), 'utf8');

  it('redacts secrets before the prompt reaches the CLI', async () => {
    const res = await aiAgent.ask('Deploy with AKIA1234567890ABCDEF');
    assert.strictEqual(res.ok, true);
    assert.ok(lastArgs('claude').includes('[REDACTED:AWS_ACCESS_KEY_ID]'));
    assert.ok(!lastArgs('claude').includes('AKIA1234567890ABCDEF'));
  });

  it('blocks the request in block mode without starting a CLI or calling the API', async () => {
    globalThis.__api.enabled = true;
    fs.rmSync(path.join(HOME, 'codex.args'), { force: true });
    const res = await aiAgent.ask('Deploy with AKIA1234567890ABCDEF', { providerId: 'codex', securityOptions: { mode: 'block' } });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'prompt_security_violation');
    assert.ok(res.findings.length >= 1);
    assert.ok(!fs.existsSync(path.join(HOME, 'codex.args')), 'the CLI must not run');
    assert.strictEqual(globalThis.__api.prompts.length, 0, 'the API must not be called');
  });

  it('sends the redacted prompt to the API in API mode', async () => {
    globalThis.__api.enabled = true;
    await aiAgent.ask('Deploy with AKIA1234567890ABCDEF');
    assert.ok(globalThis.__api.prompts[0].includes('[REDACTED:AWS_ACCESS_KEY_ID]'));
  });
});

describe('quick-ask', () => {
  it('builds a short, read-only prompt with the textarea context', () => {
    const prompt = buildQuickAskPrompt('What does this do?', 'Refactor the login flow', ['src/login.js']);
    assert.match(prompt, /Do not edit files or run commands/);
    assert.match(prompt, /Refactor the login flow/);
    assert.match(prompt, /- src\/login.js/);
    assert.match(prompt, /Question: What does this do\?$/);
    assert.ok(buildQuickAskPrompt('q', 'x'.repeat(20000)).length < 13000, 'context is capped');
  });

  it('registers an IPC handler that answers through ai-agent', async () => {
    const handlers = {};
    const asked = [];
    registerQuickAskIPC({ handle: (name, fn) => { handlers[name] = fn; } }, { aiAgent: { ask: async p => { asked.push(p); return { ok: true, text: 'answer', error: null, via: 'cli' }; } } });
    const res = await handlers['robos-quick-ask'](null, { question: 'Why?', context: 'ctx', contextFiles: [] });
    assert.deepStrictEqual(res, { ok: true, text: 'answer', error: null, via: 'cli' });
    assert.match(asked[0], /Question: Why\?/);
    const empty = await handlers['robos-quick-ask'](null, { question: '  ' });
    assert.strictEqual(empty.ok, false);
  });
});

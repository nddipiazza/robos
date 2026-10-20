'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Isolate HOME (settings, vectors) and the optional-package directory before loading robos-llm.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-llm-home-'));
process.env.HOME = HOME;
const REAL_DEPS_DIR = process.env.ROBOS_LLM_DEPS_DIR;
process.env.ROBOS_LLM_DEPS_DIR = path.join(HOME, 'llm-deps');
delete process.env.ANTHROPIC_API_KEY;
delete process.env.PASSWORD_STORE_DIR;

const LLM_PATH = path.resolve(__dirname, '../../../robos-llm');
const llm = require(LLM_PATH);
const { VectorIndex, nodeText, indexFileFor } = require(path.join(LLM_PATH, 'semantic-search'));

function writeSettings(settings) {
  fs.mkdirSync(path.join(HOME, '.config', 'robos'), { recursive: true });
  fs.writeFileSync(path.join(HOME, '.config', 'robos', 'settings.json'), JSON.stringify(settings));
}

// Deterministic embeddings: one dimension per keyword.
const VOCAB = ['payment', 'billing', 'login', 'auth', 'queue', 'email'];
function stubEmbeddings() {
  const calls = [];
  return {
    calls,
    async embedDocuments(texts) {
      calls.push(texts);
      return texts.map(t => VOCAB.map(w => (t.toLowerCase().includes(w) ? 1 : 0)).map((v, i) => v + (i === 0 && /billing/i.test(t) ? 1 : 0)));
    },
  };
}

describe('robos-llm: settings and status', () => {
  after(() => fs.rmSync(path.join(HOME, '.config'), { recursive: true, force: true }));

  it('API mode is off by default', () => {
    const config = llm.readConfig({});
    assert.strictEqual(config.enabled, false);
    assert.strictEqual(config.semanticSearch, false);
    assert.strictEqual(config.provider, 'anthropic');
  });

  it('reads API mode settings and rejects unknown providers', () => {
    const config = llm.readConfig({ ai_api_enabled: true, ai_api_provider: 'gemini', ai_api_model: ' gemini-2.5-pro ', ai_semantic_search: true, ai_embeddings_provider: 'ollama' });
    assert.deepStrictEqual(
      { enabled: config.enabled, provider: config.provider, model: config.model, semanticSearch: config.semanticSearch, embeddingsProvider: config.embeddingsProvider },
      { enabled: true, provider: 'gemini', model: 'gemini-2.5-pro', semanticSearch: true, embeddingsProvider: 'ollama' },
    );
    assert.strictEqual(llm.readConfig({ ai_api_provider: 'nope' }).provider, 'anthropic');
  });

  it('semantic search needs API mode on as well', () => {
    assert.strictEqual(llm.readConfig({ ai_semantic_search: true }).semanticSearch, false);
  });

  it('status reports packages as not installed and Ollama as needing no key', () => {
    const status = llm.status({});
    assert.deepStrictEqual(Object.keys(status.providers), ['anthropic', 'openai', 'gemini', 'ollama']);
    for (const p of Object.values(status.providers)) assert.strictEqual(p.installed, false);
    assert.strictEqual(status.providers.ollama.needsKey, false);
    assert.strictEqual(status.providers.ollama.keyConfigured, true);
    assert.strictEqual(status.providers.anthropic.embeddings, false);
    assert.strictEqual(status.depsDir, process.env.ROBOS_LLM_DEPS_DIR);
  });

  it('package manifest pins an openai release that runs on Node 20', () => {
    const groups = require(path.join(LLM_PATH, 'package.json')).robos.optionalProviders;
    assert.strictEqual(groups.openai['@langchain/openai'], '1.5.8');
    assert.ok(groups.core['@langchain/core']);
    assert.strictEqual(require(path.join(LLM_PATH, 'package.json')).dependencies, undefined, 'robos-llm must not install anything by default');
  });
});

describe('robos-llm: complete()', () => {
  it('sends system and human messages to the chat model and returns its text', async () => {
    let seen;
    const chatModel = { async invoke(messages, options) { seen = { messages, options }; return { text: '  Paris  ' }; } };
    const res = await llm.complete('Capital of France?', { system: 'Be brief.', chatModel, config: { provider: 'openai', model: 'gpt-5-mini' } });
    assert.deepStrictEqual(res, { ok: true, text: 'Paris', error: null, via: 'api', provider: 'openai', model: 'gpt-5-mini' });
    assert.deepStrictEqual(seen.messages, [['system', 'Be brief.'], ['human', 'Capital of France?']]);
    assert.strictEqual(seen.options.timeout, 120000);
  });

  it('joins array content from providers that return content parts', async () => {
    const chatModel = { async invoke() { return { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }; } };
    const res = await llm.complete('x', { chatModel });
    assert.strictEqual(res.text, 'ab');
  });

  it('redacts secrets before the prompt leaves the machine', async () => {
    let sent = '';
    const chatModel = { async invoke(messages) { sent = messages[0][1]; return { text: 'ok' }; } };
    await llm.complete('use token ghp_1234567890abcdefghijklmnopqrstuvwxyzAB here', { chatModel });
    assert.ok(!sent.includes('ghp_1234567890abcdefghijklmnopqrstuvwxyzAB'), 'GitHub token must be redacted');
    assert.match(sent, /\[REDACTED:/);
  });

  it('reports not_installed until the user installs the API packages', async () => {
    const res = await llm.complete('hi', { config: { provider: 'anthropic' } });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'not_installed');
    assert.match(res.error, /Install API packages/);
  });

  it('embed() refuses providers without an embeddings API', async () => {
    const res = await llm.embed(['x'], { config: { embeddingsProvider: 'anthropic' } });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'no_embeddings');
  });
});

describe('robos-llm: semantic search', () => {
  const nodes = [
    { '@id': 'urn:robos:service:payments', '@type': 'robos:Microservice', 'dcterms:title': 'Payment API', 'dcterms:description': 'Billing and checkout' },
    { '@id': 'urn:robos:service:auth', '@type': 'robos:Microservice', 'dcterms:title': 'Login gateway', 'dcterms:description': 'OAuth auth' },
    { '@id': 'urn:robos:worker:email', '@type': 'robos:DataPipeline', 'dcterms:title': 'Email worker', 'dcterms:description': 'Queue consumer' },
  ];
  const config = { embeddingsProvider: 'ollama', embeddingsModel: 'nomic-embed-text' };

  before(() => fs.rmSync(path.join(HOME, '.config'), { recursive: true, force: true }));

  it('ranks nodes by meaning and stores the index locally', async () => {
    const embeddings = stubEmbeddings();
    const res = await llm.semanticSearch({ nodes, query: 'billing', k: 2, indexName: 'test', config, embeddings });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.indexed, 3);
    assert.strictEqual(res.results[0].node['@id'], 'urn:robos:service:payments');
    assert.strictEqual(res.results.length, 2);
    const file = indexFileFor('test');
    assert.ok(file.startsWith(path.join(HOME, '.config', 'robos', 'vectors')));
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(saved.provider, 'ollama');
    assert.strictEqual(saved.model, 'nomic-embed-text');
    assert.strictEqual(Object.keys(saved.items).length, 3);
  });

  it('only re-embeds new or changed nodes', async () => {
    const embeddings = stubEmbeddings();
    const changed = nodes.map(n => (n['@id'] === 'urn:robos:service:auth' ? { ...n, 'dcterms:description': 'OAuth login and auth' } : n));
    const res = await llm.semanticSearch({ nodes: changed, query: 'login', indexName: 'test', config, embeddings });
    assert.strictEqual(res.indexed, 1);
    assert.strictEqual(embeddings.calls[0].length, 1, 'one node re-embedded');
    assert.strictEqual(res.results[0].node['@id'], 'urn:robos:service:auth');
  });

  it('drops deleted nodes and rebuilds when the embeddings model changes', async () => {
    await llm.semanticSearch({ nodes: nodes.slice(0, 2), query: 'auth', indexName: 'test', config, embeddings: stubEmbeddings() });
    assert.strictEqual(Object.keys(new VectorIndex(indexFileFor('test')).data.items).length, 2);
    const embeddings = stubEmbeddings();
    const res = await llm.semanticSearch({ nodes, query: 'auth', indexName: 'test', config: { ...config, embeddingsModel: 'other-model' }, embeddings });
    assert.strictEqual(res.indexed, 3, 'all nodes re-embedded for the new model');
  });

  it('returns the embeddings error so callers can fall back to text search', async () => {
    const res = await llm.semanticSearch({ nodes, query: 'x', indexName: 'test-fail', config: { embeddingsProvider: 'anthropic' } });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'no_embeddings');
  });

  it('nodeText covers title, description, types and tags', () => {
    const text = nodeText({ '@id': 'urn:x', '@type': ['a:B', 'c:D'], 'dcterms:title': 'T', 'dcterms:description': 'Desc', 'robos:tags': ['t1', 't2'] });
    for (const part of ['T', 'Desc', 'a:B c:D', 't1 t2', 'urn:x']) assert.ok(text.includes(part), part);
  });
});

// Runs only when real LangChain packages are present (e.g. ROBOS_LLM_DEPS_DIR pointing at an install).
describe('robos-llm: real LangChain packages', () => {
  const depsDir = REAL_DEPS_DIR;
  const installed = depsDir && fs.existsSync(path.join(depsDir, 'node_modules', '@langchain', 'core', 'package.json'));

  it('runs a LangChain fake chat model end to end', { skip: !installed && 'set ROBOS_LLM_DEPS_DIR to an install of the API packages' }, async () => {
    const r = require('module').createRequire(path.join(depsDir, 'package.json'));
    const { FakeListChatModel } = r('@langchain/core/utils/testing');
    const res = await llm.complete('hello', { system: 'sys', chatModel: new FakeListChatModel({ responses: ['from langchain'] }) });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.text, 'from langchain');
  });
});

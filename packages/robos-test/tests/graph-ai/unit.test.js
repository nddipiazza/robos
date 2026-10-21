'use strict';
const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-ai-home-'));
process.env.HOME = HOME;

const { SDLCKnowledgeGraphStore, GraphCoPilot } = require('../../../robos-graph/index');
const { parseAIJson } = require('../../../robos-lib/ai-json');
const llm = require('../../../robos-llm');

after(() => fs.rmSync(HOME, { recursive: true, force: true }));

const AGENT_NODES = {
  summary: 'Adds a pet surgery booking service with its contract and requirement.',
  proposedNodes: [
    { '@id': 'urn:robos:service:pet-surgery', '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'], 'dcterms:title': 'Pet Surgery Booking Service', 'robos:repository': 'github.com/acme/pet-surgery', 'robos:implementsContract': 'urn:robos:contract:pet-surgery-v1', 'robos:ownerTeam': 'urn:robos:team:core-platform' },
    { '@id': 'urn:robos:contract:pet-surgery-v1', '@type': ['robos:Contract', 'c4:Component'], 'dcterms:title': 'Pet Surgery API Spec', 'robos:specFile': 'specs/contracts/pet-surgery.yaml', 'robos:protocol': 'OpenAPI 3.1' },
  ],
};

describe('Graph Copilot through an AI agent', () => {
  const copilot = new GraphCoPilot();

  it('uses the agent proposal when it is valid', async () => {
    let asked = '';
    const ask = async p => { asked = p; return { ok: true, text: '```json\n' + JSON.stringify(AGENT_NODES) + '\n```', via: 'cli' }; };
    const doc = { 'robos:nodes': [{ '@id': 'urn:robos:service:existing', 'dcterms:title': 'Existing' }] };
    const m = await copilot.generateMutationWithAgent('Add pet surgery booking', doc, { ask, parseJson: parseAIJson });
    assert.strictEqual(m.source, 'agent');
    assert.strictEqual(m.via, 'cli');
    assert.strictEqual(m.proposedNodes.length, 2);
    assert.strictEqual(m.summary, AGENT_NODES.summary);
    assert.strictEqual(typeof m.conforms, 'boolean');
    assert.ok(m.shaclReport);
    assert.match(asked, /Add pet surgery booking/);
    assert.match(asked, /urn:robos:service:existing/, 'existing ids are listed so the agent avoids them');
  });

  it('falls back to the template when no agent is available', async () => {
    const m = await copilot.generateMutationWithAgent('Add a payment API with Stripe', {}, {});
    assert.strictEqual(m.source, 'template');
    assert.strictEqual(m.proposedNodes[0]['dcterms:title'], 'Stripe Payment API Service');
  });

  it('falls back when the agent fails or answers with unusable nodes', async () => {
    const failed = await copilot.generateMutationWithAgent('x', {}, { ask: async () => ({ ok: false, error: 'claude not found' }) });
    assert.strictEqual(failed.source, 'template');
    assert.strictEqual(failed.agentError, 'claude not found');

    const prose = await copilot.generateMutationWithAgent('x', {}, { ask: async () => ({ ok: true, text: 'Sure! Here are some ideas.' }) });
    assert.strictEqual(prose.source, 'template');

    const badId = { proposedNodes: [{ '@id': 'http://evil/x', '@type': 'robos:Microservice', 'dcterms:title': 'X' }] };
    const bad = await copilot.generateMutationWithAgent('x', {}, { ask: async () => ({ ok: true, text: JSON.stringify(badId) }) });
    assert.strictEqual(bad.source, 'template');

    const dup = await copilot.generateMutationWithAgent('x', { 'robos:nodes': [{ '@id': 'urn:robos:service:pet-surgery' }] },
      { ask: async () => ({ ok: true, text: JSON.stringify(AGENT_NODES) }) });
    assert.strictEqual(dup.source, 'template', 'an id that already exists is rejected');
  });

  it('is reachable from the graph store with an injected agent', async () => {
    const store = new SDLCKnowledgeGraphStore({ filePath: path.join(HOME, 'kg', 'knowledge-graph.jsonld') });
    const m = await store.generateCoPilotMutationWithAgent('Add pet surgery booking', { ask: async () => ({ ok: true, text: JSON.stringify(AGENT_NODES) }) });
    assert.strictEqual(m.source, 'agent');
    const applied = store.applyCoPilotMutation(m);
    assert.strictEqual(applied.ok, true);
    assert.ok(store.getNode('urn:robos:service:pet-surgery'));
  });
});

describe('Knowledge Graph semantic search', () => {
  const store = new SDLCKnowledgeGraphStore({ filePath: path.join(HOME, 'kg2', 'knowledge-graph.jsonld') });
  store.addNode({ '@id': 'urn:robos:service:billing', '@type': ['robos:Microservice'], 'dcterms:title': 'Invoice service', 'dcterms:description': 'Charges customers and sends receipts' });
  store.addNode({ '@id': 'urn:robos:service:signin', '@type': ['robos:Microservice'], 'dcterms:title': 'Sign-in service', 'dcterms:description': 'Handles OAuth' });

  it('returns substring results with a note while semantic search is off', async () => {
    const res = await store.semanticSearchNodes('Invoice');
    assert.strictEqual(res.mode, 'text');
    assert.match(res.note, /Semantic search is off/);
    assert.ok(res.results.some(r => r.node['@id'] === 'urn:robos:service:billing'));
  });

  it('ranks by meaning when embeddings are available, and respects filters', async () => {
    // "payments" shares no words with the billing node; the stub maps both to the same direction.
    const embeddings = { async embedDocuments(texts) { return texts.map(t => (/invoice|payment|charge/i.test(t) ? [1, 0] : [0, 1])); } };
    const res = await store.semanticSearchNodes('payments', { type: 'Microservice' }, { config: { embeddingsProvider: 'ollama' }, embeddings, llm, k: 5 });
    assert.strictEqual(res.mode, 'semantic');
    assert.strictEqual(res.results[0].node['@id'], 'urn:robos:service:billing');
    assert.ok(res.results.every(r => [].concat(r.node['@type']).some(t => t.endsWith('Microservice'))));
    assert.ok(fs.readdirSync(path.join(HOME, '.config', 'robos', 'vectors')).some(f => f.startsWith('kgraph-')));
  });

  it('falls back to text results when embeddings fail', async () => {
    const res = await store.semanticSearchNodes('Invoice', {}, { config: { embeddingsProvider: 'anthropic' }, llm });
    assert.strictEqual(res.mode, 'text');
    assert.match(res.note, /Semantic search unavailable/);
  });
});

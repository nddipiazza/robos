/**
 * Opt-in semantic search over Knowledge Graph nodes.
 *
 * Vectors are kept in a local JSON file (one per graph) under
 * ~/.config/robos/vectors/. Each entry stores a hash of the text it was built
 * from, so only new or changed nodes are re-embedded. The file records which
 * provider and model built it; switching either rebuilds the index rather than
 * mixing vectors from different models.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BATCH_SIZE = 64;

function vectorsDir() {
  return path.join(process.env.HOME || os.homedir(), '.config', 'robos', 'vectors');
}

function indexFileFor(name) {
  const safe = String(name || 'default').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
  return path.join(vectorsDir(), `${safe}.json`);
}

/** The text that represents a node for embedding: title, description, types, role and tags. */
function nodeText(node) {
  const types = [].concat(node['@type'] || []).join(' ');
  const tags = Array.isArray(node['robos:tags']) ? node['robos:tags'].join(' ') : '';
  return [node['dcterms:title'], node['dcterms:description'], types, node['robos:role'], tags, node['@id']]
    .filter(Boolean).join('\n');
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

class VectorIndex {
  constructor(file) {
    this.file = file;
    this.data = { provider: '', model: '', updatedAt: null, items: {} };
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    if (!this.data.items) this.data.items = {};
  }

  /** Clears the index if it was built with a different provider or model. */
  useModel(provider, model) {
    if (this.data.provider !== provider || this.data.model !== model) {
      this.data = { provider, model, updatedAt: null, items: {} };
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.data.updatedAt = new Date().toISOString();
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  search(vector, k) {
    return Object.entries(this.data.items)
      .map(([id, item]) => ({ id, score: cosine(vector, item.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

/**
 * Embeds any new or changed nodes, then ranks them against the query.
 *
 * @param {{ nodes: object[], query: string, k?: number, indexName?: string, llm: object, config?: object, embeddings?: object }} opts
 *   llm — the robos-llm module (passed in so tests can supply a stub)
 * @returns {Promise<{ ok, results?: {node, score}[], indexed?: number, error?, code? }>}
 */
async function semanticSearch({ nodes, query, k = 20, indexName = 'kgraph', llm, config, embeddings }) {
  const q = String(query || '').trim();
  if (!q) return { ok: true, results: [], indexed: 0 };
  const effective = { ...llm.readConfig(), ...(config || {}) };
  const spec = llm.PROVIDERS[effective.embeddingsProvider];
  const model = effective.embeddingsModel || spec?.defaultEmbeddingModel || '';
  const index = new VectorIndex(indexFileFor(indexName));
  index.useModel(effective.embeddingsProvider, model);

  const byId = new Map();
  for (const node of nodes) if (node && node['@id']) byId.set(node['@id'], node);

  // Drop nodes that no longer exist, then find the ones to (re)embed.
  for (const id of Object.keys(index.data.items)) if (!byId.has(id)) delete index.data.items[id];
  const pending = [];
  for (const [id, node] of byId) {
    const text = nodeText(node);
    const h = hash(text);
    if (index.data.items[id]?.hash !== h) pending.push({ id, text, h });
  }

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const res = await llm.embed(batch.map(p => p.text), { config, embeddings });
    if (!res.ok) {
      if (i > 0) index.save();
      return { ok: false, error: res.error, code: res.code };
    }
    batch.forEach((p, j) => { index.data.items[p.id] = { hash: p.h, vector: res.vectors[j].map(v => Math.round(v * 1e5) / 1e5) }; });
  }
  if (pending.length || !fs.existsSync(index.file)) index.save();

  const queryRes = await llm.embed([q], { config, embeddings });
  if (!queryRes.ok) return { ok: false, error: queryRes.error, code: queryRes.code };
  const results = index.search(queryRes.vectors[0], k).map(r => ({ node: byId.get(r.id), score: Math.round(r.score * 1000) / 1000 }));
  return { ok: true, results, indexed: pending.length, provider: effective.embeddingsProvider, model };
}

module.exports = { semanticSearch, VectorIndex, nodeText, indexFileFor, cosine };

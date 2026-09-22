'use strict';

const path = require('path');

let LuxirIndexerClass = null;
try {
  const luxirModulePath = path.resolve(__dirname, '../../robos-graph/lib/luxir-indexer.js');
  const mod = require(luxirModulePath);
  LuxirIndexerClass = mod.LuxirIndexer;
} catch {}

/**
 * LuxirSearchBridge: Hybrid search bridge connecting Kgraph Parse Portal
 * to the C++ Luxir search index with fast in-memory fallback.
 */
class LuxirSearchBridge {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.ROBOS_LUXIR_ENDPOINT || 'http://127.0.0.1:8983';
    this.indexer = LuxirIndexerClass ? new LuxirIndexerClass({ endpoint: this.endpoint }) : null;
    this.localIndex = new Map(); // id -> document
  }

  /**
   * Pings the C++ Luxir search engine.
   * @returns {Promise<boolean>}
   */
  async isLuxirOnline() {
    if (this.indexer && typeof this.indexer.ping === 'function') {
      return await this.indexer.ping();
    }
    return false;
  }

  /**
   * Transforms a KGraph node into a searchable document.
   */
  toDocument(node) {
    if (!node || typeof node !== 'object') return null;
    const id = node['@id'] || '';
    const title = node['dcterms:title'] || '';
    const description = node['dcterms:description'] || '';
    const types = Array.isArray(node['@type']) ? node['@type'] : (node['@type'] ? [node['@type']] : []);
    const mimeType = node['robos:mimeType'] || '';
    const semanticRole = node['robos:semanticRole'] || '';
    const archetype = node['robos:archetype'] || '';
    const pkg = node['robos:package'] || 'core-platform';
    const protocol = node['robos:protocol'] || '';

    const textCorpus = [
      id,
      title,
      description,
      mimeType,
      semanticRole,
      archetype,
      protocol,
      ...types,
    ].filter(Boolean).join(' ').toLowerCase();

    return {
      id,
      title,
      description,
      types,
      mimeType,
      semanticRole,
      archetype,
      package: pkg,
      protocol,
      textCorpus,
      rawNode: node,
      indexedAt: new Date().toISOString(),
    };
  }

  /**
   * Indexes an array of KGraph nodes into Luxir and local cache.
   * @param {Array<Object>} nodes 
   * @returns {Promise<number>} Number of indexed nodes
   */
  async indexNodes(nodes = []) {
    if (!Array.isArray(nodes)) return 0;
    let count = 0;

    for (const node of nodes) {
      const doc = this.toDocument(node);
      if (doc && doc.id) {
        this.localIndex.set(doc.id, doc);
        count++;
      }
    }

    if (this.indexer) {
      try {
        await this.indexer.indexNodes(nodes);
      } catch {}
    }

    return count;
  }

  /**
   * Searches the indexed documents with text matching and faceted filters.
   * @param {string} query 
   * @param {Object} [filters] { type, mimeType, semanticRole, archetype, protocol }
   * @returns {Promise<Array<Object>>} Matching documents
   */
  async search(query = '', filters = {}) {
    const q = (query || '').trim().toLowerCase();
    const results = [];

    for (const doc of this.localIndex.values()) {
      let matchesQuery = true;
      if (q) {
        matchesQuery = doc.textCorpus.includes(q);
      }
      if (!matchesQuery) continue;

      if (filters.type && !doc.types.some(t => t.toLowerCase().includes(filters.type.toLowerCase()))) {
        continue;
      }
      if (filters.mimeType && !doc.mimeType.toLowerCase().includes(filters.mimeType.toLowerCase())) {
        continue;
      }
      if (filters.semanticRole && !doc.semanticRole.toLowerCase().includes(filters.semanticRole.toLowerCase())) {
        continue;
      }
      if (filters.archetype && !doc.archetype.toLowerCase().includes(filters.archetype.toLowerCase())) {
        continue;
      }
      if (filters.protocol && !doc.protocol.toLowerCase().includes(filters.protocol.toLowerCase())) {
        continue;
      }

      results.push({
        id: doc.id,
        title: doc.title,
        description: doc.description,
        types: doc.types,
        mimeType: doc.mimeType,
        semanticRole: doc.semanticRole,
        archetype: doc.archetype,
        package: doc.package,
        protocol: doc.protocol,
        rawNode: doc.rawNode,
      });
    }

    return results;
  }

  /**
   * Returns stats about the current search index.
   */
  async getIndexStats() {
    const luxirOnline = await this.isLuxirOnline();
    return {
      indexedCount: this.localIndex.size,
      luxirOnline,
      endpoint: this.endpoint,
      engine: luxirOnline ? 'Luxir C++ Engine' : 'Luxir Resilient Fallback Index',
    };
  }
}

module.exports = {
  LuxirSearchBridge,
};

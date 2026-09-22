'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * LuxirIndexer: Hybrid search indexer and query adapter for RobOS Knowledge Graph.
 * Connects the in-memory/file-backed SDLC Knowledge Graph to the high-performance C++ Luxir search engine.
 */
class LuxirIndexer {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.ROBOS_LUXIR_ENDPOINT || 'http://127.0.0.1:8983';
    this.indexName = options.indexName || 'robos_kgraph';
    this.timeoutMs = options.timeoutMs || 400; // Fast failover for desktop responsiveness
    this.enabled = options.enabled !== false;
  }

  /**
   * Transforms an RDF/JSON-LD Knowledge Graph node into a flat Luxir document.
   */
  nodeToDocument(node) {
    if (!node || typeof node !== 'object') return null;

    const id = node['@id'] || '';
    const types = Array.isArray(node['@type']) ? node['@type'] : (node['@type'] ? [node['@type']] : []);
    const title = node['dcterms:title'] || node['rdfs:label'] || node['schema:name'] || '';
    const description = node['dcterms:description'] || node['rdfs:comment'] || '';
    const pkg = node['robos:package'] || 'core-platform';
    const role = node['robos:role'] || '';
    const engine = node['robos:engine'] || '';
    const tags = Array.isArray(node['robos:tags']) ? node['robos:tags'] : [];
    const ownerTeam = node['robos:ownerTeam'] || node['robos:assignedTeam'] || '';
    const status = node['robos:status'] || node['robos:readiness'] || '';
    const productionReady = typeof node['robos:productionReady'] === 'boolean' ? node['robos:productionReady'] : true;

    // Collect all string values for broad text indexing
    const searchableTextParts = [
      id,
      title,
      description,
      role,
      engine,
      ...tags,
      ...types,
      status,
    ];

    const searchableText = searchableTextParts.filter(Boolean).join(' ');

    return {
      id,
      title,
      description,
      types,
      package: pkg,
      role,
      engine,
      tags,
      ownerTeam,
      status,
      productionReady,
      searchableText,
      rawNode: node,
      indexedAt: new Date().toISOString(),
    };
  }

  /**
   * Health check to detect if local Luxir instance is running.
   */
  async ping() {
    if (!this.enabled) return false;
    try {
      const parsed = new URL(this.endpoint);
      return await new Promise((resolve) => {
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: '/api/v1/health',
            method: 'GET',
            timeout: this.timeoutMs,
          },
          (res) => {
            resolve(res.statusCode >= 200 && res.statusCode < 400);
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      });
    } catch {
      return false;
    }
  }

  /**
   * Index a single Knowledge Graph node in Luxir.
   */
  async indexNode(node) {
    const doc = this.nodeToDocument(node);
    if (!doc || !doc.id) return { ok: false, error: 'Invalid document' };

    const isAvailable = await this.ping();
    if (!isAvailable) {
      return { ok: false, offline: true, document: doc };
    }

    try {
      const payload = JSON.stringify({ index: this.indexName, document: doc });
      const res = await this._sendHttpRequest('/api/v1/documents', 'POST', payload);
      return { ok: true, id: doc.id, response: res };
    } catch (err) {
      return { ok: false, error: err.message, document: doc };
    }
  }

  /**
   * Remove a node from Luxir index.
   */
  async deleteNode(nodeId) {
    if (!nodeId) return { ok: false };
    const isAvailable = await this.ping();
    if (!isAvailable) {
      return { ok: false, offline: true };
    }

    try {
      const encodedId = encodeURIComponent(nodeId);
      const res = await this._sendHttpRequest(`/api/v1/documents/${encodedId}?index=${encodeURIComponent(this.indexName)}`, 'DELETE');
      return { ok: true, id: nodeId, response: res };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Bulk index all nodes in the Knowledge Graph.
   */
  async bulkIndex(nodes = []) {
    const docs = nodes.map(n => this.nodeToDocument(n)).filter(Boolean);
    const isAvailable = await this.ping();

    if (!isAvailable) {
      return {
        ok: false,
        offline: true,
        totalDocs: docs.length,
        message: 'Luxir server is offline or unreachable at ' + this.endpoint + '. Documents formatted for indexing.',
        sample: docs.slice(0, 3),
      };
    }

    try {
      const payload = JSON.stringify({ index: this.indexName, documents: docs });
      const res = await this._sendHttpRequest('/api/v1/documents/bulk', 'POST', payload);
      return { ok: true, totalDocs: docs.length, response: res };
    } catch (err) {
      return { ok: false, error: err.message, totalDocs: docs.length };
    }
  }

  /**
   * Execute full-text / hybrid query against Luxir.
   */
  async search(query = '', filter = {}) {
    const isAvailable = await this.ping();
    if (!isAvailable) {
      return { ok: false, offline: true, results: [] };
    }

    try {
      const payload = JSON.stringify({
        index: this.indexName,
        query,
        filter,
      });
      const res = await this._sendHttpRequest('/api/v1/search', 'POST', payload);
      return { ok: true, results: res.hits || [] };
    } catch (err) {
      return { ok: false, error: err.message, results: [] };
    }
  }

  _sendHttpRequest(reqPath, method, body = null) {
    const parsed = new URL(this.endpoint);
    const client = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = client.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: reqPath,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
          },
          timeout: this.timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              const json = data ? JSON.parse(data) : {};
              resolve(json);
            } catch {
              resolve({ raw: data, status: res.statusCode });
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout to Luxir at ' + this.endpoint));
      });

      if (body) req.write(body);
      req.end();
    });
  }
}

module.exports = { LuxirIndexer };

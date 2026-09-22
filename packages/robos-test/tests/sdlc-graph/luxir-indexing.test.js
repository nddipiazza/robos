'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { SHACLValidator } = require('../../../robos-graph/lib/shacl-validator');
const { LuxirIndexer } = require('../../../robos-graph/lib/luxir-indexer');
const { SDLCKnowledgeGraphStore } = require('../../../robos-graph/lib/graph-store');

describe('Luxir, Search Indices & Hybrid KGraph Indexing Test Suite', () => {
  const validator = new SHACLValidator();

  describe('1. W3C SHACL Validation for SearchIndexShape', () => {
    it('validates conforming SearchIndex nodes for Luxir, Solr, Elasticsearch, and OpenSearch', () => {
      const nodes = [
        {
          '@id': 'urn:robos:search:luxir-test',
          '@type': ['oslc_am:Resource', 'robos:SearchIndex', 'schema:DataStore'],
          'dcterms:title': 'Luxir Search Index',
          'robos:engine': 'luxir',
          'robos:productionReady': false,
          'robos:status': 'experimental',
        },
        {
          '@id': 'urn:robos:search:solr-test',
          '@type': ['oslc_am:Resource', 'robos:SearchIndex', 'schema:DataStore'],
          'dcterms:title': 'Solr Index',
          'robos:engine': 'solr',
          'robos:productionReady': true,
        },
        {
          '@id': 'urn:robos:search:elastic-test',
          '@type': ['oslc_am:Resource', 'robos:SearchIndex', 'schema:DataStore'],
          'dcterms:title': 'Elasticsearch Telemetry',
          'robos:engine': 'elasticsearch',
        },
        {
          '@id': 'urn:robos:search:opensearch-test',
          '@type': ['oslc_am:Resource', 'robos:SearchIndex', 'schema:DataStore'],
          'dcterms:title': 'OpenSearch Artifacts',
          'robos:engine': 'opensearch',
        },
      ];

      const res = validator.validate(nodes);
      assert.strictEqual(res.conforms, true, 'All search indices must conform to SHACL');
      assert.strictEqual(res.violations.length, 0);
    });

    it('rejects SearchIndex nodes missing engine or title', () => {
      const invalidNode = {
        '@id': 'urn:robos:search:invalid',
        '@type': ['robos:SearchIndex'],
      };
      const res = validator.validate([invalidNode]);
      assert.strictEqual(res.conforms, false);
      assert.ok(res.violations.some(v => v.path === 'dcterms:title'));
      assert.ok(res.violations.some(v => v.path === 'robos:engine'));
    });
  });

  describe('2. Knowledge Graph Registration & Production Readiness', () => {
    const corePkgPath = path.resolve(__dirname, '../../../../.robos/kgraphs/core-platform/package.jsonld');
    const corePkg = JSON.parse(fs.readFileSync(corePkgPath, 'utf8'));
    const nodes = corePkg['robos:nodes'] || [];

    it('contains Luxir registered as experimental and not-yet-prod-ready', () => {
      const luxirNode = nodes.find(n => n['@id'] === 'urn:robos:search:luxir-kgraph-index');
      assert.ok(luxirNode, 'Luxir search index node must exist in core-platform');
      assert.strictEqual(luxirNode['robos:engine'], 'luxir');
      assert.strictEqual(luxirNode['robos:productionReady'], false, 'Luxir must be marked productionReady: false');
      assert.strictEqual(luxirNode['robos:status'], 'experimental');
      assert.strictEqual(luxirNode['robos:readiness'], 'not-yet-prod-ready');
      assert.strictEqual(luxirNode['robos:maturity'], 'pre-release');
      assert.strictEqual(luxirNode['robos:technology'], 'https://robos.dev/ns/technology#luxir');
    });

    it('contains Solr, Elasticsearch, and OpenSearch search indices', () => {
      const solr = nodes.find(n => n['@id'] === 'urn:robos:search:solr-enterprise-index');
      assert.ok(solr, 'Solr index must exist');
      assert.strictEqual(solr['robos:engine'], 'solr');
      assert.strictEqual(solr['robos:productionReady'], true);

      const es = nodes.find(n => n['@id'] === 'urn:robos:search:elasticsearch-telemetry-index');
      assert.ok(es, 'Elasticsearch index must exist');
      assert.strictEqual(es['robos:engine'], 'elasticsearch');
      assert.strictEqual(es['robos:productionReady'], true);

      const osNode = nodes.find(n => n['@id'] === 'urn:robos:search:opensearch-cluster-index');
      assert.ok(osNode, 'OpenSearch index must exist');
      assert.strictEqual(osNode['robos:engine'], 'opensearch');
      assert.strictEqual(osNode['robos:productionReady'], true);
    });

    it('registers technology defined terms for luxir, solr, elasticsearch, and opensearch', () => {
      const luxirTech = nodes.find(n => n['@id'] === 'https://robos.dev/ns/technology#luxir');
      assert.ok(luxirTech, 'Luxir technology term must exist');
      assert.strictEqual(luxirTech['schema:termCode'], 'luxir');
      assert.strictEqual(luxirTech['robos:productionReady'], false);

      const solrTech = nodes.find(n => n['@id'] === 'https://robos.dev/ns/technology#solr');
      assert.ok(solrTech);

      const esTech = nodes.find(n => n['@id'] === 'https://robos.dev/ns/technology#elasticsearch');
      assert.ok(esTech);

      const osTech = nodes.find(n => n['@id'] === 'https://robos.dev/ns/technology#opensearch');
      assert.ok(osTech);
    });
  });

  describe('3. LuxirIndexer Document Extraction & Bulk Indexing Pipeline', () => {
    const indexer = new LuxirIndexer({ endpoint: 'http://127.0.0.1:9999' });

    it('converts Knowledge Graph node into structured Luxir document', () => {
      const sampleNode = {
        '@id': 'urn:robos:service:billing-api',
        '@type': ['oslc_am:Resource', 'robos:Microservice'],
        'dcterms:title': 'Billing Microservice',
        'dcterms:description': 'Stripe payment processor and invoicing engine',
        'robos:role': 'Payment Orchestration',
        'robos:package': 'services',
        'robos:tags': ['billing', 'payments', 'stripe'],
        'robos:ownerTeam': 'urn:robos:team:fintech',
      };

      const doc = indexer.nodeToDocument(sampleNode);
      assert.strictEqual(doc.id, 'urn:robos:service:billing-api');
      assert.strictEqual(doc.title, 'Billing Microservice');
      assert.strictEqual(doc.package, 'services');
      assert.strictEqual(doc.role, 'Payment Orchestration');
      assert.ok(doc.searchableText.includes('Billing Microservice'));
      assert.ok(doc.searchableText.includes('invoicing engine'));
      assert.ok(doc.searchableText.includes('stripe'));
    });

    it('gracefully handles offline Luxir instance during bulk indexing', async () => {
      const sampleNodes = [
        { '@id': 'urn:robos:n1', 'dcterms:title': 'Node 1' },
        { '@id': 'urn:robos:n2', 'dcterms:title': 'Node 2' },
      ];

      const res = await indexer.bulkIndex(sampleNodes);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.offline, true);
      assert.strictEqual(res.totalDocs, 2);
      assert.ok(res.message.includes('offline'));
    });
  });

  describe('4. SDLCKnowledgeGraphStore Luxir Integration & Fallback', () => {
    it('falls back to in-memory search when Luxir is offline', async () => {
      const store = new SDLCKnowledgeGraphStore();
      const results = await store.searchWithLuxir('luxir', {});
      assert.ok(Array.isArray(results));
      assert.ok(results.length >= 1, 'Should find at least 1 node matching luxir via fallback');
      assert.ok(results.some(r => r['@id'] === 'urn:robos:search:luxir-kgraph-index' || r['@id'] === 'https://robos.dev/ns/technology#luxir'));
    });

    it('executes reindexToLuxir without throwing', async () => {
      const store = new SDLCKnowledgeGraphStore();
      const res = await store.reindexToLuxir();
      assert.ok(res);
      assert.ok(res.totalDocs > 0);
    });
  });
});

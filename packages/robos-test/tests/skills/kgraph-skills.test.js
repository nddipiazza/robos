'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const { SDLCKnowledgeGraphStore } = require('../../../robos-graph/lib/graph-store');
const { SHACLValidator } = require('../../../robos-graph/lib/shacl-validator');
const { BUILTIN_SKILLS } = require('../../../skills-manager/skills-data');

const CLI_PATH = path.resolve(__dirname, '../../../robos-graph/bin/kgraph-cli.js');

describe('Knowledge Graph (KGraph) Skills & CLI Test Suite', () => {
  let tmpDir;
  let tmpGraphFile;
  let store;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-skills-'));
    tmpGraphFile = path.join(tmpDir, 'knowledge-graph.jsonld');
    store = new SDLCKnowledgeGraphStore(tmpGraphFile);
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Skills Registry & Built-in Integration', () => {
    it('registers Knowledge Graph skills in Skills Manager BUILTIN_SKILLS', () => {
      const kgraphSkills = BUILTIN_SKILLS.filter(s => s.category === 'Knowledge Graph');
      assert.ok(kgraphSkills.length >= 7, `Expected at least 7 kgraph skills, got ${kgraphSkills.length}`);
      
      const skillIds = kgraphSkills.map(s => s.id);
      assert.ok(skillIds.includes('kgraph-search'));
      assert.ok(skillIds.includes('kgraph-validate'));
      assert.ok(skillIds.includes('kgraph-diff'));
      assert.ok(skillIds.includes('kgraph-impact'));
      assert.ok(skillIds.includes('kgraph-visualize'));
      assert.ok(skillIds.includes('kgraph-export'));
      assert.ok(skillIds.includes('kgraph-query'));
    });

    it('has SKILL.md documentation files for all 10 new KGraph skills in plugins and .agents', () => {
      const expectedSkills = [
        'kgraph-search', 'kgraph-insert', 'kgraph-delete', 'kgraph-update',
        'kgraph-query', 'kgraph-impact-analysis', 'kgraph-validate', 'kgraph-diff',
        'kgraph-export', 'kgraph-visualize'
      ];

      for (const sk of expectedSkills) {
        const pluginPath = path.join(__dirname, '../../../../plugins/robos/skills', sk, 'SKILL.md');
        const agentPath = path.join(__dirname, '../../../../.agents/skills', sk, 'SKILL.md');
        assert.ok(fs.existsSync(pluginPath), `Missing plugin skill: ${pluginPath}`);
        assert.ok(fs.existsSync(agentPath), `Missing agent skill: ${agentPath}`);
      }
    });
  });

  describe('2. SDLCKnowledgeGraphStore Extended Graph Operations', () => {
    it('inserts a validated node and updates package store', () => {
      const node = {
        '@id': 'urn:robos:service:test-billing-api',
        '@type': ['robos:Microservice', 'oslc_am:Resource'],
        'dcterms:title': 'Test Billing API Microservice',
        'dcterms:description': 'Automated test billing microservice',
        'robos:package': 'services',
        'robos:repository': 'git@github.com:acme/billing-api.git',
      };

      const inserted = store.addNode(node);
      assert.equal(inserted['@id'], node['@id']);

      const retrieved = store.getNode(node['@id']);
      assert.ok(retrieved);
      assert.equal(retrieved['dcterms:title'], node['dcterms:title']);
    });

    it('searches nodes across packages by query, type, and tags', () => {
      const results = store.searchNodes('Billing', { type: 'robos:Microservice' });
      assert.ok(results.length >= 1);
      assert.equal(results[0]['@id'], 'urn:robos:service:test-billing-api');
    });

    it('updates node properties in place and validates', () => {
      const updated = store.updateNode('urn:robos:service:test-billing-api', {
        'dcterms:description': 'Updated description with payment capabilities',
        'robos:tags': ['billing', 'payments', 'finance'],
      });
      assert.ok(updated);
      assert.equal(updated['dcterms:description'], 'Updated description with payment capabilities');

      const retrieved = store.getNode('urn:robos:service:test-billing-api');
      assert.deepEqual(retrieved['robos:tags'], ['billing', 'payments', 'finance']);
    });

    it('traces multi-hop graph paths between connected nodes', () => {
      // Connect test-billing-api -> test-db
      const dbNode = {
        '@id': 'urn:robos:db:test-billing-db',
        '@type': ['robos:Database', 'oslc_am:Resource'],
        'dcterms:title': 'Test Billing Database',
        'robos:dbEngine': 'PostgreSQL',
        'robos:package': 'core-platform',
      };
      store.addNode(dbNode);

      store.updateNode('urn:robos:service:test-billing-api', {
        'robos:usesDatabase': 'urn:robos:db:test-billing-db',
      });

      const pathResult = store.findPath('urn:robos:service:test-billing-api', 'urn:robos:db:test-billing-db');
      assert.ok(pathResult);
      assert.equal(pathResult.length, 2);
      assert.equal(pathResult[0].id, 'urn:robos:service:test-billing-api');
      assert.equal(pathResult[1].id, 'urn:robos:db:test-billing-db');
    });

    it('computes blast radius and dependent nodes via impact analysis', () => {
      const blast = store.findDependents('urn:robos:db:test-billing-db', 2);
      assert.ok(blast);
      assert.ok(blast.blastRadiusCount >= 1);
      const depIds = blast.dependents.map(d => d.node['@id']);
      assert.ok(depIds.includes('urn:robos:service:test-billing-api'));
    });

    it('generates executable Mermaid diagram syntax with subgraphs and edges', () => {
      const mermaid = store.generateMermaidGraph({ rootId: 'urn:robos:service:test-billing-api' });
      assert.ok(mermaid.startsWith('graph TD'));
      assert.ok(mermaid.includes('urn_robos_service_test_billing_api'));
      assert.ok(mermaid.includes('urn_robos_db_test_billing_db'));
      assert.ok(mermaid.includes('-->'));
    });

    it('exports graph to standard W3C Turtle (.ttl) format', () => {
      const ttl = store.exportGraph('ttl');
      assert.ok(ttl.includes('@prefix oslc:'));
      assert.ok(ttl.includes('@prefix robos:'));
      assert.ok(ttl.includes('<urn:robos:service:test-billing-api>'));
      assert.ok(ttl.includes('<http://purl.org/dc/terms/title> "Test Billing API Microservice"'));
    });

    it('safely removes node with cascade cleanup', () => {
      const removed = store.removeNode('urn:robos:db:test-billing-db', { cascade: true });
      assert.equal(removed, true);
      assert.equal(store.getNode('urn:robos:db:test-billing-db'), null);

      // Verify reference was pruned from test-billing-api
      const consumer = store.getNode('urn:robos:service:test-billing-api');
      assert.equal(consumer['robos:usesDatabase'], undefined);

      // Clean up test-billing-api
      store.removeNode('urn:robos:service:test-billing-api');
    });

    it('validates graph satisfies 100% SHACL shapes', () => {
      const val = store.validate();
      assert.equal(val.conforms, true);
      assert.equal(val.results ? val.results.length : 0, 0);
    });
  });

  describe('3. kgraph CLI Subcommand Invocations', () => {
    it('executes kgraph search via CLI and returns formatted results', () => {
      const output = execSync(`node ${CLI_PATH} search "forms"`, { encoding: 'utf8' });
      assert.ok(output.includes('Found'));
      assert.ok(output.includes('urn:robos:service:forms-api'));
    });

    it('executes kgraph get via CLI and returns JSON representation', () => {
      const output = execSync(`node ${CLI_PATH} get "urn:robos:service:forms-api" --json`, { encoding: 'utf8' });
      const parsed = JSON.parse(output);
      assert.equal(parsed['@id'], 'urn:robos:service:forms-api');
      assert.equal(parsed['dcterms:title'], 'Forms API Service');
      assert.ok(parsed._outboundRefs);
    });

    it('executes kgraph validate via CLI and returns 100% SHACL conformance', () => {
      const output = execSync(`node ${CLI_PATH} validate`, { encoding: 'utf8' });
      assert.ok(output.includes('passes 100% of W3C SHACL shape constraints'));
    });

    it('executes kgraph impact via CLI', () => {
      const output = execSync(`node ${CLI_PATH} impact "urn:robos:service:forms-api" --depth 2 --json`, { encoding: 'utf8' });
      const parsed = JSON.parse(output);
      assert.equal(parsed.targetId, 'urn:robos:service:forms-api');
      assert.ok(parsed.blastRadiusCount >= 1);
    });

    it('executes kgraph visualize via CLI and prints Mermaid syntax', () => {
      const output = execSync(`node ${CLI_PATH} visualize services --direction TD`, { encoding: 'utf8' });
      assert.ok(output.includes('graph TD'));
      assert.ok(output.includes('subgraph sub_services'));
    });
  });
});

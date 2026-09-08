'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { SDLCKnowledgeGraphStore } = require('../../../robos-graph/lib/graph-store');
const { SHACLValidator } = require('../../../robos-graph/lib/shacl-validator');
const { OSLCGraphParser } = require('../../../robos-graph/lib/oslc-parser');

describe('RobOS App Suite Knowledge Graph Data Audit Test Suite', () => {
  let tmpDir;
  let tmpGraphFile;
  let store;
  let validator;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-audit-'));
    tmpGraphFile = path.join(tmpDir, 'knowledge-graph.jsonld');
    store = new SDLCKnowledgeGraphStore(tmpGraphFile);
    validator = new SHACLValidator();
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. SDLCKnowledgeGraphStore Operational Domain CRUD & SHACL Validation', () => {
    it('creates, SHACL validates, and retrieves a relational Database node (db-manager & data-sources)', () => {
      const res = store.createDatabase({
        title: 'Petshop PostgreSQL Cluster',
        engine: 'postgresql',
        databaseName: 'petshop_prod',
        host: 'postgres.production.internal',
        port: 5432,
        user: 'postgres_app',
        passPath: 'devops/database/postgresql/petshop-prod/password',
        schemas: ['public', 'inventory', 'audits'],
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.ok(res.node['@id'].includes('petshop-postgresql-cluster'));
      assert.strictEqual(res.node['robos:engine'], 'postgresql');
      assert.strictEqual(res.node['robos:databaseName'], 'petshop_prod');
      assert.strictEqual(res.node['robos:package'], 'core-platform');
      assert.strictEqual(res.node['robos:hasCredential'], 'urn:robos:credential:devops/database/postgresql/petshop-prod/password');

      const found = store.getDatabase('petshop-postgresql-cluster');
      assert.ok(found, 'Database must be retrievable by slug');
      assert.strictEqual(found['robos:databaseName'], 'petshop_prod');

      const all = store.getDatabases();
      assert.ok(all.some(d => d['@id'] === res.node['@id']));
    });

    it('rejects an invalid Database missing mandatory properties under SHACL', () => {
      const res = store.createDatabase({
        title: 'Broken DB',
        engine: '',
        databaseName: '',
        host: '',
      });
      assert.strictEqual(res.ok, false);
      assert.ok(res.error.includes('SHACL validation failed'));
    });

    it('creates, SHACL validates, and retrieves a NoSQL Database node (nosql-manager)', () => {
      const res = store.createNoSQLDatabase({
        title: 'Session & Rate-Limit Cache Store',
        engine: 'redis',
        host: 'redis.cache.internal',
        port: 6379,
        databaseName: 'db0',
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.strictEqual(res.node['robos:engine'], 'redis');
      assert.strictEqual(res.node['robos:package'], 'core-platform');

      const found = store.getNoSQLDatabase('session---rate-limit-cache-store');
      assert.ok(found, 'NoSQL store must be retrievable');

      const all = store.getNoSQLDatabases();
      assert.ok(all.some(d => d['robos:engine'] === 'redis'));
    });

    it('creates, SHACL validates, and retrieves a Message Broker node', () => {
      const res = store.createMessageBroker({
        title: 'Orders Event Bus',
        brokerType: 'kafka',
        endpoint: 'kafka.events.internal:9092',
        topics: ['orders.v1', 'shipments.v1'],
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.strictEqual(res.node['robos:brokerType'], 'kafka');
      assert.strictEqual(res.node['robos:package'], 'core-platform');

      const found = store.getMessageBroker('orders-event-bus');
      assert.ok(found);
      assert.strictEqual(found['robos:endpoint'], 'kafka.events.internal:9092');
    });

    it('creates, SHACL validates, and retrieves an MCP Server node (mcp-manager)', () => {
      const res = store.createMCPServer({
        appId: 'task-manager',
        title: 'Task Manager MCP Server',
        transport: 'sse',
        endpoint: 'http://localhost:19131/mcp',
        port: 19131,
        toolsProvided: ['robos_task_manager_get_task', 'robos_task_manager_update_status'],
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.strictEqual(res.node['robos:transport'], 'sse');
      assert.strictEqual(res.node['robos:package'], 'core-platform');

      const found = store.getMCPServer('task-manager');
      assert.ok(found);
      assert.strictEqual(found['robos:appId'], 'task-manager');
    });

    it('creates, SHACL validates, and retrieves an Agent Persona node (agents-manager)', () => {
      const res = store.createAgentPersona({
        role: 'Autonomous Security Auditor',
        title: 'Security Auditor Persona',
        systemPrompt: 'Inspect contracts and identify secret leakage, misconfigurations, and CVEs.',
        tools: ['robos_sec_audit', 'robos_shacl_validate'],
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.strictEqual(res.node['robos:role'], 'Autonomous Security Auditor');
      assert.strictEqual(res.node['robos:package'], 'organization');

      const found = store.getAgentPersona('security-auditor-persona');
      assert.ok(found);
    });

    it('creates, SHACL validates, and retrieves a Kubernetes Cluster node (kube-studio)', () => {
      const res = store.createKubernetesCluster({
        id: 'eks-acme-prod',
        title: 'Acme EKS Production Cluster',
        provider: 'eks',
        apiEndpoint: 'https://eks-acme-prod.k8s.internal:6443',
        clusterContext: 'arn:aws:eks:us-east-1:123456789012:cluster/acme-prod',
        nodeCount: 12,
        region: 'us-east-1',
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.strictEqual(res.node['robos:provider'], 'eks');
      assert.strictEqual(res.node['robos:package'], 'devops');

      const found = store.getKubernetesCluster('eks-acme-prod');
      assert.ok(found);
      assert.strictEqual(found['robos:nodeCount'], 12);
    });

    it('creates, SHACL validates, and retrieves an Environment node', () => {
      const res = store.createEnvironment({
        title: 'Staging Us-East-1',
        environmentType: 'staging',
        tier: 'Tier-2',
        targetCluster: 'urn:robos:k8s:cluster:eks-acme-prod',
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.strictEqual(res.node['robos:environmentType'], 'staging');
      assert.strictEqual(res.node['robos:package'], 'devops');

      const found = store.getEnvironment('staging-us-east-1');
      assert.ok(found);
    });

    it('creates, SHACL validates, and retrieves a GitOps Deployment node (kube-studio)', () => {
      const res = store.createGitOpsDeployment({
        title: 'Orders API GitOps Deployment',
        gitopsEngine: 'argocd',
        sourceRepo: 'github.com/acme/gitops-deployments',
        targetCluster: 'urn:robos:k8s:cluster:eks-acme-prod',
        targetNamespace: 'prod-orders',
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.strictEqual(res.node['robos:gitopsEngine'], 'argocd');
      assert.strictEqual(res.node['robos:package'], 'devops');

      const found = store.getGitOpsDeployment('orders-api-gitops-deployment');
      assert.ok(found);
    });

    it('creates, SHACL validates, and retrieves a Task Server node (task-servers)', () => {
      const res = store.createTaskServer({
        title: 'Enterprise Jira Core Server',
        serverType: 'jira',
        url: 'https://jira.acme.corp',
        projectKey: 'SDLC',
        passPath: 'devops/tasks/jira/api-token',
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.strictEqual(res.node['robos:serverType'], 'jira');
      assert.strictEqual(res.node['robos:package'], 'organization');
      assert.strictEqual(res.node['robos:hasCredential'], 'urn:robos:credential:devops/tasks/jira/api-token');

      const found = store.getTaskServer('enterprise-jira-core-server');
      assert.ok(found);
    });

    it('creates, SHACL validates, and retrieves a Context Source node (context-manager)', () => {
      const res = store.createContextSource({
        title: 'RobOS Core Documentation Source',
        sourceType: 'local',
        location: '/home/robos/source/robos/docs',
        tags: ['documentation', 'architecture'],
        enabled: true,
      });

      assert.strictEqual(res.ok, true, res.error);
      assert.strictEqual(res.node['robos:sourceType'], 'local');
      assert.strictEqual(res.node['robos:package'], 'core-platform');

      const found = store.getContextSource('robos-core-documentation-source');
      assert.ok(found);
    });
  });

  describe('2. Bi-Directional Semantic Edge Resolution & Dependency Graphs', () => {
    it('connects a Microservice to Database, MessageBroker, and GitOpsDeployment and resolves dependencies', () => {
      const dbRes = store.createDatabase({
        title: 'Inventory PostgreSQL',
        engine: 'postgresql',
        databaseName: 'inventory_db',
        host: 'postgres-inv.internal',
      });
      const brokerRes = store.createMessageBroker({
        title: 'Inventory Events',
        brokerType: 'kafka',
        endpoint: 'kafka-inv.internal:9092',
      });
      const clusterRes = store.createKubernetesCluster({
        id: 'k8s-inv-prod',
        title: 'Inventory EKS',
        provider: 'eks',
        apiEndpoint: 'https://k8s-inv.internal:6443',
        clusterContext: 'arn:aws:eks:inv-prod',
      });
      const gitopsRes = store.createGitOpsDeployment({
        title: 'Inventory GitOps',
        gitopsEngine: 'argocd',
        sourceRepo: 'github.com/acme/gitops-inv',
        targetCluster: clusterRes.node['@id'],
        targetNamespace: 'inv-prod',
      });

      const serviceNode = {
        '@id': 'urn:robos:service:inventory-api',
        '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
        'dcterms:title': 'Inventory Management Microservice',
        'robos:repository': 'github.com/acme/inventory-api',
        'robos:ownerTeam': 'urn:robos:team:inventory-squad',
        'robos:usesDatabase': dbRes.node['@id'],
        'robos:publishesTo': brokerRes.node['@id'],
        'robos:deployedVia': gitopsRes.node['@id'],
      };

      store.addNode(serviceNode);

      // Re-index edges
      store.parser.loadNodes(store.parser.nodes);

      const outgoing = store.parser.outgoingRefs.get('urn:robos:service:inventory-api');
      assert.ok(outgoing, 'Service must have outgoing references registered');
      assert.ok(outgoing.has(dbRes.node['@id']), 'Database must be in service outgoing references');
      assert.ok(outgoing.has(brokerRes.node['@id']), 'MessageBroker must be in service outgoing references');

      // Check blast radius / dependents from database back to consumer microservice
      const dbBlast = store.parser.findDependents(dbRes.node['@id']);
      assert.ok(dbBlast.dependents.some(d => d.node['@id'] === 'urn:robos:service:inventory-api'), 'Database blast radius must include dependent microservice');

      // Check incoming references on the database
      const dbIncoming = store.parser.incomingRefs.get(dbRes.node['@id']);
      assert.ok(dbIncoming && dbIncoming.has('urn:robos:service:inventory-api'), 'Database must reflect incoming reference from microservice');
    });
  });

  describe('3. Security & Zero-Plaintext-Credentials Audit', () => {
    it('verifies zero plaintext passwords or secret keys in the Knowledge Graph', () => {
      const serialized = JSON.stringify(store.parser.nodes);

      const secretPatterns = [
        /\"password\"\s*:\s*\"[^\"]+\"/i,
        /\"api_key\"\s*:\s*\"[^\"]+\"/i,
        /\"secret_token\"\s*:\s*\"[^\"]+\"/i,
        /\"private_key\"\s*:\s*\"[^\"]+\"/i,
      ];

      for (const pat of secretPatterns) {
        assert.strictEqual(pat.test(serialized), false, `Knowledge Graph must not contain plaintext secrets matching ${pat}`);
      }

      // Verify all credential links use robos:hasCredential URN scheme
      const credNodes = store.parser.nodes.filter(n => n['robos:hasCredential']);
      assert.ok(credNodes.length > 0, 'Should have nodes linking to credentials');
      for (const node of credNodes) {
        assert.ok(
          node['robos:hasCredential'].startsWith('urn:robos:credential:'),
          `Credential link must use urn:robos:credential: scheme, got ${node['robos:hasCredential']}`
        );
      }
    });
  });

  describe('4. Complete SHACL Conformance of All Graph Nodes', () => {
    it('validates that 100% of nodes in the audited store satisfy SHACL shapes', () => {
      const validation = validator.validate(store.parser.nodes);
      assert.strictEqual(validation.conforms, true, `Audited store must conform to SHACL with zero violations: ${JSON.stringify(validation.violations)}`);
      assert.strictEqual(validation.violations.length, 0);
    });
  });
});

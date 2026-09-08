'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { SHACLValidator } = require('../../../robos-graph/lib/shacl-validator');
const { OSLCGraphParser } = require('../../../robos-graph/lib/oslc-parser');
const { KGraphPackageManager } = require('../../../robos-graph/lib/package-manager');
const { KGraphResourceImporter } = require('../../../robos-graph/lib/resource-importer');

describe('RobOS Knowledge Graph Next SDLC Extensions Test Suite', () => {
  let validator;

  before(() => {
    validator = new SHACLValidator();
  });

  describe('1. W3C SHACL Validation of 11 New SDLC Shapes', () => {
    it('validates a relational Database node conforming to DatabaseShape', () => {
      const node = {
        '@id': 'urn:robos:db:postgres-primary',
        '@type': ['oslc_am:Resource', 'robos:Database', 'robos:RelationalDatabase'],
        'dcterms:title': 'Production Orders PostgreSQL Cluster',
        'robos:engine': 'postgresql',
        'robos:databaseName': 'orders_prod',
        'robos:host': 'postgres.production.internal',
        'robos:port': 5432,
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'Relational Database node must pass SHACL');
      assert.strictEqual(res.violations.length, 0);
    });

    it('catches violations when a Database node is missing engine or databaseName', () => {
      const invalidNode = {
        '@id': 'urn:robos:db:invalid-db',
        '@type': ['robos:Database'],
        'dcterms:title': 'Incomplete DB',
      };
      const res = validator.validate([invalidNode]);
      assert.strictEqual(res.conforms, false, 'Invalid Database node must violate SHACL');
      assert.ok(res.violations.some(v => v.path === 'robos:engine'));
      assert.ok(res.violations.some(v => v.path === 'robos:databaseName'));
      assert.ok(res.violations.some(v => v.path === 'robos:host'));
    });

    it('validates a NoSQLDatabase / CacheStore conforming to NoSQLDatabaseShape', () => {
      const node = {
        '@id': 'urn:robos:db:redis-sessions',
        '@type': ['oslc_am:Resource', 'robos:NoSQLDatabase', 'robos:CacheStore'],
        'dcterms:title': 'Redis Global Session Cluster',
        'robos:engine': 'redis',
        'robos:host': 'redis.cache.internal',
        'robos:port': 6379,
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'Redis CacheStore must pass SHACL');
    });

    it('validates a MessageBroker / EventBus node conforming to MessageBrokerShape', () => {
      const node = {
        '@id': 'urn:robos:broker:kafka-core',
        '@type': ['oslc_am:Resource', 'robos:MessageBroker', 'robos:EventBus'],
        'dcterms:title': 'Enterprise Kafka Event Bus',
        'robos:brokerType': 'kafka',
        'robos:endpoint': 'kafka.events.internal:9092',
        'robos:topics': ['orders.v1', 'invoices.v1'],
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'Kafka MessageBroker must pass SHACL');
    });

    it('validates an MCPServer conforming to MCPServerShape', () => {
      const node = {
        '@id': 'urn:robos:mcp:code-search',
        '@type': ['oslc_am:Resource', 'robos:MCPServer', 'robos:ToolProvider'],
        'dcterms:title': 'Codebase Context MCP Server',
        'robos:transport': 'stdio',
        'robos:command': '/usr/local/bin/context-mcp',
        'robos:toolsProvided': ['ast_search', 'symbol_lookup'],
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'MCPServer must pass SHACL');
    });

    it('validates an AgentPersona conforming to AgentPersonaShape', () => {
      const node = {
        '@id': 'urn:robos:agent:security-auditor',
        '@type': ['oslc:Person', 'robos:AgentPersona', 'robos:AIAgent'],
        'dcterms:title': 'Security Vulnerability Auditor',
        'robos:role': 'Autonomous Security Auditor',
        'robos:systemPrompt': 'Audit source code for OWASP Top 10 vulnerabilities.',
        'robos:modelPreference': 'claude-3-5-sonnet',
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'AgentPersona must pass SHACL');
    });

    it('validates a KubernetesCluster conforming to KubernetesClusterShape', () => {
      const node = {
        '@id': 'urn:robos:cluster:prod-eks',
        '@type': ['c4:DeploymentNode', 'robos:KubernetesCluster'],
        'dcterms:title': 'Production US-East EKS Cluster',
        'robos:provider': 'eks',
        'robos:apiEndpoint': 'https://k8s-api.us-east-1.eks.amazonaws.com',
        'robos:clusterContext': 'arn:aws:eks:us-east-1:123456:cluster/prod-eks',
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'KubernetesCluster must pass SHACL');
    });

    it('validates an Environment conforming to EnvironmentShape', () => {
      const node = {
        '@id': 'urn:robos:env:production',
        '@type': ['oslc_am:Resource', 'robos:Environment'],
        'dcterms:title': 'Production Tier 1 Environment',
        'robos:environmentType': 'production',
        'robos:tier': 'tier-1',
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'Environment must pass SHACL');
    });

    it('validates a GitOpsDeployment conforming to GitOpsDeploymentShape', () => {
      const node = {
        '@id': 'urn:robos:gitops:payments-app',
        '@type': ['oslc_config:ConfigurationItem', 'robos:GitOpsDeployment'],
        'dcterms:title': 'Payments Service ArgoCD Deployment',
        'robos:gitopsEngine': 'argocd',
        'robos:sourceRepo': 'https://github.com/acme/gitops-deployments',
        'robos:targetCluster': 'urn:robos:cluster:prod-eks',
        'robos:targetNamespace': 'payments',
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'GitOpsDeployment must pass SHACL');
    });

    it('validates a ProtobufContract conforming to ProtobufContractShape', () => {
      const node = {
        '@id': 'urn:robos:contract:payments-proto',
        '@type': ['robos:Contract', 'robos:ProtobufContract'],
        'dcterms:title': 'Payments gRPC Protobuf Contract',
        'robos:protocol': 'grpc-protobuf',
        'robos:specFile': 'proto/payments/v1/payments.proto',
        'robos:packageName': 'acme.payments.v1',
        'robos:rpcMethods': ['ProcessPayment', 'RefundPayment'],
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'ProtobufContract must pass SHACL');
    });

    it('validates a GraphQLContract conforming to GraphQLContractShape', () => {
      const node = {
        '@id': 'urn:robos:contract:products-graphql',
        '@type': ['robos:Contract', 'robos:GraphQLContract'],
        'dcterms:title': 'Products GraphQL Subgraph Schema',
        'robos:protocol': 'graphql',
        'robos:specFile': 'schemas/products.graphql',
        'robos:schemaType': 'federated-subgraph',
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'GraphQLContract must pass SHACL');
    });

    it('validates a CICDPipeline conforming to CICDPipelineShape', () => {
      const node = {
        '@id': 'urn:robos:pipeline:checkout-ci',
        '@type': ['oslc_qm:TestPlan', 'robos:CICDPipeline'],
        'dcterms:title': 'Checkout Service GitHub Actions Pipeline',
        'robos:platform': 'github-actions',
        'robos:workflowFile': '.github/workflows/ci.yml',
      };
      const res = validator.validate([node]);
      assert.strictEqual(res.conforms, true, 'CICDPipeline must pass SHACL');
    });
  });

  describe('2. OSLC Graph Parser Semantic Edge Traversal', () => {
    it('correctly populates incoming and outgoing references for databases, brokers, and clusters', () => {
      const nodes = [
        {
          '@id': 'urn:robos:service:orders',
          '@type': ['robos:Microservice'],
          'dcterms:title': 'Orders Service',
          'robos:usesDatabase': 'urn:robos:db:postgres-orders',
          'robos:usesMessageBroker': 'urn:robos:broker:kafka-main',
          'robos:publishesTo': 'urn:robos:broker:kafka-main',
          'robos:deployedTo': 'urn:robos:gitops:orders-argocd',
          'robos:implementsContract': ['urn:robos:contract:orders-grpc'],
        },
        {
          '@id': 'urn:robos:db:postgres-orders',
          '@type': ['robos:Database'],
          'dcterms:title': 'Orders Postgres DB',
          'robos:engine': 'postgresql',
          'robos:databaseName': 'orders_db',
          'robos:host': 'localhost',
        },
        {
          '@id': 'urn:robos:broker:kafka-main',
          '@type': ['robos:MessageBroker'],
          'dcterms:title': 'Kafka Main',
          'robos:brokerType': 'kafka',
          'robos:endpoint': 'localhost:9092',
        },
        {
          '@id': 'urn:robos:agent:reviewer',
          '@type': ['robos:AgentPersona'],
          'dcterms:title': 'PR Reviewer',
          'robos:role': 'Reviewer',
          'robos:systemPrompt': 'Review code',
          'robos:usesMCPServer': ['urn:robos:mcp:context-server'],
        },
        {
          '@id': 'urn:robos:mcp:context-server',
          '@type': ['robos:MCPServer'],
          'dcterms:title': 'Context Server',
          'robos:transport': 'stdio',
          'robos:toolsProvided': ['search'],
        },
      ];

      const parser = new OSLCGraphParser({ 'robos:nodes': nodes });
      const ordersOutgoing = parser.outgoingRefs.get('urn:robos:service:orders');
      assert.ok(ordersOutgoing.has('urn:robos:db:postgres-orders'), 'Must link to database');
      assert.ok(ordersOutgoing.has('urn:robos:broker:kafka-main'), 'Must link to message broker');
      assert.ok(ordersOutgoing.has('urn:robos:gitops:orders-argocd'), 'Must link to gitops deployment');
      assert.ok(ordersOutgoing.has('urn:robos:contract:orders-grpc'), 'Must link to contract');

      const dbIncoming = parser.incomingRefs.get('urn:robos:db:postgres-orders');
      assert.ok(dbIncoming.has('urn:robos:service:orders'), 'Database must have incoming ref from service');

      const mcpIncoming = parser.incomingRefs.get('urn:robos:mcp:context-server');
      assert.ok(mcpIncoming.has('urn:robos:agent:reviewer'), 'MCP server must have incoming ref from agent');
    });
  });

  describe('3. Workspace Modular Packages Conformance', () => {
    it('verifies all workspace packages conform to SHACL with zero violations', () => {
      const pm = new KGraphPackageManager({ baseDir: path.join(__dirname, '../../../../.robos') });
      const allNodes = pm.getAllNodes();
      assert.ok(allNodes.length >= 36, `Must contain at least 36 nodes, found ${allNodes.length}`);

      const report = validator.validate({ nodes: allNodes });
      assert.strictEqual(report.conforms, true, `Workspace KGraph must conform to SHACL. Violations: ${JSON.stringify(report.violations)}`);
      assert.strictEqual(report.violations.length, 0);

      // Verify specific new nodes exist in graph
      const ids = allNodes.map(n => n['@id']);
      assert.ok(ids.includes('urn:robos:db:acme-orders-postgres'), 'Postgres DB must exist');
      assert.ok(ids.includes('urn:robos:db:acme-session-redis'), 'Redis DB must exist');
      assert.ok(ids.includes('urn:robos:broker:acme-event-kafka'), 'Kafka broker must exist');
      assert.ok(ids.includes('urn:robos:mcp:context-engine'), 'Context MCP server must exist');
      assert.ok(ids.includes('urn:robos:agent:pr-reviewer'), 'PR reviewer agent persona must exist');
      assert.ok(ids.includes('urn:robos:cluster:prod-us-east-eks'), 'EKS cluster must exist');
      assert.ok(ids.includes('urn:robos:contract:orders-grpc'), 'Orders gRPC contract must exist');
      assert.ok(ids.includes('urn:robos:contract:catalog-graphql'), 'Catalog GraphQL contract must exist');
    });
  });

  describe('4. Prompt-Driven Resource Importer Expansion', () => {
    it('intelligently analyzes and extracts databases, brokers, k8s clusters, MCP servers, personas, and contracts', async () => {
      const importer = new KGraphResourceImporter({ companyName: 'FinTech Global' });
      const prompt = `
        Set up our FinTech Global SDLC architecture:
        - Primary PostgreSQL database at postgres://admin:secret@postgres.fintech.internal:5432/fintech_ledger
        - Distributed session store at redis://redis.fintech.internal:6379
        - Core Kafka broker at kafka://kafka.fintech.internal:9092
        - Kubernetes EKS cluster fintech-prod-eks at https://k8s-api.fintech.internal
        - MCP server fintech-query-tools at /usr/local/bin/fintech-mcp
        - Agent persona: Compliance Auditor - Continuously audits code commits against SOX and PCI standards
        - Microservice gRPC contract at proto/ledger/v1/ledger.proto
        - GraphQL API contract at schemas/portfolio.graphql
      `;

      const plan = importer.parsePrompt(prompt);
      assert.strictEqual(plan.company.name, 'FinTech Global');
      assert.ok(plan.summary.databases >= 2, 'Must extract at least 2 database URIs');
      assert.ok(plan.summary.messageBrokers >= 1, 'Must extract Kafka broker');
      assert.ok(plan.summary.kubernetesClusters >= 1, 'Must extract EKS cluster');
      assert.ok(plan.summary.mcpServers >= 1, 'Must extract MCP server');
      assert.ok(plan.summary.agentPersonas >= 1, 'Must extract agent persona');
      assert.ok(plan.summary.protobufContracts >= 1, 'Must extract proto contract');
      assert.ok(plan.summary.graphqlContracts >= 1, 'Must extract graphql schema');

      // Import the parsed resources and check SHACL
      const result = await importer.importResources(plan.resources, { companyName: 'FinTech Global', companySlug: 'fintech-global' });
      assert.ok(result.nodes.length >= 8, 'Must instantiate all resource nodes');
      assert.strictEqual(result.summary.shacl.conforms, true, 'All dynamically synthesized nodes must conform to SHACL');
      assert.strictEqual(result.summary.shacl.violations, 0);

      // Verify package routing
      const dbNodes = result.nodes.filter(n => (n['@type'] || []).includes('robos:Database') || (n['@type'] || []).includes('robos:NoSQLDatabase'));
      assert.ok(dbNodes.every(n => n['robos:package'] === 'core-platform'), 'Databases must route to core-platform');

      const personaNodes = result.nodes.filter(n => (n['@type'] || []).includes('robos:AgentPersona'));
      assert.ok(personaNodes.every(n => n['robos:package'] === 'organization'), 'Personas must route to organization');

      const clusterNodes = result.nodes.filter(n => (n['@type'] || []).includes('robos:KubernetesCluster'));
      assert.ok(clusterNodes.every(n => n['robos:package'] === 'devops'), 'Clusters must route to devops');

      const contractNodes = result.nodes.filter(n => (n['@type'] || []).includes('robos:Contract'));
      assert.ok(contractNodes.every(n => n['robos:package'] === 'services'), 'Contracts must route to services');
    });
  });
});

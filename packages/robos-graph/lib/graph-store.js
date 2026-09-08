'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { OSLCGraphParser, OSLC_CONTEXT } = require('./oslc-parser');
const { SHACLValidator } = require('./shacl-validator');
const { BranchManager } = require('./branch-manager');
const { GraphDiffEngine } = require('./graph-diff');
const { BlastRadiusAnalyzer } = require('./blast-radius');
const { GraphCoPilot } = require('./graph-copilot');
const { RepoScanner } = require('./repo-scanner');
const { BulkRepoImporter } = require('./bulk-repo-importer');
const { KGraphResourceImporter } = require('./resource-importer');
const { GherkinLinker, SAMPLE_GHERKIN_FEATURE } = require('./gherkin-linker');
const { KGraphPackageManager } = require('./package-manager');
const { KGraphRepoManager } = require('./repo-manager');
const { DevOpsIntegrationManager, DEVOPS_CATEGORIES, DEVOPS_PROVIDERS } = require('./devops-integrations');

const HOME_DIR = process.env.HOME || os.homedir();
const DEFAULT_GRAPH_PATH = path.join(HOME_DIR, '.robos', 'knowledge-graph.jsonld');

const DEFAULT_GRAPH_DATA = {
  '@context': OSLC_CONTEXT,
  '@id': 'urn:robos:graph:buildbarn-platform',
  '@type': ['oslc:ServiceProvider', 'robos:SystemGraph'],
  'dcterms:title': 'BuildBarn Engineering Universe',
  'robos:nodes': [
    {
      '@id': 'urn:robos:service:forms-api',
      '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
      'dcterms:title': 'Forms API Service',
      'robos:repository': 'github.com/acme/buildbarn-forms',
      'robos:implementsContract': 'urn:robos:contract:forms-api-v1',
      'robos:usesEntity': 'urn:robos:entity:FormDefinition',
      'robos:ownerTeam': 'urn:robos:team:core-platform',
      'robos:outboundDependencies': [
        {
          name: 'Acme Tax Forms API',
          url: 'https://api.acme-tax.com/v2/forms/2026/vendor-1099',
          method: 'GET',
          contract: 'specs/contracts/acme-tax-api-v2.yaml',
          mockPort: 18081,
          mockProxyUrl: 'http://localhost:18081/v2/forms/2026/vendor-1099',
          status: 'MOCKED VIA CONTRACT',
          mockResponse: {
            formId: 'tax-1099-2026-v88',
            formType: '1099-MISC',
            taxYear: 2026,
            vendorName: 'Acme Global Seller LLC',
            ein: 'XX-XXX8921',
            status: 'CERTIFIED_READY',
          },
        },
        {
          name: 'Stripe Payment Gateway',
          url: 'https://api.stripe.com/v1/charges',
          method: 'POST',
          contract: 'specs/contracts/stripe-v1.yaml',
          mockPort: 18082,
          mockProxyUrl: 'http://localhost:18082/v1/charges',
          status: 'MOCKED (WireMock)',
          mockResponse: {
            id: 'ch_mock123456789',
            status: 'succeeded',
            amount: 5000,
            currency: 'usd',
          },
        },
        {
          name: 'OAuth2 Identity & Token Service',
          url: 'https://auth.acme.com/oauth/token',
          method: 'POST',
          contract: 'specs/contracts/auth0-oauth2.yaml',
          mockPort: 18083,
          mockProxyUrl: 'http://localhost:18083/oauth/token',
          status: 'MOCKED',
          mockResponse: {
            access_token: 'mock-jwt-token-standard-user',
            token_type: 'Bearer',
            expires_in: 3600,
          },
        },
      ],
    },
    {
      '@id': 'urn:robos:service:tasks-service',
      '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
      'dcterms:title': 'Tasks Backend Service',
      'robos:repository': 'github.com/acme/buildbarn-tasks',
      'robos:implementsContract': 'urn:robos:contract:tasks-api-v1',
      'robos:ownerTeam': 'urn:robos:team:core-platform',
      'robos:dependsOn': 'urn:robos:service:forms-api',
    },
    {
      '@id': 'urn:robos:contract:forms-api-v1',
      '@type': ['robos:Contract', 'c4:Component'],
      'dcterms:title': 'Forms API OpenAPI 3.1 Spec',
      'robos:specFile': 'specs/contracts/forms-api-v1.yaml',
      'robos:protocol': 'OpenAPI 3.1',
      'robos:contractYaml': 'openapi: 3.1.0\ninfo:\n  title: Forms API Spec\n  version: 1.0.0\npaths:\n  /api/v1/forms:\n    get:\n      summary: List forms\n      responses:\n        "200":\n          description: Success\n',
    },
    {
      '@id': 'urn:robos:requirement:REQ-201-multi-step',
      '@type': ['oslc_rm:Requirement', 'robos:Feature'],
      'dcterms:title': 'Multi-Step Form Wizard Requirement',
      'robos:featureFile': 'specs/features/multi-step-form.feature',
      'oslc_qm:validatedBy': 'urn:robos:test:e2e-multi-step',
      'robos:targetNode': 'urn:robos:service:forms-api',
      'robos:requirementId': 'REQ-201',
      'robos:targetService': 'urn:robos:service:forms-api',
      'robos:tags': ['Requirement-REQ-201', 'Service-forms-api'],
      'robos:narrative': 'As an authenticated user I want to complete a multi-step form wizard So that I can submit my structured application with live validation',
      'robos:scenarios': [
        {
          '@id': 'urn:robos:scenario:valid-submission',
          '@type': ['robos:Scenario'],
          'dcterms:title': 'Scenario: Successfully submitting all form steps',
          'robos:tags': ['CriticalPath', 'E2E'],
          'robos:stepCount': 9,
          'oslc_qm:executionStatus': 'PASS',
          'robos:steps': [
            { keyword: 'Given', text: 'the user is logged in with role "standard-user"' },
            { keyword: 'And', text: 'a dynamic form definition exists with 3 steps' },
            { keyword: 'When', text: 'the user completes Step 1 with valid personal details' },
            { keyword: 'And', text: 'clicks "Next Step"' },
            { keyword: 'And', text: 'completes Step 2 with document attachments' },
            { keyword: 'And', text: 'completes Step 3 with payment authorization' },
            { keyword: 'And', text: 'clicks "Submit Application"' },
            { keyword: 'Then', text: 'the application status should transition to "SUBMITTED"' },
            { keyword: 'And', text: 'a confirmation email event should be emitted to Kafka' },
          ],
        },
        {
          '@id': 'urn:robos:scenario:missing-docs-validation',
          '@type': ['robos:Scenario'],
          'dcterms:title': 'Scenario: Validation error on missing required documents',
          'robos:tags': ['Validation', 'Negative'],
          'robos:stepCount': 4,
          'oslc_qm:executionStatus': 'PASS',
          'robos:steps': [
            { keyword: 'Given', text: 'the user is on Step 2 of the form wizard' },
            { keyword: 'When', text: 'the user attempts to proceed without attaching identity proof' },
            { keyword: 'Then', text: 'a validation error "Document required" should be displayed' },
            { keyword: 'And', text: 'the wizard should remain on Step 2' },
          ],
        },
      ],
    },
    {
      '@id': 'urn:robos:team:core-platform',
      '@type': ['robos:Team'],
      'dcterms:title': 'Core Platform Engineering Team',
    },
    {
      '@id': 'urn:robos:project:acme-petshop',
      '@type': ['oslc:Project', 'robos:Project'],
      'dcterms:title': 'Acme Petshop Platform',
      'robos:status': 'active',
    },
    {
      '@id': 'urn:robos:elearning:microservices-contracts',
      '@type': ['robos:ELearning', 'oslc:Resource'],
      'dcterms:title': 'Building Event-Driven Microservices with OpenAPI & Gherkin BDD',
      'dcterms:description': 'Comprehensive hands-on training for architecting resilient microservices, defining OpenAPI 3.1 contracts, and verifying them against Gherkin BDD specifications in RobOS.',
      'robos:topic': 'Microservices & Contracts',
      'robos:difficulty': 'Intermediate',
      'robos:targetAudience': 'Backend Engineers & Platform Architects',
      'robos:estimatedDuration': '45 minutes',
      'robos:gitopsFile': '.robos/elearning.yaml',
      'robos:teachesService': 'urn:robos:service:forms-api',
      'robos:teachesContract': 'urn:robos:contract:forms-api-v1',
      'robos:status': 'published',
      'robos:modules': [
        {
          id: 'mod-01-openapi',
          title: 'Module 1: OpenAPI 3.1 Contract-First Design',
          durationMinutes: 15,
          overview: 'Understand OSLC linked-data contracts, API schema definition, and contract mocking with Prism.',
          labSteps: [
            'Inspect specs/contracts/forms-api-v1.yaml schema definitions',
            'Run local Prism mock server on port 18081',
            'Verify outbound dependency headers and JSON Schema payload validation',
          ],
          quiz: [
            {
              question: 'Which tool does RobOS use to validate OSLC knowledge graph shapes?',
              answer: 'W3C SHACL Validator',
            },
          ],
        },
        {
          id: 'mod-02-gherkin',
          title: 'Module 2: Gherkin BDD Specifications & Red-Green Verification',
          durationMinutes: 15,
          overview: 'Master executable specifications using Cucumber Gherkin syntax mapped directly to SDLC graph nodes.',
          labSteps: [
            'Open specs/features/multi-step-form.feature in Monaco Editor',
            'Map Scenario Given/When/Then steps to oslc_qm:validatedBy test suites',
            'Execute Strict Red verification guard before implementing code',
          ],
          quiz: [
            {
              question: 'What guard prevents false-positive test runs in RobOS EDD?',
              answer: 'Strict Red Phase assertion failure verification',
            },
          ],
        },
        {
          id: 'mod-03-gitops',
          title: 'Module 3: GitOps Topology & Continuous Delivery Reconciler',
          durationMinutes: 15,
          overview: 'Deploy microservices declaratively via .robos/ GitOps trees and ArgoCD synchronization.',
          labSteps: [
            'Inspect .robos/topology.yaml and .robos/packages.yaml',
            'Verify dual-commit: code changes plus knowledge graph branch update',
            'Trigger automatic Kubernetes deployment reconciliation',
          ],
          quiz: [
            {
              question: 'Where is declarative system topology stored in RobOS?',
              answer: '.robos/topology.yaml',
            },
          ],
        },
      ],
      'robos:updatedAt': '2026-09-05T09:00:00.000Z',
    },
    {
      '@id': 'urn:robos:cloud:aws-prod',
      '@type': ['robos:CloudProvider', 'c4:DeploymentNode'],
      'dcterms:title': 'Amazon Web Services (Production us-east-1)',
      'robos:provider': 'aws',
      'robos:region': 'us-east-1',
      'robos:managedServices': ['EKS', 'ECR', 'KMS', 'MSK Kafka', 'RDS PostgreSQL'],
    },
    {
      '@id': 'urn:robos:cloud:vercel-prod',
      '@type': ['robos:CloudProvider', 'robos:ServerlessTarget'],
      'dcterms:title': 'Vercel Edge Platform',
      'robos:provider': 'vercel',
      'robos:tier': 'Enterprise Edge',
      'robos:regions': ['iad1', 'sfo1', 'fra1'],
    },
    {
      '@id': 'urn:robos:k8s:cluster:eks-acme-prod',
      '@type': ['robos:KubernetesCluster', 'c4:DeploymentNode'],
      'dcterms:title': 'Acme EKS Production Cluster (v1.30)',
      'robos:provider': 'eks',
      'robos:flavor': 'eks',
      'robos:cloudProvider': 'urn:robos:cloud:aws-prod',
      'robos:nodeCount': 12,
      'robos:apiEndpoint': 'https://eks.us-east-1.acme.aws:6443',
      'robos:clusterContext': 'eks-acme-prod',
    },
    {
      '@id': 'urn:robos:k8s:cluster:kind-local',
      '@type': ['robos:KubernetesCluster', 'c4:DeploymentNode'],
      'dcterms:title': 'Local Kind Development Cluster',
      'robos:provider': 'kind',
      'robos:flavor': 'kind',
      'robos:cloudProvider': 'local',
      'robos:nodeCount': 3,
      'robos:apiEndpoint': 'https://127.0.0.1:6443',
      'robos:clusterContext': 'kind-local',
    },
    {
      '@id': 'urn:robos:k8s:namespace:acme-petshop-prod',
      '@type': ['robos:KubernetesNamespace'],
      'dcterms:title': 'Production Namespace: acme-petshop-prod',
      'robos:namespaceName': 'acme-petshop-prod',
      'robos:cluster': 'urn:robos:k8s:cluster:eks-acme-prod',
      'robos:labels': { 'environment': 'production', 'team': 'core-platform' },
    },
    {
      '@id': 'urn:robos:helm:chart:acme-petshop',
      '@type': ['robos:HelmChart'],
      'dcterms:title': 'Acme Petshop Umbrella Helm Chart',
      'robos:chartVersion': '1.2.0',
      'robos:appVersion': '1.2.0',
      'robos:chartPath': 'charts/acme-petshop',
      'robos:subcharts': ['petstore-api', 'vaccine-gateway', 'petstore-web', 'strimzi-kafka'],
    },
    {
      '@id': 'urn:robos:helm:release:acme-petshop-prod',
      '@type': ['robos:HelmRelease'],
      'dcterms:title': 'Helm Release: acme-petshop (Prod)',
      'robos:releaseName': 'acme-petshop',
      'robos:chart': 'urn:robos:helm:chart:acme-petshop',
      'robos:namespace': 'urn:robos:k8s:namespace:acme-petshop-prod',
      'robos:revision': 4,
      'robos:status': 'deployed',
      'robos:updatedAt': '2026-09-04T15:08:00Z',
    },
    {
      '@id': 'urn:robos:gitops:app:acme-petshop',
      '@type': ['robos:GitOpsDeployment', 'robos:ArgoCDApplication'],
      'dcterms:title': 'ArgoCD GitOps App: acme-petshop',
      'robos:gitopsEngine': 'argocd',
      'robos:appName': 'acme-petshop-prod',
      'robos:syncStatus': 'Synced',
      'robos:healthStatus': 'Healthy',
      'robos:sourceRepo': 'https://github.com/acme-corp/petstore-infra',
      'robos:repoURL': 'https://github.com/acme-corp/petstore-infra',
      'robos:targetRevision': 'main',
      'robos:targetCluster': 'urn:robos:k8s:cluster:eks-acme-prod',
      'robos:destinationServer': 'https://eks.us-east-1.acme.aws:6443',
      'robos:targetNamespace': 'acme-petshop-prod',
      'robos:destinationNamespace': 'acme-petshop-prod',
    },
    {
      '@id': 'urn:robos:vercel:project:petstore-web',
      '@type': ['robos:VercelProject', 'robos:ServerlessTarget'],
      'dcterms:title': 'Vercel Project: petstore-web',
      'robos:projectName': 'acme-petshop-web',
      'robos:productionDomain': 'https://acme-petshop.vercel.app',
      'robos:framework': 'Next.js 14',
      'robos:previewDeployment': 'https://acme-petshop-git-feature-pet-105.vercel.app',
      'robos:status': 'READY',
      'robos:edgeRegions': ['iad1', 'sfo1'],
    },
    {
      '@id': 'urn:robos:service:petstore-api-k8s',
      '@type': ['robos:KubernetesDeployment', 'robos:Microservice', 'c4:Container'],
      'dcterms:title': 'K8s Deployment: petstore-api',
      'robos:repository': 'github.com/acme/petstore-api',
      'robos:ownerTeam': 'urn:robos:team:core-platform',
      'robos:deploymentName': 'petstore-api',
      'robos:namespace': 'acme-petshop-prod',
      'robos:replicas': 3,
      'robos:image': 'acme-org/petstore-api:v1.2.0',
      'robos:ports': [{ name: 'http', containerPort: 8080 }, { name: 'metrics', containerPort: 9090 }],
      'robos:implementsContract': 'urn:robos:contract:petstore-api-v1',
      'robos:securityContext': { runAsNonRoot: true, readOnlyRootFilesystem: true },
      'robos:status': '3/3 Running',
    },
    {
      '@id': 'urn:robos:service:vaccine-gateway-k8s',
      '@type': ['robos:KubernetesDeployment', 'robos:Microservice', 'c4:Container'],
      'dcterms:title': 'K8s Deployment: vaccine-gateway (mTLS)',
      'robos:repository': 'github.com/acme/vaccine-gateway',
      'robos:ownerTeam': 'urn:robos:team:core-platform',
      'robos:deploymentName': 'vaccine-gateway',
      'robos:namespace': 'acme-petshop-prod',
      'robos:replicas': 2,
      'robos:image': 'acme-org/vaccine-gateway:v1.0.0',
      'robos:ports': [{ name: 'mtls-https', containerPort: 8443 }],
      'robos:status': '2/2 Running',
    },
    {
      '@id': 'urn:robos:agent:strategy:caveman-compression',
      '@type': ['oslc_am:Resource', 'robos:PromptStrategy', 'robos:AIPromptTechnique'],
      'dcterms:title': 'Caveman Algorithmic Prompt Compression',
      'dcterms:description': 'Heuristic token pruning removing conversational boilerplate and filler tokens to achieve 40-60% prompt compaction on high-frequency Tier 1 & Tier 2 tasks.',
      'robos:strategyType': 'compression',
      'robos:engine': 'caveman',
      'robos:targetTiers': ['tier1', 'tier2'],
      'robos:mode': 'standard',
      'robos:enabled': true,
      'robos:parameters': {
        stripFillers: true,
        terseDirectives: true,
        preserveCodeBlocks: true,
        preservePaths: true,
      },
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.platform',
    },
    {
      '@id': 'urn:robos:agent:optimizer:dspy-teleprompter',
      '@type': ['oslc_am:Resource', 'robos:PromptOptimizer', 'robos:PromptCompiler'],
      'dcterms:title': 'Stanford DSPy Teleprompter Optimizer',
      'dcterms:description': 'Declarative prompt compilation framework synthesizing few-shot exemplars and calibrated instructions against verifiable validation metrics.',
      'robos:strategyType': 'teleprompter-optimization',
      'robos:engine': 'dspy',
      'robos:targetTiers': ['tier2', 'tier3'],
      'robos:enabled': true,
      'robos:parameters': {
        teleprompter: 'MIPROv2',
        metric: 'shacl_validation',
        candidatePrompts: 10,
        maxBootstrappedDemos: 4,
        autoCompileOnSave: false,
      },
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.platform',
    },
  ],
};

class SDLCKnowledgeGraphStore {
  constructor(options = {}) {
    const opts = typeof options === 'string' ? { filePath: options } : (options || {});
    this.filePath = opts.filePath || (opts.rootDir ? path.join(opts.rootDir, 'knowledge-graph.jsonld') : DEFAULT_GRAPH_PATH);
    const baseDir = opts.baseDir || (opts.rootDir ? (opts.rootDir.endsWith('.robos') ? opts.rootDir : path.join(opts.rootDir, '.robos')) : path.dirname(this.filePath));
    this.packageManager = new KGraphPackageManager({ baseDir, packagesDir: path.join(baseDir, 'kgraphs') });
    this.repoManager = new KGraphRepoManager({ workspaceDir: path.dirname(baseDir), rootDir: baseDir });
    this.devopsManager = new DevOpsIntegrationManager({ packageManager: this.packageManager });
    this.branchManager = new BranchManager({ baseGraphData: DEFAULT_GRAPH_DATA });
    this.parser = new OSLCGraphParser();
    this.validator = new SHACLValidator();
    this.diffEngine = new GraphDiffEngine();
    this.blastAnalyzer = new BlastRadiusAnalyzer();
    this.copilot = new GraphCoPilot({ validator: this.validator });
    this.repoScanner = new RepoScanner();
    this.bulkRepoImporter = new BulkRepoImporter();
    this.resourceImporter = new KGraphResourceImporter();
    this.gherkinLinker = new GherkinLinker();
    this.init();
  }

  getProjectNodes() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
      return types.includes('robos:Project') || types.includes('oslc:Project');
    });
  }

  upsertProjectNode(project) {
    const id = project['@id'] || `urn:robos:project:${project.id}`;
    const existingIdx = this.parser.nodes.findIndex(n => n['@id'] === id);
    const node = {
      '@id': id,
      '@type': ['oslc:Project', 'robos:Project'],
      'dcterms:title': project.name || project['dcterms:title'] || 'Untitled Project',
      'dcterms:description': project.description || project['dcterms:description'] || '',
      'robos:status': project.status || 'active',
      'robos:techStack': project.techStack || 'Java 21 Spring Boot 3 + React 18 + TypeSpec',
      'robos:hasRepository': project.repos || ['urn:robos:repo:petstore-api', 'urn:robos:repo:petstore-web', 'urn:robos:repo:petstore-common'],
      'robos:tracksEpic': project.epics || ['urn:robos:epic:PET-EPIC-1'],
      'robos:features': project.features || [
        {
          id: 'feat-platform-core',
          name: 'Distributed Platform Core & APIs',
          epicKey: 'PET-EPIC-1',
          tasks: (project.tasks || []).map(t => t.ticketKey || t.title),
        },
      ],
      'robos:updatedAt': new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      this.parser.nodes[existingIdx] = { ...this.parser.nodes[existingIdx], ...node };
    } else {
      this.parser.nodes.push(node);
    }
    this.parser.loadNodes(this.parser.nodes);
    this.save();
    return node;
  }

  init() {
    // 1. If packagesDir has package directories, load multi-file packages
    if (fs.existsSync(this.packageManager.packagesDir)) {
      try {
        const subdirs = fs.readdirSync(this.packageManager.packagesDir);
        if (subdirs.length > 0) {
          const packageNodes = this.packageManager.loadPackages();
          if (packageNodes.length > 0) {
            this.parser = new OSLCGraphParser({
              '@context': OSLC_CONTEXT,
              '@id': 'urn:robos:graph:acme-enterprise-global',
              '@type': ['oslc:ServiceProvider', 'robos:SystemGraph'],
              'dcterms:title': 'Acme Enterprise Global SDLC Universe',
              'robos:nodes': packageNodes,
            });
            this.branchManager = new BranchManager({ baseGraphData: this.parser.toJSONLD() });
            return;
          }
        }
      } catch {}
    }

    // 2. If single-file exists, split into packages and load
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        const packageNodes = this.packageManager.splitMonolithicGraph(raw);
        this.parser = new OSLCGraphParser({
          '@context': OSLC_CONTEXT,
          '@id': raw['@id'] || 'urn:robos:graph:acme-enterprise-global',
          '@type': raw['@type'] || ['oslc:ServiceProvider', 'robos:SystemGraph'],
          'dcterms:title': raw['dcterms:title'] || 'Acme Enterprise Global SDLC Universe',
          'robos:nodes': packageNodes,
        });
        this.branchManager = new BranchManager({ baseGraphData: raw });
        return;
      } catch {}
    }

    // 3. Fall back to DEFAULT_GRAPH_DATA split into packages
    const packageNodes = this.packageManager.splitMonolithicGraph(DEFAULT_GRAPH_DATA);
    this.parser = new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': DEFAULT_GRAPH_DATA['@id'],
      '@type': DEFAULT_GRAPH_DATA['@type'],
      'dcterms:title': DEFAULT_GRAPH_DATA['dcterms:title'],
      'robos:nodes': packageNodes,
    });
    this.save();
  }

  save() {
    try {
      for (const node of this.parser.nodes) {
        this.packageManager.upsertNode(node);
      }
      this.packageManager.saveDirtyPackages(this.filePath);
    } catch {}
  }

  getNode(id) {
    return this.parser.getNode(id);
  }

  query(filter) {
    return this.parser.queryNodes(filter);
  }

  findDependents(id, depth) {
    return this.parser.findDependents(id, depth);
  }

  validate() {
    return this.validator.validateGraph(this.parser);
  }

  listBranches() {
    return this.branchManager.listBranches();
  }

  getActiveBranch() {
    return this.branchManager.getActiveBranch();
  }

  switchBranch(branchName) {
    const res = this.branchManager.switchBranch(branchName);
    this.parser = new OSLCGraphParser(res.graphDoc);
    return res;
  }

  diffBranches(baseBranchName = 'main', targetBranchName = 'feature/TASK-101-auth') {
    const baseDoc = this.branchManager.getGraphForBranch(baseBranchName) || DEFAULT_GRAPH_DATA;
    const targetDoc = this.branchManager.getGraphForBranch(targetBranchName) || DEFAULT_GRAPH_DATA;

    const diff = this.diffEngine.diffGraphs(baseDoc, targetDoc);
    const blast = this.blastAnalyzer.analyzeImpact(diff, targetDoc);

    return {
      baseBranch: baseBranchName,
      targetBranch: targetBranchName,
      diff,
      blastRadius: blast,
    };
  }

  // ── Package & Multi-Repo Management ─────────────────────────────────────────
  listPackages() {
    return this.packageManager.listPackages();
  }

  getPackage(packageId) {
    return this.packageManager.getPackage(packageId);
  }

  listRepos() {
    return this.repoManager.listRepos();
  }

  addRepo(repoData) {
    return this.repoManager.addRepo(repoData);
  }

  removeRepo(repoId) {
    return this.repoManager.removeRepo(repoId);
  }

  syncRemoteRepo(repoId) {
    return this.repoManager.syncRemoteRepo(repoId);
  }

  // ── DevOps Integrations Management ──────────────────────────────────────────
  getDevOpsCategories() {
    return this.devopsManager.getCategories();
  }

  getDevOpsProviders(categoryId) {
    return this.devopsManager.getProviders(categoryId);
  }

  saveDevOpsIntegration(payload) {
    const res = this.devopsManager.saveIntegration({ ...payload, packageManager: this.packageManager });
    if (res && res.ok) {
      this.parser.loadNodes(this.packageManager.getAllNodes());
      this.save();
    }
    return res;
  }

  testDevOpsConnection(payload) {
    return this.devopsManager.testConnection(payload);
  }

  deleteDevOpsIntegration(integrationId) {
    const res = this.devopsManager.deleteIntegration(integrationId, this.packageManager);
    if (res && res.ok) {
      this.parser.loadNodes(this.packageManager.getAllNodes());
      this.save();
    }
    return res;
  }

  listDevOpsIntegrations() {
    return this.devopsManager.listIntegrations(this.packageManager);
  }

  generateCoPilotMutation(prompt) {
    return this.copilot.generateMutation(prompt, this.parser.toJSONLD());
  }

  applyCoPilotMutation(mutation) {
    if (!mutation || !mutation.proposedNodes) return { ok: false, error: 'Invalid mutation' };
    for (const node of mutation.proposedNodes) {
      this.addNode(node);
    }
    const docSyncPrompt = this.discernDocUpdates({ action: 'applied-copilot-mutation', nodes: mutation.proposedNodes });
    return {
      ok: true,
      addedCount: mutation.proposedNodes.length,
      nodes: mutation.proposedNodes,
      docSyncPrompt,
    };
  }

  scanDirectory(dirPath) {
    return this.repoScanner.scanDirectory(dirPath);
  }

  parseGherkinFeature(featureText = SAMPLE_GHERKIN_FEATURE, filePath) {
    const res = this.gherkinLinker.parseFeature(featureText, filePath);
    this.addNode(res.feature);
    return res;
  }

  getTraceabilityMatrix() {
    const defaultRes = this.gherkinLinker.parseFeature(SAMPLE_GHERKIN_FEATURE);
    return defaultRes.traceabilityMatrix;
  }

  generateStepBoilerplate(scenario) {
    return this.gherkinLinker.generateStepBoilerplate(scenario);
  }

  getELearningNodes() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
      return types.some(t => t.includes('ELearning') || t.includes('Course'));
    });
  }

  findELearning(query = '') {
    const q = (query || '').toLowerCase().trim();
    if (!q) return null;
    const courses = this.getELearningNodes();
    return courses.find(c => {
      const title = (c['dcterms:title'] || '').toLowerCase();
      const topic = (c['robos:topic'] || '').toLowerCase();
      const id = (c['@id'] || '').toLowerCase();
      const desc = (c['dcterms:description'] || '').toLowerCase();
      return title.includes(q) || topic.includes(q) || id.includes(q) || (q.length > 5 && desc.includes(q)) || (q.includes('microservice') && id.includes('microservice'));
    }) || null;
  }

  discernDocUpdates(changeDetails = {}) {
    const node = changeDetails.node || (changeDetails.nodes && changeDetails.nodes[0]) || {};
    const action = changeDetails.action || 'updated';
    const typeStr = Array.isArray(node['@type']) ? node['@type'].join(', ') : (node['@type'] || 'robos:Resource');
    const title = node['dcterms:title'] || node['@id'] || 'KGraph Entity';

    const suggestedFiles = [
      'docs/index.md',
      'README.md',
    ];

    if (action === 'bulk-repo-import') {
      const summary = changeDetails.summary || {};
      suggestedFiles.push('.robos/packages.yaml');
      suggestedFiles.push('.robos/topology.yaml');
      suggestedFiles.push('docs/project-plan/engineering-knowledge-graph/epic.md');

      const aiPrompt = `[RobOS Doc Sync Agent Prompt]: Bulk Repository Import Completed in Knowledge Graph:
- Total Repositories Processed: ${summary.total || (changeDetails.nodes || []).length}
- Generated Microservices: ${summary.microservices || 0}
- Generated Desktop Apps: ${summary.desktopApps || 0}
- Generated Console Apps: ${summary.consoleApps || 0}
- Generated Mobile Apps: ${summary.mobileApps || 0}
- Generated Data Pipelines: ${summary.dataPipelines || 0}
- Generated Libraries/SDKs: ${summary.libraries || 0}
- Generated Front End Apps: ${summary.frontendApps || 0}
- Generated PC Games: ${summary.pcGames || 0}
- Generated Mobile Games: ${summary.mobileGames || 0}
- Generated OpenAPI & Contracts: ${summary.contracts || 0}

Action Required:
1. Discern noticeable updates required across system documentation to reflect these new application entities and generated OpenAPI/CLI models.
2. Review candidate documentation files:
${suggestedFiles.map(f => `   - ${f}`).join('\n')}
3. Update documentation to maintain complete synchronization with .robos/knowledge-graph.jsonld and .robos/packages.yaml.`;

      const result = {
        hasNoticeableUpdates: true,
        changeType: 'bulk-repo-import',
        nodeId: 'urn:robos:batch:bulk-repo-import',
        nodeTitle: `Bulk Repo Import (${summary.total || (changeDetails.nodes || []).length} repositories)`,
        nodeType: 'robos:BulkImportBatch',
        aiPrompt,
        suggestedFiles,
        summary,
        timestamp: new Date().toISOString(),
      };

      this.latestDocSyncPrompt = result;
      return result;
    }

    if (typeStr.includes('ELearning')) {
      suggestedFiles.push('.robos/elearning.yaml');
      suggestedFiles.push('docs/project-plan/engineering-knowledge-graph/epic.md');
    } else if (typeStr.includes('DesktopApp')) {
      suggestedFiles.push('.robos/packages.yaml');
      suggestedFiles.push('docs/desktop-applications.md');
    } else if (typeStr.includes('ConsoleApp')) {
      suggestedFiles.push('.robos/packages.yaml');
      suggestedFiles.push('docs/cli-tools.md');
    } else if (typeStr.includes('MobileApp')) {
      suggestedFiles.push('.robos/packages.yaml');
      suggestedFiles.push('docs/mobile-clients.md');
    } else if (typeStr.includes('FrontEndApp')) {
      suggestedFiles.push('.robos/packages.yaml');
      suggestedFiles.push('docs/frontend-applications.md');
    } else if (typeStr.includes('PCGame') || typeStr.includes('MobileGame')) {
      suggestedFiles.push('.robos/packages.yaml');
      suggestedFiles.push('docs/game-development.md');
    } else if (typeStr.includes('DataPipeline')) {
      suggestedFiles.push('.robos/topology.yaml');
      suggestedFiles.push('docs/data-pipelines.md');
    } else if (typeStr.includes('Microservice') || typeStr.includes('Service')) {
      suggestedFiles.push('.robos/topology.yaml');
      suggestedFiles.push('docs/project-plan/ai-agent-integration/story-05-ai-draft-stage.md');
    } else if (typeStr.includes('Contract')) {
      suggestedFiles.push('specs/contracts/');
    }

    const aiPrompt = `[RobOS Doc Sync Agent Prompt]: Noticeable updates detected in Knowledge Graph object:
- Object Type: ${typeStr}
- ID: ${node['@id'] || 'N/A'}
- Title: "${title}"
- Change Event: ${action.toUpperCase()}
- Description / Scope: ${node['dcterms:description'] || node['robos:topic'] || 'Architecture component update'}

Action Required:
1. Discern any noticeable updates needed across system documentation to reflect this Knowledge Graph entity.
2. Review candidate documentation files:
${suggestedFiles.map(f => `   - ${f}`).join('\n')}
3. Update the documentation accordingly to ensure documentation integrity and synchronization with .robos/knowledge-graph.jsonld.`;

    const result = {
      hasNoticeableUpdates: true,
      changeType: action,
      nodeId: node['@id'],
      nodeTitle: title,
      nodeType: typeStr,
      aiPrompt,
      suggestedFiles,
      timestamp: new Date().toISOString(),
    };

    this.latestDocSyncPrompt = result;
    return result;
  }

  syncToGitOpsELearning(courseNode) {
    try {
      const gitopsPaths = [
        path.join(process.cwd(), '.robos', 'elearning.yaml'),
        path.join(HOME_DIR, '.robos', 'elearning.yaml'),
      ];

      const allCourses = this.getELearningNodes();
      const yamlContent = [
        '# ============================================================================== #',
        '# RobOS Declarative GitOps eLearning Catalog                                      #',
        '# Auto-synchronized with .robos/knowledge-graph.jsonld                            #',
        '# ============================================================================== #',
        'version: "1.0"',
        'kind: ELearningCatalog',
        'courses:',
      ];

      for (const c of allCourses) {
        yamlContent.push(`  - id: "${(c['@id'] || '').replace('urn:robos:elearning:', '')}"`);
        yamlContent.push(`    title: "${c['dcterms:title'] || ''}"`);
        yamlContent.push(`    topic: "${c['robos:topic'] || ''}"`);
        yamlContent.push(`    difficulty: "${c['robos:difficulty'] || 'Intermediate'}"`);
        yamlContent.push(`    duration: "${c['robos:estimatedDuration'] || '30 minutes'}"`);
        yamlContent.push(`    gitopsFile: "${c['robos:gitopsFile'] || '.robos/elearning.yaml'}"`);
        if (c['robos:teachesService']) {
          yamlContent.push(`    targetService: "${c['robos:teachesService']}"`);
        }
        if (c['robos:teachesContract']) {
          yamlContent.push(`    targetContract: "${c['robos:teachesContract']}"`);
        }
        if (Array.isArray(c['robos:modules'])) {
          yamlContent.push('    modules:');
          for (const m of c['robos:modules']) {
            yamlContent.push(`      - id: "${m.id}"`);
            yamlContent.push(`        title: "${m.title}"`);
            yamlContent.push(`        durationMinutes: ${m.durationMinutes || 15}`);
            yamlContent.push(`        overview: "${(m.overview || '').replace(/"/g, '\\"')}"`);
            if (Array.isArray(m.labSteps)) {
              yamlContent.push('        labSteps:');
              for (const ls of m.labSteps) {
                yamlContent.push(`          - "${ls.replace(/"/g, '\\"')}"`);
              }
            }
          }
        }
      }

      const text = yamlContent.join('\n') + '\n';
      for (const p of gitopsPaths) {
        try {
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, text, 'utf8');
        } catch {}
      }
    } catch (err) {
      console.error('[SDLCKnowledgeGraphStore] Error syncing GitOps elearning:', err.message);
    }
  }

  generateELearningCourse(options = {}) {
    const prompt = (typeof options === 'string' ? options : options.prompt) || '';
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      return { ok: false, error: 'Prompt is required to generate an eLearning course' };
    }

    // 1. Look for existing eLearning course
    const existing = this.findELearning(cleanPrompt);
    if (existing) {
      const docSyncPrompt = this.discernDocUpdates({ action: 'lookup', node: existing });
      return {
        ok: true,
        existing: true,
        created: false,
        message: `Existing eLearning course found: "${existing['dcterms:title']}" (${existing['@id']}). Navigating to course.`,
        node: existing,
        docSyncPrompt,
      };
    }

    // 2. Synthesize new eLearning course
    const slug = cleanPrompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'course-' + Date.now();

    const titleWords = cleanPrompt
      .replace(/(create|build|generate|make|an?|interactive|course|on|for|about)\s+/gi, '')
      .trim();
    const courseTitle = titleWords.length > 3
      ? titleWords.charAt(0).toUpperCase() + titleWords.slice(1) + ' Mastery'
      : 'RobOS Interactive Training: ' + cleanPrompt;

    let topic = 'Architecture & Systems';
    let targetService = 'urn:robos:service:forms-api';
    let targetContract = 'urn:robos:contract:forms-api-v1';

    const pLower = cleanPrompt.toLowerCase();
    if (pLower.includes('auth') || pLower.includes('security') || pLower.includes('token')) {
      topic = 'Security & Authentication';
    } else if (pLower.includes('test') || pLower.includes('bdd') || pLower.includes('gherkin')) {
      topic = 'BDD & Quality Assurance';
    } else if (pLower.includes('gitops') || pLower.includes('k8s') || pLower.includes('deploy')) {
      topic = 'GitOps & Infrastructure';
    } else if (pLower.includes('api') || pLower.includes('microservice')) {
      topic = 'Microservices & Distributed Systems';
    }

    const courseNode = {
      '@id': `urn:robos:elearning:${slug}`,
      '@type': ['robos:ELearning', 'oslc:Resource'],
      'dcterms:title': courseTitle,
      'dcterms:description': `AI-synthesized interactive training curriculum covering ${topic} in the RobOS ecosystem.`,
      'robos:topic': topic,
      'robos:difficulty': options.difficulty || 'Intermediate',
      'robos:targetAudience': 'Software Developers & Platform Engineers',
      'robos:estimatedDuration': '40 minutes',
      'robos:gitopsFile': '.robos/elearning.yaml',
      'robos:teachesService': targetService,
      'robos:teachesContract': targetContract,
      'robos:status': 'published',
      'robos:modules': [
        {
          id: `mod-01-${slug}`,
          title: `Module 1: Foundations & Architecture of ${topic}`,
          durationMinutes: 10,
          overview: `Core architectural primitives, data models, and OSLC graph representations of ${topic}.`,
          labSteps: [
            `Examine knowledge-graph.jsonld nodes relevant to ${topic}`,
            `Review declarative schemas in .robos/ directory`,
            'Inspect live entity status and topology links in KGraph Explorer',
          ],
          quiz: [
            {
              question: `How does RobOS track ${topic} across git branches?`,
              answer: 'Dual-State Knowledge Graph branches with semantic diff verification',
            },
          ],
        },
        {
          id: `mod-02-${slug}`,
          title: `Module 2: Hands-On Implementation & Verification`,
          durationMinutes: 20,
          overview: `Practical step-by-step implementation, contract stubs, and test execution.`,
          labSteps: [
            'Scaffold new component handlers adhering to SHACL constraints',
            'Run local Test Fabric mock dispatch to simulate outbound dependencies',
            'Verify strict Red-Green-Refactor test cycle',
          ],
          quiz: [
            {
              question: 'What phase ensures no false positives occur during implementation?',
              answer: 'Strict RED phase assertion check',
            },
          ],
        },
        {
          id: `mod-03-${slug}`,
          title: `Module 3: GitOps Delivery & Automated Continuous Sync`,
          durationMinutes: 10,
          overview: `Declarative GitOps storage and living documentation synchronization.`,
          labSteps: [
            `Verify declarative entries in .robos/elearning.yaml`,
            'Commit changes with dual Git + KGraph sync',
            'Confirm automated AI documentation update prompt has been addressed',
          ],
          quiz: [
            {
              question: 'When should documentation be reviewed for noticeable updates?',
              answer: 'Whenever Knowledge Graph objects are updated',
            },
          ],
        },
      ],
      'robos:updatedAt': new Date().toISOString(),
    };

    // 3. Add to graph and sync to GitOps
    this.addNode(courseNode);
    this.syncToGitOpsELearning(courseNode);

    // 4. Generate AI documentation synchronization prompt
    const docSyncPrompt = this.discernDocUpdates({ action: 'created', node: courseNode });

    return {
      ok: true,
      existing: false,
      created: true,
      message: `Successfully generated new eLearning course: "${courseTitle}" (${courseNode['@id']}). Saved to KGraph and .robos/elearning.yaml.`,
      node: courseNode,
      docSyncPrompt,
    };
  }

  addNode(node) {
    const idx = this.parser.nodes.findIndex(n => n['@id'] === node['@id']);
    const exists = idx >= 0;
    if (exists) {
      this.parser.nodes[idx] = node;
    } else {
      this.parser.nodes.push(node);
    }
    this.packageManager.upsertNode(node);
    this.parser.loadNodes(this.parser.nodes);
    this.save();
    this.latestDocSyncPrompt = this.discernDocUpdates({ action: exists ? 'updated' : 'added', node });
    return node;
  }

  updateNode(nodeId, partialData = {}) {
    const existing = this.getNode(nodeId);
    if (!existing) return null;
    const merged = { ...existing, ...partialData, '@id': nodeId };
    return this.addNode(merged);
  }

  removeNode(nodeId, { cascade = false } = {}) {
    const existingNode = this.getNode(nodeId);
    if (!existingNode) return false;

    // 1. Remove from package manager
    this.packageManager.removeNode(nodeId);

    // 2. Cascade remove references if requested
    if (cascade) {
      const refKeys = [
        'robos:implementsContract', 'robos:usesEntity', 'robos:ownerTeam', 'robos:dependsOn',
        'robos:service', 'robos:targetNode', 'robos:hasProject', 'robos:hasFeature',
        'robos:hasEpic', 'robos:hasTask', 'robos:hasRepository', 'robos:usesDatabase',
        'robos:usesMessageBroker', 'robos:publishesTo', 'robos:subscribesTo', 'robos:usesMCPServer',
        'robos:deployedTo', 'robos:targetCluster', 'robos:inEnvironment', 'robos:hasPipeline',
        'robos:consumesContract', 'robos:assignedTeam', 'robos:hasCredential'
      ];
      for (const node of this.parser.nodes) {
        let changed = false;
        for (const k of refKeys) {
          if (Array.isArray(node[k])) {
            const before = node[k].length;
            node[k] = node[k].filter(ref => ref !== nodeId);
            if (node[k].length !== before) changed = true;
          } else if (node[k] === nodeId) {
            delete node[k];
            changed = true;
          }
        }
        if (changed) {
          this.packageManager.upsertNode(node);
        }
      }
    }

    // 3. Filter from parser.nodes
    this.parser.nodes = this.parser.nodes.filter(n => n['@id'] !== nodeId);
    this.parser.loadNodes(this.parser.nodes);
    this.packageManager.saveDirtyPackages(this.filePath);

    this.latestDocSyncPrompt = this.discernDocUpdates({ action: 'deleted', node: existingNode });
    return true;
  }

  deleteNode(nodeId, options) {
    return this.removeNode(nodeId, options);
  }

  searchNodes(searchQuery = '', filter = {}) {
    const q = (searchQuery || '').toLowerCase().trim();
    return this.parser.nodes.filter(node => {
      if (filter.type) {
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
        const match = types.some(t => t === filter.type || t.endsWith(`:${filter.type}`));
        if (!match) return false;
      }
      if (filter.package) {
        const pkg = this.packageManager.nodeToPackage.get(node['@id']) || node['robos:package'];
        if (pkg !== filter.package) return false;
      }
      if (filter.ownerTeam && node['robos:ownerTeam'] !== filter.ownerTeam && node['robos:assignedTeam'] !== filter.ownerTeam) {
        return false;
      }
      if (!q) return true;
      const title = (node['dcterms:title'] || '').toLowerCase();
      const desc = (node['dcterms:description'] || '').toLowerCase();
      const id = (node['@id'] || '').toLowerCase();
      const role = (node['robos:role'] || '').toLowerCase();
      const tags = Array.isArray(node['robos:tags']) ? node['robos:tags'].join(' ').toLowerCase() : '';
      return title.includes(q) || desc.includes(q) || id.includes(q) || role.includes(q) || tags.includes(q);
    });
  }

  findPath(startId, endId, maxDepth = 6) {
    if (!this.getNode(startId) || !this.getNode(endId)) return null;
    if (startId === endId) return [{ id: startId, node: this.getNode(startId) }];

    const queue = [[startId]];
    const visited = new Set([startId]);

    while (queue.length > 0) {
      const currentPath = queue.shift();
      const currentId = currentPath[currentPath.length - 1];

      if (currentPath.length > maxDepth) continue;

      const outbound = this.parser.outgoingRefs.get(currentId) || new Set();
      for (const nextId of outbound) {
        if (nextId === endId) {
          const fullPathIds = [...currentPath, nextId];
          return fullPathIds.map(id => ({ id, node: this.getNode(id) }));
        }
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push([...currentPath, nextId]);
        }
      }
    }
    return null;
  }

  generateMermaidGraph({ rootId = null, packageId = null, maxNodes = 50, direction = 'TD' } = {}) {
    let targetNodes = [];
    if (rootId) {
      const root = this.getNode(rootId);
      if (!root) return `graph ${direction}\n  empty["Node not found: ${rootId}"]`;
      const visited = new Set([rootId]);
      targetNodes.push(root);

      const outbound = this.parser.outgoingRefs.get(rootId) || new Set();
      for (const outId of outbound) {
        if (!visited.has(outId) && targetNodes.length < maxNodes) {
          visited.add(outId);
          const n = this.getNode(outId);
          if (n) targetNodes.push(n);
        }
      }
      const inbound = this.parser.incomingRefs.get(rootId) || new Set();
      for (const inId of inbound) {
        if (!visited.has(inId) && targetNodes.length < maxNodes) {
          visited.add(inId);
          const n = this.getNode(inId);
          if (n) targetNodes.push(n);
        }
      }
    } else if (packageId) {
      const pkg = this.packageManager.packages.get(packageId);
      targetNodes = (pkg ? pkg.nodes : []).slice(0, maxNodes);
    } else {
      targetNodes = this.parser.nodes.slice(0, maxNodes);
    }

    const nodeIds = new Set(targetNodes.map(n => n['@id']));
    const sanitize = (id) => id.replace(/[^a-zA-Z0-9_]/g, '_');

    let lines = [`graph ${direction}`];

    // Group by package in subgraphs
    const packageGroups = new Map();
    for (const node of targetNodes) {
      const pkg = this.packageManager.nodeToPackage.get(node['@id']) || node['robos:package'] || 'core';
      if (!packageGroups.has(pkg)) packageGroups.set(pkg, []);
      packageGroups.get(pkg).push(node);
    }

    for (const [pkg, nodes] of packageGroups) {
      lines.push(`  subgraph sub_${sanitize(pkg)}["${pkg}"]`);
      for (const n of nodes) {
        const title = (n['dcterms:title'] || n['@id']).replace(/["[\]()]/g, '');
        const typeStr = Array.isArray(n['@type']) ? n['@type'][n['@type'].length - 1] : (n['@type'] || 'Node');
        const shortType = typeStr.split(':').pop();
        lines.push(`    ${sanitize(n['@id'])}["${title}<br/><small><i>${shortType}</i></small>"]`);
      }
      lines.push('  end');
    }

    // Connect edges between present nodes
    const edgeSet = new Set();
    for (const node of targetNodes) {
      const fromId = node['@id'];
      const outbound = this.parser.outgoingRefs.get(fromId) || new Set();
      for (const toId of outbound) {
        if (nodeIds.has(toId)) {
          const edgeKey = `${fromId}->${toId}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            lines.push(`  ${sanitize(fromId)} --> ${sanitize(toId)}`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  exportGraph(format = 'jsonld', packageId = null) {
    if (format === 'jsonld' || format === 'json') {
      if (packageId) {
        const pkg = this.packageManager.packages.get(packageId);
        return JSON.stringify(pkg ? {
          '@context': pkg.context || this.parser.context,
          '@id': `urn:robos:package:${pkg.id}`,
          'robos:package': pkg.id,
          'dcterms:title': pkg.title,
          'robos:nodes': pkg.nodes
        } : {}, null, 2);
      }
      return JSON.stringify(this.parser.toJSONLD(), null, 2);
    }

    if (format === 'ttl' || format === 'turtle' || format === 'nt' || format === 'ntriples') {
      const lines = [];
      lines.push('@prefix oslc: <http://open-services.net/ns/core#> .');
      lines.push('@prefix robos: <https://robos.dev/ns/sdlc#> .');
      lines.push('@prefix dcterms: <http://purl.org/dc/terms/> .');
      lines.push('@prefix schema: <https://schema.org/> .\n');

      const nodesToExport = packageId && this.packageManager.packages.has(packageId)
        ? this.packageManager.packages.get(packageId).nodes
        : this.parser.nodes;

      for (const node of nodesToExport) {
        const s = `<${node['@id']}>`;
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
        for (const t of types) {
          if (t) lines.push(`${s} a <${t.startsWith('http') ? t : 'https://robos.dev/ns/sdlc#' + t.split(':').pop()}> .`);
        }
        if (node['dcterms:title']) {
          lines.push(`${s} <http://purl.org/dc/terms/title> "${node['dcterms:title'].replace(/"/g, '\\"')}" .`);
        }
        if (node['dcterms:description']) {
          lines.push(`${s} <http://purl.org/dc/terms/description> "${node['dcterms:description'].replace(/"/g, '\\"')}" .`);
        }
        const outbound = this.parser.outgoingRefs.get(node['@id']) || new Set();
        for (const targetId of outbound) {
          lines.push(`${s} <https://robos.dev/ns/sdlc#relatesTo> <${targetId}> .`);
        }
      }
      return lines.join('\n');
    }

    return JSON.stringify(this.parser.toJSONLD(), null, 2);
  }

  bulkImportRepositories(repositories = [], options = {}) {
    const homeDir = process.env.HOME || os.homedir();
    const sessionDir = path.join(homeDir, '.config', 'robos', 'agent-sessions');
    const notifFile = path.join(homeDir, '.config', 'robos', 'notifications.json');
    const sessionId = options.sessionId || `session_kgraph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = Date.now();

    if (options.trackSession !== false) {
      try {
        fs.mkdirSync(sessionDir, { recursive: true });
        const sess = {
          id: sessionId,
          agentId: 'kgraph-ingestion-agent',
          status: 'running',
          task: `Knowledge Graph Ingestion for ${repositories.length} Git Project(s)`,
          startedAt,
          stoppedAt: null,
          duration: null,
          projectsCount: repositories.length,
          filesChanged: [],
          metrics: { projectsIngested: repositories.length },
          output: `Started autonomous ingestion of ${repositories.length} Git project(s) into SDLC Knowledge Graph...\n`,
        };
        fs.writeFileSync(path.join(sessionDir, `${sessionId}.json`), JSON.stringify(sess, null, 2), 'utf8');
      } catch {}
    }

    const importRes = this.bulkRepoImporter.importRepositories(repositories);
    const addedNodes = [];

    for (const node of importRes.nodes) {
      const idx = this.parser.nodes.findIndex(n => n['@id'] === node['@id']);
      if (idx >= 0) {
        this.parser.nodes[idx] = node;
      } else {
        this.parser.nodes.push(node);
      }
      addedNodes.push(node);
    }

    this.parser.loadNodes(this.parser.nodes);
    this.save();
    this.syncToGitOpsPackages(addedNodes);

    const docSyncPrompt = this.discernDocUpdates({
      action: 'bulk-repo-import',
      nodes: addedNodes,
      summary: importRes.summary,
    });

    const stoppedAt = Date.now();

    if (options.trackSession !== false) {
      try {
        fs.mkdirSync(sessionDir, { recursive: true });
        const completedSess = {
          id: sessionId,
          agentId: 'kgraph-ingestion-agent',
          status: 'completed',
          task: `Knowledge Graph Ingestion for ${repositories.length} Git Project(s)`,
          startedAt,
          stoppedAt,
          duration: stoppedAt - startedAt,
          projectsCount: repositories.length,
          filesChanged: ['.robos/knowledge-graph.jsonld', '.robos/packages.yaml'],
          metrics: {
            projectsIngested: repositories.length,
            nodesAdded: addedNodes.length,
            contractsCreated: Object.keys(importRes.contracts || {}).length,
          },
          output: `Successfully synchronized ${repositories.length} Git project(s) to RobOS Knowledge Graph.\n`,
        };
        fs.writeFileSync(path.join(sessionDir, `${sessionId}.json`), JSON.stringify(completedSess, null, 2), 'utf8');
      } catch {}

      try {
        let notifs = [];
        if (fs.existsSync(notifFile)) {
          try { notifs = JSON.parse(fs.readFileSync(notifFile, 'utf8')); } catch {}
        }
        if (!Array.isArray(notifs)) notifs = [];
        const notif = {
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: 'Knowledge Graph Ingestion Completed',
          message: `Successfully ingested ${repositories.length} Git project(s) into SDLC Knowledge Graph with OpenAPI 3.1, gRPC, and CLI specs.`,
          category: 'agent',
          tier: 'info',
          ts: new Date().toISOString(),
          read: false,
        };
        notifs.unshift(notif);
        if (notifs.length > 200) notifs = notifs.slice(0, 200);
        fs.mkdirSync(path.dirname(notifFile), { recursive: true });
        fs.writeFileSync(notifFile, JSON.stringify(notifs, null, 2), 'utf8');
      } catch {}
    }

    return {
      ok: true,
      sessionId,
      summary: importRes.summary,
      addedCount: addedNodes.length,
      nodes: addedNodes,
      contracts: importRes.contracts,
      docSyncPrompt,
    };
  }

  importGitProjectsConfig() {
    const homeDir = process.env.HOME || os.homedir();
    const gitProjectsFile = path.join(homeDir, '.config', 'robos', 'git-projects.json');
    if (!fs.existsSync(gitProjectsFile)) {
      return { ok: false, error: 'No git-projects.json found at ' + gitProjectsFile };
    }
    try {
      const data = JSON.parse(fs.readFileSync(gitProjectsFile, 'utf8'));
      const projects = data.projects || [];
      return this.bulkImportRepositories(projects);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async importResources(resources, options = {}) {
    const importRes = await this.resourceImporter.importResources(resources, options);
    const addedNodes = [];

    for (const node of importRes.nodes) {
      const idx = this.parser.nodes.findIndex(n => n['@id'] === node['@id']);
      if (idx >= 0) {
        this.parser.nodes[idx] = node;
      } else {
        this.parser.nodes.push(node);
      }
      addedNodes.push(node);
    }

    this.parser.loadNodes(this.parser.nodes);
    this.save();
    this.syncToGitOpsPackages(addedNodes);

    const docSyncPrompt = this.discernDocUpdates({
      action: 'resource-import',
      nodes: addedNodes,
      summary: importRes.summary,
    });

    return {
      ok: true,
      summary: importRes.summary,
      packageBreakdown: importRes.packageBreakdown,
      addedCount: addedNodes.length,
      nodes: addedNodes,
      docSyncPrompt,
    };
  }

  async importFromPrompt(promptText, options = {}) {
    const plan = this.resourceImporter.parsePrompt(promptText);
    const res = await this.importResources(plan.resources, {
      companyName: plan.company.name,
      companySlug: plan.company.slug,
      ...options,
    });
    return {
      ok: true,
      plan,
      ...res,
    };
  }

  syncToGitOpsPackages(nodes = []) {
    const packagesFiles = [
      path.join(process.cwd(), '.robos', 'packages.yaml'),
      path.join(HOME_DIR, '.robos', 'packages.yaml'),
    ];

    for (const packagesFile of packagesFiles) {
      try {
        if (!fs.existsSync(path.dirname(packagesFile))) {
          fs.mkdirSync(path.dirname(packagesFile), { recursive: true });
        }
        let existingContent = '';
        if (fs.existsSync(packagesFile)) {
          try { existingContent = fs.readFileSync(packagesFile, 'utf8'); } catch {}
        }
        const lines = [existingContent ? existingContent.trim() : 'kind: PackagesCatalog\npackages:'];
        for (const node of nodes) {
          const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
          if (types.some(t => t.includes('Microservice') || t.includes('DesktopApp') || t.includes('ConsoleApp') || t.includes('MobileApp') || t.includes('DataPipeline') || t.includes('Library') || t.includes('FrontEndApp') || t.includes('PCGame') || t.includes('MobileGame'))) {
            const id = node['@id'];
            if (!lines.join('\n').includes(id)) {
              lines.push(`  - id: "${id}"`);
              lines.push(`    title: "${node['dcterms:title'] || ''}"`);
              lines.push(`    type: "${types.find(t => t.startsWith('robos:')) || 'robos:Microservice'}"`);
              lines.push(`    repository: "${node['robos:repository'] || 'unknown'}"`);
              lines.push(`    technology: "${node['robos:technology'] || 'Node.js'}"`);
            }
          }
        }
        fs.writeFileSync(packagesFile, lines.join('\n') + '\n');
      } catch {}
    }
  }

  requestAppDocUpdate({ appId, userPrompt, targetFiles = [] } = {}) {
    const node = this.getNode(appId) || this.parser.nodes[0] || {};
    const title = node['dcterms:title'] || appId || 'Application';
    const typeStr = Array.isArray(node['@type']) ? node['@type'].join(', ') : (node['@type'] || 'robos:Application');

    const suggestedFiles = targetFiles.length > 0 ? targetFiles : [
      'docs/index.md',
      'README.md',
    ];

    if (typeStr.includes('DesktopApp')) {
      suggestedFiles.push('docs/desktop-applications.md');
      suggestedFiles.push('.robos/packages.yaml');
    } else if (typeStr.includes('ConsoleApp')) {
      suggestedFiles.push('docs/cli-tools.md');
      suggestedFiles.push('.robos/packages.yaml');
    } else if (typeStr.includes('FrontEndApp')) {
      suggestedFiles.push('docs/frontend-applications.md');
      suggestedFiles.push('.robos/packages.yaml');
    } else if (typeStr.includes('PCGame') || typeStr.includes('MobileGame')) {
      suggestedFiles.push('docs/game-development.md');
      suggestedFiles.push('.robos/packages.yaml');
    } else if (typeStr.includes('Microservice')) {
      suggestedFiles.push('.robos/topology.yaml');
      if (node['robos:specFile']) suggestedFiles.push(node['robos:specFile']);
    }

    const aiPrompt = `[RobOS Per-App Doc Update Prompt]:
- Application: ${title} (${node['@id'] || appId})
- Archetype: ${typeStr}
- Requested Documentation Changes: "${userPrompt}"
- Target Documentation Files:
${suggestedFiles.map(f => `  - ${f}`).join('\n')}

Action Required:
Apply the requested updates to the targeted documentation files, ensuring accuracy, style consistency, and Knowledge Graph alignment.`;

    const docUpdateResult = {
      ok: true,
      appId: node['@id'] || appId,
      appTitle: title,
      userPrompt,
      aiPrompt,
      suggestedFiles,
      status: 'PROPOSED_AND_APPLIED',
      message: `Documentation change request processed for "${title}". AI prompt generated and targeted across ${suggestedFiles.length} documentation files.`,
      timestamp: new Date().toISOString(),
    };

    this.latestDocSyncPrompt = {
      hasNoticeableUpdates: true,
      changeType: 'user-doc-request',
      nodeId: node['@id'] || appId,
      nodeTitle: title,
      nodeType: typeStr,
      aiPrompt,
      suggestedFiles,
      timestamp: new Date().toISOString(),
    };

    return docUpdateResult;
  }

  // ── Git Project Organization Management ─────────────────────────────────────
  createGitProjectOrganization(data = {}) {
    const slug = (data.orgName || data.slug || 'unnamed-org').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:git-org:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || (slug.charAt(0).toUpperCase() + slug.slice(1));
    const url = data['robos:url'] || data.url || `https://github.com/${slug}`;
    const forgeType = data['robos:forgeType'] || data.forgeType || 'github';

    const orgNode = {
      '@id': id,
      '@type': ['robos:GitProjectOrganization', 'robos:GitOrganization', 'schema:Organization', 'oslc:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `Git project organization for ${title}.`,
      'robos:orgName': slug,
      'robos:url': url,
      'robos:forgeType': forgeType,
      'robos:avatarUrl': data['robos:avatarUrl'] || data.avatarUrl || null,
      'robos:billingEmail': data['robos:billingEmail'] || data.billingEmail || null,
      'robos:visibility': data['robos:visibility'] || data.visibility || 'public',
      'robos:isEnterprise': Boolean(data['robos:isEnterprise'] !== undefined ? data['robos:isEnterprise'] : data.isEnterprise),
      'robos:verified': Boolean(data['robos:verified'] !== undefined ? data['robos:verified'] : data.verified),
      'robos:defaultBranch': data['robos:defaultBranch'] || data.defaultBranch || 'main',
      'robos:memberCount': data['robos:memberCount'] || data.memberCount || 0,
      'robos:repoCount': data['robos:repoCount'] || data.repoCount || (Array.isArray(data.hasRepository || data['robos:hasRepository']) ? (data.hasRepository || data['robos:hasRepository']).length : 0),
      'robos:hasRepository': data['robos:hasRepository'] || data.hasRepository || [],
      'robos:hasProject': data['robos:hasProject'] || data.hasProject || null,
      'robos:ownerTeam': data['robos:ownerTeam'] || data.ownerTeam || 'urn:robos:team:core-platform',
      'robos:documentation': data['robos:documentation'] || data.documentation || {
        docsUrl: data.docsUrl || `${url}`,
        docsPaths: data.docsPaths || ['docs/index.md', 'README.md', 'CONTRIBUTING.md'],
        architectureGuidelines: data.architectureGuidelines || null,
        license: data.license || 'Apache-2.0',
      },
      'robos:agentRules': data['robos:agentRules'] || data.agentRules || [],
      'robos:agentRulesDoc': data['robos:agentRulesDoc'] || data.agentRulesDoc || 'AGENTS.md',
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
    };

    // Validate with SHACL
    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [orgNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Git Project Organization: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(orgNode);
    return {
      ok: true,
      node: orgNode,
      message: `Successfully created Git Project Organization: ${title} (${id})`,
    };
  }

  getGitProjectOrganizations() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('GitProjectOrganization') || t.includes('GitOrganization'));
    });
  }

  getGitProjectOrganization(idOrSlugOrUrl) {
    if (!idOrSlugOrUrl) return null;
    const query = String(idOrSlugOrUrl).trim().toLowerCase();
    return this.getGitProjectOrganizations().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === query) return true;
      if (n['robos:orgName'] && n['robos:orgName'].toLowerCase() === query) return true;
      if (n['robos:url'] && n['robos:url'].toLowerCase().replace(/\/$/, '') === query.replace(/\/$/, '')) return true;
      return false;
    }) || null;
  }

  addAgentRuleToOrganization(orgIdOrSlug, rule = {}) {
    const org = this.getGitProjectOrganization(orgIdOrSlug);
    if (!org) {
      return { ok: false, error: `Organization not found: ${orgIdOrSlug}` };
    }

    if (!Array.isArray(org['robos:agentRules'])) {
      org['robos:agentRules'] = [];
    }

    const ruleObj = {
      ruleId: rule.ruleId || `RULE-${(org['robos:orgName'] || 'ORG').toUpperCase()}-${String(org['robos:agentRules'].length + 1).padStart(3, '0')}`,
      title: rule.title || 'General Agent Standard',
      severity: rule.severity || 'mandatory',
      description: rule.description || '',
      ruleFile: rule.ruleFile || org['robos:agentRulesDoc'] || 'AGENTS.md',
      enforcement: rule.enforcement || 'agent-review',
    };

    org['robos:agentRules'].push(ruleObj);
    org['robos:updatedAt'] = new Date().toISOString();
    this.save();
    this.latestDocSyncPrompt = this.discernDocUpdates({ action: 'updated', node: org });

    return {
      ok: true,
      org,
      rule: ruleObj,
      message: `Added rule "${ruleObj.title}" (${ruleObj.ruleId}) to organization "${org['dcterms:title']}"`,
    };
  }

  getEffectiveAgentRulesForRepository(repoUrlOrSlug) {
    if (!repoUrlOrSlug) return [];
    const normalized = repoUrlOrSlug.toLowerCase().replace(/^https?:\/\//, '').replace(/\.git$/, '');
    const parts = normalized.split('/');
    let targetOrgSlug = null;
    if (parts.length >= 2) {
      targetOrgSlug = parts[0].includes('.') ? parts[1] : parts[0];
    } else {
      targetOrgSlug = parts[0];
    }

    let org = this.getGitProjectOrganization(targetOrgSlug);

    if (!org) {
      const directNode = this.getNode(repoUrlOrSlug);
      if (directNode && directNode['robos:inOrganization']) {
        org = this.getGitProjectOrganization(directNode['robos:inOrganization']);
      }
    }

    if (!org) {
      const repoNode = this.parser.nodes.find(n => {
        const repoVal = (n['robos:repository'] || '').toLowerCase();
        return repoVal.includes(normalized) || normalized.includes(repoVal);
      });
      if (repoNode && repoNode['robos:inOrganization']) {
        org = this.getGitProjectOrganization(repoNode['robos:inOrganization']);
      }
    }

    if (!org) {
      org = this.getGitProjectOrganizations().find(o => {
        const repos = Array.isArray(o['robos:hasRepository']) ? o['robos:hasRepository'] : [];
        return repos.some(r => r.toLowerCase().includes(normalized) || normalized.includes(r.toLowerCase()));
      });
    }

    if (!org) return [];
    return Array.isArray(org['robos:agentRules']) ? org['robos:agentRules'] : [];
  }

  getEffectiveDocumentationForRepository(repoUrlOrSlug) {
    if (!repoUrlOrSlug) return null;
    const normalized = repoUrlOrSlug.toLowerCase().replace(/^https?:\/\//, '').replace(/\.git$/, '');
    const parts = normalized.split('/');
    let targetOrgSlug = null;
    if (parts.length >= 2) {
      targetOrgSlug = parts[0].includes('.') ? parts[1] : parts[0];
    } else {
      targetOrgSlug = parts[0];
    }

    let org = this.getGitProjectOrganization(targetOrgSlug);
    if (!org) {
      const directNode = this.getNode(repoUrlOrSlug);
      if (directNode && directNode['robos:inOrganization']) {
        org = this.getGitProjectOrganization(directNode['robos:inOrganization']);
      }
    }
    if (!org) {
      const repoNode = this.parser.nodes.find(n => {
        const repoVal = (n['robos:repository'] || '').toLowerCase();
        return repoVal.includes(normalized) || normalized.includes(repoVal);
      });
      if (repoNode && repoNode['robos:inOrganization']) {
        org = this.getGitProjectOrganization(repoNode['robos:inOrganization']);
      }
    }
    if (!org) {
      org = this.getGitProjectOrganizations().find(o => {
        const repos = Array.isArray(o['robos:hasRepository']) ? o['robos:hasRepository'] : [];
        return repos.some(r => r.toLowerCase().includes(normalized) || normalized.includes(r.toLowerCase()));
      });
    }

    return org ? (org['robos:documentation'] || null) : null;
  }

  // ── Remote Execution API (REAPI v2) & Build System Management ────────────────
  createRemoteExecutionCluster(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'reapi-cluster')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:remote-execution:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || 'REAPI Distributed Build Cluster';
    const protocol = data['robos:protocol'] || data.protocol || 'REAPI_v2';
    const provider = data['robos:provider'] || data.provider || 'buildbarn';
    const instanceName = data['robos:instanceName'] || data.instanceName || 'main';
    const executionEndpoint = data['robos:executionEndpoint'] || data.executionEndpoint || 'grpc://re-execution.buildbarn.internal:8980';
    const casEndpoint = data['robos:casEndpoint'] || data.casEndpoint || 'grpc://re-cas.buildbarn.internal:8980';
    const actionCacheEndpoint = data['robos:actionCacheEndpoint'] || data.actionCacheEndpoint || casEndpoint;
    const assetEndpoint = data['robos:assetEndpoint'] || data.assetEndpoint || null;
    const browserEndpoint = data['robos:browserEndpoint'] || data.browserEndpoint || 'http://re-browser.buildbarn.internal:7984';
    const tlsEnabled = Boolean(data['robos:tlsEnabled'] !== undefined ? data['robos:tlsEnabled'] : data.tlsEnabled);

    const defaultWorkerPools = [
      {
        name: 'linux-x86_64-standard',
        osFamily: 'linux',
        isa: 'x86-64',
        containerImage: 'docker://gcr.io/cloud-marketplace/google/debian11:latest',
        concurrency: 32,
      },
    ];

    const clusterNode = {
      '@id': id,
      '@type': ['robos:RemoteExecutionCluster', 'robos:RemoteBuildCluster', 'oslc:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `Remote Execution API v2 Cluster backed by ${provider}.`,
      'robos:protocol': protocol,
      'robos:provider': provider,
      'robos:instanceName': instanceName,
      'robos:executionEndpoint': executionEndpoint,
      'robos:casEndpoint': casEndpoint,
      'robos:actionCacheEndpoint': actionCacheEndpoint,
      'robos:assetEndpoint': assetEndpoint,
      'robos:browserEndpoint': browserEndpoint,
      'robos:tlsEnabled': tlsEnabled,
      'robos:workerPools': data['robos:workerPools'] || data.workerPools || defaultWorkerPools,
      'robos:cacheSettings': data['robos:cacheSettings'] || data.cacheSettings || {
        maxSizeBytes: '100GB',
        retentionDays: 14,
        evictionPolicy: 'lru',
      },
      'robos:package': 'devops',
      'robos:namespace': 'robos.devops',
      'robos:updatedAt': new Date().toISOString(),
    };

    // SHACL validation
    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [clusterNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Remote Execution Cluster: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(clusterNode);
    return {
      ok: true,
      node: clusterNode,
      message: `Successfully registered Remote Execution Cluster: ${title} (${id})`,
    };
  }

  getRemoteExecutionClusters() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('RemoteExecutionCluster') || t.includes('RemoteBuildCluster'));
    });
  }

  getRemoteExecutionCluster(idOrSlug) {
    if (!idOrSlug) return null;
    const query = String(idOrSlug).trim().toLowerCase();
    return this.getRemoteExecutionClusters().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === query) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${query}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === query) return true;
      return false;
    }) || null;
  }

  createBuildSystem(data = {}) {
    const buildTool = data['robos:buildTool'] || data.buildTool || 'bazel';
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || `${buildTool}-build`)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:build-system:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${buildTool.toUpperCase()} Build Configuration`;
    const configFile = data['robos:configFile'] || data.configFile || (buildTool === 'buck2' ? '.buckconfig' : '.bazelrc');

    const buildSystemNode = {
      '@id': id,
      '@type': ['robos:BuildSystem', 'robos:MonorepoBuild', 'oslc:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `Build system configuration for ${buildTool}.`,
      'robos:buildTool': buildTool,
      'robos:configFile': configFile,
      'robos:repository': data['robos:repository'] || data.repository || 'github.com/acme/monorepo',
      'robos:hasRemoteExecution': data['robos:hasRemoteExecution'] || data.hasRemoteExecution || null,
      'robos:defaultExecProperties': data['robos:defaultExecProperties'] || data.defaultExecProperties || {
        OSFamily: 'linux',
        ISA: 'x86-64',
      },
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.platform',
      'robos:updatedAt': new Date().toISOString(),
    };

    // SHACL validation
    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [buildSystemNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Build System: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(buildSystemNode);
    return {
      ok: true,
      node: buildSystemNode,
      message: `Successfully registered Build System: ${title} (${id})`,
    };
  }

  getBuildSystems() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('BuildSystem') || t.includes('MonorepoBuild'));
    });
  }

  getBuildSystem(idOrSlug) {
    if (!idOrSlug) return null;
    const query = String(idOrSlug).trim().toLowerCase();
    return this.getBuildSystems().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === query) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${query}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === query) return true;
      return false;
    }) || null;
  }

  generateBazelrc(clusterOrId) {
    const cluster = typeof clusterOrId === 'object' && clusterOrId !== null
      ? clusterOrId
      : (this.getRemoteExecutionCluster(clusterOrId) || this.getRemoteExecutionClusters()[0] || {});

    const provider = cluster['robos:provider'] || 'buildbarn';
    const instance = cluster['robos:instanceName'] || 'main';
    const execEndpoint = cluster['robos:executionEndpoint'] || 'grpc://re-execution.buildbarn.internal:8980';
    const casEndpoint = cluster['robos:casEndpoint'] || 'grpc://re-cas.buildbarn.internal:8980';
    const workerPool = (cluster['robos:workerPools'] && cluster['robos:workerPools'][0]) || {
      osFamily: 'linux',
      containerImage: 'docker://gcr.io/cloud-marketplace/google/debian11:latest',
    };

    return [
      `# RobOS Remote Execution Configuration for Bazel (REAPI v2)`,
      `# Backend Provider: ${provider} (Standard: build.bazel.remote.execution.v2)`,
      `# Generated autonomously by RobOS Remote Execution Studio`,
      ``,
      `# Remote Execution & Remote Caching`,
      `build:remote --remote_executor=${execEndpoint}`,
      `build:remote --remote_cache=${casEndpoint}`,
      `build:remote --remote_instance_name=${instance}`,
      `build:remote --remote_default_exec_properties=OSFamily=${workerPool.osFamily || 'linux'}`,
      workerPool.containerImage ? `build:remote --remote_default_exec_properties=container-image=${workerPool.containerImage}` : null,
      `build:remote --remote_download_minimal`,
      `build:remote --nolegacy_important_outputs`,
      `build:remote --remote_upload_local_results=true`,
      `build:remote --jobs=100`,
      ``,
      `# Remote Caching Only (Local Compilation + Remote Cache Upload)`,
      `build:cache --remote_cache=${casEndpoint}`,
      `build:cache --remote_instance_name=${instance}`,
      `build:cache --remote_upload_local_results=true`,
      ``,
    ].filter(line => line !== null).join('\n');
  }

  generateBuckconfig(clusterOrId) {
    const cluster = typeof clusterOrId === 'object' && clusterOrId !== null
      ? clusterOrId
      : (this.getRemoteExecutionCluster(clusterOrId) || this.getRemoteExecutionClusters()[0] || {});

    const provider = cluster['robos:provider'] || 'buildbarn';
    const instance = cluster['robos:instanceName'] || 'main';
    const execEndpoint = (cluster['robos:executionEndpoint'] || 're-execution.buildbarn.internal:8980')
      .replace(/^grpc:\/\//, '')
      .replace(/^grpcs:\/\//, '');
    const casEndpoint = (cluster['robos:casEndpoint'] || 're-cas.buildbarn.internal:8980')
      .replace(/^grpc:\/\//, '')
      .replace(/^grpcs:\/\//, '');
    const actionCacheEndpoint = (cluster['robos:actionCacheEndpoint'] || casEndpoint)
      .replace(/^grpc:\/\//, '')
      .replace(/^grpcs:\/\//, '');
    const useTls = Boolean(cluster['robos:tlsEnabled']);

    return [
      `# RobOS Remote Execution Configuration for Buck2 (REAPI v2)`,
      `# Backend Provider: ${provider} (Standard: build.bazel.remote.execution.v2)`,
      `# Generated autonomously by RobOS Remote Execution Studio`,
      ``,
      `[buck2_re_client]`,
      `engine_address = ${execEndpoint}`,
      `action_cache_address = ${actionCacheEndpoint}`,
      `cas_address = ${casEndpoint}`,
      `instance_name = ${instance}`,
      `use_tls = ${useTls}`,
      ``,
      `[buck2]`,
      `remote_execution = true`,
      ``,
    ].join('\n');
  }

  generateBuildbarnConfigs(clusterOrId) {
    const cluster = typeof clusterOrId === 'object' && clusterOrId !== null
      ? clusterOrId
      : (this.getRemoteExecutionCluster(clusterOrId) || this.getRemoteExecutionClusters()[0] || {});

    const instance = cluster['robos:instanceName'] || 'main';
    const casHost = (cluster['robos:casEndpoint'] || 're-cas.buildbarn.internal:8980')
      .replace(/^grpc:\/\//, '')
      .replace(/^grpcs:\/\//, '');
    const execHost = (cluster['robos:executionEndpoint'] || 're-execution.buildbarn.internal:8980')
      .replace(/^grpc:\/\//, '')
      .replace(/^grpcs:\/\//, '');

    return {
      storage: {
        contentAddressableStorage: {
          circular: {
            directory: '/var/cache/buildbarn/cas',
            minimumSize: 1048576,
            maximumSize: 107374182400,
          },
        },
        actionCache: {
          completenessChecking: {
            circular: {
              directory: '/var/cache/buildbarn/ac',
              minimumSize: 1048576,
              maximumSize: 10737418240,
            },
          },
        },
        grpcServers: [
          {
            listenAddresses: [':8980'],
            authenticationPolicy: { allow: {} },
          },
        ],
      },
      scheduler: {
        client: {
          listenAddresses: [':8982'],
          authenticationPolicy: { allow: {} },
        },
        worker: {
          listenAddresses: [':8983'],
          authenticationPolicy: { allow: {} },
        },
        contentAddressableStorage: {
          endpoint: { address: casHost },
        },
      },
      worker: {
        blobstore: {
          contentAddressableStorage: {
            endpoint: { address: casHost },
          },
        },
        scheduler: {
          endpoint: { address: execHost.replace(/:[0-9]+$/, ':8983') },
        },
        buildDirectories: [
          {
            native: {
              runPath: '/tmp/buildbarn/run',
              cacheDirectory: '/tmp/buildbarn/cache',
            },
          },
        ],
        runner: {
          endpoint: { address: 'unix:///tmp/buildbarn/runner.sock' },
        },
        concurrency: 16,
        platform: {
          properties: [
            { name: 'OSFamily', value: 'linux' },
            { name: 'ISA', value: 'x86-64' },
          ],
        },
      },
      runner: {
        listenPath: '/tmp/buildbarn/runner.sock',
        chrootDirectory: '/tmp/buildbarn/chroot',
        concurrency: 16,
      },
      browser: {
        listenAddress: ':7984',
        contentAddressableStorage: {
          endpoint: { address: casHost },
        },
        actionCache: {
          endpoint: { address: casHost },
        },
      },
    };
  }

  generateNativeLinkConfig(clusterOrId) {
    return {
      cas: {
        main: {
          filesystem: {
            content_path: '/var/cache/nativelink/cas',
            eviction_policy: { max_bytes: 107374182400 },
          },
        },
      },
      ac: {
        main: {
          filesystem: {
            content_path: '/var/cache/nativelink/ac',
            eviction_policy: { max_bytes: 10737418240 },
          },
        },
      },
      servers: [
        {
          listen_address: '0.0.0.0:8980',
          services: {
            cas: { main: 'main' },
            ac: { main: 'main' },
            execution: { scheduler: 'main' },
          },
        },
      ],
    };
  }

  // ── Living Documentation, Visual Architecture & Flow Diagrams ────────────────
  createFlowDiagram(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'flow-diagram')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:diagram:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || 'Visual Flow Diagram';
    const description = data['dcterms:description'] || data.description || '';
    const mermaidText = data['robos:mermaidText'] || data.mermaidText || data['robos:mermaidGraph'] || data.mermaidGraph || '';
    const imagePath = data['robos:imagePath'] || data.imagePath || data['robos:aiGeneratedImagePath'] || data.aiGeneratedImagePath || '';
    const tooltip = data['robos:tooltip'] || data.tooltip || '';
    const diagramType = data['robos:diagramType'] || data.diagramType || 'flowchart';
    const aspectRatio = data['robos:aspectRatio'] || data.aspectRatio || '16:9';
    const targetComponent = data['robos:targetComponent'] || data.targetComponent || null;
    const tags = data['robos:tags'] || data.tags || ['FlowDiagram', 'VisualArchitecture'];
    const nodeCount = data['robos:nodeCount'] !== undefined ? data['robos:nodeCount'] : (data.nodeCount || 0);

    const diagramNode = {
      '@id': id,
      '@type': ['robos:FlowDiagram', 'oslc_am:Resource', 'oslc:Resource'],
      'dcterms:title': title,
      'dcterms:description': description,
      'robos:mermaidText': mermaidText,
      'robos:imagePath': imagePath,
      'robos:tooltip': tooltip,
      'robos:diagramType': diagramType,
      'robos:aspectRatio': aspectRatio,
      'robos:targetComponent': targetComponent,
      'robos:tags': tags,
      'robos:nodeCount': nodeCount,
      'robos:package': 'documentation',
      'robos:namespace': 'robos.docs',
      'robos:updatedAt': new Date().toISOString(),
    };

    // SHACL validation
    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [diagramNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Flow Diagram: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(diagramNode);
    return {
      ok: true,
      node: diagramNode,
      message: `Successfully registered Flow Diagram: ${title} (${id})`,
    };
  }

  getFlowDiagrams(filter = {}) {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      const isDiagram = types.some(t => t.includes('FlowDiagram'));
      if (!isDiagram) return false;
      if (filter.targetComponent && n['robos:targetComponent'] !== filter.targetComponent) return false;
      if (filter.diagramType && n['robos:diagramType'] !== filter.diagramType) return false;
      return true;
    });
  }

  getFlowDiagram(idOrSlug) {
    if (!idOrSlug) return null;
    const query = String(idOrSlug).trim().toLowerCase();
    return this.getFlowDiagrams().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === query) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${query}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === query) return true;
      return false;
    }) || null;
  }

  createDocumentationPage(data = {}) {
    const slug = (data.slug || data['robos:slug'] || data['dcterms:title'] || data.title || 'doc-page')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:doc:${slug}`;
    const title = data['dcterms:title'] || data.title || 'Living Documentation Page';
    const docPath = data['robos:docPath'] || data.docPath || `docs/${slug}.md`;
    const description = data['dcterms:description'] || data.description || '';
    const category = data['robos:category'] || data.category || 'Guides';
    const hasFlowDiagram = data['robos:hasFlowDiagram'] || data.hasFlowDiagram || null;
    const targetNode = data['robos:targetNode'] || data.targetNode || null;

    const pageNode = {
      '@id': id,
      '@type': ['robos:DocumentationPage', 'robos:DocArticle', 'oslc_am:Resource'],
      'dcterms:title': title,
      'robos:slug': slug,
      'robos:docPath': docPath,
      'dcterms:description': description,
      'robos:category': category,
      'robos:hasFlowDiagram': hasFlowDiagram,
      'robos:targetNode': targetNode,
      'robos:author': data['robos:author'] || data.author || 'RobOS Living Documentation Sync Agent',
      'robos:status': data['robos:status'] || data.status || 'published',
      'robos:package': 'documentation',
      'robos:namespace': 'robos.docs',
      'robos:updatedAt': new Date().toISOString(),
    };

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [pageNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Documentation Page: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(pageNode);
    return {
      ok: true,
      node: pageNode,
      message: `Successfully registered Documentation Page: ${title} (${id})`,
    };
  }

  getDocumentationPages(filter = {}) {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      const isDoc = types.some(t => t.includes('DocumentationPage') || t.includes('DocArticle'));
      if (!isDoc) return false;
      if (filter.category && n['robos:category'] !== filter.category) return false;
      return true;
    });
  }

  getDocumentationPage(idOrSlug) {
    if (!idOrSlug) return null;
    const query = String(idOrSlug).trim().toLowerCase();
    return this.getDocumentationPages().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === query) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${query}`)) return true;
      if (n['robos:slug'] && n['robos:slug'].toLowerCase() === query) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === query) return true;
      return false;
    }) || null;
  }

  createArchitectureDecisionRecord(data = {}) {
    const slug = (data.slug || data.adrNumber || data['robos:adrNumber'] || data['dcterms:title'] || data.title || 'adr-001')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:adr:${slug}`;
    const title = data['dcterms:title'] || data.title || 'Architecture Decision Record';
    const status = data['robos:status'] || data.status || 'proposed';
    const context = data['robos:context'] || data.context || '';
    const decision = data['robos:decision'] || data.decision || '';
    const consequences = data['robos:consequences'] || data.consequences || '';
    const adrNumber = data['robos:adrNumber'] || data.adrNumber || slug.toUpperCase();
    const hasFlowDiagram = data['robos:hasFlowDiagram'] || data.hasFlowDiagram || null;
    const relatesTo = data['robos:relatesTo'] || data.relatesTo || null;
    const supersededBy = data['robos:supersededBy'] || data.supersededBy || null;

    const adrNode = {
      '@id': id,
      '@type': ['robos:ArchitectureDecisionRecord', 'robos:ADR', 'oslc_am:Resource'],
      'dcterms:title': title,
      'robos:adrNumber': adrNumber,
      'robos:status': status,
      'robos:context': context,
      'robos:decision': decision,
      'robos:consequences': consequences,
      'robos:date': data['robos:date'] || data.date || new Date().toISOString().split('T')[0],
      'robos:hasFlowDiagram': hasFlowDiagram,
      'robos:relatesTo': relatesTo,
      'robos:supersededBy': supersededBy,
      'robos:package': 'documentation',
      'robos:namespace': 'robos.docs',
      'robos:updatedAt': new Date().toISOString(),
    };

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [adrNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Architecture Decision Record: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(adrNode);
    return {
      ok: true,
      node: adrNode,
      message: `Successfully registered ADR: ${title} (${id})`,
    };
  }

  createADR(data) {
    return this.createArchitectureDecisionRecord(data);
  }

  getArchitectureDecisionRecords(filter = {}) {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      const isADR = types.some(t => t.includes('ArchitectureDecisionRecord') || t.includes('ADR'));
      if (!isADR) return false;
      if (filter.status && n['robos:status'] !== filter.status) return false;
      return true;
    });
  }

  getADRs(filter = {}) {
    return this.getArchitectureDecisionRecords(filter);
  }

  getArchitectureDecisionRecord(idOrSlug) {
    if (!idOrSlug) return null;
    const query = String(idOrSlug).trim().toLowerCase();
    return this.getArchitectureDecisionRecords().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === query) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${query}`)) return true;
      if (n['robos:adrNumber'] && n['robos:adrNumber'].toLowerCase() === query) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === query) return true;
      return false;
    }) || null;
  }

  getADR(idOrSlug) {
    return this.getArchitectureDecisionRecord(idOrSlug);
  }

  createInteractiveWalkthrough(data = {}) {
    const slug = (data.slug || data['robos:slug'] || data['dcterms:title'] || data.title || 'walkthrough')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:walkthrough:${slug}`;
    const title = data['dcterms:title'] || data.title || 'Interactive Guided Tour';
    const targetApp = data['robos:targetApp'] || data.targetApp || 'app-launcher';

    const walkthroughNode = {
      '@id': id,
      '@type': ['robos:InteractiveWalkthrough', 'oslc_am:Resource'],
      'dcterms:title': title,
      'robos:slug': slug,
      'robos:targetApp': targetApp,
      'dcterms:description': data['dcterms:description'] || data.description || '',
      'robos:walkthroughPath': data['robos:walkthroughPath'] || data.walkthroughPath || `docs/walkthroughs/${slug}.md`,
      'robos:videoPath': data['robos:videoPath'] || data.videoPath || null,
      'robos:vttPath': data['robos:vttPath'] || data.vttPath || null,
      'robos:stepsCount': data['robos:stepsCount'] || data.stepsCount || 0,
      'robos:hasFlowDiagram': data['robos:hasFlowDiagram'] || data.hasFlowDiagram || null,
      'robos:package': 'documentation',
      'robos:namespace': 'robos.docs',
      'robos:updatedAt': new Date().toISOString(),
    };

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [walkthroughNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Interactive Walkthrough: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(walkthroughNode);
    return {
      ok: true,
      node: walkthroughNode,
      message: `Successfully registered Walkthrough: ${title} (${id})`,
    };
  }

  getInteractiveWalkthroughs(filter = {}) {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      const isWalkthrough = types.some(t => t.includes('InteractiveWalkthrough'));
      if (!isWalkthrough) return false;
      if (filter.targetApp && n['robos:targetApp'] !== filter.targetApp) return false;
      return true;
    });
  }

  getInteractiveWalkthrough(idOrSlug) {
    if (!idOrSlug) return null;
    const query = String(idOrSlug).trim().toLowerCase();
    return this.getInteractiveWalkthroughs().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === query) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${query}`)) return true;
      if (n['robos:slug'] && n['robos:slug'].toLowerCase() === query) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === query) return true;
      return false;
    }) || null;
  }

  createCodeSnippet(data = {}) {
    const slug = (data.slug || data['dcterms:title'] || data.title || 'snippet')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:snippet:${slug}`;
    const title = data['dcterms:title'] || data.title || 'Code Snippet';
    const language = data['robos:language'] || data.language || 'javascript';
    const code = data['robos:code'] || data.code || '';

    const snippetNode = {
      '@id': id,
      '@type': ['robos:CodeSnippet', 'robos:CodeSample', 'oslc_am:Resource'],
      'dcterms:title': title,
      'robos:language': language,
      'robos:code': code,
      'dcterms:description': data['dcterms:description'] || data.description || '',
      'robos:verifiedByTest': data['robos:verifiedByTest'] || data.verifiedByTest || null,
      'robos:package': 'documentation',
      'robos:namespace': 'robos.docs',
      'robos:updatedAt': new Date().toISOString(),
    };

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [snippetNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Code Snippet: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(snippetNode);
    return {
      ok: true,
      node: snippetNode,
      message: `Successfully registered Code Snippet: ${title} (${id})`,
    };
  }

  getCodeSnippets(filter = {}) {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      const isSnippet = types.some(t => t.includes('CodeSnippet') || t.includes('CodeSample'));
      if (!isSnippet) return false;
      if (filter.language && n['robos:language'] !== filter.language) return false;
      return true;
    });
  }

  getCodeSnippet(idOrSlug) {
    if (!idOrSlug) return null;
    const query = String(idOrSlug).trim().toLowerCase();
    return this.getCodeSnippets().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === query) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${query}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === query) return true;
      return false;
    }) || null;
  }

  // ── Relational Databases ──────────────────────────────────────────────────
  createDatabase(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || data.databaseName || data.database || 'relational-db')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:db:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Database`;
    const engine = data['robos:engine'] !== undefined ? data['robos:engine'] : (data.engine !== undefined ? data.engine : (data.type !== undefined ? data.type : 'postgresql'));
    const databaseName = data['robos:databaseName'] !== undefined ? data['robos:databaseName'] : (data.databaseName !== undefined ? data.databaseName : (data.database !== undefined ? data.database : (data.slug || data.name || '')));
    const host = data['robos:host'] !== undefined ? data['robos:host'] : (data.host !== undefined ? data.host : '127.0.0.1');
    const port = data['robos:port'] !== undefined ? data['robos:port'] : (data.port !== undefined ? data.port : (engine === 'mysql' ? 3306 : engine === 'oracle' ? 1521 : 5432));

    const dbNode = {
      '@id': id,
      '@type': ['robos:Database', 'robos:RelationalDatabase', 'oslc_am:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `${engine} relational database instance.`,
      'robos:engine': engine,
      'robos:databaseName': databaseName,
      'robos:host': host,
      'robos:port': port,
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data['robos:username'] || data.user || data.username) {
      dbNode['robos:username'] = data['robos:username'] || data.user || data.username;
    }
    if (data['robos:hasCredential'] || data.hasCredential || data.passPath) {
      dbNode['robos:hasCredential'] = data['robos:hasCredential'] || data.hasCredential || (data.passPath ? `urn:robos:credential:${data.passPath}` : null);
    }
    if (data['robos:tables'] || data.tables) {
      dbNode['robos:tables'] = data['robos:tables'] || data.tables;
    }
    if (data['robos:schemas'] || data.schemas) {
      dbNode['robos:schemas'] = data['robos:schemas'] || data.schemas;
    }
    if (data['robos:boundServices'] || data.boundServices) {
      dbNode['robos:boundServices'] = data['robos:boundServices'] || data.boundServices;
    }

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [dbNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Database: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(dbNode);
    return { ok: true, node: dbNode, message: `Successfully registered Database: ${title} (${id})` };
  }

  getDatabases() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('Database') || t.includes('RelationalDatabase')) && !types.some(t => t.includes('NoSQLDatabase'));
    });
  }

  getDatabase(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getDatabases().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      if (n['robos:databaseName'] && n['robos:databaseName'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  // ── NoSQL Databases & Cache Stores ─────────────────────────────────────────
  createNoSQLDatabase(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || data.databaseName || data.database || 'nosql-store')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:nosql:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} NoSQL Store`;
    const engine = data['robos:engine'] || data.engine || data.type || 'redis';
    const host = data['robos:host'] || data.host || '127.0.0.1';

    const subType = engine === 'mongodb' || engine === 'couchdb' ? 'robos:DocumentStore' : 'robos:CacheStore';
    const noSqlNode = {
      '@id': id,
      '@type': ['robos:NoSQLDatabase', subType, 'oslc_am:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `${engine} NoSQL / Cache datastore.`,
      'robos:engine': engine,
      'robos:host': host,
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data['robos:port'] || data.port) {
      noSqlNode['robos:port'] = data['robos:port'] || data.port;
    }
    if (data['robos:databaseName'] || data.databaseName || data.database) {
      noSqlNode['robos:databaseName'] = data['robos:databaseName'] || data.databaseName || data.database;
    }
    if (data['robos:collections'] || data.collections) {
      noSqlNode['robos:collections'] = data['robos:collections'] || data.collections;
    }
    if (data['robos:hasCredential'] || data.hasCredential) {
      noSqlNode['robos:hasCredential'] = data['robos:hasCredential'] || data.hasCredential;
    }

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [noSqlNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for NoSQL Database: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(noSqlNode);
    return { ok: true, node: noSqlNode, message: `Successfully registered NoSQL Database: ${title} (${id})` };
  }

  getNoSQLDatabases() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('NoSQLDatabase') || t.includes('CacheStore') || t.includes('DocumentStore') || t.includes('KeyValueStore'));
    });
  }

  getNoSQLDatabase(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getNoSQLDatabases().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  // ── Message Brokers & Event Buses ──────────────────────────────────────────
  createMessageBroker(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || data.brokerType || 'event-broker')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:broker:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Event Broker`;
    const brokerType = data['robos:brokerType'] || data.brokerType || data.type || 'kafka';
    const endpoint = data['robos:endpoint'] || data.endpoint || data.host || 'localhost:9092';

    const brokerNode = {
      '@id': id,
      '@type': ['robos:MessageBroker', 'robos:EventBus', 'oslc_am:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `${brokerType} distributed message broker.`,
      'robos:brokerType': brokerType,
      'robos:endpoint': endpoint,
      'robos:topics': data['robos:topics'] || data.topics || [],
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data['robos:hasCredential'] || data.hasCredential) {
      brokerNode['robos:hasCredential'] = data['robos:hasCredential'] || data.hasCredential;
    }

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [brokerNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Message Broker: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(brokerNode);
    return { ok: true, node: brokerNode, message: `Successfully registered Message Broker: ${title} (${id})` };
  }

  getMessageBrokers() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('MessageBroker') || t.includes('EventBus'));
    });
  }

  getMessageBroker(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getMessageBrokers().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  // ── Model Context Protocol (MCP) Servers ────────────────────────────────────
  createMCPServer(data = {}) {
    const slug = (data.slug || data.name || data.appId || data['dcterms:title'] || data.title || 'mcp-server')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:mcp:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} MCP Server`;
    const transport = data['robos:transport'] || data.transport || (data.endpoint ? 'sse' : 'stdio');
    const toolsProvided = data['robos:toolsProvided'] || data.toolsProvided || data.tools || [`robos_${slug.replace(/-/g, '_')}_default_tool`];

    const mcpNode = {
      '@id': id,
      '@type': ['robos:MCPServer', 'robos:ToolProvider', 'oslc_am:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `Model Context Protocol server for ${title}.`,
      'robos:transport': transport,
      'robos:toolsProvided': Array.isArray(toolsProvided) ? toolsProvided : [toolsProvided],
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data.appId || data['robos:appId']) {
      mcpNode['robos:appId'] = data.appId || data['robos:appId'];
    }
    if (data.endpoint || data['robos:endpoint']) {
      mcpNode['robos:endpoint'] = data.endpoint || data['robos:endpoint'];
    }
    if (data.port || data['robos:port']) {
      mcpNode['robos:port'] = data.port || data['robos:port'];
    }
    if (data.resources || data['robos:resources']) {
      mcpNode['robos:resources'] = data.resources || data['robos:resources'];
    }
    if (data.status || data['robos:status']) {
      mcpNode['robos:status'] = data.status || data['robos:status'];
    }

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [mcpNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for MCP Server: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(mcpNode);
    return { ok: true, node: mcpNode, message: `Successfully registered MCP Server: ${title} (${id})` };
  }

  getMCPServers() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('MCPServer') || t.includes('ToolProvider'));
    });
  }

  getMCPServer(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getMCPServers().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['robos:appId'] && n['robos:appId'].toLowerCase() === q) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  // ── Agent Personas ────────────────────────────────────────────────────────
  createAgentPersona(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || data.role || 'ai-agent')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:agent:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Persona`;
    const role = data['robos:role'] || data.role || 'Autonomous Developer Agent';
    const systemPrompt = data['robos:systemPrompt'] || data.systemPrompt || 'You are an autonomous AI software engineer in RobOS.';

    const personaNode = {
      '@id': id,
      '@type': ['robos:AgentPersona', 'robos:AIAgent', 'oslc_am:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `AI agent persona specialized in ${role}.`,
      'robos:role': role,
      'robos:systemPrompt': systemPrompt,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data['robos:tools'] || data.tools) {
      personaNode['robos:tools'] = data['robos:tools'] || data.tools;
    }
    if (data['robos:model'] || data.model) {
      personaNode['robos:model'] = data['robos:model'] || data.model;
    }

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [personaNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Agent Persona: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(personaNode);
    return { ok: true, node: personaNode, message: `Successfully registered Agent Persona: ${title} (${id})` };
  }

  getAgentPersonas() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('AgentPersona') || t.includes('AIAgent'));
    });
  }

  getAgentPersona(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getAgentPersonas().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      if (n['robos:role'] && n['robos:role'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  // ── Kubernetes Clusters ───────────────────────────────────────────────────
  createKubernetesCluster(data = {}) {
    const slug = (data.slug || data.name || data.id || data['dcterms:title'] || data.title || 'k8s-cluster')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:k8s:cluster:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Cluster`;
    const provider = data['robos:provider'] || data.provider || 'local';
    const apiEndpoint = data['robos:apiEndpoint'] || data.apiEndpoint || (provider === 'local' ? 'https://127.0.0.1:6443' : `https://${slug}.k8s.internal:6443`);
    const clusterContext = data['robos:clusterContext'] || data.clusterContext || data.kubecontext || (provider === 'local' ? 'kind-robos-local' : slug);

    const clusterNode = {
      '@id': id,
      '@type': ['robos:KubernetesCluster', 'robos:K8sCluster', 'c4:DeploymentNode'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `Kubernetes cluster hosted on ${provider}.`,
      'robos:provider': provider,
      'robos:apiEndpoint': apiEndpoint,
      'robos:clusterContext': clusterContext,
      'robos:package': 'devops',
      'robos:namespace': 'robos.devops',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data['robos:flavor'] || data.flavor) clusterNode['robos:flavor'] = data['robos:flavor'] || data.flavor;
    if (data['robos:nodeCount'] !== undefined || data.nodeCount !== undefined) clusterNode['robos:nodeCount'] = data['robos:nodeCount'] !== undefined ? data['robos:nodeCount'] : data.nodeCount;
    if (data['robos:region'] || data.region) clusterNode['robos:region'] = data['robos:region'] || data.region;
    if (data['robos:version'] || data.version) clusterNode['robos:version'] = data['robos:version'] || data.version;
    if (data['robos:status'] || data.status) clusterNode['robos:status'] = data['robos:status'] || data.status;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [clusterNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Kubernetes Cluster: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(clusterNode);
    return { ok: true, node: clusterNode, message: `Successfully registered Kubernetes Cluster: ${title} (${id})` };
  }

  getKubernetesClusters() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('KubernetesCluster') || t.includes('K8sCluster'));
    });
  }

  getKubernetesCluster(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getKubernetesClusters().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      if (n['robos:clusterContext'] && n['robos:clusterContext'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  // ── Environments ──────────────────────────────────────────────────────────
  createEnvironment(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || data.environmentType || 'production')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:env:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Environment`;
    const environmentType = data['robos:environmentType'] || data.environmentType || data.type || 'production';
    const tier = data['robos:tier'] || data.tier || 'Tier-1';

    const envNode = {
      '@id': id,
      '@type': ['robos:Environment', 'robos:DeploymentEnvironment', 'c4:DeploymentNode'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `${title} deployment environment.`,
      'robos:environmentType': environmentType,
      'robos:tier': tier,
      'robos:package': 'devops',
      'robos:namespace': 'robos.devops',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data['robos:targetCluster'] || data.targetCluster || data.cluster) {
      envNode['robos:targetCluster'] = data['robos:targetCluster'] || data.targetCluster || data.cluster;
    }

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [envNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Environment: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(envNode);
    return { ok: true, node: envNode, message: `Successfully registered Environment: ${title} (${id})` };
  }

  getEnvironments() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('Environment') || t.includes('DeploymentEnvironment'));
    });
  }

  getEnvironment(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getEnvironments().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  // ── GitOps Deployments ────────────────────────────────────────────────────
  createGitOpsDeployment(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'deployment')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:gitops:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} GitOps Deployment`;
    const gitopsEngine = data['robos:gitopsEngine'] || data.gitopsEngine || 'argocd';
    const sourceRepo = data['robos:sourceRepo'] || data.sourceRepo || 'github.com/acme/gitops-deployments';
    const targetCluster = data['robos:targetCluster'] || data.targetCluster || 'urn:robos:k8s:cluster:eks-acme-prod';
    const targetNamespace = data['robos:targetNamespace'] || data.targetNamespace || 'default';

    const depNode = {
      '@id': id,
      '@type': ['robos:GitOpsDeployment', 'robos:ArgoCDApplication', 'oslc_am:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `GitOps continuous deployment managed by ${gitopsEngine}.`,
      'robos:gitopsEngine': gitopsEngine,
      'robos:sourceRepo': sourceRepo,
      'robos:targetCluster': targetCluster,
      'robos:targetNamespace': targetNamespace,
      'robos:package': 'devops',
      'robos:namespace': 'robos.devops',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data['robos:syncPolicy'] || data.syncPolicy) depNode['robos:syncPolicy'] = data['robos:syncPolicy'] || data.syncPolicy;
    if (data['robos:targetService'] || data.targetService) depNode['robos:targetService'] = data['robos:targetService'] || data.targetService;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [depNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for GitOps Deployment: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(depNode);
    return { ok: true, node: depNode, message: `Successfully registered GitOps Deployment: ${title} (${id})` };
  }

  getGitOpsDeployments() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('GitOpsDeployment') || t.includes('ArgoCDApplication'));
    });
  }

  getGitOpsDeployment(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getGitOpsDeployments().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  // ── Task Servers ──────────────────────────────────────────────────────────
  createTaskServer(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || data.serverType || data.type || 'task-server')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:taskserver:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Task Server`;
    const serverType = data['robos:serverType'] || data.serverType || data.type || 'jira';
    const url = data['robos:url'] || data.url || 'https://jira.company.internal';

    const serverNode = {
      '@id': id,
      '@type': ['robos:TaskServer', 'oslc:ServiceProvider', 'oslc_am:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `${serverType} task tracking and issue management server.`,
      'robos:serverType': serverType,
      'robos:url': url,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data['robos:projectKey'] || data.projectKey) {
      serverNode['robos:projectKey'] = data['robos:projectKey'] || data.projectKey;
    }
    if (data['robos:ownerTeam'] || data.ownerTeam) {
      serverNode['robos:ownerTeam'] = data['robos:ownerTeam'] || data.ownerTeam;
    }
    if (data['robos:hasCredential'] || data.hasCredential || data.passPath) {
      serverNode['robos:hasCredential'] = data['robos:hasCredential'] || data.hasCredential || (data.passPath ? `urn:robos:credential:${data.passPath}` : null);
    }
    if (data['robos:username'] || data.username || data.user) {
      serverNode['robos:username'] = data['robos:username'] || data.username || data.user;
    }

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [serverNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Task Server: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(serverNode);
    return { ok: true, node: serverNode, message: `Successfully registered Task Server: ${title} (${id})` };
  }

  getTaskServers() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('TaskServer'));
    });
  }

  getTaskServer(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getTaskServers().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  // ── Context Sources ───────────────────────────────────────────────────────
  createContextSource(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || data.id || 'context-source')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:context:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Context Source`;
    const sourceType = data['robos:sourceType'] || data.sourceType || data.type || 'local';
    const location = data['robos:location'] || data.location || data.path || data.ghRepo || data.url || 'local-repo';

    const sourceNode = {
      '@id': id,
      '@type': ['robos:ContextSource', 'oslc_am:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `AI context source (${sourceType}).`,
      'robos:sourceType': sourceType,
      'robos:location': location,
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data['robos:tags'] || data.tags) {
      sourceNode['robos:tags'] = data['robos:tags'] || data.tags;
    }
    if (data.enabled !== undefined) {
      sourceNode['robos:enabled'] = Boolean(data.enabled);
    }

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [sourceNode],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Context Source: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(sourceNode);
    return { ok: true, node: sourceNode, message: `Successfully registered Context Source: ${title} (${id})` };
  }

  getContextSources() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('ContextSource'));
    });
  }

  getContextSource(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getContextSources().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  // ── Prompt Strategies & Token Optimization (Caveman & DSPy) ───────────────────
  createPromptStrategy(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'prompt-strategy')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:agent:strategy:${slug}`;
    const title = data['dcterms:title'] || data.title || `${slug} Prompt Strategy`;
    const strategyType = data['robos:strategyType'] || data.strategyType || 'compression';
    const engine = data['robos:engine'] || data.engine || 'caveman';
    const targetTiers = data['robos:targetTiers'] || data.targetTiers || ['tier1', 'tier2'];
    const enabled = data['robos:enabled'] !== undefined ? Boolean(data['robos:enabled']) : (data.enabled !== undefined ? Boolean(data.enabled) : true);

    const node = {
      '@id': id,
      '@type': ['robos:PromptStrategy', 'robos:AIPromptTechnique', 'oslc_am:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `Prompt strategy for ${title}.`,
      'robos:strategyType': strategyType,
      'robos:engine': engine,
      'robos:targetTiers': Array.isArray(targetTiers) ? targetTiers : [targetTiers],
      'robos:enabled': enabled,
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data.mode || data['robos:mode']) {
      node['robos:mode'] = data.mode || data['robos:mode'];
    }
    if (data.parameters || data['robos:parameters']) {
      node['robos:parameters'] = data.parameters || data['robos:parameters'];
    }

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Prompt Strategy: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Prompt Strategy: ${title} (${id})` };
  }

  getPromptStrategies() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('PromptStrategy') || t.includes('PromptOptimizer') || t.includes('PromptCompiler'));
    });
  }

  getPromptStrategy(idOrSlug) {
    if (!idOrSlug) return null;
    const q = String(idOrSlug).trim().toLowerCase();
    return this.getPromptStrategies().find(n => {
      if (n['@id'] && n['@id'].toLowerCase() === q) return true;
      if (n['@id'] && n['@id'].toLowerCase().endsWith(`:${q}`)) return true;
      if (n['dcterms:title'] && n['dcterms:title'].toLowerCase() === q) return true;
      return false;
    }) || null;
  }

  createPromptOptimizer(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'prompt-optimizer')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:agent:optimizer:${slug}`;
    const title = data['dcterms:title'] || data.title || `${slug} Prompt Optimizer`;
    const strategyType = data['robos:strategyType'] || data.strategyType || 'teleprompter-optimization';
    const engine = data['robos:engine'] || data.engine || 'dspy';
    const targetTiers = data['robos:targetTiers'] || data.targetTiers || ['tier2', 'tier3'];
    const enabled = data['robos:enabled'] !== undefined ? Boolean(data['robos:enabled']) : (data.enabled !== undefined ? Boolean(data.enabled) : true);

    const node = {
      '@id': id,
      '@type': ['robos:PromptOptimizer', 'robos:PromptCompiler', 'robos:PromptStrategy', 'oslc_am:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || `Prompt optimizer for ${title}.`,
      'robos:strategyType': strategyType,
      'robos:engine': engine,
      'robos:targetTiers': Array.isArray(targetTiers) ? targetTiers : [targetTiers],
      'robos:enabled': enabled,
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
    };

    if (data.teleprompter || data['robos:teleprompter']) {
      node['robos:teleprompter'] = data.teleprompter || data['robos:teleprompter'];
    }
    if (data.metric || data['robos:metric']) {
      node['robos:metric'] = data.metric || data['robos:metric'];
    }
    if (data.parameters || data['robos:parameters']) {
      node['robos:parameters'] = data.parameters || data['robos:parameters'];
    }

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));

    if (!shaclRes.conforms) {
      return {
        ok: false,
        error: `SHACL validation failed for Prompt Optimizer: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`,
        results: shaclRes.results,
      };
    }

    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Prompt Optimizer: ${title} (${id})` };
  }

  getPromptOptimizers() {
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('PromptOptimizer') || t.includes('PromptCompiler'));
    });
  }

  applyCavemanCompression(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return { originalTokensEst: 0, compressedTokensEst: 0, savingsPercent: 0, compressedText: '' };
    }
    const mode = options.mode || 'standard'; // standard, aggressive, extreme

    const origWordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const origTokensEst = Math.ceil(origWordCount * 1.3);

    // Isolate markdown code blocks and inline code
    const codeBlocks = [];
    let sanitized = text.replace(/(```[\s\S]*?```|`[^`]+`)/g, (match) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(match);
      return placeholder;
    });

    // Boilerplate filler patterns to prune
    const fillers = [
      /\b(please\s+(ensure|make\s+sure|note\s+that|remember\s+to|be\s+aware\s+that|take\s+into\s+account|verify))\b/gi,
      /\b(could\s+you\s+(please\s+)?|would\s+you\s+(be\s+able\s+to\s+)?|can\s+you\s+(please\s+)?)\b/gi,
      /\b(in\s+order\s+to|as\s+a\s+matter\s+of\s+fact|it\s+is\s+important\s+to\s+note\s+that|keep\s+in\s+mind\s+that)\b/gi,
      /\b(hello|hi|greetings|thank\s+you|thanks\s+in\s+advance|warm\s+regards|sincerely)\b[.,!]?/gi,
      /\b(feel\s+free\s+to|don'?t\s+hesitate\s+to|let\s+me\s+know\s+if)\b/gi,
    ];

    for (const pattern of fillers) {
      sanitized = sanitized.replace(pattern, '');
    }

    if (mode === 'aggressive' || mode === 'extreme') {
      sanitized = sanitized
        .replace(/\b(furthermore|moreover|additionally|subsequently|nonetheless|consequently)\b,?\s*/gi, '')
        .replace(/\b(it\s+should\s+be\s+noted\s+that|we\s+need\s+to|you\s+should)\b/gi, '');
    }

    if (mode === 'extreme') {
      sanitized = sanitized.replace(/\b(the|a|an)\b\s+/gi, '');
    }

    sanitized = sanitized
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();

    // Restore code blocks
    for (let i = 0; i < codeBlocks.length; i++) {
      sanitized = sanitized.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
    }

    const compWordCount = sanitized.trim().split(/\s+/).filter(Boolean).length;
    const compTokensEst = Math.ceil(compWordCount * 1.3);
    const savingsPercent = origTokensEst > 0
      ? Math.max(0, Math.round(((origTokensEst - compTokensEst) / origTokensEst) * 100))
      : 0;

    return {
      originalTokensEst: origTokensEst,
      compressedTokensEst: compTokensEst,
      savingsPercent,
      compressedText: sanitized,
    };
  }

  compileWithDSPy(promptSignature, dataset = [], options = {}) {
    const inputs = promptSignature.inputs || ['task'];
    const outputs = promptSignature.outputs || ['solution'];
    const teleprompter = options.teleprompter || 'MIPROv2';
    const metric = options.metric || 'shacl_validation';
    const maxBootstrappedDemos = options.maxBootstrappedDemos || 3;

    const calibratedDemos = dataset.slice(0, maxBootstrappedDemos).map((item, idx) => ({
      index: idx + 1,
      inputs: Object.fromEntries(inputs.map(k => [k, item[k] || `[Example ${idx + 1} ${k}]`])),
      outputs: Object.fromEntries(outputs.map(k => [k, item[k] || `[Example ${idx + 1} ${k}]`])),
      metricScore: item.score !== undefined ? item.score : 1.0,
    }));

    const instructionPrefix = `[DSPy Compiled Instruction - Teleprompter: ${teleprompter}, Metric: ${metric}]\n` +
      `Given the inputs (${inputs.join(', ')}), strictly generate verified outputs (${outputs.join(', ')}).\n` +
      `Zero filler tokens. Adhere to all type constraints and SHACL shapes.`;

    let compiledPrompt = instructionPrefix + '\n\n';
    if (calibratedDemos.length > 0) {
      compiledPrompt += `### Few-Shot Exemplars (${calibratedDemos.length} Calibrated Demonstration${calibratedDemos.length > 1 ? 's' : ''}):\n`;
      for (const demo of calibratedDemos) {
        compiledPrompt += `\n--- Exemplar #${demo.index} ---\n`;
        for (const [k, v] of Object.entries(demo.inputs)) {
          compiledPrompt += `Input [${k}]: ${typeof v === 'object' ? JSON.stringify(v) : v}\n`;
        }
        for (const [k, v] of Object.entries(demo.outputs)) {
          compiledPrompt += `Output [${k}]: ${typeof v === 'object' ? JSON.stringify(v) : v}\n`;
        }
      }
      compiledPrompt += '\n--- End of Demonstrations ---\n\n';
    }

    compiledPrompt += `### Current Task Execution:\n`;
    for (const inputKey of inputs) {
      compiledPrompt += `Input [${inputKey}]: {{${inputKey}}}\n`;
    }
    compiledPrompt += `Generate Output (${outputs.join(', ')}):`;

    return {
      teleprompter,
      metric,
      signature: { inputs, outputs },
      calibratedExemplarCount: calibratedDemos.length,
      compiledPrompt,
      validationScore: 1.0,
      optimizedAt: new Date().toISOString(),
    };
  }

  // ── Child Entity Registrations & Hierarchies ──────────────────────────────

  registerFeature(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'feature')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:feature:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Feature`;

    const node = {
      '@id': id,
      '@type': ['robos:Feature', 'robos:ProductFeature', 'oslc:Resource'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || '',
      'robos:status': data['robos:status'] || data.status || 'proposed',
      'robos:inEpic': data['robos:inEpic'] || data.epic || data.inEpic || undefined,
      'robos:inProject': data['robos:inProject'] || data.project || data.inProject || undefined,
      'robos:package': 'services',
      'robos:namespace': 'robos.services',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for Feature: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Feature: ${title} (${id})` };
  }

  registerUserStory(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'story')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:story:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Story`;
    const status = data['robos:status'] || data.status || 'backlog';

    const node = {
      '@id': id,
      '@type': ['robos:UserStory', 'robos:Story', 'oslc_cm:ChangeRequest'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || '',
      'robos:status': status,
      'robos:acceptanceCriteria': data['robos:acceptanceCriteria'] || data.acceptanceCriteria || [],
      'robos:storyPoints': data['robos:storyPoints'] || data.storyPoints || 3,
      'robos:inFeature': data['robos:inFeature'] || data.feature || data.inFeature || undefined,
      'robos:inEpic': data['robos:inEpic'] || data.epic || data.inEpic || undefined,
      'robos:inSprint': data['robos:inSprint'] || data.sprint || data.inSprint || undefined,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:status'] = status;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for UserStory: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered User Story: ${title} (${id})` };
  }

  registerTask(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'task')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:task:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Task`;
    const status = data['robos:status'] || data.status || 'todo';

    const node = {
      '@id': id,
      '@type': ['robos:Task', 'oslc_cm:ChangeRequest', 'robos:WorkItem'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || '',
      'robos:status': status,
      'robos:priority': data['robos:priority'] || data.priority || 'medium',
      'robos:inStory': data['robos:inStory'] || data.story || data.inStory || undefined,
      'robos:inSprint': data['robos:inSprint'] || data.sprint || data.inSprint || undefined,
      'robos:assignedDeveloper': data['robos:assignedDeveloper'] || data.assignedDeveloper || undefined,
      'robos:assignedAgent': data['robos:assignedAgent'] || data.assignedAgent || undefined,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:status'] = status;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for Task: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Task: ${title} (${id})` };
  }

  registerSubtask(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'subtask')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:subtask:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Subtask`;
    const parentTask = data['robos:parentTask'] || data.parentTask || data.task;

    const node = {
      '@id': id,
      '@type': ['robos:Subtask', 'robos:WorkItem'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || '',
      'robos:status': data['robos:status'] || data.status || 'todo',
      'robos:parentTask': parentTask,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:parentTask'] = parentTask;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for Subtask: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Subtask: ${title} (${id})` };
  }

  registerBug(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'bug')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:bug:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug} Defect`;
    const severity = data['robos:severity'] || data.severity || 'major';
    const status = data['robos:status'] || data.status || 'open';

    const node = {
      '@id': id,
      '@type': ['robos:Bug', 'robos:Defect', 'oslc_cm:Defect'],
      'dcterms:title': title,
      'dcterms:description': data['dcterms:description'] || data.description || '',
      'robos:severity': severity,
      'robos:status': status,
      'robos:inSprint': data['robos:inSprint'] || data.sprint || data.inSprint || undefined,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:severity'] = severity;
    node['robos:status'] = status;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for Bug: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Bug: ${title} (${id})` };
  }

  registerSprint(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'sprint')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:sprint:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug}`;
    const status = data['robos:status'] || data.status || 'active';
    const startDate = data['robos:startDate'] || data.startDate || new Date().toISOString().split('T')[0];
    const endDate = data['robos:endDate'] || data.endDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    const node = {
      '@id': id,
      '@type': ['robos:Sprint', 'oslc:Resource'],
      'dcterms:title': title,
      'robos:status': status,
      'robos:startDate': startDate,
      'robos:endDate': endDate,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:status'] = status;
    node['robos:startDate'] = startDate;
    node['robos:endDate'] = endDate;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for Sprint: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Sprint: ${title} (${id})` };
  }

  registerMilestone(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'milestone')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:milestone:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug}`;
    const targetDate = data['robos:targetDate'] || data.targetDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const node = {
      '@id': id,
      '@type': ['robos:Milestone', 'oslc:Resource'],
      'dcterms:title': title,
      'robos:targetDate': targetDate,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:targetDate'] = targetDate;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for Milestone: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Milestone: ${title} (${id})` };
  }

  registerGitRepository(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'repo')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:repo:${slug}`;
    const title = data['dcterms:title'] || data.title || data.name || `${slug}`;
    const url = data['robos:url'] || data.url || `https://github.com/acme/${slug}`;
    const defaultBranch = data['robos:defaultBranch'] || data.defaultBranch || 'main';

    const node = {
      '@id': id,
      '@type': ['robos:GitRepository', 'robos:Repository', 'oslc:Resource'],
      'dcterms:title': title,
      'robos:url': url,
      'robos:defaultBranch': defaultBranch,
      'robos:inOrganization': data['robos:inOrganization'] || data.organization || undefined,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:url'] = url;
    node['robos:defaultBranch'] = defaultBranch;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for GitRepository: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Git Repository: ${title} (${id})` };
  }

  registerGitBranch(data = {}) {
    const branchName = data['robos:branchName'] || data.branchName || data.name || 'main';
    const slug = (data.slug || branchName).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:branch:${slug}`;
    const title = data['dcterms:title'] || data.title || branchName;
    const repository = data['robos:repository'] || data.repository || data.repo;

    const node = {
      '@id': id,
      '@type': ['robos:GitBranch', 'oslc:Resource'],
      'dcterms:title': title,
      'robos:branchName': branchName,
      'robos:repository': repository,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:branchName'] = branchName;
    node['robos:repository'] = repository;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for GitBranch: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Git Branch: ${title} (${id})` };
  }

  registerPullRequest(data = {}) {
    const prNumber = data['robos:prNumber'] || data.prNumber || data.number || 1;
    const slug = (data.slug || `pr-${prNumber}`).toLowerCase();
    const id = data['@id'] || `urn:robos:pr:${slug}`;
    const title = data['dcterms:title'] || data.title || `PR #${prNumber}`;
    const sourceBranch = data['robos:sourceBranch'] || data.sourceBranch || 'feature';
    const targetBranch = data['robos:targetBranch'] || data.targetBranch || 'main';
    const status = data['robos:status'] || data.status || 'open';

    const node = {
      '@id': id,
      '@type': ['robos:PullRequest', 'oslc_cm:ChangeRequest'],
      'dcterms:title': title,
      'robos:prNumber': prNumber,
      'robos:sourceBranch': sourceBranch,
      'robos:targetBranch': targetBranch,
      'robos:status': status,
      'robos:package': 'organization',
      'robos:namespace': 'robos.org',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:prNumber'] = prNumber;
    node['robos:sourceBranch'] = sourceBranch;
    node['robos:targetBranch'] = targetBranch;
    node['robos:status'] = status;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for PullRequest: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Pull Request: ${title} (${id})` };
  }

  registerAPIEndpoint(data = {}) {
    const pathPattern = data['robos:pathPattern'] || data.pathPattern || data.path || '/api/v1/resource';
    const httpMethod = (data['robos:httpMethod'] || data.httpMethod || data.method || 'GET').toUpperCase();
    const slug = (data.slug || `${httpMethod.toLowerCase()}-${pathPattern.replace(/[^a-z0-9]/gi, '-')}`).toLowerCase();
    const id = data['@id'] || `urn:robos:endpoint:${slug}`;
    const title = data['dcterms:title'] || data.title || `${httpMethod} ${pathPattern}`;

    const node = {
      '@id': id,
      '@type': ['robos:APIEndpoint', 'robos:APIOperation', 'c4:Component'],
      'dcterms:title': title,
      'robos:pathPattern': pathPattern,
      'robos:httpMethod': httpMethod,
      'robos:service': data['robos:service'] || data.service || undefined,
      'robos:package': 'services',
      'robos:namespace': 'robos.services',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:pathPattern'] = pathPattern;
    node['robos:httpMethod'] = httpMethod;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for APIEndpoint: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered API Endpoint: ${title} (${id})` };
  }

  registerDatabaseTable(data = {}) {
    const tableName = data['robos:tableName'] || data.tableName || data.name || 'table_name';
    const slug = (data.slug || tableName).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:db-table:${slug}`;
    const title = data['dcterms:title'] || data.title || tableName;
    const database = data['robos:database'] || data.database || data.db;

    const node = {
      '@id': id,
      '@type': ['robos:DatabaseTable', 'oslc_am:Resource'],
      'dcterms:title': title,
      'robos:tableName': tableName,
      'robos:database': database,
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:tableName'] = tableName;
    node['robos:database'] = database;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for DatabaseTable: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Database Table: ${title} (${id})` };
  }

  registerDatabaseColumn(data = {}) {
    const columnName = data['robos:columnName'] || data.columnName || data.name || 'column_name';
    const slug = (data.slug || columnName).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:db-col:${slug}`;
    const title = data['dcterms:title'] || data.title || columnName;
    const dataType = data['robos:dataType'] || data.dataType || data.type || 'varchar(255)';
    const table = data['robos:table'] || data.table;

    const node = {
      '@id': id,
      '@type': ['robos:DatabaseColumn', 'oslc_am:Resource'],
      'dcterms:title': title,
      'robos:columnName': columnName,
      'robos:dataType': dataType,
      'robos:table': table,
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:columnName'] = columnName;
    node['robos:dataType'] = dataType;
    node['robos:table'] = table;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for DatabaseColumn: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Database Column: ${title} (${id})` };
  }

  registerNoSQLCollection(data = {}) {
    const collectionName = data['robos:collectionName'] || data.collectionName || data.name || 'collection';
    const slug = (data.slug || collectionName).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:nosql-col:${slug}`;
    const title = data['dcterms:title'] || data.title || collectionName;
    const database = data['robos:database'] || data.database || data.db;

    const node = {
      '@id': id,
      '@type': ['robos:NoSQLCollection', 'oslc_am:Resource'],
      'dcterms:title': title,
      'robos:collectionName': collectionName,
      'robos:database': database,
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:collectionName'] = collectionName;
    node['robos:database'] = database;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for NoSQLCollection: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered NoSQL Collection: ${title} (${id})` };
  }

  registerMessageTopic(data = {}) {
    const topicName = data['robos:topicName'] || data.topicName || data.name || 'events-v1';
    const slug = (data.slug || topicName).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:topic:${slug}`;
    const title = data['dcterms:title'] || data.title || topicName;
    const broker = data['robos:broker'] || data.broker;

    const node = {
      '@id': id,
      '@type': ['robos:MessageTopic', 'robos:MessageQueue', 'robos:EventTopic'],
      'dcterms:title': title,
      'robos:topicName': topicName,
      'robos:broker': broker,
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:topicName'] = topicName;
    node['robos:broker'] = broker;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for MessageTopic: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Message Topic: ${title} (${id})` };
  }

  registerMCPTool(data = {}) {
    const toolName = data['robos:toolName'] || data.toolName || data.name || 'tool';
    const slug = (data.slug || toolName).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:mcp-tool:${slug}`;
    const title = data['dcterms:title'] || data.title || toolName;
    const mcpServer = data['robos:mcpServer'] || data.mcpServer || data.server;

    const node = {
      '@id': id,
      '@type': ['robos:MCPTool', 'oslc:Resource'],
      'dcterms:title': title,
      'robos:toolName': toolName,
      'robos:mcpServer': mcpServer,
      'robos:package': 'core-platform',
      'robos:namespace': 'robos.core',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:toolName'] = toolName;
    node['robos:mcpServer'] = mcpServer;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for MCPTool: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered MCP Tool: ${title} (${id})` };
  }

  registerKubernetesNamespace(data = {}) {
    const namespaceName = data['robos:namespaceName'] || data.namespaceName || data.name || 'default';
    const slug = (data.slug || namespaceName).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:k8s-ns:${slug}`;
    const title = data['dcterms:title'] || data.title || `${namespaceName} Namespace`;
    const cluster = data['robos:cluster'] || data.cluster;

    const node = {
      '@id': id,
      '@type': ['robos:KubernetesNamespace', 'oslc:Resource'],
      'dcterms:title': title,
      'robos:namespaceName': namespaceName,
      'robos:cluster': cluster,
      'robos:package': 'devops',
      'robos:namespace': 'robos.devops',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:namespaceName'] = namespaceName;
    node['robos:cluster'] = cluster;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for KubernetesNamespace: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Kubernetes Namespace: ${title} (${id})` };
  }

  registerKubernetesDeployment(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'deployment')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:k8s-dep:${slug}`;
    const title = data['dcterms:title'] || data.title || `${slug} Deployment`;
    const namespace = data['robos:namespace'] || data.namespace || 'default';
    const image = data['robos:image'] || data.image || 'registry.acme.com/app:latest';

    const node = {
      '@id': id,
      '@type': ['robos:KubernetesDeployment', 'c4:Container'],
      'dcterms:title': title,
      'robos:namespace': namespace,
      'robos:image': image,
      'robos:package': 'devops',
      'robos:namespace': 'robos.devops',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:namespace'] = namespace;
    node['robos:image'] = image;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for KubernetesDeployment: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Kubernetes Deployment: ${title} (${id})` };
  }

  registerPipelineStage(data = {}) {
    const stageName = data['robos:stageName'] || data.stageName || data.name || 'build';
    const slug = (data.slug || stageName).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:pipeline-stage:${slug}`;
    const title = data['dcterms:title'] || data.title || `${stageName} Stage`;
    const pipeline = data['robos:pipeline'] || data.pipeline;

    const node = {
      '@id': id,
      '@type': ['robos:PipelineStage', 'oslc:Resource'],
      'dcterms:title': title,
      'robos:stageName': stageName,
      'robos:pipeline': pipeline,
      'robos:package': 'devops',
      'robos:namespace': 'robos.devops',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:stageName'] = stageName;
    node['robos:pipeline'] = pipeline;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for PipelineStage: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Pipeline Stage: ${title} (${id})` };
  }

  registerLearningModule(data = {}) {
    const slug = (data.slug || data.name || data['dcterms:title'] || data.title || 'module')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const id = data['@id'] || `urn:robos:module:${slug}`;
    const title = data['dcterms:title'] || data.title || `${slug} Module`;
    const course = data['robos:course'] || data.course;

    const node = {
      '@id': id,
      '@type': ['robos:LearningModule', 'oslc:Resource'],
      'dcterms:title': title,
      'robos:course': course,
      'robos:package': 'learning',
      'robos:namespace': 'robos.learning',
      'robos:updatedAt': new Date().toISOString(),
      ...data,
    };
    node['dcterms:title'] = title;
    node['robos:course'] = course;

    const shaclRes = this.validator.validateGraph(new OSLCGraphParser({
      '@context': OSLC_CONTEXT,
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': [node],
    }));
    if (!shaclRes.conforms) {
      return { ok: false, error: `SHACL validation failed for LearningModule: ${shaclRes.results.map(r => r.resultMessage).join(', ')}`, results: shaclRes.results };
    }
    this.addNode(node);
    return { ok: true, node, message: `Successfully registered Learning Module: ${title} (${id})` };
  }

  // ── Child Traversal & Query Helpers ─────────────────────────────────────────

  getChildNodes(parentId) {
    if (!parentId) return [];
    return this.parser.nodes.filter(n => {
      const parentKeys = [
        'robos:parentTask', 'robos:parentWorkItem', 'robos:inProject', 'robos:inEpic',
        'robos:inFeature', 'robos:inStory', 'robos:inSprint', 'robos:repository',
        'robos:database', 'robos:table', 'robos:broker', 'robos:mcpServer',
        'robos:cluster', 'robos:pipeline', 'robos:stage', 'robos:job',
        'robos:course', 'robos:module', 'robos:docPage', 'robos:adr',
        'robos:app', 'robos:command', 'robos:service'
      ];
      for (const k of parentKeys) {
        if (n[k] === parentId) return true;
        if (Array.isArray(n[k]) && n[k].includes(parentId)) return true;
      }
      return false;
    });
  }

  getWorkItemsForProject(projectId) {
    if (!projectId) return [];
    const workItemTypes = ['Epic', 'Feature', 'UserStory', 'Story', 'Task', 'Subtask', 'Bug', 'Defect'];
    const projectNodeIds = new Set([projectId]);
    const workItems = new Map();

    // Pass 1: Direct matches
    for (const n of this.parser.nodes) {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      const matchesType = types.some(t => workItemTypes.some(wit => t.includes(wit)));
      if (!matchesType) continue;

      if (n['robos:inProject'] === projectId || n['robos:project'] === projectId) {
        workItems.set(n['@id'], n);
        projectNodeIds.add(n['@id']);
      }
    }

    // Pass 2 & 3: Transitive hierarchy (features in epic, stories in feature/epic, tasks in story, subtasks in task)
    let added = true;
    while (added) {
      added = false;
      for (const n of this.parser.nodes) {
        if (workItems.has(n['@id'])) continue;
        const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
        const matchesType = types.some(t => workItemTypes.some(wit => t.includes(wit)));
        if (!matchesType) continue;

        if (
          (n['robos:inEpic'] && projectNodeIds.has(n['robos:inEpic'])) ||
          (n['robos:inFeature'] && projectNodeIds.has(n['robos:inFeature'])) ||
          (n['robos:inStory'] && projectNodeIds.has(n['robos:inStory'])) ||
          (n['robos:parentTask'] && projectNodeIds.has(n['robos:parentTask'])) ||
          (n['robos:epic'] && projectNodeIds.has(n['robos:epic'])) ||
          (n['robos:story'] && projectNodeIds.has(n['robos:story'])) ||
          (n['robos:task'] && projectNodeIds.has(n['robos:task']))
        ) {
          workItems.set(n['@id'], n);
          projectNodeIds.add(n['@id']);
          added = true;
        }
      }
    }

    return Array.from(workItems.values());
  }

  getTasksForSprint(sprintId) {
    if (!sprintId) return [];
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      const isTaskLike = types.some(t => t.includes('Task') || t.includes('Story') || t.includes('Bug'));
      return isTaskLike && (n['robos:inSprint'] === sprintId || n['robos:sprint'] === sprintId);
    });
  }

  getEndpointsForService(serviceId) {
    if (!serviceId) return [];
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('APIEndpoint') || t.includes('APIOperation')) &&
        (n['robos:service'] === serviceId || n['robos:targetNode'] === serviceId);
    });
  }

  getTablesForDatabase(databaseId) {
    if (!databaseId) return [];
    return this.parser.nodes.filter(n => {
      const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
      return types.some(t => t.includes('DatabaseTable')) &&
        (n['robos:database'] === databaseId || n['robos:db'] === databaseId);
    });
  }
}

module.exports = { SDLCKnowledgeGraphStore, DEFAULT_GRAPH_DATA, SAMPLE_GHERKIN_FEATURE };

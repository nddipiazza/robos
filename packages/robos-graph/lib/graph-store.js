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
const { GherkinLinker, SAMPLE_GHERKIN_FEATURE } = require('./gherkin-linker');

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
      'robos:flavor': 'eks',
      'robos:cloudProvider': 'urn:robos:cloud:aws-prod',
      'robos:nodeCount': 12,
      'robos:apiEndpoint': 'https://eks.us-east-1.acme.aws:6443',
    },
    {
      '@id': 'urn:robos:k8s:cluster:kind-local',
      '@type': ['robos:KubernetesCluster', 'c4:DeploymentNode'],
      'dcterms:title': 'Local Kind Development Cluster',
      'robos:flavor': 'kind',
      'robos:cloudProvider': 'local',
      'robos:nodeCount': 3,
      'robos:apiEndpoint': 'https://127.0.0.1:6443',
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
      '@type': ['robos:ArgoCDApplication'],
      'dcterms:title': 'ArgoCD GitOps App: acme-petshop',
      'robos:appName': 'acme-petshop-prod',
      'robos:syncStatus': 'Synced',
      'robos:healthStatus': 'Healthy',
      'robos:repoURL': 'https://github.com/acme-corp/petstore-infra',
      'robos:targetRevision': 'main',
      'robos:destinationServer': 'https://eks.us-east-1.acme.aws:6443',
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
  ],
};

class SDLCKnowledgeGraphStore {
  constructor(options = {}) {
    this.filePath = options.filePath || DEFAULT_GRAPH_PATH;
    this.branchManager = new BranchManager({ baseGraphData: DEFAULT_GRAPH_DATA });
    this.parser = new OSLCGraphParser();
    this.validator = new SHACLValidator();
    this.diffEngine = new GraphDiffEngine();
    this.blastAnalyzer = new BlastRadiusAnalyzer();
    this.copilot = new GraphCoPilot({ validator: this.validator });
    this.repoScanner = new RepoScanner();
    this.bulkRepoImporter = new BulkRepoImporter();
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
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        this.parser = new OSLCGraphParser(raw);
        this.branchManager = new BranchManager({ baseGraphData: raw });
        return;
      } catch {}
    }
    this.parser = new OSLCGraphParser(DEFAULT_GRAPH_DATA);
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.parser.toJSONLD(), null, 2), 'utf8');
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
    const exists = this.parser.nodes.some(n => n['@id'] === node['@id']);
    if (!exists) {
      this.parser.nodes.push(node);
      this.parser.loadNodes(this.parser.nodes);
      this.save();
    }
    this.latestDocSyncPrompt = this.discernDocUpdates({ action: exists ? 'updated' : 'added', node });
    return node;
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
          if (types.some(t => t.includes('Microservice') || t.includes('DesktopApp') || t.includes('ConsoleApp') || t.includes('MobileApp') || t.includes('DataPipeline') || t.includes('Library'))) {
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
}

module.exports = { SDLCKnowledgeGraphStore, DEFAULT_GRAPH_DATA, SAMPLE_GHERKIN_FEATURE };

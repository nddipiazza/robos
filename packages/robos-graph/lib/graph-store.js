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
      'dcterms:description': 'Polyglot distributed pet store & veterinary platform',
      'robos:status': 'active',
      'robos:techStack': 'Java 21 Spring Boot 3 + React 18 + TypeSpec + Kafka + PostgreSQL',
      'robos:hasRepository': [
        'urn:robos:repo:petstore-api',
        'urn:robos:repo:petstore-web',
        'urn:robos:repo:petstore-common',
      ],
      'robos:tracksEpic': [
        'urn:robos:epic:PET-EPIC-1',
      ],
      'robos:features': [
        {
          id: 'feat-platform-core',
          name: 'Distributed Platform Core & APIs',
          epicKey: 'PET-EPIC-1',
          tasks: ['PET-101', 'PET-102', 'PET-103', 'PET-104', 'PET-105'],
        },
      ],
      'robos:managedByTeam': 'urn:robos:team:core-platform',
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
    return {
      ok: true,
      addedCount: mutation.proposedNodes.length,
      nodes: mutation.proposedNodes,
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

  addNode(node) {
    const exists = this.parser.nodes.some(n => n['@id'] === node['@id']);
    if (!exists) {
      this.parser.nodes.push(node);
      this.parser.loadNodes(this.parser.nodes);
      this.save();
    }
    return node;
  }
}

module.exports = { SDLCKnowledgeGraphStore, DEFAULT_GRAPH_DATA, SAMPLE_GHERKIN_FEATURE };

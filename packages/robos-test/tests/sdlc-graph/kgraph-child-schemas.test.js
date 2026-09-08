'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  OSLCGraphParser,
  SHACLValidator,
  BUILTIN_SHACL_SHAPES,
} = require('../../../robos-graph/index');
const { KGraphPackageManager } = require('../../../robos-graph/lib/package-manager');

describe('SDLC Knowledge Graph: Child Schema Elements & Hierarchies', () => {

  it('1. Work Item Hierarchy: registers and validates Project -> Milestone -> Sprint -> Epic -> Feature -> Story -> Task -> Subtask -> Bug', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-workitems-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // 1. Create Project
    const projId = 'urn:robos:project:billing-system';
    store.addNode({
      '@id': projId,
      '@type': ['robos:Project', 'oslc:Project'],
      'dcterms:title': 'Billing System Modernization',
      'robos:status': 'active',
    });

    // 2. Register Milestone
    const msRes = store.registerMilestone({
      slug: 'billing-v2-launch',
      title: 'Billing v2.0 Production Launch',
      targetDate: '2026-12-01',
      inProject: projId,
    });
    assert.strictEqual(msRes.ok, true);
    assert.strictEqual(msRes.node['@id'], 'urn:robos:milestone:billing-v2-launch');

    // 3. Register Sprint
    const sprintRes = store.registerSprint({
      slug: 'sprint-42',
      title: 'Sprint 42: Payment Gateway Cutover',
      status: 'active',
      startDate: '2026-10-01',
      endDate: '2026-10-15',
      inProject: projId,
    });
    assert.strictEqual(sprintRes.ok, true);
    assert.strictEqual(sprintRes.node['@id'], 'urn:robos:sprint:sprint-42');

    // 4. Create Epic
    const epicId = 'urn:robos:epic:stripe-migration';
    store.addNode({
      '@id': epicId,
      '@type': ['robos:Epic'],
      'dcterms:title': 'Migrate Legacy Billing to Stripe Payment Element',
      'robos:inProject': projId,
    });

    // 5. Register Feature
    const featRes = store.registerFeature({
      slug: 'hosted-checkout-modal',
      title: 'Hosted Checkout Modal with 3D Secure 2.0',
      status: 'in-progress',
      epic: epicId,
      project: projId,
    });
    assert.strictEqual(featRes.ok, true);

    // 6. Register User Story
    const storyRes = store.registerUserStory({
      slug: 'card-payment-intent',
      title: 'As a customer I want to tokenize my credit card so that payments process securely',
      status: 'in-progress',
      acceptanceCriteria: ['Must create Stripe PaymentIntent', 'Must handle 3DS challenge'],
      storyPoints: 5,
      feature: featRes.node['@id'],
      epic: epicId,
      sprint: sprintRes.node['@id'],
    });
    assert.strictEqual(storyRes.ok, true);

    // 7. Register Task
    const taskRes = store.registerTask({
      slug: 'implement-stripe-webhook-handler',
      title: 'Implement idempotency key and Stripe webhook handler in Forms API',
      status: 'in-progress',
      priority: 'high',
      story: storyRes.node['@id'],
      sprint: sprintRes.node['@id'],
      assignedAgent: 'urn:robos:agent:pr-reviewer',
    });
    assert.strictEqual(taskRes.ok, true);

    // 8. Register Subtask
    const subtaskRes = store.registerSubtask({
      slug: 'verify-webhook-signatures',
      title: 'Add HMAC SHA256 signature verification filter',
      status: 'completed',
      task: taskRes.node['@id'],
    });
    assert.strictEqual(subtaskRes.ok, true);

    // 9. Register Bug
    const bugRes = store.registerBug({
      slug: 'refund-currency-mismatch',
      title: 'EUR currency refunds fail with decimal precision mismatch',
      severity: 'critical',
      status: 'open',
      sprint: sprintRes.node['@id'],
    });
    assert.strictEqual(bugRes.ok, true);

    // Verify Query Helpers
    const projectItems = store.getWorkItemsForProject(projId);
    assert.ok(projectItems.length >= 3, 'Must discover work items belonging to project');

    const sprintTasks = store.getTasksForSprint(sprintRes.node['@id']);
    assert.ok(sprintTasks.some(t => t['@id'] === taskRes.node['@id']), 'Task must be in sprint');
    assert.ok(sprintTasks.some(t => t['@id'] === bugRes.node['@id']), 'Bug must be in sprint');

    const childNodesOfTask = store.getChildNodes(taskRes.node['@id']);
    assert.ok(childNodesOfTask.some(c => c['@id'] === subtaskRes.node['@id']), 'Subtask must be a child of Task');

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('2. Negative SHACL validation: rejects invalid work items missing required fields', () => {
    const validator = new SHACLValidator();

    // Task missing status
    const invalidTask = {
      '@id': 'urn:robos:task:broken-task',
      '@type': ['robos:Task'],
      'dcterms:title': 'Task Without Status',
    };
    const res1 = validator.validate(invalidTask);
    assert.strictEqual(res1.conforms, false);
    assert.ok(res1.results.some(r => r.resultPath === 'robos:status'));

    // Subtask missing parentTask
    const invalidSubtask = {
      '@id': 'urn:robos:subtask:broken-subtask',
      '@type': ['robos:Subtask'],
      'dcterms:title': 'Orphan Subtask',
    };
    const res2 = validator.validate(invalidSubtask);
    assert.strictEqual(res2.conforms, false);
    assert.ok(res2.results.some(r => r.resultPath === 'robos:parentTask'));

    // Bug missing severity
    const invalidBug = {
      '@id': 'urn:robos:bug:broken-bug',
      '@type': ['robos:Bug'],
      'dcterms:title': 'Bug Without Severity',
      'robos:status': 'open',
    };
    const res3 = validator.validate(invalidBug);
    assert.strictEqual(res3.conforms, false);
    assert.ok(res3.results.some(r => r.resultPath === 'robos:severity'));

    // Sprint missing startDate or endDate
    const invalidSprint = {
      '@id': 'urn:robos:sprint:broken-sprint',
      '@type': ['robos:Sprint'],
      'dcterms:title': 'Sprint Missing Dates',
      'robos:status': 'planning',
    };
    const res4 = validator.validate(invalidSprint);
    assert.strictEqual(res4.conforms, false);
    assert.ok(res4.results.some(r => r.resultPath === 'robos:startDate'));
    assert.ok(res4.results.some(r => r.resultPath === 'robos:endDate'));
  });

  it('3. Git Organization & Repository Hierarchy: validates Repo -> Branch -> PR -> Commit -> Tag', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-git-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // Register Git Repository
    const repoRes = store.registerGitRepository({
      slug: 'acme-payment-service',
      title: 'Payment Gateway Core Service',
      url: 'https://github.com/acme/payment-service',
      defaultBranch: 'main',
      organization: 'urn:robos:git-org:apache',
    });
    assert.strictEqual(repoRes.ok, true);

    // Register Git Branch
    const branchRes = store.registerGitBranch({
      branchName: 'feat/apple-pay-support',
      repository: repoRes.node['@id'],
    });
    assert.strictEqual(branchRes.ok, true);

    // Register Pull Request
    const prRes = store.registerPullRequest({
      prNumber: 314,
      title: 'feat: add Apple Pay token decryptor and validation suite',
      sourceBranch: branchRes.node['robos:branchName'],
      targetBranch: 'main',
      status: 'open',
      repository: repoRes.node['@id'],
    });
    assert.strictEqual(prRes.ok, true);

    // Check relations
    const repoChildren = store.getChildNodes(repoRes.node['@id']);
    assert.ok(repoChildren.some(c => c['@id'] === branchRes.node['@id']));

    // Negative validation for PR without targetBranch
    const validator = new SHACLValidator();
    const brokenPR = {
      '@id': 'urn:robos:pr:broken',
      '@type': ['robos:PullRequest'],
      'dcterms:title': 'Broken PR',
      'robos:prNumber': 999,
      'robos:sourceBranch': 'feat/test',
      'robos:status': 'open',
      // missing targetBranch
    };
    const brokenRes = validator.validate(brokenPR);
    assert.strictEqual(brokenRes.conforms, false);
    assert.ok(brokenRes.results.some(r => r.resultPath === 'robos:targetBranch'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('4. API Endpoints & Database Schemas: validates APIEndpoint and DatabaseTable', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-api-db-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // Register API Endpoint
    const epRes = store.registerAPIEndpoint({
      pathPattern: '/api/v1/orders/{orderId}/refund',
      httpMethod: 'POST',
      title: 'Issue order refund',
      service: 'urn:robos:service:forms-api',
    });
    assert.strictEqual(epRes.ok, true);
    assert.strictEqual(epRes.node['robos:httpMethod'], 'POST');

    const serviceEndpoints = store.getEndpointsForService('urn:robos:service:forms-api');
    assert.ok(serviceEndpoints.some(e => e['@id'] === epRes.node['@id']));

    // Register Database Table & Column
    const dbId = 'urn:robos:db:acme-orders-postgres';
    const tableRes = store.registerDatabaseTable({
      tableName: 'refund_transactions',
      title: 'Refund Transactions Table',
      database: dbId,
    });
    assert.strictEqual(tableRes.ok, true);

    const colRes = store.registerDatabaseColumn({
      columnName: 'refund_amount_cents',
      title: 'Refund Amount in Cents',
      dataType: 'bigint',
      table: tableRes.node['@id'],
    });
    assert.strictEqual(colRes.ok, true);

    const tables = store.getTablesForDatabase(dbId);
    assert.ok(tables.some(t => t['@id'] === tableRes.node['@id']));

    // Negative validation for APIEndpoint without httpMethod
    const validator = new SHACLValidator();
    const brokenEndpoint = {
      '@id': 'urn:robos:endpoint:broken',
      '@type': ['robos:APIEndpoint'],
      'dcterms:title': 'Broken Endpoint',
      'robos:pathPattern': '/api/v1/broken',
    };
    const epValidation = validator.validate(brokenEndpoint);
    assert.strictEqual(epValidation.conforms, false);
    assert.ok(epValidation.results.some(r => r.resultPath === 'robos:httpMethod'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('5. Message Broker & MCP Tool: registers MessageTopic and MCPTool', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-mcp-event-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // Register Topic
    const topicRes = store.registerMessageTopic({
      topicName: 'refund-dispatched-v1',
      title: 'Refund Dispatched Event Stream',
      broker: 'urn:robos:broker:acme-kafka',
    });
    assert.strictEqual(topicRes.ok, true);
    assert.strictEqual(topicRes.node['robos:topicName'], 'refund-dispatched-v1');

    // Register MCP Tool
    const toolRes = store.registerMCPTool({
      toolName: 'validate_refund_eligibility',
      title: 'Validate Customer Refund Eligibility',
      mcpServer: 'urn:robos:mcp:context-engine',
    });
    assert.strictEqual(toolRes.ok, true);
    assert.strictEqual(toolRes.node['robos:toolName'], 'validate_refund_eligibility');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('6. Cloud Infrastructure & CI/CD Stages: registers Kubernetes and Pipeline resources', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-cloud-ci-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // Register Namespace
    const nsRes = store.registerKubernetesNamespace({
      namespaceName: 'payments-prod',
      cluster: 'urn:robos:cluster:prod-us-east-eks',
    });
    assert.strictEqual(nsRes.ok, true);

    // Register Deployment
    const depRes = store.registerKubernetesDeployment({
      slug: 'payment-processor-dep',
      title: 'Payment Processor Daemon Deployment',
      namespace: nsRes.node['@id'],
      image: 'registry.acme.com/apps/payment-processor:v3.1.0',
    });
    assert.strictEqual(depRes.ok, true);

    // Register Pipeline Stage
    const stageRes = store.registerPipelineStage({
      stageName: 'security-compliance-scan',
      pipeline: 'urn:robos:pipeline:checkout-service-ci',
    });
    assert.strictEqual(stageRes.ok, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('7. Package Inferencing: accurately routes child schema entities to their respective package store', () => {
    const pkgManager = new KGraphPackageManager({ baseDir: path.join(os.tmpdir(), 'robos-test-pkg-infer') });

    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:Task'] }), 'organization');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:UserStory'] }), 'organization');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:Bug'] }), 'organization');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:Sprint'] }), 'organization');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:Milestone'] }), 'organization');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:GitRepository'] }), 'organization');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:GitBranch'] }), 'organization');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:PullRequest'] }), 'organization');

    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:APIEndpoint'] }), 'services');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:DataModel'] }), 'services');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:Feature'] }), 'services');

    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:DatabaseSchema'] }), 'core-platform');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:DatabaseTable'] }), 'core-platform');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:DatabaseColumn'] }), 'core-platform');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:MessageTopic'] }), 'core-platform');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:MCPTool'] }), 'core-platform');

    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:KubernetesNamespace'] }), 'devops');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:KubernetesDeployment'] }), 'devops');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:PipelineStage'] }), 'devops');

    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:LearningModule'] }), 'learning');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:HandsOnLab'] }), 'learning');

    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:DocSection'] }), 'documentation');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:ADROption'] }), 'documentation');

    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:WebRoute'] }), 'applications');
    assert.strictEqual(pkgManager.inferPackageForNode({ '@type': ['robos:CLICommand'] }), 'applications');
  });

});

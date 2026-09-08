'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const {
  KGraphResourceImporter,
  DEFAULT_MOCK_REGISTRY,
} = require('../../../robos-graph/lib/resource-importer');
const { SDLCKnowledgeGraphStore } = require('../../../robos-graph/index');
const { OSLC_CONTEXT } = require('../../../robos-graph/lib/oslc-parser');

describe('RobOS Universal KGraph Resource Importer Test Suite', () => {
  let tmpDir;
  let localMonorepoDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-resource-importer-test-'));

    // Create a local filesystem monorepo fixture with a service and local ADR
    localMonorepoDir = path.join(tmpDir, 'acme-legacy-monorepo');
    fs.mkdirSync(path.join(localMonorepoDir, 'services', 'inventory-service'), { recursive: true });
    fs.mkdirSync(path.join(localMonorepoDir, 'docs', 'adr'), { recursive: true });

    fs.writeFileSync(
      path.join(localMonorepoDir, 'services', 'inventory-service', 'package.json'),
      JSON.stringify({ name: 'inventory-service', version: '1.0.0' }, null, 2),
      'utf8'
    );

    fs.writeFileSync(
      path.join(localMonorepoDir, 'docs', 'adr', '001-monolith-decoupling.md'),
      '# ADR 001: Monolith Decoupling\n\nStatus: Accepted\n\nContext: Legacy monolith decoupling.',
      'utf8'
    );
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('intelligently analyzes a natural language agent prompt and extracts 5 heterogeneous resource types', () => {
    const importer = new KGraphResourceImporter({
      companyName: 'Acme Enterprise',
      companySlug: 'acme',
    });

    const userPrompt = `
      Please import the following infrastructure for Acme Global:
      1. Confluence wiki at https://confluence.acme.corp/display/ARCH
      2. GitHub organization https://github.com/acme-payments
      3. GitHub organization https://github.com/acme-identity
      4. Customer checkout API at https://github.com/acme-retail/checkout-api
      5. GitOps pipelines at https://gitlab.com/acme-devops/gitops-deployments
      6. Local filesystem codebase link at ${localMonorepoDir}
    `;

    const plan = importer.parsePrompt(userPrompt);

    assert.equal(plan.company.slug, 'acme-global');
    assert.equal(plan.summary.totalResources, 6);
    assert.equal(plan.summary.confluenceWikis, 1, 'Should find 1 Confluence wiki');
    assert.equal(plan.summary.githubOrgs, 2, 'Should find 2 GitHub organizations');
    assert.equal(plan.summary.githubRepos, 1, 'Should find 1 GitHub repo');
    assert.equal(plan.summary.gitlabRepos, 1, 'Should find 1 GitLab repo');
    assert.equal(plan.summary.filesystemLinks, 1, 'Should find 1 local filesystem link');

    const confluenceRes = plan.resources.find(r => r.type === 'confluence');
    assert.ok(confluenceRes);
    assert.equal(confluenceRes.spaceKey, 'ARCH');

    const orgs = plan.resources.filter(r => r.type === 'github-org').map(r => r.org);
    assert.ok(orgs.includes('acme-payments'));
    assert.ok(orgs.includes('acme-identity'));

    const gitlabRes = plan.resources.find(r => r.type === 'gitlab-repo');
    assert.ok(gitlabRes);
    assert.equal(gitlabRes.repo, 'gitops-deployments');
  });

  it('resolves Confluence wiki pages into DocumentationPage, ADR, and FlowDiagram with Mermaid text', async () => {
    const importer = new KGraphResourceImporter();
    const confluenceRes = {
      type: 'confluence',
      url: 'https://confluence.acme.corp/display/ARCH',
      hostname: 'confluence.acme.corp',
      spaceKey: 'ARCH',
    };

    const nodes = await importer.resolveConfluence(confluenceRes);
    assert.ok(nodes.length >= 3);

    // 1. DocumentationPage
    const docPage = nodes.find(n => n['@id'] === 'urn:robos:doc:acme-architecture-overview');
    assert.ok(docPage);
    assert.ok(docPage['@type'].includes('robos:DocumentationPage'));
    assert.equal(docPage['robos:package'], 'documentation');
    assert.equal(docPage['robos:namespace'], 'robos.docs');

    // 2. ADR
    const adrNode = nodes.find(n => n['@id'] === 'urn:robos:adr:004-event-driven-orders');
    assert.ok(adrNode);
    assert.ok(adrNode['@type'].includes('robos:ArchitectureDecisionRecord'));
    assert.equal(adrNode['robos:adrNumber'], 4);
    assert.equal(adrNode['robos:status'], 'accepted');
    assert.ok(adrNode['robos:decision'].includes('Apache Kafka'));

    // 3. FlowDiagram
    const flowNode = nodes.find(n => n['@id'] === 'urn:robos:diagram:checkout-payment-flow');
    assert.ok(flowNode);
    assert.ok(flowNode['@type'].includes('robos:FlowDiagram'));
    assert.equal(flowNode['robos:diagramType'], 'sequence');
    assert.ok(flowNode['robos:mermaidText'].includes('sequenceDiagram'));
    assert.ok(flowNode['robos:tooltip'].length > 0);
  });

  it('resolves GitHub organizations with GitProjectOrganization, agent rules, and member repos', async () => {
    const importer = new KGraphResourceImporter();
    const orgRes = {
      type: 'github-org',
      url: 'https://github.com/acme-payments',
      org: 'acme-payments',
    };

    const nodes = await importer.resolveGitHubOrg(orgRes);
    assert.ok(nodes.length >= 3);

    // Org Node
    const orgNode = nodes.find(n => n['@id'] === 'urn:robos:git-org:acme-payments');
    assert.ok(orgNode);
    assert.ok(orgNode['@type'].includes('robos:GitProjectOrganization'));
    assert.equal(orgNode['robos:orgName'], 'acme-payments');
    assert.ok(Array.isArray(orgNode['robos:agentRules']));
    assert.ok(orgNode['robos:agentRules'].some(r => r.includes('integer cents') || r.includes('mTLS')));
    assert.equal(orgNode['robos:package'], 'organization');

    // Member Repos
    const memberNodes = nodes.filter(n => n['robos:inOrganization'] === 'urn:robos:git-org:acme-payments');
    assert.ok(memberNodes.length >= 2);
    assert.ok(memberNodes.some(n => n['@id'].includes('payment-gateway')));
    assert.ok(memberNodes.some(n => n['@id'].includes('fraud-detector')));
  });

  it('resolves individual GitHub and GitLab URLs, generating OpenAPI contracts and routing packages', async () => {
    const importer = new KGraphResourceImporter();

    // GitHub Repo
    const ghNodes = await importer.resolveGitRepo({
      type: 'github-repo',
      url: 'https://github.com/acme-retail/checkout-api',
      org: 'acme-retail',
      repo: 'checkout-api',
    });
    assert.ok(ghNodes.some(n => n['@id'] === 'urn:robos:service:checkout-api'));
    assert.ok(ghNodes.some(n => n['@id'] === 'urn:robos:contract:checkout-api-v1'));

    // GitLab Repo
    const glNodes = await importer.resolveGitRepo({
      type: 'gitlab-repo',
      url: 'https://gitlab.com/acme-devops/gitops-deployments',
      org: 'acme-devops',
      repo: 'gitops-deployments',
    });
    const glPipeline = glNodes.find(n => n['robos:forgeType'] === 'gitlab');
    assert.ok(glPipeline);
    assert.equal(glPipeline['robos:package'], 'devops');
  });

  it('resolves local filesystem directories and ingests scanned codebases and local markdown ADRs', async () => {
    const importer = new KGraphResourceImporter({ companySlug: 'acme' });
    const fsNodes = await importer.resolveLocalFileSystem({
      type: 'filesystem',
      path: localMonorepoDir,
    });

    assert.ok(fsNodes.length >= 2);
    const localAdr = fsNodes.find(n => n['@id'] === 'urn:robos:adr:001-monolith-decoupling');
    assert.ok(localAdr, 'Must discover local ADR from docs/adr/001-monolith-decoupling.md');
    assert.ok(localAdr['@type'].includes('robos:ArchitectureDecisionRecord'));
    assert.equal(localAdr['robos:package'], 'documentation');
  });

  it('executes full end-to-end importFromPrompt and validates SHACL conformance', async () => {
    const importer = new KGraphResourceImporter();

    const fullPrompt = `
      Import all core infrastructure for Acme Global:
      - Confluence wiki: https://confluence.acme.corp/display/ARCH
      - Payment services org: https://github.com/acme-payments
      - Identity org: https://github.com/acme-identity
      - Checkout API: https://github.com/acme-retail/checkout-api
      - Deployment repo: https://gitlab.com/acme-devops/gitops-deployments
      - Legacy Monorepo: ${localMonorepoDir}
    `;

    const { plan, importResult, summary } = await importer.importFromPrompt(fullPrompt);

    assert.equal(plan.summary.totalResources, 6);
    assert.ok(summary.totalNodes >= 12);
    assert.ok(summary.organizations >= 2, 'Should have Git organizations');
    assert.ok(summary.documentationPages >= 1, 'Should have Confluence documentation page');
    assert.ok(summary.adrs >= 2, 'Should have Confluence & local ADRs');
    assert.ok(summary.flowDiagrams >= 1, 'Should have FlowDiagram');
    assert.ok(summary.contracts >= 3, 'Should generate OpenAPI contracts');

    // SHACL Conformance
    assert.strictEqual(summary.shacl.conforms, true, 'Imported graph must conform to SHACL shapes');
    assert.strictEqual(summary.shacl.violations, 0, 'Zero SHACL violations allowed');

    // Package breakdown check
    assert.ok(importResult.packageBreakdown.organization >= 3);
    assert.ok(importResult.packageBreakdown.services >= 5);
    assert.ok(importResult.packageBreakdown.devops >= 1);
    assert.ok(importResult.packageBreakdown.documentation >= 3);
  });

  it('integrates seamlessly with SDLCKnowledgeGraphStore.importFromPrompt', async () => {
    const storePath = path.join(tmpDir, 'store-test.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath: storePath });

    const result = await store.importFromPrompt(`
      Ingest https://github.com/acme-payments and Confluence at https://confluence.acme.corp/spaces/ARCH for Acme Global
    `);

    assert.ok(result.plan.summary.totalResources >= 2);
    assert.ok(result.summary.totalNodes >= 5);
    assert.strictEqual(result.summary.shacl.conforms, true);

    // Verify nodes are accessible in store
    const gitOrg = store.getNode('urn:robos:git-org:acme-payments');
    assert.ok(gitOrg, 'Store must contain ingested GitProjectOrganization');

    const flowDiagram = store.getNode('urn:robos:diagram:checkout-payment-flow');
    assert.ok(flowDiagram, 'Store must contain ingested FlowDiagram');
  });

  it('executes the CLI script with --prompt mode cleanly', () => {
    const scriptPath = path.join(__dirname, '../../../../plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js');
    const outPath = path.join(tmpDir, 'prompt-cli-output.jsonld');

    const stdout = execSync(
      `node "${scriptPath}" --prompt "Import Confluence https://confluence.acme.corp/display/ARCH and repo https://github.com/acme-retail/checkout-api" --output "${outPath}"`,
      { encoding: 'utf8' }
    );

    assert.match(stdout, /RobOS Agent Prompt Knowledge Graph Ingestion/);
    assert.match(stdout, /Agent Prompt Analysis Plan:/);
    assert.match(stdout, /Generated Knowledge Graph Summary:/);
    assert.match(stdout, /Saved company KGraph to:/);

    assert.ok(fs.existsSync(outPath));
    const saved = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(saved['@context'].robos, OSLC_CONTEXT.robos);
    assert.ok(saved['robos:nodes'].some(n => n['@id'] === 'urn:robos:service:checkout-api'));
    assert.ok(saved['robos:nodes'].some(n => n['@id'] === 'urn:robos:diagram:checkout-payment-flow'));
  });
});

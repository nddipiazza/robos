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
  KGraphPackageManager,
} = require('../../../robos-graph/index');

describe('RobOS GitProjectOrganization Schema, SHACL Validation & Agent Rules Inheritance', () => {

  it('validates canonical Apache organization node against GitProjectOrganizationShape', () => {
    const validator = new SHACLValidator();
    const pkgPath = path.resolve('.robos/kgraphs/organization/package.jsonld');
    assert.ok(fs.existsSync(pkgPath), 'organization package.jsonld must exist');

    const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const nodes = pkgData['robos:nodes'] || [];
    const apacheNode = nodes.find(n => n['@id'] === 'urn:robos:git-org:apache');
    assert.ok(apacheNode, 'urn:robos:git-org:apache node must exist in organization package');

    const validation = validator.validate(apacheNode);
    assert.strictEqual(validation.conforms, true, `Apache org node should conform to SHACL shapes: ${JSON.stringify(validation.violations)}`);
    assert.strictEqual(validation.violations.length, 0);

    // Verify metadata
    assert.strictEqual(apacheNode['robos:orgName'], 'apache');
    assert.strictEqual(apacheNode['robos:forgeType'], 'github');
    assert.strictEqual(apacheNode['robos:url'], 'https://github.com/apache');
    assert.ok(Array.isArray(apacheNode['robos:agentRules']));
    assert.strictEqual(apacheNode['robos:agentRules'].length, 4);

    // Verify documentation context
    assert.ok(apacheNode['robos:documentation']);
    assert.strictEqual(apacheNode['robos:documentation'].docsUrl || apacheNode['robos:documentation']['robos:docsUrl'], 'https://www.apache.org/dev/');
    assert.strictEqual(apacheNode['robos:documentation'].license || apacheNode['robos:documentation']['robos:license'], 'Apache-2.0');
    assert.ok(apacheNode['robos:documentation'].architectureGuidelines || apacheNode['robos:documentation']['robos:architectureGuidelines']);
  });

  it('enforces SHACL constraints on GitProjectOrganization and GitOrganization alias', () => {
    const validator = new SHACLValidator();

    // Valid with robos:GitProjectOrganization
    const valid1 = {
      '@id': 'urn:robos:git-org:test-org',
      '@type': ['oslc:ServiceProvider', 'robos:GitProjectOrganization'],
      'dcterms:title': 'Test Organization',
      'robos:url': 'https://github.com/test-org',
      'robos:orgName': 'test-org',
      'robos:forgeType': 'github',
    };
    const res1 = validator.validate(valid1);
    assert.strictEqual(res1.conforms, true);

    // Valid with robos:GitOrganization alias
    const valid2 = {
      '@id': 'urn:robos:git-org:alias-org',
      '@type': ['oslc:ServiceProvider', 'robos:GitOrganization'],
      'dcterms:title': 'Alias Org',
      'robos:url': 'https://gitlab.com/alias-org',
      'robos:orgName': 'alias-org',
      'robos:forgeType': 'gitlab',
    };
    const res2 = validator.validate(valid2);
    assert.strictEqual(res2.conforms, true);

    // Missing title
    const invalidTitle = {
      '@id': 'urn:robos:git-org:bad-title',
      '@type': ['robos:GitProjectOrganization'],
      'robos:url': 'https://github.com/bad-title',
      'robos:orgName': 'bad-title',
      'robos:forgeType': 'github',
    };
    const resTitle = validator.validate(invalidTitle);
    assert.strictEqual(resTitle.conforms, false);
    assert.ok(resTitle.violations.some(v => v.path === 'dcterms:title'));

    // Missing robos:url
    const invalidUrl = {
      '@id': 'urn:robos:git-org:bad-url',
      '@type': ['robos:GitProjectOrganization'],
      'dcterms:title': 'Bad URL Org',
      'robos:orgName': 'bad-url',
      'robos:forgeType': 'github',
    };
    const resUrl = validator.validate(invalidUrl);
    assert.strictEqual(resUrl.conforms, false);
    assert.ok(resUrl.violations.some(v => v.path === 'robos:url'));

    // Missing robos:orgName
    const invalidOrgName = {
      '@id': 'urn:robos:git-org:bad-org',
      '@type': ['robos:GitProjectOrganization'],
      'dcterms:title': 'Bad Org Name',
      'robos:url': 'https://github.com/bad-org',
      'robos:forgeType': 'github',
    };
    const resOrgName = validator.validate(invalidOrgName);
    assert.strictEqual(resOrgName.conforms, false);
    assert.ok(resOrgName.violations.some(v => v.path === 'robos:orgName'));

    // Missing robos:forgeType
    const invalidForge = {
      '@id': 'urn:robos:git-org:bad-forge',
      '@type': ['robos:GitProjectOrganization'],
      'dcterms:title': 'Bad Forge',
      'robos:url': 'https://github.com/bad-forge',
      'robos:orgName': 'bad-forge',
    };
    const resForge = validator.validate(invalidForge);
    assert.strictEqual(resForge.conforms, false);
    assert.ok(resForge.violations.some(v => v.path === 'robos:forgeType'));
  });

  it('creates, stores, and looks up GitProjectOrganization via SDLCKnowledgeGraphStore', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-git-org-test-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath, rootDir: tmpDir });

    const createRes = store.createGitProjectOrganization({
      orgName: 'my-tech-corp',
      url: 'https://github.com/my-tech-corp',
      title: 'My Tech Corporation',
      description: 'Enterprise open-source tools and infrastructure',
      forgeType: 'github',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345678',
      defaultBranch: 'main',
      memberCount: 85,
      repoCount: 42,
      hasRepository: [
        'https://github.com/my-tech-corp/core-api',
        'https://github.com/my-tech-corp/web-portal',
      ],
      documentation: {
        'robos:docsUrl': 'https://docs.mytechcorp.io',
        'robos:docsPaths': ['docs/', 'README.md'],
        'robos:architectureGuidelines': ['Microservices must implement OpenAPI 3.1 contracts'],
        'robos:license': 'MIT',
      },
      agentRules: [
        {
          ruleId: 'RULE-CORP-001',
          title: 'Semantic Commit Hygiene',
          severity: 'error',
          description: 'All commit messages must adhere to Conventional Commits specification.',
          enforcement: 'pre-commit-hook',
        },
      ],
    });

    assert.strictEqual(createRes.ok, true, 'createGitProjectOrganization must succeed');
    const orgNode = createRes.node;
    assert.ok(orgNode, 'Should create org node');
    assert.strictEqual(orgNode['@id'], 'urn:robos:git-org:my-tech-corp');
    assert.strictEqual(orgNode['robos:package'], 'organization');
    assert.strictEqual(orgNode['robos:orgName'], 'my-tech-corp');
    assert.strictEqual(orgNode['robos:forgeType'], 'github');

    // Retrieve via list
    const allOrgs = store.getGitProjectOrganizations();
    assert.ok(allOrgs.some(o => o['@id'] === 'urn:robos:git-org:my-tech-corp'));

    // Retrieve by slug
    const bySlug = store.getGitProjectOrganization('my-tech-corp');
    assert.ok(bySlug);
    assert.strictEqual(bySlug['dcterms:title'], 'My Tech Corporation');

    // Retrieve by URI
    const byUri = store.getGitProjectOrganization('urn:robos:git-org:my-tech-corp');
    assert.ok(byUri);
    assert.strictEqual(byUri['@id'], 'urn:robos:git-org:my-tech-corp');

    // Retrieve by URL
    const byUrl = store.getGitProjectOrganization('https://github.com/my-tech-corp');
    assert.ok(byUrl);
    assert.strictEqual(byUrl['@id'], 'urn:robos:git-org:my-tech-corp');

    // Retrieve unknown
    assert.strictEqual(store.getGitProjectOrganization('non-existent'), null);
  });

  it('adds agent rules to organization and verifies inheritance for member repositories', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-org-rules-test-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath, rootDir: tmpDir });

    // 1. Create Organization
    store.createGitProjectOrganization({
      orgName: 'acme-cloud',
      url: 'https://github.com/acme-cloud',
      title: 'ACME Cloud Services',
      forgeType: 'github',
      documentation: {
        'robos:docsUrl': 'https://docs.acmecloud.internal',
        'robos:architectureGuidelines': ['All APIs must log in JSON with correlation IDs'],
      },
      agentRules: [
        {
          ruleId: 'ACME-SEC-001',
          title: 'Secret Leak Prevention',
          severity: 'critical',
          description: 'Never commit credentials or tokens to git repositories.',
        },
      ],
    });

    // 2. Add second rule to organization
    const addRuleRes = store.addAgentRuleToOrganization('acme-cloud', {
      ruleId: 'ACME-CODE-002',
      title: 'Mandatory Unit Test Coverage',
      severity: 'error',
      description: 'Minimum 80% test coverage required for all pull requests.',
      enforcement: 'ci-pipeline',
    });
    assert.strictEqual(addRuleRes.ok, true, 'addAgentRuleToOrganization must return ok: true');
    const addedRule = addRuleRes.rule;
    assert.ok(addedRule);
    assert.strictEqual(addedRule.ruleId, 'ACME-CODE-002');

    // 3. Verify effective rules inheritance by GitHub URL pattern
    const rulesByUrl = store.getEffectiveAgentRulesForRepository('https://github.com/acme-cloud/billing-service');
    assert.strictEqual(rulesByUrl.length, 2, 'Repository should inherit 2 organization agent rules');
    assert.ok(rulesByUrl.some(r => r.ruleId === 'ACME-SEC-001'));
    assert.ok(rulesByUrl.some(r => r.ruleId === 'ACME-CODE-002'));

    // 4. Verify documentation inheritance by GitHub URL pattern
    const docsByUrl = store.getEffectiveDocumentationForRepository('https://github.com/acme-cloud/billing-service');
    assert.ok(docsByUrl);
    assert.strictEqual(docsByUrl.docsUrl || docsByUrl['robos:docsUrl'], 'https://docs.acmecloud.internal');

    // 5. Register a repository node linked with robos:inOrganization
    store.addNode({
      '@id': 'urn:robos:service:billing-service',
      '@type': ['robos:Microservice', 'oslc:Resource'],
      'dcterms:title': 'Billing Microservice',
      'robos:repository': 'https://custom-git.internal/acme-cloud/billing-service',
      'robos:ownerTeam': 'urn:robos:team:cloud-platform',
      'robos:inOrganization': 'urn:robos:git-org:acme-cloud',
    });

    // Verify inheritance via URI node lookup
    const rulesByUri = store.getEffectiveAgentRulesForRepository('urn:robos:service:billing-service');
    assert.strictEqual(rulesByUri.length, 2);

    const docsByUri = store.getEffectiveDocumentationForRepository('urn:robos:service:billing-service');
    assert.ok(docsByUri);
    assert.strictEqual(docsByUri.docsUrl || docsByUri['robos:docsUrl'], 'https://docs.acmecloud.internal');

    // 6. Test repository with no organization
    const emptyRules = store.getEffectiveAgentRulesForRepository('https://github.com/unaffiliated-user/solo-repo');
    assert.deepStrictEqual(emptyRules, []);
    const emptyDocs = store.getEffectiveDocumentationForRepository('https://github.com/unaffiliated-user/solo-repo');
    assert.strictEqual(emptyDocs, null);
  });

  it('routes GitProjectOrganization nodes to organization package in KGraphPackageManager', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-pkg-mgr-test-'));
    const pm = new KGraphPackageManager({ baseDir: tmpDir });

    const orgNode = {
      '@id': 'urn:robos:git-org:hyper-org',
      '@type': ['oslc:ServiceProvider', 'robos:GitProjectOrganization'],
      'dcterms:title': 'Hyper Org',
      'robos:url': 'https://github.com/hyper-org',
      'robos:orgName': 'hyper-org',
      'robos:forgeType': 'github',
    };

    pm.upsertNode(orgNode);
    pm.saveDirtyPackages();

    // Check file on disk
    const orgPkgFile = path.join(tmpDir, 'kgraphs', 'organization', 'package.jsonld');
    assert.ok(fs.existsSync(orgPkgFile), 'organization/package.jsonld must be created');

    const pkgContent = JSON.parse(fs.readFileSync(orgPkgFile, 'utf8'));
    assert.ok(pkgContent['robos:nodes'].some(n => n['@id'] === 'urn:robos:git-org:hyper-org'));

    // Check aggregated file
    const aggFile = path.join(tmpDir, 'knowledge-graph.jsonld');
    assert.ok(fs.existsSync(aggFile), 'knowledge-graph.jsonld must be created');
    const aggContent = JSON.parse(fs.readFileSync(aggFile, 'utf8'));
    assert.ok(aggContent['robos:nodes'].some(n => n['@id'] === 'urn:robos:git-org:hyper-org'));
  });

});

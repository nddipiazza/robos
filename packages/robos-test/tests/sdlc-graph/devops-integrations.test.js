'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  KGraphPackageManager,
  DevOpsIntegrationManager,
  DEVOPS_CATEGORIES,
  DEVOPS_PROVIDERS,
} = require('../../../robos-graph/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('DevOps Integrations & GPG Password Store (Epic 2) Test Suite', () => {
  it('supplies full catalog covering all 7 categories and major providers', () => {
    const mgr = new DevOpsIntegrationManager();
    const categories = mgr.getCategories();
    assert.strictEqual(categories.length, 7, 'Must provide all 7 major categories');

    const catIds = categories.map(c => c.id);
    assert.ok(catIds.includes('source-control') || catIds.includes('source_control'), 'Must include source-control');
    assert.ok(catIds.includes('cloud'), 'Must include cloud');
    assert.ok(catIds.includes('ci-cd') || catIds.includes('cicd'), 'Must include ci-cd');
    assert.ok(catIds.includes('registry') || catIds.includes('registries'), 'Must include registry');
    assert.ok(catIds.includes('containers'), 'Must include containers');
    assert.ok(catIds.includes('oauth'), 'Must include oauth');
    assert.ok(catIds.includes('dns'), 'Must include dns');

    // Check specific required providers
    assert.ok(mgr.getProvider('github'), 'GitHub must exist');
    assert.ok(mgr.getProvider('gitlab'), 'GitLab must exist');
    assert.ok(mgr.getProvider('bitbucket'), 'Bitbucket must exist');
    assert.ok(mgr.getProvider('aws'), 'AWS must exist');
    assert.ok(mgr.getProvider('gcp'), 'GCP must exist');
    assert.ok(mgr.getProvider('azure'), 'Azure must exist');
    assert.ok(mgr.getProvider('openshift'), 'OpenShift must exist');
    assert.ok(mgr.getProvider('jenkins'), 'Jenkins must exist');
    assert.ok(mgr.getProvider('artifactory'), 'Artifactory must exist');
    assert.ok(mgr.getProvider('docker'), 'Docker Hub must exist');
    assert.ok(mgr.getProvider('podman'), 'Podman must exist');
    assert.ok(mgr.getProvider('kubernetes'), 'Kubernetes must exist');
    assert.ok(mgr.getProvider('vmware'), 'VMware must exist');
    assert.ok(mgr.getProvider('okta'), 'Okta must exist');
    assert.ok(mgr.getProvider('godaddy'), 'GoDaddy must exist');
  });

  it('securely encrypts secrets into pass and creates referenced PassCredential nodes with zero plaintext in KGraph', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-devops-test-'));
    const pkgMgr = new KGraphPackageManager({ rootDir: tmpDir });
    const devopsMgr = new DevOpsIntegrationManager({ packageManager: pkgMgr });

    // Save an AWS integration with credentials
    const saveRes = devopsMgr.saveIntegration({
      providerId: 'aws',
      accountSlug: 'test-production-aws',
      formValues: {
        accountTitle: 'Production AWS Cloud',
        region: 'us-east-1',
        accessKeyId: 'AKIA_EXAMPLE_12345678',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: 'MOCK_SESSION_TOKEN_XYZ',
      },
      packageManager: pkgMgr,
    });

    assert.strictEqual(saveRes.ok, true);
    assert.strictEqual(saveRes.passPaths.length, 2, 'Must create 2 pass paths for secretAccessKey and sessionToken');
    assert.strictEqual(saveRes.credentialNodes.length, 2, 'Must create 2 credential reference nodes');

    // 1. Verify Integration Node in devops package
    const integrationNode = pkgMgr.getNode('urn:robos:devops:cloud:aws:test-production-aws');
    assert.ok(integrationNode, 'Integration node must exist in package manager');
    assert.strictEqual(integrationNode['robos:package'], 'devops');
    assert.strictEqual(integrationNode['robos:category'], 'cloud');
    assert.strictEqual(integrationNode['robos:provider'], 'aws');

    // CRITICAL SECURITY ASSERTION: Secret values must NEVER exist in the KGraph integration node
    const serializedIntegration = JSON.stringify(integrationNode);
    assert.ok(!serializedIntegration.includes('wJalrXUtnFEMI'), 'Plaintext secretAccessKey must NEVER be saved in KGraph');
    assert.ok(!serializedIntegration.includes('MOCK_SESSION_TOKEN'), 'Plaintext sessionToken must NEVER be saved in KGraph');

    // 2. Verify PassCredential Reference Nodes
    const credNodeId = 'urn:robos:pass:devops:cloud:aws:test-production-aws:secretAccessKey';
    const credNode = pkgMgr.getNode(credNodeId);
    assert.ok(credNode, 'PassCredential node must exist in KGraph');
    assert.strictEqual(credNode['robos:package'], 'devops');
    assert.strictEqual(credNode['robos:passPath'], 'devops/cloud/aws/test-production-aws/secretAccessKey');
    assert.strictEqual(credNode['robos:managedByPass'], true);

    const serializedCred = JSON.stringify(credNode);
    assert.ok(!serializedCred.includes('wJalrXUtnFEMI'), 'Plaintext secret must NEVER be saved in PassCredential node');

    // 3. Verify pass storage file on disk
    const passDir = path.join(os.homedir(), '.password-store');
    const secretFile = path.join(passDir, 'devops', 'cloud', 'aws', 'test-production-aws', 'secretAccessKey.gpg');
    assert.ok(fs.existsSync(secretFile), `Pass encrypted file must exist at ${secretFile}`);

    // 4. Test connection
    const testRes = await devopsMgr.testConnection({
      providerId: 'aws',
      formValues: { region: 'us-east-1', accessKeyId: 'AKIA_123', secretAccessKey: 'sec' },
    });
    assert.strictEqual(testRes.ok, true);
    assert.strictEqual(testRes.authenticated, true);

    // 5. Clean up / Delete integration
    const delRes = devopsMgr.deleteIntegration('urn:robos:devops:cloud:aws:test-production-aws', pkgMgr);
    assert.strictEqual(delRes.ok, true);
    assert.strictEqual(pkgMgr.getNode('urn:robos:devops:cloud:aws:test-production-aws'), null);
    assert.strictEqual(pkgMgr.getNode(credNodeId), null);
    assert.ok(!fs.existsSync(secretFile), 'Pass file must be deleted upon integration removal');
  });

  it('provides end-to-end integration via SDLCKnowledgeGraphStore and robos-graph UI modal', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-devops-store-'));
    const store = new SDLCKnowledgeGraphStore({ rootDir: tmpDir });

    // Check categories and providers
    const cats = store.getDevOpsCategories();
    assert.strictEqual(cats.length, 7);

    // Save GitHub integration via store
    const saveRes = store.saveDevOpsIntegration({
      providerId: 'github',
      accountSlug: 'e2e-github',
      formValues: {
        accountTitle: 'E2E GitHub Account',
        token: 'ghp_MOCKTOKENFORTESTING1234567890',
        defaultOwner: 'acme-org',
      },
    });
    assert.strictEqual(saveRes.ok, true);

    const integrations = store.listDevOpsIntegrations();
    assert.strictEqual(integrations.length, 1);
    assert.strictEqual(integrations[0]['dcterms:title'], 'E2E GitHub Account');

    // Launch GUI Harness and interact with DevOps modal
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');

      // 1. Open DevOps Modal
      await evalJS(app.port, 'window.openDevOpsModal()');
      await new Promise(r => setTimeout(r, 400));

      const modalDisplay = await evalJS(app.port, 'document.getElementById("devops-modal").style.display');
      assert.strictEqual(modalDisplay, 'flex', 'DevOps modal must be opened');

      // 2. Switch to Onboarding Wizard
      await evalJS(app.port, 'window.showDevOpsWizardView()');
      await new Promise(r => setTimeout(r, 400));

      const wizardDisplay = await evalJS(app.port, 'document.getElementById("devops-wizard-view").style.display');
      assert.strictEqual(wizardDisplay, 'block', 'Wizard view must be active');

      // Check category pills & provider cards
      const categoryPillsText = await evalJS(app.port, 'document.getElementById("wizard-category-pills").textContent');
      assert.ok(categoryPillsText.includes('Source Control'));
      assert.ok(categoryPillsText.includes('Cloud Infrastructure') || categoryPillsText.includes('Cloud'));

      // 3. Select GitLab Provider
      await evalJS(app.port, `window.selectDevOpsProvider('gitlab')`);
      await new Promise(r => setTimeout(r, 400));

      const formDisplay = await evalJS(app.port, 'document.getElementById("wizard-config-form").style.display');
      assert.strictEqual(formDisplay, 'block', 'Config form must be visible');

      // 4. Fill in GitLab config form
      await evalJS(app.port, `
        const slugEl = document.getElementById('devops-field-accountSlug');
        if (slugEl) slugEl.value = 'acme-gitlab';
        const titleEl = document.getElementById('devops-field-accountTitle');
        if (titleEl) titleEl.value = 'Acme Corp GitLab';
        const tokenEl = document.getElementById('devops-field-personalAccessToken') || document.getElementById('devops-field-token');
        if (tokenEl) tokenEl.value = 'glpat-MOCKTOKEN987654321';
      `);

      // 5. Test Connection
      await evalJS(app.port, 'window.testCurrentDevOpsForm()');
      await new Promise(r => setTimeout(r, 300));

      const statusText = await evalJS(app.port, 'document.getElementById("wizard-form-status").textContent');
      assert.ok(statusText.includes('Successfully connected') || statusText.includes('verified'), 'Connection test should report success');

      // 6. Save Integration
      await evalJS(app.port, 'window.saveCurrentDevOpsForm()');
      await new Promise(r => setTimeout(r, 600));

      // 7. Verify active view lists the integration
      const activeListText = await evalJS(app.port, 'document.getElementById("devops-integrations-list").textContent');
      assert.ok(activeListText.includes('Acme Corp GitLab'), 'Newly onboarded integration must appear in active view');
      assert.ok(activeListText.includes('GPG'), 'Pass credential indicator must be shown');

      // 8. Close modal and check sidebar node list
      await evalJS(app.port, 'window.closeDevOpsModal()');
      const nodesText = await evalJS(app.port, 'document.getElementById("nodes-list").textContent');
      assert.ok(nodesText.includes('Acme Corp GitLab'), 'New integration must appear in Knowledge Graph nodes list');

      // 9. Clean up via delete
      await store.deleteDevOpsIntegration('urn:robos:devops:source_control:gitlab:acme-gitlab');
      await store.deleteDevOpsIntegration('urn:robos:devops:source_control:github:e2e-github');
    } finally {
      await killApp(app);
    }
  });
});

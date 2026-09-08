'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  KGraphPackageManager,
  KGraphRepoManager,
  DEFAULT_PACKAGES,
} = require('../../../robos-graph/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Multi-Package & Multi-Repo Knowledge Graph (Epic 1) Test Suite', () => {
  it('initializes standard RobOS packages and namespaces correctly', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-pkg-'));
    const pkgMgr = new KGraphPackageManager({ rootDir: tmpDir });

    const packages = pkgMgr.listPackages();
    assert.strictEqual(packages.length, 6, 'Should supply all 6 standard packages');

    const expectedIds = ['core-platform', 'organization', 'services', 'applications', 'devops', 'learning'];
    for (const id of expectedIds) {
      const pkg = pkgMgr.getPackage(id);
      assert.ok(pkg, `Package "${id}" must exist`);
      assert.strictEqual(pkg.id, id);
      assert.ok(pkg.namespace.startsWith('robos.'), `Namespace "${pkg.namespace}" should start with robos.`);
      assert.ok(fs.existsSync(pkg.filePath), `Package file must exist on disk: ${pkg.filePath}`);
    }
  });

  it('routes and tags nodes into their respective packages and preserves aggregated view', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-route-'));
    const pkgMgr = new KGraphPackageManager({ rootDir: tmpDir });

    // Add a service node
    const serviceNode = {
      '@id': 'urn:robos:service:billing-api',
      '@type': ['oslc_am:Resource', 'robos:Microservice'],
      'dcterms:title': 'Billing API Service',
      'robos:technology': 'Go 1.22 / Gin',
      'robos:repository': 'github.com/acme/billing-api',
    };
    pkgMgr.upsertNode(serviceNode);

    // Add an application node
    const appNode = {
      '@id': 'urn:robos:app:billing-portal',
      '@type': ['oslc_am:Resource', 'robos:FrontEndApp'],
      'dcterms:title': 'Billing Web Portal',
      'robos:framework': 'React 19 / Vite',
    };
    pkgMgr.upsertNode(appNode);

    // Add a devops node
    const devopsNode = {
      '@id': 'urn:robos:devops:github:enterprise',
      '@type': ['oslc_config:ConfigurationItem', 'robos:DevOpsIntegration'],
      'dcterms:title': 'GitHub Enterprise Server',
    };
    pkgMgr.upsertNode(devopsNode);

    // Verify routing and tag assignment
    const savedService = pkgMgr.getNode('urn:robos:service:billing-api');
    assert.strictEqual(savedService['robos:package'], 'services', 'Service node must route to services package');

    const savedApp = pkgMgr.getNode('urn:robos:app:billing-portal');
    assert.strictEqual(savedApp['robos:package'], 'applications', 'App node must route to applications package');

    const savedDevops = pkgMgr.getNode('urn:robos:devops:github:enterprise');
    assert.strictEqual(savedDevops['robos:package'], 'devops', 'DevOps node must route to devops package');

    // Save packages and inspect disk
    pkgMgr.saveDirtyPackages();

    const servicesPkgFile = path.join(tmpDir, 'kgraphs', 'services', 'package.jsonld');
    const servicesJson = JSON.parse(fs.readFileSync(servicesPkgFile, 'utf8'));
    assert.ok(servicesJson['@graph'].some(n => n['@id'] === 'urn:robos:service:billing-api'), 'Billing API must be in services package.jsonld');

    const aggregatedFile = path.join(tmpDir, 'knowledge-graph.jsonld');
    assert.ok(fs.existsSync(aggregatedFile), 'Aggregated knowledge-graph.jsonld must be maintained for backward compatibility');
    const aggJson = JSON.parse(fs.readFileSync(aggregatedFile, 'utf8'));
    assert.ok(aggJson['@graph'].some(n => n['@id'] === 'urn:robos:service:billing-api'));
    assert.ok(aggJson['@graph'].some(n => n['@id'] === 'urn:robos:app:billing-portal'));
    assert.ok(aggJson['@graph'].some(n => n['@id'] === 'urn:robos:devops:github:enterprise'));
  });

  it('manages multi-repo registry, semver git tags, and remote dependency caching', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-repos-'));
    const repoMgr = new KGraphRepoManager({ rootDir: tmpDir });

    // 1. Initial repo list has local default
    const initialRepos = repoMgr.listRepos();
    assert.strictEqual(initialRepos.length, 1);
    assert.strictEqual(initialRepos[0].id, 'local');
    assert.strictEqual(initialRepos[0].type, 'local');

    // 2. Add remote repository with git tag versioning
    const addRes = repoMgr.addRepo({
      id: 'acme-enterprise-kgraph',
      name: 'Acme Enterprise Master KGraph',
      url: 'https://github.com/acme/enterprise-kgraph',
      tag: 'v2.4.1',
    });
    assert.strictEqual(addRes.ok, true);
    assert.strictEqual(addRes.repo.id, 'acme-enterprise-kgraph');
    assert.strictEqual(addRes.repo.tag, 'v2.4.1');
    assert.strictEqual(addRes.repo.version, '2.4.1');
    assert.strictEqual(addRes.repo.type, 'remote');

    // 3. Sync remote repository into local cache
    const syncRes = await repoMgr.syncRemoteRepo('acme-enterprise-kgraph');
    assert.strictEqual(syncRes.ok, true);
    assert.ok(syncRes.cacheDir.includes('acme-enterprise-kgraph@v2.4.1'), 'Cache directory must reflect repo and git tag');
    assert.ok(fs.existsSync(syncRes.cacheDir), 'Cache directory must exist');
    assert.ok(fs.existsSync(path.join(syncRes.cacheDir, 'kgraph.yaml')), 'Remote kgraph manifest must be cached');

    // 4. Remote packages can be resolved from cache
    const cachedPackages = repoMgr.getCachedPackages('acme-enterprise-kgraph');
    assert.ok(Array.isArray(cachedPackages));
    assert.ok(cachedPackages.length > 0, 'Should load remote cached packages');

    // 5. Remove remote repo
    const removeRes = repoMgr.removeRepo('acme-enterprise-kgraph');
    assert.strictEqual(removeRes.ok, true);
    assert.strictEqual(repoMgr.listRepos().length, 1);
  });

  it('integrates seamlessly with SDLCKnowledgeGraphStore and GUI packages modal', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kgraph-store-'));
    const store = new SDLCKnowledgeGraphStore({ rootDir: tmpDir });

    // Verify packages
    const pkgs = store.listPackages();
    assert.strictEqual(pkgs.length, 6);

    // Verify repos
    const repos = store.listRepos();
    assert.strictEqual(repos.length, 1);
    assert.strictEqual(repos[0].id, 'local');

    // Register external repo via store
    const addRepoRes = store.addRepo({
      id: 'cloud-contracts',
      name: 'Cloud Infrastructure Contracts',
      url: 'https://github.com/acme/cloud-contracts',
      tag: 'v1.0.0',
    });
    assert.strictEqual(addRepoRes.ok, true);
    assert.strictEqual(store.listRepos().length, 2);

    // Now test GUI Harness interaction
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug port should be allocated');

      // 1. Open Packages & Repos Modal
      await evalJS(app.port, 'window.openPackagesModal()');
      await new Promise(r => setTimeout(r, 400));

      const modalDisplay = await evalJS(app.port, 'document.getElementById("packages-modal").style.display');
      assert.strictEqual(modalDisplay, 'flex', 'Packages modal must be displayed');

      // 2. Check Package Cards
      const pkgsText = await evalJS(app.port, 'document.getElementById("packages-list-grid").textContent');
      assert.ok(pkgsText.includes('core-platform'), 'Should list core-platform package');
      assert.ok(pkgsText.includes('devops'), 'Should list devops package');
      assert.ok(pkgsText.includes('applications'), 'Should list applications package');

      // 3. Check Repos Grid
      const reposText = await evalJS(app.port, 'document.getElementById("repos-list-grid").textContent');
      assert.ok(reposText.includes('local'), 'Should list default local workspace repo');

      // 4. Test Adding a new repo via modal
      await evalJS(app.port, `
        document.getElementById('new-repo-id').value = 'e2e-external-repo';
        document.getElementById('new-repo-name').value = 'E2E External Repository';
        document.getElementById('new-repo-url').value = 'https://github.com/acme/external-spec';
        document.getElementById('new-repo-tag').value = 'v1.5.0';
      `);
      await evalJS(app.port, 'window.addNewRepo()');
      await new Promise(r => setTimeout(r, 600));

      const updatedReposText = await evalJS(app.port, 'document.getElementById("repos-list-grid").textContent');
      assert.ok(updatedReposText.includes('e2e-external-repo'), 'Newly added repo must appear in repos grid');
      assert.ok(updatedReposText.includes('v1.5.0'), 'Git tag must appear in repos grid');

      // 5. Test package filter in sidebar
      await evalJS(app.port, 'window.closePackagesModal()');
      await evalJS(app.port, `
        const select = document.getElementById('node-package-filter');
        select.value = 'services';
        select.dispatchEvent(new Event('change'));
      `);
      await new Promise(r => setTimeout(r, 300));

      const filteredCount = await evalJS(app.port, 'document.querySelectorAll("#nodes-list .node-item").length');
      assert.ok(filteredCount > 0, 'Services package nodes should be rendered');
    } finally {
      await killApp(app);
    }
  });
});

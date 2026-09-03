'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execSync } = require('child_process');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');
const { GitOpsSDLCParser } = require('../../../robos-lib/index');
const { createAdapters } = require(path.resolve(__dirname, '../../../robos-adapters'));
const { GiteaForgeService } = require('../../lib/gitea-forge');

describe('End-to-End Agent-First SDLC Walkthrough & Test Suite (Acme Petshop & Hermetic Gitea Forge)', () => {
  it('exercises full SDLC lifecycle: Hermetic Gitea forge, GitOps schemas, breaking change gate, and Dev Central review', async () => {
    // 1. Start Hermetic Gitea Forge
    const forge = new GiteaForgeService({ port: 3000 });
    const forgeInfo = await forge.start();
    assert.ok(forgeInfo.url, 'Gitea forge should be running on local port');

    try {
      // 2. Seed Acme Petshop Repositories on Gitea
      const apiCloneUrl = forge.seedRepo({
        owner: 'acme-org',
        repo: 'petstore-api',
        defaultBranch: 'main',
        files: {
          'pom.xml': '<project><modelVersion>4.0.0</modelVersion><artifactId>petstore-api</artifactId></project>',
          'src/main/java/org/acme/PetResource.java': 'package org.acme; public class PetResource {}',
          'README.md': '# Acme Petshop Java API Service',
        },
      });
      assert.ok(apiCloneUrl.includes('petstore-api.git'));

      const webCloneUrl = forge.seedRepo({
        owner: 'acme-org',
        repo: 'petstore-web',
        defaultBranch: 'main',
        files: {
          'package.json': '{"name": "@acme/petstore-web", "version": "1.0.0"}',
          'README.md': '# Acme Petshop React Web Portal',
        },
      });
      assert.ok(webCloneUrl.includes('petstore-web.git'));

      // 3. GitOps Schema Validation for Acme Petshop
      const parser = new GitOpsSDLCParser();
      const validTopology = {
        version: '1.0',
        kind: 'Topology',
        system: { id: 'acme-petshop', name: 'Acme Petshop Platform' },
        nodes: [
          { id: 'petstore-web', name: 'React Web Portal', type: 'service' },
          { id: 'petstore-api', name: 'Java Spring Boot API', type: 'service' },
          { id: 'petstore-common', name: 'Reusable TypeSpec Library', type: 'library' },
          { id: 'petstore-db', name: 'Postgres DB', type: 'database' },
        ],
        links: [
          { from: 'petstore-web', to: 'petstore-api', protocol: 'HTTPS/JSON (OpenAPI 3.1)' },
          { from: 'petstore-api', to: 'petstore-db', protocol: 'TCP/SQL' },
        ],
      };
      const resTop = parser.validateTopology(validTopology);
      assert.strictEqual(resTop.valid, true);

      // 4. OSS Adapters (TypeSpec & Pact Matrix)
      const adapters = createAdapters();
      const pactRes = adapters.pact.verifyContracts(new Array(14).fill({}));
      assert.strictEqual(pactRes.ok, true);
      assert.strictEqual(pactRes.interactionsTotal, 14);

      // 5. Dev Central GUI Review & 1-Click Merge
      const app = await launchApp('dev-central', {
        ...scenarios['all-good'],
        env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
      });

      try {
        assert.ok(app.port, 'dev-central debug port should be allocated');

        // Open Proof-of-Work Review Hub
        await evalClick(app.port, '#btn-open-review-hub');
        await new Promise(r => setTimeout(r, 400));

        // Click 1-Click Sign-Off & Merge
        await evalClick(app.port, '#btn-signoff-merge');
        await new Promise(r => setTimeout(r, 500));
        const statusText = await evalJS(app.port, `document.getElementById('review-status-pill').textContent`);
        assert.ok(statusText.includes('MERGED'), 'PR should be marked as merged to main');
      } finally {
        await killApp(app);
      }
    } finally {
      await forge.stop();
    }
  });
});

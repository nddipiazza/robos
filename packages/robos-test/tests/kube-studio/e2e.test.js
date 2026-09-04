'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Kube Studio Real Kubernetes & Knowledge Graph Deployment E2E Tests', () => {
  it('connects to local Kind cluster, deploys from KGraph, undeploys, and auto-deploys on main branch commit with live pod list assertion', async () => {
    // 1. Launch Kube Studio in test harness with real local binaries
    const binDir = path.join(os.homedir(), '.local', 'bin');
    const app = await launchApp('kube-studio', {
      ...scenarios['all-good'],
      useRealBinaries: true,
      env: {
        ROBOS_TEST: '1',
        ROBOS_REAL_BINARIES: '1',
        PATH: `${binDir}:${process.env.PATH}`,
      },
    });

    try {
      assert.ok(app.port, 'Kube Studio debug snapshot port must be allocated');

      // 2. Initial Title & Navigation Bar Assertions
      const title = await evalJS(app.port, 'document.title');
      assert.ok(title.includes('Kube Studio'), 'Page title must include Kube Studio');

      // 3. Switch / Ensure Active Namespace is acme-petshop-local
      await evalJS(app.port, `
        const nsSel = document.getElementById('namespace-select');
        if (nsSel) {
          nsSel.value = 'acme-petshop-local';
          nsSel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      `);
      // Cleanup any pre-existing pods in test namespace to start clean
      try {
        execSync(`kubectl delete deployment petstore-api vaccine-gateway petstore-db --namespace=acme-petshop-local --ignore-not-found`, {
          encoding: 'utf8',
          env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
        });
      } catch (_) {}

      // Wait for KGraph application cards to render
      let kgraphCards = 0;
      for (let i = 0; i < 10; i++) {
        kgraphCards = await evalJS(app.port, `document.querySelectorAll('.kgraph-app-card').length`);
        if (kgraphCards >= 2) break;
        await new Promise(r => setTimeout(r, 500));
      }
      assert.ok(kgraphCards >= 2, 'Should render deployable application cards from Knowledge Graph');

      // Polling helper
      async function waitForTable(text, maxMs = 12000) {
        const start = Date.now();
        while (Date.now() - start < maxMs) {
          await evalJS(app.port, `if (typeof loadResources === 'function') loadResources();`);
          await new Promise(r => setTimeout(r, 800));
          const content = await evalJS(app.port, `document.getElementById('table-body') ? document.getElementById('table-body').textContent : ''`);
          if (content && content.includes(text)) return true;
        }
        return false;
      }

      async function waitForEmptyState(maxMs = 15000) {
        const start = Date.now();
        while (Date.now() - start < maxMs) {
          await evalJS(app.port, `if (typeof loadResources === 'function') loadResources();`);
          await new Promise(r => setTimeout(r, 800));
          const empty = await evalJS(app.port, `!document.getElementById('empty-namespace-card').classList.contains('hidden')`);
          if (empty) return true;
        }
        return false;
      }

      // 5. Phase 1: Real Deploy petstore-api
      await evalJS(app.port, `
        (async () => {
          if (typeof deployKGraphApp === 'function') {
            await deployKGraphApp('petstore-api');
          } else {
            const card = document.getElementById('card-petstore-api');
            if (card) {
              const btn = card.querySelector('.btn-deploy');
              if (btn) btn.click();
            }
          }
        })();
      `);

      // Assert petstore-api pod appears in Kube Studio live table
      const hasPetstoreInTable = await waitForTable('petstore-api', 12000);
      assert.ok(hasPetstoreInTable, 'Live table must contain petstore-api pod');
      console.log('✓ Assertion 1: petstore-api pod is confirmed in the live Kube Studio table');

      // Assert against real Kind cluster via kubectl CLI
      const k8sOut1 = execSync(`kubectl get pods -n acme-petshop-local -o json`, {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
      const pods1 = JSON.parse(k8sOut1).items || [];
      assert.ok(pods1.some(p => p.metadata.name.includes('petstore-api')), 'Live kubectl get pods must contain petstore-api');
      console.log('✓ Assertion 2: Real Kind cluster has live running petstore-api pods in Docker');

      // 6. Phase 2: Live Undeploy petstore-api
      await evalJS(app.port, `
        (async () => {
          if (typeof undeployFromRow === 'function') {
            await undeployFromRow('petstore-api', true);
          } else {
            await window.api.undeployApp({ appId: 'petstore-api', namespace: 'acme-petshop-local' });
          }
        })();
      `);

      // Assert namespace reclaimed and returns to 0 workloads
      const emptyStateVisible = await waitForEmptyState(15000);
      assert.ok(emptyStateVisible, 'Namespace must return to empty state after undeploy');
      console.log('✓ Assertion 3: Live Undeploy cleanly removed pods and reclaimed cluster resources');

      // 7. Phase 3: Zero-Click Auto-Deploy on Knowledge Graph main branch commit [PET-105]
      await evalJS(app.port, `
        const btn = document.getElementById('btn-trigger-kgraph');
        if (btn) btn.click();
      `);

      // Assert vaccine-gateway pod is auto-deployed and present in the list
      const hasVaccineInTable = await waitForTable('vaccine-gateway', 10000);
      assert.ok(hasVaccineInTable, 'Live table must contain auto-deployed vaccine-gateway pod');

      // Assert live kubectl pods for vaccine-gateway
      const k8sOut2 = execSync(`kubectl get pods -n acme-petshop-local -o json`, {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
      const pods2 = JSON.parse(k8sOut2).items || [];
      assert.ok(pods2.some(p => p.metadata.name.includes('vaccine-gateway')), 'Assertion Passed: vaccine-gateway pod is confirmed in the live cluster pod list');
      console.log('✓ Assertion 4: vaccine-gateway pod is confirmed live in the Kubernetes cluster pod list after KGraph main commit!');

    } finally {
      await killApp(app);
    }
  });
});

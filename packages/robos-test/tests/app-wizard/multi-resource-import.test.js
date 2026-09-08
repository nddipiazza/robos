'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const http = require('http');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchScreenshot(port, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}/screenshot`, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Screenshot failed with status code ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Screenshot timeout')); });
  });
}

describe('App Wizard Multi-Resource Knowledge Graph Import GUI Test Suite', () => {
  it('queues heterogeneous resources in Step 1, uses AI prompt extraction, inspects graph topology, and completes KGraph ingestion', async () => {
    const app = await launchApp('app-wizard', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'App Wizard debug port should be allocated');
      await sleep(2000);

      // 1. Switch to Import Mode
      await evalJS(app.port, `
        (() => {
          document.getElementById('btn-mode-import').click();
        })()
      `);
      await sleep(500);

      // 2. Verify Step 1 Title is 'What stuff are you importing?'
      const step1Title = await evalJS(app.port, `document.querySelector('#panel-import-1 h2')?.textContent || ''`);
      assert.strictEqual(step1Title.trim(), 'What stuff are you importing?', 'Step 1 title must be What stuff are you importing?');

      // 3. Queue multiple heterogeneous resources using the adder bar
      await evalJS(app.port, `
        (() => {
          const input = document.getElementById('import-source-path');
          const addBtn = document.getElementById('btn-add-resource');

          input.value = 'https://confluence.acme.corp/display/ARCH';
          addBtn.click();

          input.value = 'https://github.com/acme-payments';
          addBtn.click();

          input.value = 'https://github.com/acme-retail/checkout-api';
          addBtn.click();

          input.value = 'postgresql://admin:secret@db.internal:5432/payments_db';
          addBtn.click();

          input.value = 'kafka.internal:9092';
          addBtn.click();
        })()
      `);
      await sleep(400);

      // 4. Verify queued items rendered in UI with badges
      const queuedCount = await evalJS(app.port, `document.querySelectorAll('.resource-item').length`);
      assert.strictEqual(queuedCount, 5, 'Must have 5 queued resource items in UI');

      const countBadgeText = await evalJS(app.port, `document.getElementById('queued-count-badge')?.textContent || ''`);
      assert.ok(countBadgeText.includes('5 items queued'), 'Badge should show 5 items queued');

      // 5. Test AI Prompt Bulk Extractor
      await evalJS(app.port, `
        (async () => {
          const aiTextarea = document.getElementById('ai-import-prompt');
          if (aiTextarea) {
            aiTextarea.value = 'Import identity org at https://github.com/acme-identity for company Acme Global';
            aiTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const parseBtn = document.getElementById('btn-parse-prompt');
          if (parseBtn) parseBtn.click();
        })()
      `);

      let aiParsed = false;
      for (let i = 0; i < 20; i++) {
        await sleep(250);
        const status = await evalJS(app.port, `document.getElementById('ai-parse-status')?.textContent || ''`);
        if (status.includes('Extracted')) {
          aiParsed = true;
          break;
        }
      }
      assert.ok(aiParsed, 'AI Prompt Extractor must extract targets and update status');

      const newQueuedCount = await evalJS(app.port, `document.querySelectorAll('.resource-item').length`);
      assert.ok(newQueuedCount >= 6, 'Queue count should increase to at least 6 after AI extraction');

      // 6. Capture screenshot of Step 1 with Queued Resources
      const screenshotBuf = await fetchScreenshot(app.port);
      assert.ok(screenshotBuf.length > 50000, 'Screenshot buffer must be valid PNG (>50KB)');
      assert.strictEqual(screenshotBuf[0], 0x89);
      assert.strictEqual(screenshotBuf[1], 0x50);

      // 7. Click Deep Inspect & Analyze Targets
      await evalJS(app.port, `document.getElementById('btn-scan-import').click()`);

      let kgraphTopologyVisible = false;
      for (let i = 0; i < 25; i++) {
        await sleep(250);
        const display = await evalJS(app.port, `document.getElementById('kgraph-multi-inspection')?.style.display || ''`);
        if (display !== 'none') {
          kgraphTopologyVisible = true;
          break;
        }
      }
      assert.ok(kgraphTopologyVisible, 'KGraph Multi-Resource inspection box must become visible in Step 2');

      // 8. Verify KGraph Statistics Cards and SHACL conformance
      const statCardsCount = await evalJS(app.port, `document.querySelectorAll('#kgraph-stats-cards .kgraph-stat-card').length`);
      assert.strictEqual(statCardsCount, 8, 'Should render 8 stat cards for discovered entities');

      const shaclBadge = await evalJS(app.port, `document.querySelector('.shacl-badge-text')?.textContent || ''`);
      assert.ok(shaclBadge.includes('W3C SHACL Shape Conformance: Passed 100%'), 'SHACL badge must confirm 100% compliance');

      const packagePillsCount = await evalJS(app.port, `document.querySelectorAll('#kgraph-package-pills .pkg-pill').length`);
      assert.ok(packagePillsCount >= 3, 'Must render package distribution pills across standard packages');

      // 9. Proceed to Step 3: Catalog & Ingest
      await evalJS(app.port, `document.getElementById('btn-next-import-2').click()`);
      await sleep(500);

      const synthSummary = await evalJS(app.port, `document.getElementById('import-synth-box')?.textContent || ''`);
      assert.ok(synthSummary.includes('Knowledge Graph Scope'), 'Summary box must report Knowledge Graph scope');

      // 10. Execute Ingestion
      await evalJS(app.port, `document.getElementById('btn-execute-import').click()`);

      let ingestionComplete = false;
      for (let i = 0; i < 25; i++) {
        await sleep(250);
        const out = await evalJS(app.port, `document.getElementById('import-console-output')?.textContent || ''`);
        if (out.includes('Existing Application Successfully Ingested')) {
          ingestionComplete = true;
          break;
        }
      }
      assert.ok(ingestionComplete, 'Ingestion must complete successfully with success banner');

      const finalConsole = await evalJS(app.port, `document.getElementById('import-console-output')?.textContent || ''`);
      assert.ok(finalConsole.includes('Ingested'), 'Must log ingestion of entities across modular packages');
      assert.ok(finalConsole.includes('W3C SHACL shape valid'), 'Must log SHACL conformance');
    } finally {
      await killApp(app);
    }
  });
});

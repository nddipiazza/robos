'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const http = require('http');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

const SAMPLE_IMPORT_DIR = path.resolve(__dirname, '../../../../packages/rest-client');

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

describe('App Wizard Existing Codebase Import Mode E2E Test Suite', () => {
  it('scans brownfield repository, refines archetype via AI prompt, assigns team, and completes ingestion', async () => {
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
          const input = document.getElementById('import-source-path');
          if (input) {
            input.value = '${SAMPLE_IMPORT_DIR}';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()
      `);
      await sleep(500);

      // 2. Trigger Codebase Scan
      await evalJS(app.port, `document.getElementById('btn-scan-import').click()`);
      let inspectionFound = false;
      for (let i = 0; i < 20; i++) {
        await sleep(250);
        const res = await evalJS(app.port, `document.getElementById('import-inspection-results')?.textContent || ''`);
        if (res.includes('Detected Archetype')) {
          inspectionFound = true;
          break;
        }
      }
      assert.ok(inspectionFound, 'Inspection results must render detected archetype');

      // 3. Verify screenshot capture endpoint
      const pngBuf = await fetchScreenshot(app.port);
      assert.ok(pngBuf.length > 50000, 'Screenshot buffer must be valid PNG (>50KB)');
      assert.strictEqual(pngBuf[0], 0x89);
      assert.strictEqual(pngBuf[1], 0x50);
      assert.strictEqual(pngBuf[2], 0x4e);
      assert.strictEqual(pngBuf[3], 0x47);

      // 4. Apply AI Prompt Refinement
      await evalJS(app.port, `
        (async () => {
          const promptEl = document.getElementById('ai-inspection-refine-prompt');
          if (promptEl) {
            promptEl.value = 'Confirm archetype robos:DesktopApp with technology Node.js 20 / Electron and assign to Core Platform Team';
            promptEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const btn = document.getElementById('btn-apply-ai-refinement');
          if (btn) {
            btn.disabled = false;
            btn.click();
          }
        })()
      `);

      let aiRefined = false;
      for (let i = 0; i < 20; i++) {
        await sleep(250);
        const status = await evalJS(app.port, `document.getElementById('ai-refine-status')?.textContent || ''`);
        if (status.includes('AI applied changes')) {
          aiRefined = true;
          break;
        }
      }
      assert.ok(aiRefined, 'AI Prompt Refinement must apply changes and report status');

      // 5. Verify fields updated
      const detectedArch = await evalJS(app.port, `document.getElementById('import-app-archetype')?.value || ''`);
      assert.strictEqual(detectedArch, 'robos:DesktopApp', 'Archetype must be refined to robos:DesktopApp');

      // 6. Proceed to Step 3 and Ingest
      await evalJS(app.port, `document.getElementById('btn-next-import-2').click()`);
      await sleep(500);

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
      assert.ok(ingestionComplete, 'Ingestion must complete successfully');
    } finally {
      await killApp(app);
    }
  });
});

'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { launchApp, killApp } = require('../lib/harness');
const { evalJS } = require('../lib/snapshot');
const scenarios = require('../lib/scenarios');

const SLUG = 'app-development-flow';
const HOME_DIR = process.env.HOME || '/home/ndipiazza';
const PERSIST_DIR = path.join(HOME_DIR, '.robos', 'development', 'walkthroughs', SLUG);
const DOCS_DIR = path.resolve(__dirname, '../../../docs/assets/images/screenshots');
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/04644cae-489f-4a1d-a844-9b01a6b5861e';

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

function saveFrame(filename, buffer) {
  const targets = [
    path.join(PERSIST_DIR, filename),
    path.join(DOCS_DIR, filename),
    path.join(BRAIN_DIR, filename),
  ];
  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buffer);
      console.log(`Saved ${filename} (${buffer.length} bytes) -> ${target}`);
    } catch (err) {
      console.warn(`Could not save to ${target}: ${err.message}`);
    }
  }
}

const promptText = `Ingest our enterprise SDLC resources for Acme Global:
- GitHub Repos:
  - https://github.com/acme-retail/checkout-api
  - https://github.com/acme-payments/payment-gateway
  - https://github.com/acme-payments/fraud-detector
  - https://github.com/acme-identity/oauth-server
- Local Codebase: /home/developer/source/repos/order-service
- PostgreSQL Database: postgresql://admin:secret@db.internal:5432/acme_db
- Confluence Architecture Wiki: https://confluence.acme.corp/display/ARCH
- Kafka Event Stream Broker: kafka.internal:9092`;

async function main() {
  console.log('Starting App Flow KGraph Screenshot Generator...');
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.mkdirSync(BRAIN_DIR, { recursive: true });

  const app = await launchApp('app-wizard', {
    ...scenarios['all-good'],
    env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
  });
  console.log(`Launched app-wizard on debug port ${app.port} (PID: ${app.proc.pid})`);

  try {
    await sleep(2500);

    // 1. Switch to Import Mode
    console.log('Navigating to Import Existing App Mode...');
    await evalJS(app.port, `
      (() => {
        document.getElementById('btn-mode-import').click();
      })()
    `);
    await sleep(600);

    // 2. Set prompt in Deep Thinking AI Agent Textarea
    console.log('Setting Deep Thinking AI prompt with 4 GitHub URLs, local path, DB, Confluence, Kafka...');
    await evalJS(app.port, `
      (() => {
        const el = document.getElementById('ai-import-prompt');
        if (el) {
          el.value = ${JSON.stringify(promptText)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await sleep(1000);

    // Frame 1: User entering multi-resource specifications into Deep Thinking AI Agent
    console.log('Capturing Frame 1: Deep Thinking AI Prompt...');
    const frame1Buf = await fetchScreenshot(app.port);
    saveFrame('app-flow-kgraph-ai-agent-prompt.png', frame1Buf);

    // 3. Click "Deep Thinking AI Extract & Queue Targets"
    console.log('Clicking Deep Thinking AI Extract & Queue Targets...');
    await evalJS(app.port, `
      (() => {
        const parseBtn = document.getElementById('btn-parse-prompt');
        if (parseBtn) parseBtn.click();
      })()
    `);

    // Wait for extraction to complete
    for (let i = 0; i < 30; i++) {
      await sleep(250);
      const status = await evalJS(app.port, `document.getElementById('ai-parse-status')?.textContent || ''`);
      if (status.includes('Extracted')) {
        console.log(`AI extraction status: ${status}`);
        break;
      }
    }
    await sleep(1000);

    // Frame 2: Queued targets extracted by Deep Thinking AI Agent
    console.log('Capturing Frame 2: Queued Targets...');
    const frame2Buf = await fetchScreenshot(app.port);
    saveFrame('app-flow-kgraph-queued-targets.png', frame2Buf);

    // 4. Click "Deep Inspect & Analyze Targets"
    console.log('Clicking Deep Inspect & Analyze Targets...');
    await evalJS(app.port, `
      (() => {
        document.getElementById('btn-scan-import').click();
      })()
    `);

    // Wait for Step 2 and KGraph multi inspection box
    for (let i = 0; i < 30; i++) {
      await sleep(250);
      const display = await evalJS(app.port, `document.getElementById('kgraph-multi-inspection')?.style.display || ''`);
      if (display !== 'none') {
        console.log('KGraph multi-inspection visible in Step 2');
        break;
      }
    }
    await sleep(1000);

    // Populate the Deep Thinking AI Architectural Refinement prompt
    await evalJS(app.port, `
      (() => {
        const refineEl = document.getElementById('ai-inspection-refine-prompt');
        if (refineEl) {
          refineEl.value = 'Confirm microservice archetype robos:Microservice with Java 21 / Spring Boot 3, assign to Core Platform Team, and verify W3C SHACL 100% compliance across all 8 packages.';
          refineEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const refineBtn = document.getElementById('btn-apply-ai-refinement');
        if (refineBtn) refineBtn.disabled = false;
      })()
    `);
    await sleep(1000);

    // Frame 3: Step 2 Knowledge Graph Topology & SHACL Conformance
    console.log('Capturing Frame 3: Step 2 Topology Inspection & SHACL Conformance...');
    const frame3Buf = await fetchScreenshot(app.port);
    saveFrame('app-flow-kgraph-topology-inspection.png', frame3Buf);

    // 5. Navigate to Step 3: Catalog & Ingest
    console.log('Navigating to Step 3...');
    await evalJS(app.port, `
      (() => {
        document.getElementById('btn-next-import-2').click();
      })()
    `);
    await sleep(1000);

    // Execute Ingestion
    console.log('Executing Knowledge Graph Ingestion...');
    await evalJS(app.port, `
      (() => {
        document.getElementById('btn-execute-import').click();
      })()
    `);

    for (let i = 0; i < 30; i++) {
      await sleep(250);
      const out = await evalJS(app.port, `document.getElementById('import-console-output')?.textContent || ''`);
      if (out.includes('Existing Application Successfully Ingested')) {
        console.log('Ingestion completed successfully!');
        break;
      }
    }
    await sleep(1200);

    // Frame 4: Ingest Complete & Backstage Catalog Synthesized
    console.log('Capturing Frame 4: Ingest Complete...');
    const frame4Buf = await fetchScreenshot(app.port);
    saveFrame('app-flow-kgraph-ingest-complete.png', frame4Buf);

    console.log('✔ All 4 App Flow screenshots successfully generated!');
  } finally {
    await killApp(app);
    console.log('Terminated app-wizard.');
  }
}

main().catch(err => {
  console.error('Failure:', err);
  process.exit(1);
});

'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { launchApp, killApp } = require('../lib/harness');
const { evalJS } = require('../lib/snapshot');
const scenarios = require('../lib/scenarios');

const SLUG = 'app-import-wizard';
const HOME_DIR = process.env.HOME || '/home/ndipiazza';
const PERSIST_DIR = path.join(HOME_DIR, '.robos', 'development', 'walkthroughs', SLUG);
const DOCS_DIR = path.resolve(__dirname, '../../../docs/assets/images/screenshots');
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/b3eec328-5b7c-4d20-9d65-749de9fa59ce';
const SAMPLE_IMPORT_DIR = path.resolve(__dirname, '../../../packages/rest-client');

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

async function main() {
  console.log(`Starting App Import Wizard Walkthrough & Screenshot Generator...`);
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.mkdirSync(BRAIN_DIR, { recursive: true });

  const app = await launchApp('app-wizard', {
    ...scenarios['all-good'],
    env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
  });
  console.log(`Launched app-wizard on debug port ${app.port} (PID: ${app.proc.pid})`);

  try {
    // 1. Wait for window to initialize
    await sleep(2500);

    // Frame 1: Switch to Import Mode and showcase Step 1: What stuff are you importing?
    console.log(`Navigating to Import Existing App Mode...`);
    await evalJS(app.port, `
      (() => {
        document.getElementById('btn-mode-import').click();
        const sampleBtn = document.getElementById('btn-load-sample');
        if (sampleBtn) sampleBtn.click();
        const input = document.getElementById('import-source-path');
        if (input) {
          input.value = '${SAMPLE_IMPORT_DIR}';
          const addBtn = document.getElementById('btn-add-resource');
          if (addBtn) addBtn.click();
        }
      })()
    `);
    await sleep(800);

    console.log(`Capturing Frame 1: Step 1 What Stuff Are You Importing...`);
    const frame1Buf = await fetchScreenshot(app.port);
    saveFrame('import-app-source-select_frame.png', frame1Buf);

    // Frame 2: Trigger Deep Codebase Inspection Scan
    console.log(`Triggering deep codebase inspection scan...`);
    await evalJS(app.port, `
      (() => {
        document.getElementById('btn-scan-import').click();
      })()
    `);

    // Wait for scan to complete and panel 2 to appear
    for (let i = 0; i < 20; i++) {
      await sleep(250);
      const res = await evalJS(app.port, `document.getElementById('import-inspection-results')?.textContent || ''`);
      if (res.includes('Detected Archetype')) break;
    }
    await sleep(800);

    console.log(`Capturing Frame 2: Deep Inspection Results...`);
    const frame2Buf = await fetchScreenshot(app.port);
    saveFrame('import-app-deep-inspection_frame.png', frame2Buf);

    // Frame 3: Interactive AI Prompt Refinement
    console.log(`Entering AI Prompt Refinement...`);
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

    for (let i = 0; i < 25; i++) {
      await sleep(250);
      const status = await evalJS(app.port, `document.getElementById('ai-refine-status')?.textContent || ''`);
      if (status.includes('AI applied changes')) break;
    }
    await sleep(800);

    console.log(`Capturing Frame 3: AI Prompt Refinement Applied...`);
    const frame3Buf = await fetchScreenshot(app.port);
    saveFrame('import-app-ai-refinement_frame.png', frame3Buf);

    // Frame 4: Team Ownership Assignment & Form Controls
    console.log(`Scrolling to Team Ownership Assignment...`);
    await evalJS(app.port, `
      (() => {
        const teamEl = document.getElementById('import-app-team');
        if (teamEl) teamEl.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()
    `);
    await sleep(600);

    console.log(`Capturing Frame 4: Team Ownership & Configuration...`);
    const frame4Buf = await fetchScreenshot(app.port);
    saveFrame('import-app-team-assignment_frame.png', frame4Buf);

    // Frame 5: Proceed to Step 3 and Execute Ingestion
    console.log(`Proceeding to Step 3 and executing Ingestion...`);
    await evalJS(app.port, `
      (() => {
        document.getElementById('btn-next-import-2').click();
      })()
    `);
    await sleep(600);

    await evalJS(app.port, `
      (() => {
        document.getElementById('btn-execute-import').click();
      })()
    `);

    for (let i = 0; i < 30; i++) {
      await sleep(250);
      const out = await evalJS(app.port, `document.getElementById('import-console-output')?.textContent || ''`);
      if (out.includes('Existing Application Successfully Ingested')) break;
    }
    await sleep(800);

    console.log(`Capturing Frame 5: Ingestion Complete & Knowledge Graph Mapped...`);
    const frame5Buf = await fetchScreenshot(app.port);
    saveFrame('import-app-ingest-complete_frame.png', frame5Buf);

    // Summary Walkthrough
    const summary = `# App Import Wizard — Codebase Ingestion (E2E Screenshots)

## Overview
This walkthrough captures the native **RobOS App Wizard** importing an existing brownfield application (\`packages/rest-client\`) with automated codebase inspection, AI prompt refinement, team assignment, and Backstage/Knowledge Graph metadata synthesis.

## Screenshots
1. **Source Path Selection**: Local directory input and company Git import skill suggestion.
2. **Deep Inspection Results**: Automatic detection of build manifests, language, framework, contracts, and Docker support.
3. **AI Prompt Refinement**: Interactive natural language refinement via \\\`<robos-ai-textarea>\\\`.
4. **Team Ownership Assignment**: Binding repository ownership to team catalog (\`.robos/teams.yaml\`).
5. **Metadata Synthesis & KGraph Ingestion**: Generation of \`catalog-info.yaml\`, \`dev-setup.sh\`, and registration in \`.robos/packages.yaml\`.
`;
    fs.writeFileSync(path.join(PERSIST_DIR, 'walkthrough.md'), summary, 'utf8');
    fs.writeFileSync(path.join(BRAIN_DIR, 'app-import-wizard-walkthrough.md'), summary, 'utf8');

    console.log(`✓ App Import Wizard screenshots captured and saved successfully!`);
    return true;
  } finally {
    await killApp(app);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Execution failed:', err);
    process.exit(1);
  });
}

module.exports = { main };

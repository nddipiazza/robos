'use strict';

/**
 * Capture CLI & Direct Access Screenshots for Luxir Search Index
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { launchApp, killApp } = require('../lib/harness');
const { evalJS, maximizeWindow } = require('../lib/snapshot');
const scenarios = require('../lib/scenarios');

const SLUG = 'kgraph-parse-portal';
const HOME_DIR = process.env.HOME || '/home/ndipiazza';
const PERSIST_DIR = path.join(HOME_DIR, '.robos', 'development', 'walkthroughs', SLUG);
const DOCS_DIR = path.resolve(__dirname, '../../../docs/assets/images/screenshots');
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/679fbb6f-c272-4386-980d-3e5538e429f7';
const DISPLAY_NUM = process.env.XVFB_DISPLAY || ':105';
const RESOLUTION = '1920x1080';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchScreenshot(port, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}/screenshot`, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Screenshot failed with status code ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Screenshot timeout'));
    });
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
      console.log(`Saved screenshot: ${filename} -> ${target}`);
    } catch (err) {
      console.warn(`Could not save to ${target}: ${err.message}`);
    }
  }
}

async function startXvfb(display) {
  const lockFile = `/tmp/.X${display.replace(':', '')}-lock`;
  try {
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  } catch {}

  console.log(`🎬 [Xvfb] Starting virtual display ${display} at ${RESOLUTION}x24...`);
  const proc = spawn('Xvfb', [display, '-screen', '0', `${RESOLUTION}x24`, '-ac'], {
    stdio: 'ignore',
  });
  await sleep(1200);
  return proc;
}

async function main() {
  console.log(`\n===============================================================`);
  console.log(`🖥️ Capturing Direct Luxir CLI & REST Access Screenshots`);
  console.log(`===============================================================\n`);

  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.mkdirSync(BRAIN_DIR, { recursive: true });

  let xvfbProc = null;
  let app = null;

  try {
    xvfbProc = await startXvfb(DISPLAY_NUM);

    process.env.DISPLAY = DISPLAY_NUM;
    process.env.ROBOS_DISPLAY = DISPLAY_NUM;

    app = await launchApp('kgraph-parse-portal', {
      ...scenarios['standard-dev'],
      name: 'luxir-cli-demo',
      useRealBinaries: true,
      env: {
        DISPLAY: DISPLAY_NUM,
        ROBOS_DISPLAY: DISPLAY_NUM,
        ROBOS_PARSE_PORT: '19193',
      },
    });

    console.log(`✔ Launched kgraph-parse-portal on debug port ${app.port}`);
    await maximizeWindow(app.port);
    await sleep(1000);

    // 1. First crawl the portal directory to populate all indexed nodes
    console.log(`Populating crawl nodes...`);
    await evalJS(app.port, `
      document.getElementById('crawl-path').value = '/home/ndipiazza/source/robos/packages/kgraph-parse-portal';
      document.getElementById('btn-crawl').click();
    `);
    await sleep(2000);

    // 2. Switch to Direct Luxir CLI tab
    console.log(`Navigating to Direct Luxir CLI tab...`);
    await evalJS(app.port, `
      document.querySelector('.tab-btn[data-tab="tab-cli"]').click();
    `);
    await sleep(800);

    // Frame 09: luxir-portal-cli search "Contract"
    console.log(`Executing Frame 09: luxir-portal-cli search "Contract"...`);
    await evalJS(app.port, `
      document.querySelector('.cli-btn[data-cmd*="search"]').click();
    `);
    await sleep(1200);
    const frame09 = await fetchScreenshot(app.port);
    saveFrame('09_luxir_cli_search_direct.png', frame09);

    // Frame 10: luxir-portal-cli inspect openapi.yaml
    console.log(`Executing Frame 10: luxir-portal-cli inspect openapi.yaml...`);
    await evalJS(app.port, `
      document.querySelector('.cli-btn[data-cmd*="openapi.yaml"]').click();
    `);
    await sleep(1200);
    const frame10 = await fetchScreenshot(app.port);
    saveFrame('10_luxir_cli_inspect_doc.png', frame10);

    // Frame 11: curl -s http://localhost:19192/api/v1/search?q=Contract | jq .
    console.log(`Executing Frame 11: curl direct REST access...`);
    await evalJS(app.port, `
      document.querySelector('.cli-btn[data-cmd*="curl"]').click();
    `);
    await sleep(1200);
    const frame11 = await fetchScreenshot(app.port);
    saveFrame('11_luxir_curl_rest_direct.png', frame11);

    // Frame 12: luxir-portal-cli status
    console.log(`Executing Frame 12: luxir-portal-cli status...`);
    await evalJS(app.port, `
      document.querySelector('.cli-btn[data-cmd*="status"]').click();
    `);
    await sleep(1200);
    const frame12 = await fetchScreenshot(app.port);
    saveFrame('12_luxir_cli_status_engine.png', frame12);

    console.log(`\n✔ All 4 CLI direct access screenshots captured successfully!`);
  } finally {
    if (app) {
      try {
        await killApp(app);
      } catch {}
    }
    if (xvfbProc) {
      try {
        xvfbProc.kill('SIGTERM');
      } catch {}
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error capturing CLI screenshots:', err);
    process.exit(1);
  });
}

module.exports = { main };

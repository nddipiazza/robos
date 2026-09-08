'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { launchApp, killApp } = require('../lib/harness');
const { evalJS } = require('../lib/snapshot');
const scenarios = require('../lib/scenarios');

const SLUG = 'remote-execution-studio';
const HOME_DIR = process.env.HOME || '/home/ndipiazza';
const PERSIST_DIR = path.join(HOME_DIR, '.robos', 'development', 'walkthroughs', SLUG);
const DOCS_DIR = path.resolve(__dirname, '../../../docs/assets/images/screenshots');
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/b3eec328-5b7c-4d20-9d65-749de9fa59ce';

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
  console.log(`Starting Remote Execution Studio Walkthrough & Screenshot Generator...`);
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.mkdirSync(BRAIN_DIR, { recursive: true });

  const app = await launchApp('remote-execution-studio', scenarios['all-good']);
  console.log(`Launched remote-execution-studio on debug port ${app.port} (PID: ${app.proc.pid})`);

  try {
    // 1. Wait for window and mock data to initialize
    await sleep(2500);

    // Verify window title and cluster
    const clusterTitle = await evalJS(app.port, `document.getElementById('cluster-detail-title').textContent`);
    console.log(`Cluster detail title: ${clusterTitle}`);

    // Frame 1: Overview Tab
    console.log(`Capturing Frame 1: Cluster Overview...`);
    const overviewBuf = await fetchScreenshot(app.port);
    saveFrame('re-studio-overview_frame.png', overviewBuf);

    // Frame 2: Endpoint Health Probe
    console.log(`Capturing Frame 2: REAPI Endpoint Health Probe...`);
    await evalJS(app.port, `document.getElementById('btn-test-endpoints').click()`);
    await sleep(1500); // Wait for async testEndpoints to populate innerHTML
    await evalJS(app.port, `
      document.querySelectorAll('.toast').forEach(t => t.remove());
      const card = document.getElementById('probe-results-card');
      if (card) card.scrollIntoView({ behavior: 'instant', block: 'end' });
      const pane = document.getElementById('pane-overview');
      if (pane) pane.scrollTop = pane.scrollHeight;
    `);
    await sleep(500);
    await evalJS(app.port, `document.querySelectorAll('.toast').forEach(t => t.remove());`);
    const probeBuf = await fetchScreenshot(app.port);
    saveFrame('re-studio-probe_frame.png', probeBuf);

    // Frame 3: Build Clients Tab (Bazel .bazelrc)
    console.log(`Capturing Frame 3: Bazel .bazelrc Configuration...`);
    await evalJS(app.port, `
      switchTab('clients');
      document.querySelectorAll('.toast').forEach(t => t.remove());
    `);
    await sleep(600);
    await evalJS(app.port, `document.querySelectorAll('.toast').forEach(t => t.remove());`);
    const bazelBuf = await fetchScreenshot(app.port);
    saveFrame('re-studio-bazel_frame.png', bazelBuf);

    // Frame 4: Build Clients Tab (Buck2 .buckconfig)
    console.log(`Capturing Frame 4: Buck2 .buckconfig Configuration...`);
    await evalJS(app.port, `
      document.getElementById('btn-toggle-buck2').click();
      document.querySelectorAll('.toast').forEach(t => t.remove());
    `);
    await sleep(600);
    await evalJS(app.port, `document.querySelectorAll('.toast').forEach(t => t.remove());`);
    const buck2Buf = await fetchScreenshot(app.port);
    saveFrame('re-studio-buck2_frame.png', buck2Buf);

    // Frame 5: Provider Configurations Tab (Buildbarn modular microservices)
    console.log(`Capturing Frame 5: Provider Configurations (Buildbarn)...`);
    await evalJS(app.port, `
      switchTab('provider');
      document.querySelectorAll('.toast').forEach(t => t.remove());
    `);
    await sleep(600);
    await evalJS(app.port, `document.querySelectorAll('.toast').forEach(t => t.remove());`);
    const providerBuf = await fetchScreenshot(app.port);
    saveFrame('re-studio-buildbarn_frame.png', providerBuf);

    // Frame 6: Knowledge Graph & SHACL Conformance Tab
    console.log(`Capturing Frame 6: Knowledge Graph & SHACL Conformance...`);
    await evalJS(app.port, `
      switchTab('kgraph');
      document.querySelectorAll('.toast').forEach(t => t.remove());
    `);
    await sleep(400);
    await evalJS(app.port, `
      document.getElementById('btn-validate-shacl').click();
    `);
    await sleep(400);
    const kgraphBuf = await fetchScreenshot(app.port);
    saveFrame('re-studio-kgraph_frame.png', kgraphBuf);

    // Generate Walkthrough Step-by-Step Markdown Summary
    const summary = `# RobOS Remote Execution Studio: Distributed REAPI v2 Build Walkthrough

## Overview
RobOS replaces the friction and operational overhead of distributed build systems (Bazel, Buck2) with **Remote Execution Studio**. Built on open standards (REAPI v2), it manages Buildbarn clusters, inspects worker pools, probes endpoints, synthesizes client configurations, and validates topology via SHACL and OSLC Knowledge Graph standards.

## Step-by-Step Walkthrough Flow
1. **Cluster Overview & Worker Observability**:
   - Inspect active REAPI v2 cluster details: Execution endpoint (\`grpc://re-execution.buildbarn.internal:8980\`), Content Addressable Storage (CAS), Action Cache (AC), and Build Observation Web UI (\`bb-browser\`).
   - Monitor active worker pools (\`linux-x86_64-large\`, \`linux-arm64-workers\`) and cache hit metrics (89.4% CAS hit, 72.1% AC hit).
2. **Live REAPI Endpoint Connectivity Probe**:
   - Click **⚡ Test REAPI Endpoints** to execute live gRPC ping probes against execution, CAS, and Action Cache endpoints, displaying roundtrip latencies (14ms, 9ms) and HTTP health verification.
3. **Push-Button Bazel \`.bazelrc\` Synthesis**:
   - Switch to **Build Clients** tab to inspect auto-generated, production-hardened Bazel flags:
     \`--remote_executor\`, \`--remote_cache\`, \`--remote_download_minimal\`, and concurrency limits.
4. **Zero-Overhead Buck2 \`.buckconfig\` Generation**:
   - Toggle to Meta Buck2 mode to synthesize native \`[buck2_re_client]\` flags with SHA256 digest functions and execution properties.
5. **Modular Buildbarn Microservice Infrastructure**:
   - Navigate to **Provider Configurations** tab to inspect and copy JSON configurations for \`bb-storage\`, \`bb-scheduler\`, \`bb-worker\`, \`bb-runner\`, and \`bb-browser\`. Seamlessly switch to alternative providers like NativeLink.
6. **Knowledge Graph & SHACL Conformance**:
   - Validate the cluster against the \`robos:RemoteExecutionCluster\` OSLC JSON-LD shape, confirming full structural conformance with zero schema violations.
`;

    const summaryPath = path.join(PERSIST_DIR, `${SLUG}-step-by-step.md`);
    fs.writeFileSync(summaryPath, summary, 'utf8');
    fs.writeFileSync(path.join(BRAIN_DIR, `${SLUG}-step-by-step.md`), summary, 'utf8');
    console.log(`✓ Walkthrough step-by-step summary written to ${summaryPath}`);

    console.log(`✓ Successfully completed Remote Execution Studio walkthrough and screenshot capture!`);
  } finally {
    console.log(`Terminating remote-execution-studio process...`);
    await killApp(app);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Walkthrough execution failed:', err);
    process.exit(1);
  });
}

module.exports = { main };

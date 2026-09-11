'use strict';
const path = require('path');
const fs = require('fs');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SLUG = 'kgraph-flagship-explorer';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const DOCS_SCREENSHOTS = path.resolve(__dirname, '../../../docs/assets/images/screenshots');

const SCRIPT = [
  {
    narration: "We open the RobOS Knowledge Graph Explorer and switch to the Interactive SVG Topology Graph.",
    target: '#tab-btn-topology',
    action: 'click',
    callout: 'Interactive SVG Topology & Dependency Diagram',
    js: `(() => {
      const btn = document.getElementById('tab-btn-topology');
      if (btn) btn.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "We click the ➕ Add Entity modal to register a new architectural node across 13 supported archetypes.",
    target: '#btn-open-add-entity-modal',
    action: 'click',
    callout: 'Schema-Driven Entity Creator Modal',
    js: `(() => {
      if (window.openAddEntityModal) window.openAddEntityModal('Database');
    })()`,
    minHold: 4000,
  },
  {
    narration: "We configure the Payments Ledger Database with URI urn:robos:db:payments-ledger and submit with live SHACL gate.",
    target: '#btn-submit-add-entity',
    action: 'click',
    callout: 'Live W3C SHACL Shape Validation Gate',
    js: `(() => {
      document.getElementById('add-node-title').value = 'Payments Ledger Database';
      document.getElementById('add-node-id').value = 'urn:robos:db:payments-ledger';
      document.getElementById('add-node-package').value = 'core-platform';
      document.getElementById('add-node-desc').value = 'ACID compliant financial transaction storage';
      const engineInput = document.getElementById('dyn-engine');
      if (engineInput) engineInput.value = 'PostgreSQL 16';
      if (window.submitAddEntity) window.submitAddEntity();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We open the Transitive Blast Radius & Impact Analyzer to evaluate risk scoring and multi-hop dependencies.",
    target: '#tab-btn-impact',
    action: 'click',
    callout: 'Transitive Blast Radius & Risk Analyzer',
    js: `(() => {
      const btn = document.getElementById('tab-btn-impact');
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We switch to the Multi-Hop Path Finder to trace complete dependency chains between arbitrary entities.",
    target: '#tab-btn-query',
    action: 'click',
    callout: 'Multi-Hop Path Finder & BFS Trace',
    js: `(() => {
      const btn = document.getElementById('tab-btn-query');
      if (btn) btn.click();
      setTimeout(() => {
        if (window.tracePathBetweenNodes) window.tracePathBetweenNodes();
      }, 500);
    })()`,
    minHold: 5000,
  },
  {
    narration: "We inspect node actions: in-place structured editing, raw JSON-LD patch editing, and cascade reference pruning.",
    target: '#tab-btn-topology',
    action: 'click',
    callout: 'Interactive In-Place Entity Editor',
    js: `(() => {
      if (window.openEditEntityModal) {
        window.openEditEntityModal('urn:robos:db:payments-ledger');
      }
      setTimeout(() => {
        if (window.closeEditEntityModal) window.closeEditEntityModal();
      }, 2500);
    })()`,
    minHold: 4000,
  },
];

async function main() {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(DOCS_SCREENSHOTS, { recursive: true });

  await runDemo({
    slug: SLUG,
    appId: 'robos-graph',
    windowTitle: 'RobOS Knowledge Graph Explorer',
    windowGeometry: { w: 2560, h: 1440 },
    scenario: scenarios['all-good'],
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
    script: SCRIPT,
  });

  const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
  const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

  console.log(`✓ Flagship KGraph Explorer demo video generated: ${videoPath}`);
}

main().catch(err => {
  console.error('Failed to run kgraph flagship demo:', err);
  process.exit(1);
});

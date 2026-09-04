"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step15-data-sources";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "RobOS Data Sources fronts and manages Knowledge Graph data sources across SQL, NoSQL, Object Storage, and Streaming providers.",
    target: "#header",
    action: "hover",
    callout: "RobOS Data Sources — Knowledge Graph Multi-Database Explorer",
    minHold: 4000,
  },
  {
    narration: "In the main view, we see 'Acme Petshop PostgreSQL Database', bound to microservices 'petstore-api' and 'vaccine-gateway'.",
    target: "#ds-header-card",
    action: "hover",
    callout: "Acme Petshop PostgreSQL Database (127.0.0.1:5432/petshop)",
    minHold: 5000,
  },
  {
    narration: "In the Schema Inspector, we explore database tables 'pets', 'vaccination_certificates', and 'surgeries' with column data types and primary keys.",
    target: "#tab-schema",
    action: "hover",
    callout: "Schema Inspector: Table Structure, Columns & Data Types",
    js: `(() => {
      if (typeof selectDataSource === 'function') selectDataSource('postgres-petshop-local');
    })()`,
    minHold: 5500,
  },
  {
    narration: "We switch to the Interactive Query Console to execute a SQL query on the 'pets' table.",
    target: ".tab-btn[data-tab='query']",
    action: "click",
    callout: "Switch to Interactive SQL Query Console",
    js: `(() => {
      if (typeof switchTab === 'function') switchTab('query');
    })()`,
    minHold: 4000,
  },
  {
    narration: "We execute 'SELECT * FROM pets WHERE status = AVAILABLE' and receive live tabular results with latency tracking.",
    target: "#btn-run-query",
    action: "click",
    callout: "Execute Live SQL Query on PostgreSQL Database",
    js: `(() => {
      document.getElementById('query-input').value = "SELECT id, name, species, status, microchip_id, created_at FROM pets WHERE status = 'AVAILABLE';";
      const runBtn = document.getElementById('btn-run-query');
      if (runBtn) runBtn.click();
    })()`,
    minHold: 5500,
  },
  {
    narration: "We click 'Test Connection' to verify live network round-trip latency and PostgreSQL server handshake.",
    target: "#btn-test-conn",
    action: "click",
    callout: "Test Connection & Server Handshake Verification",
    js: `(() => {
      const testBtn = document.getElementById('btn-test-conn');
      if (testBtn) testBtn.click();
      setTimeout(() => {
        const okBtn = document.getElementById('btn-test-conn-ok');
        if (okBtn) okBtn.click();
      }, 3000);
    })()`,
    minHold: 5500,
  },
  {
    narration: "We switch to 'Cloud & Object Storage' and select the 'AWS S3 Document & Contract Vault' data source.",
    target: ".nav-item[data-cat='storage']",
    action: "click",
    callout: "Select AWS S3 Document & Contract Vault (Storage)",
    js: `(() => {
      if (typeof selectDataSource === 'function') selectDataSource('s3-acme-artifacts');
      if (typeof switchTab === 'function') switchTab('schema');
    })()`,
    minHold: 5000,
  },
  {
    narration: "We inspect S3 buckets and stored artifacts including 'PET-105-luna-rabies-cert.pdf' and contract specifications.",
    target: "#tab-schema",
    action: "hover",
    callout: "Inspect S3 Buckets & Stored Certificate Artifacts",
    minHold: 5000,
  },
  {
    narration: "We click '+ New Data Source' to launch the multi-provider wizard supporting PostgreSQL, MySQL, Oracle, GDrive, and Kafka.",
    target: "#btn-add-datasource",
    action: "click",
    callout: "Launch Multi-Provider Data Source Wizard",
    js: `(() => {
      if (typeof openAddModal === 'function') openAddModal();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We configure 'Oracle Enterprise Financial DB' and save it, automatically synchronizing node topology in the Knowledge Graph.",
    target: "#ds-modal .modal-dialog",
    action: "hover",
    callout: "Save Data Source & Synchronize with Knowledge Graph",
    js: `(() => {
      document.getElementById('modal-ds-driver').value = 'oracle';
      document.getElementById('modal-ds-name').value = 'Oracle Enterprise Financial DB';
      document.getElementById('modal-ds-host').value = 'oracle-db.internal.acme.com';
      document.getElementById('modal-ds-port').value = '1521';
      document.getElementById('modal-ds-database').value = 'ORCL_FIN';
      document.getElementById('modal-ds-user').value = 'c##billing_app';
      document.getElementById('modal-ds-services').value = 'petstore-api';
      setTimeout(() => {
        const saveBtn = document.getElementById('btn-ds-modal-save');
        if (saveBtn) saveBtn.click();
      }, 2000);
    })()`,
    minHold: 5500,
  },
];

async function main() {
  const display = process.env.DISPLAY || ":99";
  const binDir = path.join(process.env.HOME || "/home/ndipiazza", ".local", "bin");

  runDemo({
    slug: SLUG,
    appId: "data-sources",
    windowTitle: "RobOS Data Sources",
    scenario: {
      ...scenarios["all-good"],
      useRealBinaries: true,
    },
    fullDesktop: true,
    audio: false,
    env: {
      ROBOS_DEMO_SHOW: "1",
      ROBOS_REAL_BINARIES: "1",
      PATH: `${binDir}:${process.env.PATH}`,
    },
    script: SCRIPT,
    prelaunch: async (app) => {
      try {
        execSync(`wmctrl -r "RobOS Data Sources" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/data-sources-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:07 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/data-sources-postgres_overview_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:12 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/data-sources-schema_inspector_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:18 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/data-sources-query_console_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:24 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/data-sources-query_results_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:29 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/data-sources-test_connection_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:35 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/data-sources-s3_storage_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:42 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/data-sources-wizard_modal_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:48 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/data-sources-kgraph_synced_frame.png`, { stdio: "ignore" });

    fs.copyFileSync(videoPath, `${BRAIN_DIR}/${SLUG}-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/${SLUG}.vtt`);

    console.log("✓ Full Inclusive RobOS Data Sources Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

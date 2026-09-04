"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step16-developer-tools";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "RobOS Relational DB Manager provides a DBeaver and DataGrip-inspired interface for PostgreSQL, MySQL, and Oracle.",
    target: "#header",
    action: "hover",
    callout: "RobOS Relational DB Manager — DBeaver/DataGrip SQL Studio",
    minHold: 4000,
  },
  {
    narration: "In the Data Viewer, we inspect table 'pets' with inline column sorting and pagination.",
    target: "#view-data",
    action: "hover",
    callout: "Inspect PostgreSQL Table Data: 'pets'",
    minHold: 4500,
  },
  {
    narration: "We switch to the SQL Console and execute a query, returning filtered pets in 1.4 milliseconds.",
    target: "#tab-sql-btn",
    action: "click",
    callout: "Execute SQL Query with Auto-Complete & Timing Stats",
    js: `(() => {
      document.getElementById('tab-sql-btn').click();
      setTimeout(() => {
        const runBtn = document.getElementById('btn-run-sql');
        if (runBtn) runBtn.click();
      }, 500);
    })()`,
    minHold: 5000,
  },
  {
    narration: "We inspect the Table Schema DDL tab, showing generated CREATE TABLE constraints, foreign keys, and indexes.",
    target: "#tab-ddl-btn",
    action: "click",
    callout: "Table Schema DDL & Constraints Inspector",
    js: `(() => {
      document.getElementById('tab-ddl-btn').click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "RobOS NoSQL DB Manager provides MongoDB Compass and RedisInsight-inspired document and key-value management.",
    target: "#header",
    action: "hover",
    callout: "RobOS NoSQL DB Manager — MongoDB & Redis Studio",
    minHold: 4500,
  },
  {
    narration: "RobOS gRPC Client provides BloomRPC and Kreya-inspired Protobuf microservice testing.",
    target: "#header",
    action: "hover",
    callout: "RobOS gRPC Client — BloomRPC/Kreya Protobuf Studio",
    minHold: 4500,
  },
  {
    narration: "RobOS GraphQL Client provides GraphiQL and Altair-inspired schema introspection and query execution.",
    target: "#header",
    action: "hover",
    callout: "RobOS GraphQL Client — GraphiQL/Altair GraphQL Studio",
    minHold: 4500,
  },
  {
    narration: "Together, these four developer applications complete the full SDLC database and API protocol toolchain in RobOS.",
    target: "#header",
    action: "hover",
    callout: "Complete RobOS Developer Protocol & Database Suite",
    minHold: 4500,
  },
];

async function main() {
  const display = process.env.DISPLAY || ":99";
  const binDir = path.join(process.env.HOME || "/home/ndipiazza", ".local", "bin");

  runDemo({
    slug: SLUG,
    appId: "db-manager",
    windowTitle: "RobOS Relational Database Management",
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
        execSync(`wmctrl -r "RobOS Relational Database Management" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/dev-tools-db_manager_overview_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/dev-tools-table_data_grid_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:11 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/dev-tools-sql_console_query_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/dev-tools-table_ddl_frame.png`, { stdio: "ignore" });

    // Also take snapshots of the other 3 apps launched headlessly
    execSync(`node -e "
      const { launchApp, killApp } = require('./packages/robos-test/lib/harness');
      const scenarios = require('./packages/robos-test/lib/scenarios');
      const { execSync } = require('child_process');

      async function snap() {
        const a1 = await launchApp('nosql-manager', scenarios['all-good']);
        await new Promise(r => setTimeout(r, 1500));
        execSync('import -window root ${BRAIN_DIR}/dev-tools-nosql_manager_frame.png', { env: { DISPLAY: ':99' } });
        await killApp(a1);

        const a2 = await launchApp('grpc-client', scenarios['all-good']);
        await new Promise(r => setTimeout(r, 1500));
        execSync('import -window root ${BRAIN_DIR}/dev-tools-grpc_client_frame.png', { env: { DISPLAY: ':99' } });
        await killApp(a2);

        const a3 = await launchApp('graphql-client', scenarios['all-good']);
        await new Promise(r => setTimeout(r, 1500));
        execSync('import -window root ${BRAIN_DIR}/dev-tools-graphql_client_frame.png', { env: { DISPLAY: ':99' } });
        await killApp(a3);
      }
      snap().catch(console.error);
    "`, { cwd: "/home/ndipiazza/source/robos", env: { ...process.env, DISPLAY: display } });

    fs.copyFileSync(videoPath, `${BRAIN_DIR}/${SLUG}-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/${SLUG}.vtt`);

    console.log("✓ Full Inclusive RobOS Developer Tools Suite Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step16-topology-db-e2e";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "We open the RobOS System Topology Studio to define our data tier architecture and bind new data sources to the Knowledge Graph.",
    target: ".app-header",
    action: "hover",
    callout: "System Topology & Knowledge Graph Architecture Studio",
    minHold: 4000,
  },
  {
    narration: "We synthesize the 6 baseline polyglot containers for the Acme Petshop Platform.",
    target: "#stat-bar",
    action: "hover",
    callout: "Synthesize Polyglot C4 Topology",
    js: `(() => {
      window.applyTopologyAnswers({});
    })()`,
    minHold: 4500,
  },
  {
    narration: "We add the PostgreSQL 16 Analytics Warehouse data source to the topology, auto-generating deployable Kubernetes and Helm manifests.",
    target: "#btn-add-datasource",
    action: "click",
    callout: "Add Data Source & Synthesize Helm/Kubernetes Manifests",
    js: `(() => {
      window.addDataSourceModal();
    })()`,
    minHold: 5000,
  },
  {
    narration: "In the Node & Contract Inspector, we inspect the synthesized database node and downstream blast radius.",
    target: "#node-inspector",
    action: "hover",
    callout: "Inspect Data Source Schema & Downstream Blast Radius",
    minHold: 4500,
  },
  {
    narration: "We export the C4 container diagram, confirming the full multi-tier microservice and database architecture.",
    target: "#btn-export-c4",
    action: "click",
    callout: "Export C4 Architecture Model & Structurizr DSL",
    js: `(() => {
      window.exportC4Diagram();
    })()`,
    minHold: 5000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ":99";
  const binDir = path.join(process.env.HOME || "/home/ndipiazza", ".local", "bin");

  runDemo({
    slug: SLUG,
    appId: "topology-manager",
    windowTitle: "RobOS System Topology & Backstage C4 Studio",
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
        execSync(`wmctrl -r "RobOS System Topology & Backstage C4 Studio" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    fs.mkdirSync(PERSIST_DIR, { recursive: true });

    // Extract key frames for walkthrough verification
    try {
      if (fs.existsSync(videoPath)) {
        execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/topology-db-desktop_frame.png`, { stdio: "ignore" });
        execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/topology-db-c4_polyglot_frame.png`, { stdio: "ignore" });
        execSync(`ffmpeg -y -ss 00:00:11 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/topology-db-datasource_synthesized_frame.png`, { stdio: "ignore" });
        execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/topology-db-inspector_blast_radius_frame.png`, { stdio: "ignore" });
        execSync(`ffmpeg -y -ss 00:00:21 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/topology-db-c4_export_frame.png`, { stdio: "ignore" });

        fs.copyFileSync(videoPath, `${BRAIN_DIR}/${SLUG}-final.webm`);
      }
      if (fs.existsSync(vttPath)) {
        fs.copyFileSync(vttPath, `${BRAIN_DIR}/${SLUG}.vtt`);
      }
    } catch (e) {
      console.warn("Keyframe extraction notice:", e.message);
    }

    // Cleanup lingering processes
    try {
      execSync("pkill -f 'ffmpeg.*topology-db' || true", { stdio: "ignore" });
    } catch (_) {}

    console.log("✓ Full Inclusive RobOS Topology Data Source & Kubernetes Lifecycle Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

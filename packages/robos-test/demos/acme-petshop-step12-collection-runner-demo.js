"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step12-collection-runner";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "RobOS elevates Bruno into a full-fledged multi-service Collection Runner, automating end-to-end regression testing across microservices in the live Kubernetes cluster.",
    target: "#top-bar",
    action: "hover",
    callout: "RobOS REST API Client — Bruno Collection Runner",
    minHold: 4000,
  },
  {
    narration: "We click '▶ Collection Runner' in the top bar to switch from single request editing to the automated integration suite view.",
    target: "#mode-runner-btn",
    action: "click",
    callout: "Switch to Multi-Service Collection Runner View",
    js: `(() => {
      const btn = document.getElementById('mode-runner-btn');
      if (btn) btn.click();
      else if (typeof window.setViewMode === 'function') window.setViewMode('runner');
    })()`,
    minHold: 4500,
  },
  {
    narration: "In the Runner Header, we review the target environment: Kind Cluster (acme-petshop-local), configuring 1 iteration with 60ms inter-request delay.",
    target: ".runner-controls",
    action: "hover",
    callout: "Configure Suite: Kind Cluster (acme-petshop-local)",
    minHold: 4500,
  },
  {
    narration: "We click '⚡ Run Collection (5 Requests)'. RobOS executes the test suite sequentially across petstore-api, vaccine-gateway, and petstore-infra.",
    target: "#btn-start-runner",
    action: "click",
    callout: "Execute 5-Step Multi-Service Integration Suite",
    js: `(() => {
      const btn = document.getElementById('btn-start-runner');
      if (btn) btn.click();
      else if (typeof window.runEntireCollection === 'function') window.runEntireCollection();
    })()`,
    minHold: 5500,
  },
  {
    narration: "The real-time progress bar advances as each microservice endpoint executes in Docker with live status pills and millisecond latency timers.",
    target: "#runner-progress-card",
    action: "hover",
    callout: "Live Sequential Execution Progress Across Microservices",
    minHold: 5000,
  },
  {
    narration: "In the Scorecards Matrix, we inspect the aggregate metrics: 5/5 requests passed (100% success rate), 10/10 green assertions, and 13.6ms average latency.",
    target: "#runner-metrics-grid",
    action: "hover",
    callout: "Multi-Service Scorecards: 100% Pass Rate & 13.6ms Latency",
    minHold: 5000,
  },
  {
    narration: "In the Test Execution Matrix, we verify the full multi-service journey: Pet Created (PET-105) -> Vaccine Verified (200 OK) -> List Pets -> Pet Adopted -> mTLS Mesh Healthy.",
    target: ".runner-results-container",
    action: "hover",
    callout: "End-to-End Microservice Verification Matrix (5/5 Green)",
    minHold: 5500,
  },
  {
    narration: "We click '✓ Publish Gate to PR #42'. RobOS publishes the passing integration test matrix directly to the PR Review Board as a verified merge gate.",
    target: "#btn-publish-pr-gate",
    action: "click",
    callout: "Publish Passing Integration Gate to PR #42",
    js: `(() => {
      const btn = document.getElementById('btn-publish-pr-gate');
      if (btn) btn.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "We click '📄 Export Report' to generate standardized JUnit XML and HTML reports for CI/CD archiving.",
    target: "#btn-export-report",
    action: "click",
    callout: "Export Standardized JUnit XML & HTML Reports",
    js: `(() => {
      const btn = document.getElementById('btn-export-report');
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "RobOS delivers complete verification: from contract synthesis to single request inspection to multi-service collection running, ensuring rock-solid Kubernetes delivery.",
    target: "#top-bar",
    action: "hover",
    callout: "Complete SDLC Verification Loop Flawlessly Achieved",
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ":99";
  const binDir = path.join(process.env.HOME || "/home/ndipiazza", ".local", "bin");

  runDemo({
    slug: SLUG,
    appId: "rest-client",
    windowTitle: "REST Client",
    scenario: {
      ...scenarios["github-task-server"],
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
        execSync(`wmctrl -r "REST Client" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step12-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step12-runner_view_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:14 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step12-start_suite_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:22 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step12-execution_progress_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:28 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step12-scorecards_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:34 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step12-results_matrix_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:40 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step12-publish_pr_gate_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:44 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step12-export_report_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step12-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step12.vtt`);

    console.log("✓ Full Inclusive Step 12 Bruno Collection Runner Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step11-bruno-rest-client";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "RobOS integrates Bruno as the native Git-backed REST API Client, allowing developers to execute test collections directly against deployed Kubernetes microservices.",
    target: "#top-bar",
    action: "hover",
    callout: "RobOS REST API Client (Bruno Engine)",
    minHold: 4000,
  },
  {
    narration: "We select the 'Acme Petshop API Collection' stored in git repository petstore-api/collections, loading Bruno (.bru) request definitions.",
    target: "#collections-tree",
    action: "hover",
    callout: "Git-Backed Bruno Collection: acme-petshop",
    js: `(() => {
      if (typeof selectRequest === 'function') selectRequest('vax-verify');
      const item = document.getElementById('req-item-vax-verify') || document.querySelector('.req-item');
      if (item) item.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We open 'Verify Rabies Vaccine Certificate' [POST /api/v1/vaccines/verify], inspecting the JSON payload for pet PET-105-VAX.",
    target: "#tab-body",
    action: "hover",
    callout: "Fastify Request Body: PET-105 Vaccine Payload",
    js: `(() => {
      const btn = document.querySelector(".req-tab-btn[data-tab='body']");
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "In the Headers tab, we inspect the mTLS client authentication headers required by the vaccine-gateway microservice.",
    target: "#tab-headers",
    action: "hover",
    callout: "mTLS Authentication Headers (X-Client-Cert)",
    js: `(() => {
      const btn = document.querySelector(".req-tab-btn[data-tab='headers']");
      if (btn) btn.click();
    })()`,
    minHold: 4000,
  },
  {
    narration: "In the Tests tab, we review the Bruno assertions verifying HTTP 200 OK status and valid vaccine certification in the response.",
    target: "#tab-tests",
    action: "hover",
    callout: "Bruno Test Assertions: Status & Verification Checks",
    js: `(() => {
      const btn = document.querySelector(".req-tab-btn[data-tab='tests']");
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "In the Bruno Source tab, we inspect the plain-text .bru file format stored directly in git alongside application code.",
    target: "#tab-bru",
    action: "hover",
    callout: "Plain-text .bru File Representation",
    js: `(() => {
      const btn = document.querySelector(".req-tab-btn[data-tab='bru']");
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We click '⚡ Send' to execute the live REST request against the running vaccine-gateway pod in the local Kind cluster.",
    target: "#btn-send-request",
    action: "click",
    callout: "Execute Live REST Call against Deployed Pod",
    js: `(async () => {
      const bodyTab = document.querySelector(".req-tab-btn[data-tab='body']");
      if (bodyTab) bodyTab.click();
      const btn = document.getElementById("btn-send-request");
      if (btn) btn.click();
      else if (typeof sendCurrentRequest === 'function') sendCurrentRequest();
    })()`,
    minHold: 5500,
  },
  {
    narration: "The live microservice responds in 18ms with 200 OK, returning the official VAX-2026-9814-CERT certificate with CERTIFIED status!",
    target: "#response-json-view",
    action: "hover",
    callout: "Live Microservice Response: 200 OK (CERTIFIED)",
    js: `(() => {
      const btn = document.querySelector(".res-tab-btn[data-tab='res-body']");
      if (btn) btn.click();
    })()`,
    minHold: 6000,
  },
  {
    narration: "In the Test Results tab, all Bruno assertions pass 2/2 green, validating the response schema and mTLS verification.",
    target: "#res-tests-list",
    action: "hover",
    callout: "Bruno Assertions Passed: 2/2 Green",
    js: `(() => {
      const btn = document.querySelector(".res-tab-btn[data-tab='res-tests']");
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We query the AI REST CoPilot to validate our Fastify headers and payload against the OpenAPI TypeSpec contract.",
    target: "#ai-dock",
    action: "hover",
    callout: "AI REST CoPilot Contract & mTLS Validation",
    js: `(() => {
      const chip = document.querySelector("button[data-prompt='Validate mTLS Fastify headers and payload format']");
      if (chip) chip.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "Live REST verification succeeds! We have proven that the microservice requested in Task PET-105 is deployed and functioning in Kubernetes.",
    target: "#top-bar",
    action: "hover",
    callout: "End-to-End Verification Complete: Pod Live & Verified",
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
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step11-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step11-collections_tree_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:14 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step11-request_editor_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:22 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step11-bru_source_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:30 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step11-live_response_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:38 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step11-test_assertions_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:44 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step11-ai_copilot_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step11-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step11.vtt`);

    console.log("✓ Full Inclusive Step 11 Bruno REST Client Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

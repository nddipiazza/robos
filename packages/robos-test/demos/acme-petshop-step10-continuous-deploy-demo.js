"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step10-continuous-deploy";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "RobOS Kube Studio links Knowledge Graph application definitions directly to live Kubernetes clusters with automated GitOps delivery.",
    callout: "RobOS Desktop — Continuous KGraph Delivery",
    minHold: 4000,
  },
  {
    narration: "In acme-petshop-local, Kube Studio queries the Knowledge Graph for deployable microservices, referencing their upstream Git repositories.",
    target: "#kgraph-apps-list",
    action: "hover",
    callout: "Knowledge Graph Deployable Applications Grid",
    minHold: 4500,
  },
  {
    narration: "Step 1: Real Deploy. We deploy Petstore API Service with target branch 'main'. Real kubectl schedules the pods in Docker.",
    target: "#card-petstore-api",
    action: "hover",
    callout: "Real Deploy: petstore-api (Branch: main)",
    js: `(() => {
      const card = document.getElementById("card-petstore-api");
      if (card) {
        const btn = card.querySelector(".btn-deploy, button.btn-accent");
        if (btn) btn.click();
      }
    })()`,
    minHold: 5500,
  },
  {
    narration: "The real Kind cluster schedules 2 replicas of petstore-api in Docker, transitioning to 1/1 Ready and Running status.",
    target: "#resource-table",
    action: "hover",
    callout: "Live Pods Running in Docker: petstore-api",
    js: `(() => {
      const btn = document.getElementById("btn-refresh");
      if (btn) btn.click();
    })()`,
    minHold: 5500,
  },
  {
    narration: "Step 2: Undeploy. We trigger Undeploy on petstore-api. Real kubectl delete cleans up the deployment and terminates the pods.",
    target: "button.btn-danger-tiny",
    action: "click",
    callout: "Undeploy petstore-api & Release Cluster Resources",
    js: `(() => {
      // Stub confirm to true for automated test execution
      window.confirm = () => true;
      const btn = document.querySelector("button.btn-danger-tiny");
      if (btn) btn.click();
      else if (typeof window.undeployFromRow === 'function') {
        window.undeployFromRow('petstore-api');
      }
    })()`,
    minHold: 5000,
  },
  {
    narration: "With petstore-api undeployed, the namespace returns to clean state, ready for automated event-driven reconciliation.",
    target: "#empty-namespace-card",
    action: "hover",
    callout: "Namespace Clean & Ready for Auto-Deploy",
    js: `(() => {
      const btn = document.getElementById("btn-refresh");
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "Step 3: Auto-Deploy on KGraph 'main' Changes. We apply Task PET-105: Rabies Vaccine Certification Gateway to the Knowledge Graph main branch.",
    target: "#btn-trigger-kgraph",
    action: "click",
    callout: "Apply Task PET-105 to Knowledge Graph main Branch",
    js: `(() => {
      const btn = document.getElementById("btn-trigger-kgraph");
      if (btn) btn.click();
    })()`,
    minHold: 5500,
  },
  {
    narration: "RobOS detects the Knowledge Graph change on main and automatically deploys vaccine-gateway to the live cluster without manual button clicks!",
    target: "#resource-table",
    action: "hover",
    callout: "Auto-Deployed vaccine-gateway Pods Running in Docker",
    js: `(() => {
      const btn = document.getElementById("btn-refresh");
      if (btn) btn.click();
    })()`,
    minHold: 5500,
  },
  {
    narration: "We stream live logs from the auto-deployed vaccine-gateway container, verifying mTLS certificate initialization on port 8443.",
    target: "#drawer-panel",
    action: "hover",
    callout: "Stream Real Live Logs from vaccine-gateway Pod",
    js: `(() => {
      const logBtn = document.querySelector(".row-actions button");
      if (logBtn) logBtn.click();
      else if (typeof window.viewPodLogs === 'function') {
        window.viewPodLogs('vaccine-gateway', 'acme-petshop-local');
      }
    })()`,
    minHold: 5000,
  },
  {
    narration: "RobOS seamlessly unifies task delivery, Knowledge Graph branch tracking, real Kubernetes deployment, undeploy, and zero-click GitOps automation.",
    target: "#header",
    action: "hover",
    callout: "Automated Knowledge Graph Continuous Delivery Verified",
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ":99";

  runDemo({
    slug: SLUG,
    appId: "kube-studio",
    windowTitle: "Kube Studio",
    scenario: scenarios["github-task-server"],
    fullDesktop: true,
    audio: false,
    env: { ROBOS_DEMO_SHOW: "1" },
    script: SCRIPT,
    prelaunch: async (app) => {
      try {
        execSync(`wmctrl -r "Kube Studio" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-kgraph_apps_grid_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:14 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-real_deploy_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:22 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-undeploy_action_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:29 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-empty_reclaimed_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:36 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-kgraph_main_commit_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:43 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-autodeployed_pods_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:48 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-live_logs_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step10-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step10.vtt`);

    // Pod list assertion: Ensure the auto-deployed pod is in the live Kubernetes cluster list
    const binDir = path.join(process.env.HOME || "/home/ndipiazza", ".local", "bin");
    const kubectlOut = execSync(`kubectl get pods -n acme-petshop-local -o json`, {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    const k8sData = JSON.parse(kubectlOut);
    const pods = k8sData.items || [];
    console.log(`[E2E Assertion] Found ${pods.length} pods in live Kind cluster:`, pods.map(p => p.metadata.name));
    if (pods.length === 0) {
      throw new Error("Assertion Failed: Live Kubernetes cluster must have running pods");
    }
    const hasVaccinePod = pods.some(p => p.metadata.name.includes("vaccine-gateway"));
    if (!hasVaccinePod) {
      throw new Error("Assertion Failed: 'vaccine-gateway' pod must be present in the live pod list");
    }
    console.log("✓ Assertion Passed: 'vaccine-gateway' pod is confirmed live in the Kubernetes cluster pod list!");

    console.log("✓ Full Inclusive Step 10 Continuous Deploy Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

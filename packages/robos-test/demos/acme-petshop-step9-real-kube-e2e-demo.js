"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step9-real-kube-e2e";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "For real E2E validation, RobOS Kube Studio connects directly to our local Kind Kubernetes cluster running inside Docker.",
    callout: "RobOS Desktop — Real Local Kubernetes Integration",
    minHold: 4000,
  },
  {
    narration: "We open the Cluster Connection wizard to connect a new Cloud Provider or local cluster context with custom namespace routing.",
    target: "#btn-add-cluster",
    action: "click",
    callout: "Connect Cloud Provider / Cluster Context",
    js: `(() => {
      const btn = document.getElementById("btn-add-cluster");
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We select Local Kind (Kubernetes-in-Docker), configure context kind-robos-local, and target namespace acme-petshop-local.",
    target: "#modal-add-cluster .modal-card",
    action: "hover",
    callout: "Configure Context & Target Namespace: acme-petshop-local",
    minHold: 4500,
  },
  {
    narration: "Connecting to the cluster, we see that acme-petshop-local is freshly initialized and currently contains 0 active workloads.",
    target: "#btn-modal-connect",
    action: "click",
    callout: "Connected to Empty acme-petshop-local Namespace",
    js: `(() => {
      const btn = document.getElementById("btn-modal-connect");
      if (btn) btn.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "To onboard our application, we deploy Task PET-101: Baseline PostgreSQL Database and Petstore API Kubernetes Manifests.",
    target: "#btn-deploy-baseline",
    action: "click",
    callout: "Deploy Task PET-101 Baseline Manifests to Real Kind Cluster",
    js: `(() => {
      const btn = document.getElementById("btn-deploy-baseline");
      if (btn) btn.click();
    })()`,
    minHold: 6000,
  },
  {
    narration: "The real Kind cluster executes kubectl apply, scheduling live pods for petstore-api and petstore-db in Docker with 1/1 Ready status.",
    target: "#resource-table",
    action: "hover",
    callout: "Live Pods Running in Docker: petstore-api & petstore-db",
    js: `(() => {
      const btn = document.getElementById("btn-refresh");
      if (btn) btn.click();
    })()`,
    minHold: 5500,
  },
  {
    narration: "We open live pod logs for petstore-api to audit real container initialization, database connection pool, and HTTP health probes.",
    target: "#drawer-panel",
    action: "hover",
    callout: "Stream Real Live Pod Logs from Running Container",
    js: `(() => {
      const logBtn = document.querySelector(".row-actions button");
      if (logBtn) logBtn.click();
      else if (typeof window.viewPodLogs === 'function') {
        window.viewPodLogs('petstore-api', 'acme-petshop-local');
      }
    })()`,
    minHold: 5500,
  },
  {
    narration: "The AI Infrastructure CoPilot inspects our live Kubernetes topology, verifying health probes, ports, and ClusterIP routing.",
    target: "#ai-copilot-dock",
    action: "hover",
    callout: "AI Infrastructure CoPilot Health Diagnostics",
    js: `(() => {
      const chip = document.querySelector("button[data-prompt='Explain task PET-101 baseline deployment architecture']");
      if (chip) chip.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "RobOS successfully unifies task requirements, local Kind Docker clusters, live container execution, and AI infrastructure diagnostics.",
    target: "#header",
    action: "hover",
    callout: "Real Local Kubernetes Deployment Complete",
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
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-add_cluster_modal_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:15 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-empty_namespace_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:22 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-deploying_task_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:28 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-live_pods_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:35 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-pod_logs_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:41 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-ai_copilot_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step9-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step9.vtt`);

    console.log("✓ Full Inclusive Step 9 Real Kube Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step8-kube-studio";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "Welcome to RobOS Kube Studio: the unified navigator for Kubernetes workloads, Helm charts, ArgoCD GitOps, and Vercel serverless deployments.",
    callout: "RobOS Desktop — Kube Studio",
    minHold: 4000,
  },
  {
    narration: "Kube Studio natively supports all major cloud Kubernetes flavors including AWS EKS, GCP GKE, Azure AKS, and local Kind dev clusters.",
    target: "#cluster-select",
    action: "hover",
    callout: "Multi-Cloud Cluster Context (AWS EKS, GKE, AKS, Kind)",
    minHold: 4500,
  },
  {
    narration: "In the acme-petshop-prod namespace, we inspect the live Pod fleet running petstore-api:v1.2.0, vaccine-gateway, and notification-worker.",
    target: "#resources-view",
    action: "hover",
    callout: "Live Pods in acme-petshop-prod Namespace",
    minHold: 4500,
  },
  {
    narration: "We inspect live pod logs for petstore-api, verifying successful mTLS certificate handshakes and zero restart count across all replicas.",
    target: "button[onclick*='viewPodLogs']",
    action: "click",
    callout: "Stream Live Pod Logs & Audit mTLS Handshake",
    js: `(() => {
      if (typeof window.viewPodLogs === 'function') {
        window.viewPodLogs('petstore-api-7b8f9c-4x9lp', 'acme-petshop-prod');
      }
    })()`,
    minHold: 5000,
  },
  {
    narration: "Next, we switch to Helm Releases to inspect chart governance, values configuration, and automated rollback controls for acme-petshop v1.2.0.",
    target: "button[data-tab='helm']",
    action: "click",
    callout: "Helm Releases & Values Governance",
    js: `(() => {
      const tab = document.querySelector("button[data-tab='helm']");
      if (tab) tab.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "The ArgoCD GitOps tab verifies continuous delivery sync between github.com/acme/petshop-infra and our production Kubernetes fleet.",
    target: "button[data-tab='argocd']",
    action: "click",
    callout: "ArgoCD GitOps Synchronized Delivery",
    js: `(() => {
      const tab = document.querySelector("button[data-tab='argocd']");
      if (tab) tab.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "RobOS does not require Kubernetes for all tiers: Vercel is a first-class citizen for Next.js web applications, edge middleware, and serverless preview URLs.",
    target: "button[data-tab='vercel']",
    action: "click",
    callout: "Vercel Edge & Serverless Deployments (No K8s Required)",
    js: `(() => {
      const tab = document.querySelector("button[data-tab='vercel']");
      if (tab) tab.click();
    })()`,
    minHold: 5500,
  },
  {
    narration: "Finally, the built-in AI Infrastructure CoPilot audits our workloads, Helm values, ArgoCD sync, and edge routing in real time.",
    target: "#ai-copilot-dock",
    action: "hover",
    callout: "AI Infrastructure CoPilot Diagnostics",
    js: `(() => {
      const btn = document.querySelector("button[data-prompt='Inspect petstore-api mTLS handshake logs']");
      if (btn) btn.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "With Kube Studio, RobOS completes the full SDLC from task planning and IDE debugging to multi-cloud Kubernetes, ArgoCD GitOps, and Vercel edge delivery.",
    target: "#header",
    action: "hover",
    callout: "RobOS Infrastructure & Deployment Complete",
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
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step8-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:07 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step8-pods_table_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:14 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step8-logs_stream_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:19 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step8-helm_releases_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:24 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step8-argocd_gitops_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:29 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step8-vercel_deployments_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:35 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step8-ai_copilot_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step8-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step8.vtt`);

    console.log("✓ Full Inclusive Step 8 Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

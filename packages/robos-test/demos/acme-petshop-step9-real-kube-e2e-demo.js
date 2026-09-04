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
    target: "#header",
    action: "hover",
    callout: "RobOS Desktop — Real Local Kubernetes Integration",
    minHold: 4000,
  },
  {
    narration: "We open the Cluster Connection wizard to connect our local Kind cluster with custom namespace routing.",
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
    narration: "Connecting to the cluster, we see that namespace acme-petshop-local is currently clean with 0 running pods.",
    target: "#btn-modal-connect",
    action: "click",
    callout: "Connected to kind-robos-local (acme-petshop-local)",
    js: `(() => {
      const btn = document.getElementById("btn-modal-connect");
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "Kube Studio dynamically queries the RobOS Knowledge Graph, discovering all deployable applications with their Git projects and branch selectors.",
    target: "#empty-namespace-card",
    action: "hover",
    callout: "Knowledge Graph Deployable Applications Grid",
    minHold: 4500,
  },
  {
    narration: "We inspect the Petstore API Service card, referencing 'github.com/acme/petstore-api' with default target branch 'main'.",
    target: "#card-petstore-api",
    action: "hover",
    callout: "Target Application: petstore-api (Branch: main)",
    minHold: 3500,
  },
  {
    narration: "We click the 'Deploy' button on Petstore API Service. RobOS triggers live kubectl apply against our local Kind cluster.",
    target: "#card-petstore-api .btn-deploy",
    action: "click",
    callout: "Click Deploy — Submitting Kubernetes Manifests",
    js: `(async () => {
      if (typeof deployKGraphApp === 'function') {
        await deployKGraphApp('petstore-api');
      } else {
        const btn = document.querySelector("#card-petstore-api .btn-deploy");
        if (btn) btn.click();
      }
    })()`,
    minHold: 5000,
  },
  {
    narration: "The deployment operation initiates in the cluster. Kube Studio displays the reconciliation status banner as pods schedule.",
    target: "#toolbar-stats",
    action: "hover",
    callout: "Reconciling Pods in acme-petshop-local Namespace",
    minHold: 4000,
  },
  {
    narration: "The live workload table populates in real time. The 2 pod replicas for petstore-api appear with IP assignments and 1/1 Ready status in Docker.",
    target: "#table-body",
    action: "hover",
    callout: "Live Pods Running in Docker: petstore-api (2/2 Ready)",
    js: `(async () => {
      for (let i = 0; i < 6; i++) {
        if (typeof loadResources === 'function') await loadResources();
        await new Promise(r => setTimeout(r, 800));
        const rows = document.querySelectorAll('.resource-row');
        if (rows.length > 0) break;
      }
    })()`,
    minHold: 6000,
  },
  {
    narration: "We click 'Logs' to stream real-time logs from the live petstore-api container running inside the Kind cluster.",
    target: ".row-actions button",
    action: "click",
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
    narration: "The AI Infrastructure CoPilot inspects the live cluster state, verifying health probes, ports, and ClusterIP routing.",
    target: "#ai-copilot-dock",
    action: "hover",
    callout: "AI Infrastructure CoPilot Health Diagnostics",
    js: `(() => {
      const chip = document.querySelector("button[data-prompt='List deployable applications in Knowledge Graph']");
      if (chip) chip.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "RobOS successfully unifies Knowledge Graph application definitions, Git project references, and live local Kubernetes execution.",
    target: "#header",
    action: "hover",
    callout: "Real Local Kubernetes Deployment Complete",
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ":99";
  const binDir = path.join(process.env.HOME || "/home/ndipiazza", ".local", "bin");

  runDemo({
    slug: SLUG,
    appId: "kube-studio",
    windowTitle: "Kube Studio",
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
      // Clean up any existing deployments in namespace to ensure clean empty state at demo start
      try {
        execSync(`kubectl delete deployment petstore-api vaccine-gateway petstore-db --namespace=acme-petshop-local --ignore-not-found --now`, {
          encoding: "utf8",
          env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
        });
      } catch (_) {}

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
    execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-empty_namespace_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:23 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-deploying_task_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:30 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-live_pods_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:38 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-pod_logs_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:45 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step9-ai_copilot_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step9-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step9.vtt`);

    // Pod list assertion: Ensure petstore-api pod is confirmed in live cluster pod list
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
    const hasPetstorePod = pods.some(p => p.metadata.name.includes("petstore-api"));
    if (!hasPetstorePod) {
      throw new Error("Assertion Failed: 'petstore-api' pod must be present in the live pod list");
    }
    console.log("✓ Assertion Passed: 'petstore-api' pod is confirmed live in the Kubernetes cluster pod list!");

    console.log("✓ Full Inclusive Step 9 Real Kube Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

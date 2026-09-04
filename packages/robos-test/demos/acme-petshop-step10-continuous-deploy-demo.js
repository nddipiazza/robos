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
    narration: "RobOS continuous deployment connects task implementation and PR approvals directly to live Kubernetes GitOps reconciliation.",
    target: "#header",
    action: "hover",
    callout: "RobOS Desktop — Continuous Deployment Pipeline",
    minHold: 4000,
  },
  {
    narration: "In acme-petshop-local, we inspect the empty namespace, ready for event-driven continuous deployment from the Knowledge Graph main branch.",
    target: "#empty-namespace-card",
    action: "hover",
    callout: "Namespace Clean & Ready for Event-Driven Auto-Deploy",
    minHold: 4000,
  },
  {
    narration: "We click 'Implement Next Task [PET-105]'. RobOS opens the Task Implementer for PET-105: Rabies Vaccine Verification Gateway.",
    target: "#btn-open-task-delivery",
    action: "click",
    callout: "Open Task Implementer for Task PET-105",
    js: `(() => {
      const btn = document.getElementById("btn-open-task-delivery");
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "The AI Coding Agent implements the task: scaffolding the Fastify service in vaccine-gateway, injecting mTLS secrets, and validating contracts.",
    target: "#panel-task-impl .impl-agent-progress",
    action: "hover",
    callout: "AI Coding Agent Implementation & Contract Validation",
    minHold: 5000,
  },
  {
    narration: "With implementation and devcontainer tests complete, we submit Pull Request #42 merging feature/PET-105 into main.",
    target: "#btn-proceed-to-pr",
    action: "click",
    callout: "Submit Pull Request #42 for Review",
    js: `(() => {
      const btn = document.getElementById("btn-proceed-to-pr");
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "In the PR Review panel, we inspect the dual commit: 4 code files modified across petstore-api and vaccine-gateway, plus Knowledge Graph schema additions.",
    target: "#panel-pr-review .pr-diff-summary",
    action: "hover",
    callout: "Review PR #42 — Code Diffs & Knowledge Graph Entities",
    minHold: 5000,
  },
  {
    narration: "We click 'Approve & Merge PR to main'. Merging the PR commits the changes to both the Git repository and Knowledge Graph main branch.",
    target: "#btn-approve-and-merge",
    action: "click",
    callout: "Approve & Merge PR #42 to main Branch",
    js: `(async () => {
      const btn = document.getElementById("btn-approve-and-merge");
      if (btn) btn.click();
    })()`,
    minHold: 5500,
  },
  {
    narration: "RobOS detects the merge event on main and automatically deploys vaccine-gateway to the live cluster without any manual button clicking!",
    target: "#toolbar-stats",
    action: "hover",
    callout: "⚡ Auto-Deploy Triggered: Knowledge Graph main updated by PR #42",
    minHold: 4000,
  },
  {
    narration: "The live workload table populates in real time. The new vaccine-gateway pod replica appears in Docker with 1/1 Ready and Running status.",
    target: "#table-body",
    action: "hover",
    callout: "Auto-Deployed vaccine-gateway Pods Running in Docker",
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
    narration: "We click 'Logs' to stream live logs from the auto-deployed container, confirming the mTLS Fastify gateway initialized on port 8443.",
    target: ".row-actions button",
    action: "click",
    callout: "Stream Real Live Pod Logs from Auto-Deployed Container",
    js: `(() => {
      const logBtn = document.querySelector(".row-actions button");
      if (logBtn) logBtn.click();
      else if (typeof window.viewPodLogs === 'function') {
        window.viewPodLogs('vaccine-gateway', 'acme-petshop-local');
      }
    })()`,
    minHold: 5500,
  },
  {
    narration: "We query the AI Infrastructure CoPilot to audit the continuous deployment pipeline and verify the active mTLS routing topology.",
    target: "#ai-copilot-dock",
    action: "hover",
    callout: "AI Infrastructure CoPilot Continuous Deployment Audit",
    js: `(() => {
      const chip = document.querySelector("button[data-prompt='Explain auto-deployment from Knowledge Graph main branch']");
      if (chip) chip.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "RobOS completes the full SDLC loop: implementing the task, approving the PR, and automatically deploying the new microservice to Kubernetes.",
    target: "#header",
    action: "hover",
    callout: "Full SDLC Loop Complete: Task -> PR -> Auto-Deploy",
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
      // Clean up any pre-existing pods in namespace to ensure clean start
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
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-empty_reclaimed_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:14 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-task_implementer_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:23 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-pr_review_approval_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:32 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-kgraph_main_commit_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:40 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-autodeployed_pods_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:48 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step10-live_logs_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step10-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step10.vtt`);

    // Pod list assertion: Ensure the auto-deployed vaccine-gateway pod is in the live Kubernetes cluster list
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

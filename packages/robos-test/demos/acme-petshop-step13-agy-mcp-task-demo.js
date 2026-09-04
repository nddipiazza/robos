"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step13-agy-mcp-task";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "RobOS integrates Google Antigravity (AGY) as a first-class AI provider connected directly to the RobOS Unified MCP Router.",
    target: "#sidebar",
    action: "hover",
    callout: "RobOS Agents Manager — Antigravity & Unified MCP",
    minHold: 4000,
  },
  {
    narration: "We select 'Antigravity / Gemini CLI' from the AI Providers sidebar to open the deep reasoning agent control center.",
    target: "#provider-nav",
    action: "click",
    callout: "Select Antigravity / Gemini CLI Provider",
    js: `(() => {
      const items = Array.from(document.querySelectorAll('.provider-nav-item'));
      const agyItem = items.find(el => el.textContent.includes('Antigravity') || el.textContent.includes('Gemini'));
      if (agyItem) agyItem.click();
      else if (typeof selectProvider === 'function') selectProvider('antigravity');
    })()`,
    minHold: 4500,
  },
  {
    narration: "In the Status section, we verify the connection to the RobOS Unified MCP Router (mcpServers.robos), exposing 11 tools across tasks, graph, kube, and rest.",
    target: ".detail-title-row",
    action: "hover",
    callout: "Unified MCP Router: mcpServers.robos Connected (11 Tools)",
    minHold: 4500,
  },
  {
    narration: "We click '⚡ Run Autonomous SDLC Workflow (PET-106)'. Antigravity initiates autonomous orchestration via JSON-RPC 2.0 MCP tools.",
    target: "#btn-run-agy-mcp-workflow",
    action: "click",
    callout: "Trigger Autonomous SDLC Pipeline via RobOS MCP Tools",
    js: `(() => {
      const btn = document.getElementById('btn-run-agy-mcp-workflow');
      if (btn) btn.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "Antigravity executes robos_tasks_create for ticket PET-106 and robos_ekgraph_update_node to register the emergency surgery endpoint in the architecture graph.",
    target: "#agy-terminal-box",
    action: "hover",
    callout: "MCP Calls: robos_tasks_create & robos_ekgraph_update_node",
    minHold: 5500,
  },
  {
    narration: "Antigravity implements the Fastify route in 03-vaccine-gateway.yaml and calls robos_kube_deploy to apply manifests to the live Kind cluster in acme-petshop-local.",
    target: "#agy-terminal-box",
    action: "hover",
    callout: "Code Implementation & Kubernetes Rollout via robos_kube_deploy",
    minHold: 6000,
  },
  {
    narration: "Antigravity executes robos_rest_send_request, verifying POST /api/v1/pets/PET-105-VAX/surgery returns 201 Created from live pod vaccine-gateway.",
    target: "#agy-terminal-box",
    action: "hover",
    callout: "Live REST Verification: POST /api/v1/pets/PET-105-VAX/surgery (201 Created)",
    minHold: 6000,
  },
  {
    narration: "Antigravity completes the workflow by calling robos_tasks_advance_workflow, promoting PET-106 to DONE with all verification criteria satisfied.",
    target: "#agy-terminal-box",
    action: "hover",
    callout: "MCP Call: robos_tasks_advance_workflow -> PET-106 DONE",
    minHold: 5000,
  },
  {
    narration: "We inspect the recent sessions list and click 'Open AGY Terminal' to inspect the interactive command-line session paired with the RobOS MCP server.",
    target: "#agy-sessions-list",
    action: "hover",
    callout: "Interactive Antigravity (AGY) CLI & Session Resuming",
    minHold: 4500,
  },
  {
    narration: "RobOS seamlessly merges desktop AI workflows, Model Context Protocol routing, Kubernetes infrastructure, and real API verification into one unified experience.",
    target: "#sidebar",
    action: "hover",
    callout: "Complete AI-First SDLC with Antigravity & RobOS MCP Router",
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ":99";
  const binDir = path.join(process.env.HOME || "/home/ndipiazza", ".local", "bin");

  runDemo({
    slug: SLUG,
    appId: "agents-manager",
    windowTitle: "RobOS Agents",
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
        execSync(`wmctrl -r "RobOS Agents" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-agy_provider_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:12 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-mcp_connected_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:18 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-trigger_workflow_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:24 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-mcp_task_topology_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:30 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-kube_deploy_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:36 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-rest_verify_201_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:42 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-workflow_done_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step13-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step13.vtt`);

    console.log("✓ Full Inclusive Step 13 Antigravity (AGY) + RobOS MCP Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

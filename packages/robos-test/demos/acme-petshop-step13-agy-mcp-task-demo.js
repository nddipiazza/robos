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
    narration: "RobOS integrates Google Antigravity (AGY) as a first-class AI provider alongside GitHub Copilot, Claude Code, and Codex.",
    target: "#sidebar",
    action: "hover",
    callout: "RobOS Agents Manager — AI Provider Management",
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
    narration: "We click the Launch Flags arrow to configure runtime options for the Antigravity agent CLI.",
    target: "#btn-agy-flags-toggle",
    action: "click",
    callout: "Configure Launch Flags Dropdown",
    js: `(() => {
      const btn = document.getElementById('btn-agy-flags-toggle');
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "In the Launch Flags dropdown, we review the active configuration: Model (gemini-2.5-pro), MCP Router (robos), and Active Task (PET-106).",
    target: "#agy-flags-dropdown",
    action: "hover",
    callout: "Flags: --model gemini-2.5-pro, --mcp robos, --task PET-106",
    minHold: 5000,
  },
  {
    narration: "We click 'All' to explore advanced launch flags including --full-auto, --workflow, and --allow-all-tools.",
    target: "#agy-flags-mode-all",
    action: "click",
    callout: "Switch to All Launch Flags View",
    js: `(() => {
      const btn = document.getElementById('agy-flags-mode-all');
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We return to 'Most Common' flags and prepare to launch the interactive Antigravity CLI session.",
    target: "#agy-flags-mode-common",
    action: "click",
    callout: "Switch to Most Common Flags View",
    js: `(() => {
      const btn = document.getElementById('agy-flags-mode-common');
      if (btn) btn.click();
    })()`,
    minHold: 4000,
  },
  {
    narration: "We click 'Open AGY Terminal' to launch the Antigravity session in Tilix terminal, pre-configured with the RobOS Unified MCP Router.",
    target: "#btn-agy-terminal",
    action: "click",
    callout: "Launch Interactive Antigravity CLI Session with RobOS MCP",
    js: `(() => {
      const btn = document.getElementById('btn-agy-terminal');
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "In the Sessions section, we inspect active Antigravity brain sessions, showing task contexts, model metadata, and instant session resumption.",
    target: "#agy-sessions-list",
    action: "hover",
    callout: "Inspect Antigravity Brain Sessions & Resume Controls",
    minHold: 5000,
  },
  {
    narration: "RobOS provides a uniform, authentic developer experience across all AI agents with seamless Model Context Protocol integration.",
    target: "#sidebar",
    action: "hover",
    callout: "Unified AI-First SDLC Architecture with Antigravity & MCP",
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
    execSync(`ffmpeg -y -ss 00:00:11 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-mcp_connected_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-open_flags_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:21 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-configure_flags_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:26 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-all_flags_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:33 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-launch_terminal_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:39 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step13-sessions_list_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step13-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step13.vtt`);

    console.log("✓ Full Inclusive Step 13 Realistic Antigravity (AGY) Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

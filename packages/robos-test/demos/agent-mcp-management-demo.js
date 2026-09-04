"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "agent-mcp-management";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "RobOS Agents allows developers to view, edit, update, remove, and authenticate Model Context Protocol (MCP) servers across all AI providers.",
    target: "#sidebar",
    action: "hover",
    callout: "RobOS Agents — MCP Server Management & Authentication",
    minHold: 4000,
  },
  {
    narration: "In the GitHub Copilot view, we scroll to Configured MCP Servers. Notice 'Sentry Crash Reporter' is unauthenticated with an explicit 'Authenticate' button.",
    target: "#copilot-mcp-section",
    action: "hover",
    callout: "Inspect Copilot MCP Servers: Sentry Not Authenticated",
    minHold: 5000,
  },
  {
    narration: "We click 'Authenticate' on Sentry. The Authenticate MCP Server dialog opens to accept an API token.",
    target: "#mcp-server-sentry .btn-auth-mcp",
    action: "click",
    callout: "Click 'Authenticate' on Sentry MCP Server",
    js: `(() => {
      const btn = document.querySelector('#mcp-server-sentry .btn-auth-mcp');
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We enter the Sentry organization API token and click 'Authenticate & Verify'.",
    target: "#mcp-auth-modal .modal-dialog",
    action: "hover",
    callout: "Submit API Token & Verify Credentials",
    js: `(() => {
      const tokenInput = document.getElementById('mcp-auth-token');
      if (tokenInput) tokenInput.value = 'sntry_prod_token_9941';
      setTimeout(() => {
        const saveBtn = document.getElementById('btn-mcp-auth-save');
        if (saveBtn) saveBtn.click();
      }, 1500);
    })()`,
    minHold: 5000,
  },
  {
    narration: "Sentry immediately updates to '✓ Authenticated' with a green badge, and the Authenticate button disappears.",
    target: "#mcp-server-sentry",
    action: "hover",
    callout: "Sentry MCP Server Successfully Authenticated",
    minHold: 4500,
  },
  {
    narration: "We select 'Claude Code' in the sidebar and click '+ Add MCP Server' to attach a new data source.",
    target: "#provider-nav",
    action: "click",
    callout: "Switch to Claude Code & Add New MCP Server",
    js: `(() => {
      if (typeof selectProvider === 'function') selectProvider('claude-code');
      setTimeout(() => {
        const addBtn = document.getElementById('btn-add-mcp-server');
        if (addBtn) addBtn.click();
      }, 1000);
    })()`,
    minHold: 5000,
  },
  {
    narration: "In the Configure MCP Server modal, we enter 'redis-cache', 'Redis Enterprise Cluster', command 'npx', and arguments.",
    target: "#mcp-server-modal .modal-dialog",
    action: "hover",
    callout: "Configure Redis Cache stdio MCP Server",
    js: `(() => {
      document.getElementById('mcp-modal-id').value = 'redis-cache';
      document.getElementById('mcp-modal-name').value = 'Redis Enterprise Cluster';
      document.getElementById('mcp-modal-type').value = 'stdio';
      document.getElementById('mcp-modal-command').value = 'npx';
      document.getElementById('mcp-modal-args').value = '-y @modelcontextprotocol/server-redis';
      document.getElementById('mcp-modal-authenticated').checked = true;
      setTimeout(() => {
        const saveBtn = document.getElementById('btn-mcp-modal-save');
        if (saveBtn) saveBtn.click();
      }, 1500);
    })()`,
    minHold: 5000,
  },
  {
    narration: "The Redis Enterprise Cluster server is saved and rendered live in Claude Code's MCP server list.",
    target: "#claude-mcp-section",
    action: "hover",
    callout: "New Redis MCP Server Added to Claude Code",
    minHold: 4500,
  },
  {
    narration: "We switch to 'Antigravity / Gemini CLI'. We see Jira Cloud with an 'Authenticate' button alongside the active RobOS Unified MCP Router.",
    target: "#provider-nav",
    action: "click",
    callout: "Inspect Antigravity MCP Servers: Jira Cloud & RobOS Router",
    js: `(() => {
      if (typeof selectProvider === 'function') selectProvider('antigravity');
    })()`,
    minHold: 5000,
  },
  {
    narration: "We authenticate Jira Cloud and remove obsolete servers, giving developers complete governance over AI tools and credentials.",
    target: "#antigravity-mcp-section",
    action: "hover",
    callout: "Full MCP Lifecycle: View, Edit, Auth & Remove across AI Products",
    js: `(() => {
      const authBtn = document.querySelector('#mcp-server-jira-cloud .btn-auth-mcp');
      if (authBtn) authBtn.click();
      setTimeout(() => {
        document.getElementById('mcp-auth-token').value = 'jira_pat_sec_8842';
        document.getElementById('btn-mcp-auth-save').click();
      }, 1000);
    })()`,
    minHold: 5000,
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
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/agent-mcp-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/agent-mcp-unauth_sentry_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:11 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/agent-mcp-auth_modal_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:18 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/agent-mcp-sentry_authed_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:24 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/agent-mcp-add_modal_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:30 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/agent-mcp-redis_added_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:36 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/agent-mcp-antigravity_servers_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:43 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/agent-mcp-jira_authed_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/agent-mcp-management-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/agent-mcp-management.vtt`);

    console.log("✓ Full Inclusive RobOS Agents MCP Management Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

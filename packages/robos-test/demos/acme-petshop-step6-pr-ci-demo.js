"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step6-pr-ci";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "With task PET-105 verified at the breakpoint, we open RobOS PR Review Board to review the pull request, automated AI audit, and synchronized Knowledge Graph branch.",
    callout: "RobOS PR Review Board & Dual Branch Tracking",
    minHold: 4000,
  },
  {
    narration: "PR #12 is ready on petstore-api: all 5 CI checks passed, Git branch and Knowledge Graph branch kgraph/PET-105-rabies-verification are synced and mergeable into main.",
    target: '.pr-card[data-number="12"]',
    action: "click",
    callout: "Select PR #12 from Review Board",
    js: `(() => {
      const card = document.querySelector('.pr-card[data-number="12"]') || document.querySelector(".pr-card");
      if (card) card.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "The Overview tab displays the full ticket context and tracks both the Git branch and the corresponding Knowledge Graph branch.",
    target: "#overview-body",
    action: "hover",
    callout: "Inspect PR Metadata & Branch Sync",
    minHold: 4000,
  },
  {
    narration: "Under PR Review, the AI review is automatically loaded on commit. It validates the mTLS keystore, confirms low risk, and verifies 100% OpenAPI contract compliance.",
    target: '.tab-btn[data-tab="ai-review"]',
    action: "click",
    callout: "Auto-Loaded AI Code & Security Review",
    js: `(() => {
      const tab = document.querySelector('.tab-btn[data-tab="ai-review"]');
      if (tab) tab.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "We chat directly with the AI Reviewer to clarify implementation details and verify TLS session caching in VaccineGatewayClient.",
    target: "#ai-chat-section",
    action: "click",
    callout: "Chat with AI Reviewer via AI Textarea",
    js: `(() => {
      const el = document.getElementById("ai-chat-prompt");
      const prompt = "Is TLS session caching enabled in VaccineGatewayClient to prevent handshake latency?";
      if (el) {
        if (typeof el.setValue === "function") el.setValue(prompt);
        else if (el.value !== undefined) el.value = prompt;
        const textarea = el.querySelector("textarea");
        if (textarea) textarea.value = prompt;
      }
      setTimeout(() => {
        const sendBtn = document.getElementById("btn-ai-chat-send");
        if (sendBtn) sendBtn.click();
      }, 600);
    })()`,
    minHold: 6500,
  },
  {
    narration: "Under the Knowledge Graph tab, RobOS shows the architecture branch diff: VaccineGatewayClient node added, OpenAPI 3.1 contract link created, and mTLS boundary defined.",
    target: '.tab-btn[data-tab="kgraph"]',
    action: "click",
    callout: "Knowledge Graph Branch Diff & Entity Tracking",
    js: `(() => {
      const tab = document.querySelector('.tab-btn[data-tab="kgraph"]');
      if (tab) tab.click();
    })()`,
    minHold: 5500,
  },
  {
    narration: "Under Files Changed and CI Checks, all Java diffs and 5 pipeline gates are verified green.",
    target: '.tab-btn[data-tab="checks"]',
    action: "click",
    callout: "Verify CI Pipeline Gates & Matrix Checks",
    js: `(() => {
      const tab = document.querySelector('.tab-btn[data-tab="checks"]');
      if (tab) tab.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "The developer approves the pull request. RobOS executes a dual merge: merging Git code and syncing the Knowledge Graph branch into main.",
    target: '.tab-btn[data-tab="actions"]',
    action: "click",
    callout: "Dual Merge: Code & Knowledge Graph into Main",
    js: `(() => {
      const tab = document.querySelector('.tab-btn[data-tab="actions"]');
      if (tab) tab.click();
      setTimeout(() => {
        const textarea = document.getElementById("review-body");
        if (textarea) textarea.value = "Approved! Verified mTLS client implementation against vaccine-gateway. OpenAPI contract, 14/14 Pact tests, and Knowledge Graph branch confirmed.";
        const btn = document.getElementById("btn-approve");
        if (btn) btn.click();
      }, 800);
    })()`,
    minHold: 6000,
  },
  {
    narration: "PR #12 is approved and merged! Both the code repository and system Knowledge Graph are synchronized on main.",
    target: "#detail-title-area",
    action: "hover",
    callout: "PR #12 & Knowledge Graph Merged to Main",
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ":99";

  runDemo({
    slug: SLUG,
    appId: "pr-review",
    windowTitle: "RobOS PR Review Board",
    scenario: scenarios["pr-review-github"],
    fullDesktop: true,
    audio: false,
    env: { ROBOS_DEMO_SHOW: "1" },
    script: SCRIPT,
    prelaunch: async (app) => {
      try {
        execSync(`wmctrl -r "RobOS PR Review Board" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-pr_list_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:11 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-overview_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-ai_review_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:22 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-ai_chat_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:28 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-kgraph_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:34 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-ci_checks_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:40 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-approve_merge_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step6-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step6.vtt`);

    console.log("✓ Full Inclusive Step 6 Demo (with AI Chat & KGraph Sync) Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

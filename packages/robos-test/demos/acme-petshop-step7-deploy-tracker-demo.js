"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "acme-petshop-step7-deploy-tracker";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424";

const SCRIPT = [
  {
    narration: "Following the merge of PR #12 into main, RobOS Deploy Tracker monitors the automated deployment rollout across staging, canary, and production.",
    callout: "RobOS Desktop Shell & Deploy Tracker",
    minHold: 4000,
  },
  {
    narration: "The DORA KPI dashboard displays 14 total deployments, an active cadence of 3.5 per week, and a rapid MTTR of 0.4 hours.",
    target: "#kpi-row",
    action: "hover",
    callout: "Inspect DORA Deployment Metrics & Pace",
    minHold: 4500,
  },
  {
    narration: "We filter the timeline by Staging to verify the initial smoke test deployment of petstore-api:v1.2.0 with all contract validations passed.",
    target: "#env-filter",
    action: "click",
    callout: "Filter by Staging Environment",
    js: `(() => {
      const f = document.getElementById("env-filter");
      if (f) {
        f.value = "staging";
        f.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: "Staging deployment #5013 completed successfully in 3m 42s, triggering the automated canary progression to production.",
    target: "#timeline-content",
    action: "hover",
    callout: "Verify Staging Smoke Test Success",
    minHold: 4000,
  },
  {
    narration: "Next, we inspect the Production environment filter to confirm the final rollout of Release v1.2.0 with active mTLS certificate verification.",
    target: "#env-filter",
    action: "click",
    callout: "Filter by Production Environment",
    js: `(() => {
      const f = document.getElementById("env-filter");
      if (f) {
        f.value = "production";
        f.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: "Production deployment #5014 is healthy and live! The rabies certificate verification microservice is serving live requests across the fleet.",
    target: ".deploy-row",
    action: "hover",
    callout: "Production Rollout Active & Healthy",
    minHold: 4500,
  },
  {
    narration: "Resetting the environment filter reveals the complete multi-tier deployment history across all Acme Petshop microservices.",
    target: "#env-filter",
    action: "click",
    callout: "View Full Multi-Environment Timeline",
    js: `(() => {
      const f = document.getElementById("env-filter");
      if (f) {
        f.value = "";
        f.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: "Under Recent Releases and Merged Changesets, we see Tag v1.2.0 mapped directly to PR #12 and ticket PET-105 with zero regressions.",
    target: "#releases-card",
    action: "hover",
    callout: "Trace Release v1.2.0 to PR #12 & PET-105",
    js: `(() => {
      const el = document.getElementById("releases-card");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    })()`,
    minHold: 5000,
  },
  {
    narration: "With deployment tracking verified, Acme Petshop feature PET-105 is fully delivered from architecture to live production in RobOS.",
    target: "#header",
    action: "hover",
    callout: "SDLC Delivery & Deployment Complete",
    js: `window.scrollTo({ top: 0, behavior: "smooth" });`,
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ":99";

  runDemo({
    slug: SLUG,
    appId: "deploy-tracker",
    windowTitle: "Deploy Tracker",
    scenario: scenarios["github-task-server"],
    fullDesktop: true,
    audio: false,
    env: { ROBOS_DEMO_SHOW: "1" },
    script: SCRIPT,
    prelaunch: async (app) => {
      try {
        execSync(`wmctrl -r "Deploy Tracker" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step7-desktop_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step7-kpis_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:11 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step7-staging_filter_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step7-prod_filter_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:22 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step7-timeline_frame.png`, { stdio: "ignore" });
    execSync(`ffmpeg -y -ss 00:00:28 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step7-releases_changeset_frame.png`, { stdio: "ignore" });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step7-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step7.vtt`);

    console.log("✓ Full Inclusive Step 7 Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

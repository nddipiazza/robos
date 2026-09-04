'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SLUG = 'acme-petshop-step6-pr-ci';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424';

const SCRIPT = [
  {
    narration: 'With task PET-105 implemented and verified at the breakpoint, we open RobOS PR Review Board to review the pull request and CI gates.',
    callout: 'RobOS Desktop Shell & PR Review Board',
    minHold: 3500,
  },
  {
    narration: 'PR #12 is ready on petstore-api: all 5 CI checks passed, branch feature/PET-105-rabies-verification is clean and mergeable into main.',
    target: '.pr-card[data-number="12"]',
    action: 'click',
    callout: 'Select PR #12 from Review Board',
    js: `(() => {
      const card = document.querySelector('.pr-card[data-number="12"]') || document.querySelector('.pr-card');
      if (card) card.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: 'The Overview tab displays the full ticket context, author robos-agent, and changed statistics: +28 lines across 4 files.',
    target: '#overview-body',
    action: 'hover',
    callout: 'Inspect PR Metadata & Ticket Requirements',
    minHold: 4500,
  },
  {
    narration: 'Under Files Changed, we review the Java microservice changes in PetService.java and VaccineGatewayClient.java.',
    target: '.tab-btn[data-tab="files"]',
    action: 'click',
    callout: 'Review Java Diff & Microservice Changes',
    js: `(() => {
      const tab = document.querySelector('.tab-btn[data-tab="files"]');
      if (tab) tab.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: 'Under CI Checks, all 5 automated gates are green: Maven build, Spectral OpenAPI lint (0 errors), JUnit 5 (38/38), and Pact verification (14/14).',
    target: '.tab-btn[data-tab="checks"]',
    action: 'click',
    callout: 'Verify 5 Automated CI/CD Pipeline Gates',
    js: `(() => {
      const tab = document.querySelector('.tab-btn[data-tab="checks"]');
      if (tab) tab.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: 'We generate the AI Review Summary. The AI validates the mTLS keystore integration, confirms low risk, and verifies 100% OpenAPI contract compliance.',
    target: '.tab-btn[data-tab="ai-review"]',
    action: 'click',
    callout: 'AI Security & Contract Compliance Audit',
    js: `(() => {
      const tab = document.querySelector('.tab-btn[data-tab="ai-review"]');
      if (tab) tab.click();
      setTimeout(() => {
        const btn = document.getElementById('btn-ai-analyze');
        if (btn) btn.click();
      }, 800);
    })()`,
    minHold: 6000,
  },
  {
    narration: 'The prominent Review & Approve action is visible in the header and tab strip. We open the Review Decision card to submit the official sign-off.',
    target: '.tab-btn[data-tab="actions"]',
    action: 'click',
    callout: 'Review & Approve Decision Sign-off',
    js: `(() => {
      const tab = document.querySelector('.tab-btn[data-tab="actions"]');
      if (tab) tab.click();
      setTimeout(() => {
        const textarea = document.getElementById('review-body');
        if (textarea) textarea.value = 'Approved! Verified mTLS client implementation against vaccine-gateway. OpenAPI contract and 14/14 Pact tests confirmed.';
        const btn = document.getElementById('btn-approve');
        if (btn) btn.click();
      }, 800);
    })()`,
    minHold: 5000,
  },
  {
    narration: 'PR #12 is approved and merged into main! The feature is officially integrated into the Acme Petshop platform.',
    target: '#detail-title-area',
    action: 'hover',
    callout: 'PR #12 Approved & Merged to Main',
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ':99';

  runDemo({
    slug: SLUG,
    appId: 'pr-review',
    windowTitle: 'RobOS PR Review Board',
    scenario: scenarios['pr-review-github'],
    fullDesktop: true,
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
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
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-desktop_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-pr_list_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:11 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-overview_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-files_diff_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:21 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-ci_checks_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:27 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-ai_review_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:33 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step6-approve_merge_frame.png`, { stdio: 'ignore' });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step6-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step6.vtt`);

    console.log('✓ Full Inclusive Step 6 Demo Finished Successfully!');
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

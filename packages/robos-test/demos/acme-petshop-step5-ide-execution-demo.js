'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SLUG = 'acme-petshop-step5-ide-execution';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424';

const SCRIPT = [
  {
    narration: 'We begin on the RobOS developer desktop to execute Step 5: IDE Breakpoint & AI Coding Execution.',
    callout: 'RobOS Desktop Shell',
    minHold: 3000,
  },
  {
    narration: 'Picking up task PET-105 provisions the workspace and launches IntelliJ IDEA at the reproduction breakpoint.',
    target: '.ij-titlebar',
    action: 'click',
    callout: 'Launch IntelliJ IDEA (RobOS Breakpoint Workspace)',
    minHold: 3500,
  },
  {
    narration: 'The workspace is brought directly to line 48 in PetService.java where rabies certification is required.',
    target: '#code-line-48',
    action: 'hover',
    callout: 'Inspect Suspended Breakpoint at PetService.java:48',
    minHold: 4000,
  },
  {
    narration: 'The Debugger Tool Window displays thread state, stack frames, and live variables for the pending pet adoption.',
    target: '#ij-debugger',
    action: 'click',
    callout: 'Inspect Thread Stack & Variable State',
    minHold: 4000,
  },
  {
    narration: 'The RobOS AI Workspace tool window analyzes the breakpoint and ticket context from the project graph.',
    target: '#ij-ai-sidebar',
    action: 'click',
    callout: 'RobOS AI Workspace & Diagnostic Analysis',
    minHold: 4000,
  },
  {
    narration: 'AI proposes a 4-step solution plan: invoke mTLS compliance gateway, validate signature, emit Kafka event, and run Pact tests.',
    target: '#ai-plan-card',
    action: 'hover',
    callout: 'Review AI Proposed Solution Plan',
    minHold: 4500,
  },
  {
    narration: 'In RobOS, the developer reviews and approves the AI plan before any code changes are applied.',
    target: '#btn-approve-plan',
    action: 'click',
    callout: 'Human-in-the-Loop Plan Approval',
    js: `(() => {
      if (window.approveAndExecutePlan) window.approveAndExecutePlan();
    })()`,
    minHold: 4500,
  },
  {
    narration: 'The AI Agent executes the plan, applies the code diff, runs unit & Pact tests (14/14 passed), and resumes execution.',
    target: '#ai-execution-card',
    action: 'click',
    callout: 'Plan Executed, Tests Passed & Breakpoint Resumed',
    minHold: 5000,
  },
  {
    narration: 'The full 5-stage RobOS SDLC loop is complete: Task Planning, C4 Topology, Contracts, Repos, and IDE AI Execution.',
    target: '.ij-titlebar',
    action: 'click',
    callout: 'Full 5-Stage SDLC Lifecycle Verified',
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ':99';

  runDemo({
    slug: SLUG,
    appId: 'intellij-idea',
    windowTitle: 'IntelliJ IDEA Ultimate 2026.1',
    scenario: scenarios['all-good'],
    fullDesktop: true,
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
    script: SCRIPT,
    prelaunch: async (app) => {
      try {
        execSync(`wmctrl -r "IntelliJ IDEA Ultimate 2026.1" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-desktop_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-ide_open_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:10 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-breakpoint_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:15 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-debugger_state_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:20 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-ai_plan_review_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:26 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-plan_approval_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:32 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-execution_verified_frame.png`, { stdio: 'ignore' });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step5-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step5.vtt`);

    console.log('✓ Full Inclusive Step 5 Demo Finished Successfully!');
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

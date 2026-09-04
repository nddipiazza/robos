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
    narration: 'On the RobOS desktop, 6 polyglot repositories are cloned and 5 tasks are queued. We open Task Implementer to implement the Petstore features.',
    callout: 'RobOS Desktop Shell & Task Implementer',
    minHold: 3500,
  },
  {
    narration: 'We select task PET-105: Rabies Vaccine Verification Gateway & Certification on the petstore-api backend.',
    target: '#task-item-105',
    action: 'click',
    callout: 'Select Task PET-105 from Sprint Backlog',
    js: `(() => {
      if (window._demoSelectTask) window._demoSelectTask('PET-105');
    })()`,
    minHold: 4000,
  },
  {
    narration: 'The task panel outlines the requirement: when adopting a puppy or kitten, verify its certificate via vaccine-gateway over mTLS before approving adoption.',
    target: '.task-detail-panel',
    action: 'hover',
    callout: 'Review Task Requirements, Branch & Secret Bindings',
    minHold: 4500,
  },
  {
    narration: 'We click "Launch Task Workspace". RobOS checks out the branch, injects mTLS secrets from pass, starts dependencies, and executes the reproduction test.',
    target: '#btn-launch-ws',
    action: 'click',
    callout: 'Automated Provisioning & Reproduction Test Run',
    js: `(() => {
      if (window._demoStartProvisioning) window._demoStartProvisioning();
    })()`,
    minHold: 4500,
  },
  {
    narration: 'The reproduction test triggers and halts execution at the exact breakpoint in PetService.java:48 where rabies certification is required.',
    target: '#code-line-48',
    action: 'hover',
    callout: 'Execution Suspended at Breakpoint (PetService.java:48)',
    minHold: 4500,
  },
  {
    narration: 'In the Debugger, we inspect live variable state: pet id, canine species, tag ID VAX-2026-9814, and the mTLS client endpoint.',
    target: '#ij-debugger',
    action: 'click',
    callout: 'Inspect Live Debugger Variables & Stack Frames',
    minHold: 4500,
  },
  {
    narration: 'In the RobOS AI Workspace, the AI analyzes the breakpoint and presents a 4-step solution plan: call mTLS gateway, validate signature, emit Kafka event, and run Pact tests.',
    target: '#ai-plan-card',
    action: 'hover',
    callout: 'RobOS AI Workspace: Diagnostic & 4-Step Plan',
    minHold: 5000,
  },
  {
    narration: 'The developer reviews and approves the AI plan. RobOS applies the code diff, binds the mTLS keystore, and runs the test suite.',
    target: '#btn-approve-plan',
    action: 'click',
    callout: 'Human-in-the-Loop Plan Approval & Execution',
    js: `(() => {
      if (window._demoApprovePlan) window._demoApprovePlan();
    })()`,
    minHold: 5000,
  },
  {
    narration: 'All 14 unit and Pact contract tests pass! The breakpoint resumes with 200 OK, Kafka event is published, and the Petstore adoption feature is verified.',
    target: '#ai-execution-card',
    action: 'click',
    callout: '14/14 Pact Tests Passed & Breakpoint Resumed 200 OK',
    minHold: 5000,
  },
  {
    narration: 'The full 5-stage RobOS SDLC loop is complete: from Task Planning and Topology, to Contracts, Git Projects, and AI IDE Breakpoint Execution.',
    target: '.ij-titlebar',
    action: 'click',
    callout: 'Complete 5-Stage RobOS SDLC Loop Verified',
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
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-task_select_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:10 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-provisioning_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-breakpoint_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:22 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-debugger_vars_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:28 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-ai_plan_review_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:36 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step5-execution_verified_frame.png`, { stdio: 'ignore' });
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


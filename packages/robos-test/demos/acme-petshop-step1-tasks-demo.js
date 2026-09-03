'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { launchApp, killApp } = require('../lib/harness');
const { GiteaForgeService } = require('../lib/gitea-forge');

const SLUG = 'acme-petshop-step1-tasks';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424';

const RICH_ARCH_PROMPT = `Architect and plan the Acme Petshop distributed polyglot platform:
- Backend: Java 21 Spring Boot 3 REST API microservice with OpenAPI 3.1 contracts
- Database: PostgreSQL with Flyway automated migrations for pet catalog, inventory, and orders
- Frontend: React 18 TypeScript single-page application for customer pet adoption & cart checkout
- Event Streaming: Apache Kafka topic pipeline for async pet adoption events & real-time inventory sync
- Compliance & Security: Dedicated rabies vaccination certification gateway validating vet health records
- Shared Contracts: Reusable TypeSpec models and DTO schemas for cross-service type safety`;

let giteaForge = null;
let giteaBrowserApp = null;

const SCRIPT = [
  {
    narration: 'We begin on the RobOS developer desktop environment with the taskbar and system menu.',
    callout: 'RobOS Desktop Shell',
    minHold: 3000,
  },
  {
    narration: 'We open RobOS Task Planner to initialize the new Acme Petshop project.',
    target: '#btn-new-project',
    action: 'click',
    callout: 'Open Task Planner & Create Project',
    js: `(() => {
      const btn = document.getElementById('btn-new-project');
      if (btn) btn.click();
      const form = document.getElementById('project-new-form');
      if (form) form.style.display = 'flex';
      const input = document.getElementById('project-name-input');
      if (input) input.focus();
    })()`,
    minHold: 3500,
  },
  {
    narration: 'We name the project "Acme Petshop Platform" in the multi-line project textarea and confirm.',
    target: '#project-name-input',
    action: 'type',
    value: 'Acme Petshop Platform',
    callout: 'Name Project & Save Upfront',
    js: `(() => {
      const input = document.getElementById('project-name-input');
      if (input) {
        input.value = 'Acme Petshop Platform';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => {
          const confirmBtn = document.getElementById('btn-project-confirm');
          if (confirmBtn) confirmBtn.click();
        }, 500);
      }
    })()`,
    minHold: 3500,
  },
  {
    narration: 'The project is created in the Knowledge Graph and appears active in the left sidebar with clean metadata.',
    target: '#project-metadata-card',
    action: 'click',
    callout: 'KGraph Project Entity',
    minHold: 3500,
  },
  {
    narration: 'In the multi-line AI textarea, we enter a comprehensive polyglot architecture specification with Spring Boot, React, and TypeSpec.',
    target: '#prompt-input',
    action: 'type',
    value: RICH_ARCH_PROMPT,
    callout: 'Detailed Polyglot Architecture Prompt',
    js: `(() => {
      const host = document.getElementById('prompt-input');
      if (host) {
        const inner = host.querySelector('.robos-ai-inner') || host;
        inner.focus();
        inner.innerText = ${JSON.stringify(RICH_ARCH_PROMPT)};
        host.dispatchEvent(new Event('input', { bubbles: true }));
        host.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: 'We click "Plan using AI Prompt" to start form-based architecture question refinement.',
    target: '#btn-generate',
    action: 'click',
    callout: 'Plan using AI Prompt',
    minHold: 3500,
  },
  {
    narration: 'Question 1: We select "Kafka Event Streaming" in the form and click Next Question.',
    target: '#btn-question-next',
    action: 'click',
    callout: 'Select Kafka Event Streaming',
    js: `(() => {
      setTimeout(() => {
        const nextBtn = document.getElementById('btn-question-next');
        if (nextBtn) nextBtn.click();
      }, 1000);
    })()`,
    minHold: 4000,
  },
  {
    narration: 'Question 2: We select "Dedicated Rabies Vaccine Gateway" and click "Generate Epics & Tasks".',
    target: '#btn-question-submit',
    action: 'click',
    callout: 'Generate Epics & Tasks',
    js: `(() => {
      setTimeout(() => {
        const submitBtn = document.getElementById('btn-question-submit');
        if (submitBtn) submitBtn.click();
      }, 1000);
    })()`,
    minHold: 4500,
  },
  {
    narration: 'We save the finalized plan to the project and inspect the synthesized Epic and Stories hierarchy.',
    target: '#btn-save-project',
    action: 'click',
    callout: 'Save Plan to Project',
    minHold: 3500,
  },
  {
    narration: 'We click "Sync All to Server" to publish all 6 issues to the local Gitea Task Forge.',
    target: '#btn-create-all',
    action: 'click',
    callout: 'Sync All to Gitea Task Forge',
    js: `(() => {
      const btn = document.getElementById('btn-create-all');
      if (btn) btn.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: 'In Google Chrome, we open the Gitea repository issue tracker to verify the created issues.',
    callout: 'Open Gitea in Google Chrome',
    actionFn: async () => {
      try {
        giteaBrowserApp = await launchApp('gitea-browser', { name: 'gitea-browser-demo', ...scenarios['all-good'] });
      } catch (err) {
        console.error('Failed to launch gitea-browser:', err);
      }
    },
    minHold: 5000,
  },
  {
    narration: 'In Google Chrome, we verify all 6 issues, epic tracking, and labels are saved and synced in Gitea.',
    callout: 'Verify 6 Issues in Gitea Forge',
    minHold: 8000,
  },
];

async function main() {
  giteaForge = new GiteaForgeService({ port: 3000 });
  await giteaForge.start();
  giteaForge.seedRepo({
    owner: 'robos',
    repo: 'acme-petshop',
    files: { 'README.md': '# Acme Petshop Platform\n' },
  });

  const display = process.env.DISPLAY || ':99';

  runDemo({
    slug: SLUG,
    appId: 'task-planner',
    windowTitle: 'RobOS Task Planner',
    scenario: scenarios['all-good'],
    fullDesktop: true,
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
    script: SCRIPT,
    prelaunch: async (app) => {
      try {
        execSync(`wmctrl -r "RobOS Task Planner" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    if (giteaBrowserApp) await killApp(giteaBrowserApp);
    if (giteaForge) await giteaForge.stop();

    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step1-desktop_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:10 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step1-clean_project_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:18 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step1-prompt_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:27 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step1-question_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:36 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step1-plan_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:54 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step1-chrome_gitea_frame.png`, { stdio: 'ignore' });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step1-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step1.vtt`);

    console.log('✓ Full Inclusive Step 1 Demo Finished Successfully!');
    process.exit(0);
  }).catch(async (err) => {
    if (giteaBrowserApp) await killApp(giteaBrowserApp);
    if (giteaForge) await giteaForge.stop();
    console.error(err);
    process.exit(1);
  });
}

main();

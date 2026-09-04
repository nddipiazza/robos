'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SLUG = 'acme-petshop-step3-contracts';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424';

const CONTRACT_PROMPT = `Author and compile API contracts for Acme Petshop Platform (urn:robos:project:acme-petshop-platform):
- Compile entities/pet.typespec into OpenAPI 3.1 contract for petstore-api (5 endpoints, AdoptionRequest)
- Author rabies vaccine verification contract for vaccine-gateway (mTLS security scheme)
- Define AsyncAPI 3.0 event streams for Apache Kafka (pet.adopted, inventory.delta)
- Run Spectral style governance, Pact consumer verification, and start local Prism mock server.`;

const SCRIPT = [
  {
    narration: 'We begin on the RobOS developer desktop to author and verify API contracts for Acme Petshop.',
    callout: 'RobOS Desktop Shell',
    minHold: 3000,
  },
  {
    narration: 'We open the API Contract & Governance Engine connected to the acme-petshop-platform project graph.',
    target: '#stat-contracts-count',
    action: 'click',
    callout: 'Open API Contract & Governance Studio',
    minHold: 3500,
  },
  {
    narration: 'In the multi-line AI textarea, we enter the contract authoring and governance compilation prompt.',
    target: '#contract-ai-prompt',
    action: 'type',
    value: CONTRACT_PROMPT,
    callout: 'Enter AI Contract Authoring Prompt',
    js: `(() => {
      const host = document.getElementById('contract-ai-prompt');
      if (host) {
        const inner = host.querySelector('.robos-ai-inner') || host;
        inner.focus();
        inner.innerText = ${JSON.stringify(CONTRACT_PROMPT)};
        host.dispatchEvent(new Event('input', { bubbles: true }));
        host.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: 'We submit the prompt. The AI Agent responds with TypeSpec compilation and schema validation results.',
    target: '.robos-submit-btn',
    action: 'click',
    callout: 'AI Conversation Mode & Compilation',
    js: `(() => {
      const host = document.getElementById('contract-ai-prompt');
      if (host && host._doSubmit) {
        host._doSubmit();
      } else if (window.submitContractPrompt) {
        window.submitContractPrompt();
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: 'We select petstore-api.openapi.yaml, inspecting its 5 REST operations linked to TypeSpec entities.',
    target: '#contract-item-petstore-api_openapi_yaml',
    action: 'click',
    callout: 'Inspect Java Spring Boot API Contract',
    js: `(() => {
      if (window.selectContract) window.selectContract('petstore-api.openapi.yaml');
    })()`,
    minHold: 4000,
  },
  {
    narration: 'We inspect the POST /pets/{id}/adopt checkout endpoint with strict AdoptionRequest validation.',
    target: '#endpoint-post--pets--id--adopt',
    action: 'hover',
    callout: 'Inspect Adoption Checkout Operation',
    minHold: 3500,
  },
  {
    narration: 'We select vaccine-gateway.openapi.yaml, verifying the mTLS state vet certificate validation endpoint.',
    target: '#contract-item-vaccine-gateway_openapi_yaml',
    action: 'click',
    callout: 'Inspect Rabies Vaccine Gateway Contract',
    js: `(() => {
      if (window.selectContract) window.selectContract('vaccine-gateway.openapi.yaml');
    })()`,
    minHold: 4000,
  },
  {
    narration: 'We inspect events.asyncapi.yml, confirming Kafka event streams for pet.adopted and inventory.delta.',
    target: '#contract-item-events_asyncapi_yml',
    action: 'click',
    callout: 'Inspect AsyncAPI Kafka Event Streams',
    js: `(() => {
      if (window.selectContract) window.selectContract('events.asyncapi.yml');
    })()`,
    minHold: 3500,
  },
  {
    narration: 'We switch to the GitOps feature branch feature/PET-105-rabies-verification to test contract deltas.',
    target: '#select-gitops-branch',
    action: 'click',
    callout: 'Switch GitOps Feature Branch',
    js: `(() => {
      const sel = document.getElementById('select-gitops-branch');
      if (sel) {
        sel.value = 'feature/PET-105-rabies-verification';
        if (window.switchGitBranch) window.switchGitBranch('feature/PET-105-rabies-verification');
      }
    })()`,
    minHold: 3500,
  },
  {
    narration: 'We execute Stoplight Spectral linting, confirming 0 errors and full compliance with API guidelines.',
    target: '#btn-run-spectral',
    action: 'click',
    callout: 'Run Spectral Style Governance (0 Errors)',
    js: `(() => {
      if (window.runSpectral) window.runSpectral();
    })()`,
    minHold: 4000,
  },
  {
    narration: 'We run Pact consumer-driven contract tests, validating all 14 frontend-to-backend expectations.',
    target: '#btn-run-pact',
    action: 'click',
    callout: 'Run Pact Verification (14/14 PASSED)',
    js: `(() => {
      if (window.runPact) window.runPact();
    })()`,
    minHold: 4000,
  },
  {
    narration: 'We start the Prism live mock server on port 4010, serving instant mock HTTP routes from disk schemas.',
    target: '#btn-start-prism',
    action: 'click',
    callout: 'Start Prism Mock Server (Port 4010)',
    js: `(() => {
      if (window.startPrism) window.startPrism();
    })()`,
    minHold: 5000,
  },
  {
    narration: 'All API contracts are 100% conforming and verified, ready for multi-repo scaffolding and devcontainers.',
    target: '#stat-pact-status',
    action: 'click',
    callout: 'Contracts Verified & Live Mock Running',
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ':99';

  runDemo({
    slug: SLUG,
    appId: 'contract-studio',
    windowTitle: 'RobOS API Contract & Governance Engine',
    scenario: scenarios['all-good'],
    fullDesktop: true,
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
    script: SCRIPT,
    prelaunch: async (app) => {
      try {
        execSync(`wmctrl -r "RobOS API Contract & Governance Engine" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step3-desktop_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step3-studio_open_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:10 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step3-prompt_typing_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step3-ai_conversation_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:22 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step3-petstore_api_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:28 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step3-vaccine_gateway_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:34 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step3-events_asyncapi_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:40 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step3-branch_switch_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:46 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step3-governance_passed_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:52 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step3-prism_mock_frame.png`, { stdio: 'ignore' });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step3-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step3.vtt`);

    console.log('✓ Full Inclusive Step 3 Demo Finished Successfully!');
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

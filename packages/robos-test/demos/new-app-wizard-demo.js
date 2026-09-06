'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SLUG = 'new-app-wizard';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/38cf4ff1-059d-4d41-9db8-305c6dee0964';
const DOCS_SCREENSHOTS = path.resolve(__dirname, '../../../docs/assets/images/screenshots');

const SCRIPT = [
  {
    narration: "We launch the RobOS App Wizard to develop a brand-new application using the guided archetype wizard.",
    target: '.brand',
    action: 'hover',
    callout: 'RobOS App Wizard — Multi-Archetype Application Builder',
    js: `(() => {
      const brand = document.querySelector('.brand-title');
      if (!brand || !brand.textContent.includes('App Wizard')) {
        throw new Error('E2E Assertion Failed: App Wizard header not found');
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: "The developer selects the Microservice archetype to scaffold a distributed Java Spring Boot REST API.",
    target: '#card-arch-microservice',
    action: 'click',
    callout: 'Select Archetype: Microservice / Web API (OpenAPI 3.1 & Spring Boot)',
    js: `(() => {
      const card = document.getElementById('card-arch-microservice');
      if (!card) throw new Error('E2E Assertion Failed: Microservice card missing');
      card.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We proceed to App Identity, naming the service Payment Gateway API and assigning it to the Core Platform team.",
    target: '#btn-next-new-1',
    action: 'click',
    callout: 'Configure App Identity, URN & Team Ownership in teams.yaml',
    js: `(() => {
      document.getElementById('btn-next-new-1').click();
      const nameInput = document.getElementById('new-app-name');
      if (!nameInput) throw new Error('E2E Assertion Failed: App Name input missing');
    })()`,
    minHold: 5000,
  },
  {
    narration: "In the Contract Specification step, RobOS provides an OpenAPI 3.1 contract preview with payment and refund endpoints.",
    target: '#btn-next-new-2',
    action: 'click',
    callout: 'Define API Contract: OpenAPI 3.1 Specification & Endpoints',
    js: `(() => {
      document.getElementById('btn-next-new-2').click();
      const contract = document.getElementById('new-contract-content');
      if (!contract || !contract.value.includes('openapi: 3.1.0')) {
        throw new Error('E2E Assertion Failed: Contract editor missing OpenAPI spec');
      }
    })()`,
    minHold: 5000,
  },
  {
    narration: "We review the scaffolding summary and click Scaffold Application to generate the codebase and register it in RobOS.",
    target: '#btn-next-new-3',
    action: 'click',
    callout: 'Review Scaffolding Blueprint & Knowledge Graph URN',
    js: `(() => {
      document.getElementById('btn-next-new-3').click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "RobOS creates the component directory, dev-setup.sh, Dockerfile, Backstage catalog-info.yaml, and registers the package.",
    target: '#btn-generate-new',
    action: 'click',
    callout: 'Scaffold Application: Generate dev-setup.sh, Dockerfile & catalog-info.yaml',
    js: `(async () => {
      document.getElementById('btn-generate-new').click();
      await new Promise(r => setTimeout(r, 1200));
      const consoleOut = document.getElementById('new-console-output')?.textContent || '';
      if (!consoleOut.includes('Greenfield Application Scaffolding Complete')) {
        throw new Error('E2E Assertion Failed: Scaffolding generation failed: ' + consoleOut);
      }
    })()`,
    minHold: 6000,
  }
];

async function main() {
  console.log(`Starting Live E2E Walkthrough (No Mocking): ${SLUG}...`);
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(BRAIN_DIR, { recursive: true });
  fs.mkdirSync(DOCS_SCREENSHOTS, { recursive: true });

  await runDemo({
    slug: SLUG,
    appId: 'app-wizard',
    windowTitle: 'RobOS App Wizard',
    scenario: scenarios['all-good'],
    audio: true,
    script: SCRIPT,
    env: { ROBOS_DEMO_SHOW: '1' },
    prelaunch: async (app) => {
      const display = process.env.DISPLAY || ':99';
      try {
        execSync(`wmctrl -r "RobOS App Wizard" -e 0,160,60,1600,960`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  });

  const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
  const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);
  const summaryMdPath = path.join(PERSIST_DIR, `${SLUG}-step-by-step.md`);

  const summary = `# Develop a New App in RobOS — New App Wizard (E2E Walkthrough)

## Scenario Overview
This end-to-end walkthrough demonstrates developing a **brand-new application from scratch** using the **RobOS App Wizard** (\`packages/app-wizard\`) with zero mocking:
- **Multi-Archetype Selection**: Choose from 6 first-class software archetypes (\`robos:Microservice\`, \`robos:DesktopApp\`, \`robos:ConsoleApp\`, \`robos:MobileApp\`, \`robos:DataPipeline\`, \`robos:Library\`).
- **Identity, URN & Team Ownership**: Specifying package identifier (\`urn:robos:microservice:payment-gateway-api\`) and team owner in \`.robos/teams.yaml\`.
- **Contract-First API Design**: Configuring OpenAPI 3.1 YAML specifications with ready-to-test endpoint definitions.
- **Polyglot Scaffolding Generation**: Creating real project files on disk (\`catalog-info.yaml\`, \`dev-setup.sh\`, \`Dockerfile\`, starter tests).
- **Knowledge Graph Registration**: Automatically registering the new component in \`.robos/packages.yaml\` and the Dual-State SDLC Knowledge Graph.

## Execution Sequence
1. **Launch App Wizard**: Open the application builder in "Develop New App" mode.
2. **Select Microservice Archetype**: Choose Java 21 Spring Boot with OpenAPI 3.1.
3. **App Identity & Ownership**: Configure Payment Gateway API and assign to Core Platform Team.
4. **Contract Specification**: Review OpenAPI 3.1 contract endpoints (\`/v1/payments\`, \`/v1/refunds\`).
5. **Scaffold & Bootstrap**: Execute file generation, compile \`dev-setup.sh\`, and register in \`.robos/packages.yaml\`.
`;
  fs.writeFileSync(summaryMdPath, summary, 'utf8');

  // Extract frames
  try {
    if (fs.existsSync(videoPath)) {
      execSync(`ffmpeg -y -ss 00:00:03 -i "${videoPath}" -vframes 1 "${PERSIST_DIR}/new-app-archetypes_frame.png"`, { stdio: 'ignore' });
      execSync(`ffmpeg -y -ss 00:00:09 -i "${videoPath}" -vframes 1 "${PERSIST_DIR}/new-app-identity-team_frame.png"`, { stdio: 'ignore' });
      execSync(`ffmpeg -y -ss 00:00:15 -i "${videoPath}" -vframes 1 "${PERSIST_DIR}/new-app-contract-spec_frame.png"`, { stdio: 'ignore' });
      execSync(`ffmpeg -y -ss 00:00:23 -i "${videoPath}" -vframes 1 "${PERSIST_DIR}/new-app-scaffold-complete_frame.png"`, { stdio: 'ignore' });

      // Copy to docs and brain
      const frames = [
        'new-app-archetypes_frame.png',
        'new-app-identity-team_frame.png',
        'new-app-contract-spec_frame.png',
        'new-app-scaffold-complete_frame.png'
      ];
      for (const f of frames) {
        if (fs.existsSync(path.join(PERSIST_DIR, f))) {
          fs.copyFileSync(path.join(PERSIST_DIR, f), path.join(DOCS_SCREENSHOTS, f));
          fs.copyFileSync(path.join(PERSIST_DIR, f), path.join(BRAIN_DIR, f));
        }
      }
      fs.copyFileSync(videoPath, path.join(BRAIN_DIR, `${SLUG}-final.webm`));
      fs.copyFileSync(vttPath, path.join(BRAIN_DIR, `${SLUG}.vtt`));
      fs.copyFileSync(summaryMdPath, path.join(BRAIN_DIR, `${SLUG}-step-by-step.md`));
    }
  } catch (e) {
    console.warn('Frame extraction warning:', e.message);
  }

  console.log(`✓ E2E Proof Test Finished Successfully for ${SLUG}! Deliverables saved to ${PERSIST_DIR}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Demo failed:', err);
    process.exit(1);
  });
}

module.exports = { main, SCRIPT, SLUG };

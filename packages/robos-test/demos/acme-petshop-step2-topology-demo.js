'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SLUG = 'acme-petshop-step2-topology';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424';

const TOPOLOGY_PROMPT = `Synthesizing architecture from Task Planner (Acme Petshop Platform):
- Java 21 Spring Boot 3 REST API microservice (petstore-api)
- PostgreSQL 16 relational database with Flyway (petstore-db)
- React 18 TypeScript web client (petstore-web)
- Apache Kafka event bus for async pet adoption (event-bus)
- Dedicated rabies vaccine certification gateway (vaccine-gateway)
- Reusable TypeSpec & Pact contract models (petstore-common)`;

const SCRIPT = [
  {
    narration: 'We begin on the RobOS developer desktop environment to define the Acme Petshop system topology.',
    callout: 'RobOS Desktop Shell',
    minHold: 3000,
  },
  {
    narration: 'We open the System Topology & Backstage C4 Studio starting with a fresh architecture workspace.',
    target: '#empty-canvas-hint',
    action: 'click',
    callout: 'Initial Clean Topology Workspace',
    minHold: 3500,
  },
  {
    narration: 'In the multi-line AI textarea, we enter the polyglot microservice specifications from our task plan.',
    target: '#topology-ai-prompt',
    action: 'type',
    value: TOPOLOGY_PROMPT,
    callout: 'Enter Polyglot Architecture Prompt',
    js: `(() => {
      const host = document.getElementById('topology-ai-prompt');
      if (host) {
        const inner = host.querySelector('.robos-ai-inner') || host;
        inner.focus();
        inner.innerText = ${JSON.stringify(TOPOLOGY_PROMPT)};
        host.dispatchEvent(new Event('input', { bubbles: true }));
        host.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: 'We click "Synthesize Topology from Prompt" to generate the 6-container C4 graph in real-time.',
    target: '#btn-synthesize-topology',
    action: 'click',
    callout: 'Synthesize Topology from Prompt',
    js: `(() => {
      if (window.synthesizeTopology) window.synthesizeTopology();
    })()`,
    minHold: 4000,
  },
  {
    narration: 'The Backstage catalog and canvas are populated with all 6 polyglot nodes and protocol links.',
    target: '#catalog-tree',
    action: 'click',
    callout: 'Backstage Catalog (6 Entities)',
    minHold: 4000,
  },
  {
    narration: 'We inspect the Java Spring Boot REST API node (petstore-api) on the topological canvas.',
    target: '#node-card-petstore-api',
    action: 'click',
    callout: 'Inspect Java Spring Boot API',
    js: `(() => {
      if (window.selectNode) window.selectNode('petstore-api');
    })()`,
    minHold: 4000,
  },
  {
    narration: 'The inspector displays responsible team, OpenAPI 3.1 contract, Devcontainer, and blast radius.',
    target: '#inspector-card-details',
    action: 'click',
    callout: 'Node & Contract Inspector',
    minHold: 3500,
  },
  {
    narration: 'We select the Rabies Vaccine Certification Gateway verifying compliance and veterinary records.',
    target: '#node-card-vaccine-gateway',
    action: 'click',
    callout: 'Inspect Vaccine Gateway',
    js: `(() => {
      if (window.selectNode) window.selectNode('vaccine-gateway');
    })()`,
    minHold: 3500,
  },
  {
    narration: 'We switch to C4 Level 1 Context view showing external pet adopters and system boundaries.',
    target: '#btn-zoom-l1',
    action: 'click',
    callout: 'C4 Level 1 System Context',
    js: `(() => {
      if (window.switchZoom) window.switchZoom('l1');
    })()`,
    minHold: 3500,
  },
  {
    narration: 'We export the C4 PlantUML container architecture DSL linked to the project Knowledge Graph entity.',
    target: '#btn-export-c4',
    action: 'click',
    callout: 'Export C4 PlantUML Diagram',
    js: `(() => {
      if (window.exportC4Diagram) window.exportC4Diagram();
    })()`,
    minHold: 5000,
  },
  {
    narration: 'The system topology is fully conforming and ready for TypeSpec multi-repo contract definition.',
    target: '#stat-schema-status',
    action: 'click',
    callout: '100% Conforming Topology',
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ':99';

  runDemo({
    slug: SLUG,
    appId: 'topology-manager',
    windowTitle: 'RobOS System Topology & Backstage C4 Studio',
    scenario: scenarios['all-good'],
    fullDesktop: true,
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
    script: SCRIPT,
    prelaunch: async (app) => {
      try {
        execSync(`wmctrl -r "RobOS System Topology & Backstage C4 Studio" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-desktop_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-empty_clean_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:10 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-prompt_typing_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:15 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-synthesized_canvas_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:23 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-inspector_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:28 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-vaccine_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:33 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-l1_frame.png`, { stdio: 'ignore' });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step2-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step2.vtt`);

    console.log('✓ Full Inclusive Step 2 Demo Finished Successfully!');
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

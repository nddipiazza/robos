'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SLUG = 'acme-petshop-step2-topology';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424';

const SCRIPT = [
  {
    narration: 'We continue on the RobOS developer desktop environment to define the Acme Petshop system topology.',
    callout: 'RobOS Desktop Shell',
    minHold: 3000,
  },
  {
    narration: 'We launch the RobOS System Topology & C4 Architecture Studio.',
    target: '#stat-system-id',
    action: 'click',
    callout: 'Open Topology & C4 Studio',
    minHold: 3500,
  },
  {
    narration: 'The Backstage catalog registers all 6 polyglot components bound to the Acme Petshop platform.',
    target: '#catalog-tree',
    action: 'click',
    callout: 'Backstage Software Catalog',
    minHold: 3500,
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
    narration: 'The inspector displays the responsible team, OpenAPI 3.1 contract, Devcontainer, and blast radius.',
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
    minHold: 6000,
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
    execSync(`ffmpeg -y -ss 00:00:08 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-catalog_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:13 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-canvas_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:17 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-inspector_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:22 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-l1_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:26 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step2-c4_export_frame.png`, { stdio: 'ignore' });
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

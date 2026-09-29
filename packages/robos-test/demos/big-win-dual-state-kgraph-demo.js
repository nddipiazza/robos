'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SLUG = 'big-win-dual-state-kgraph';
const ROOT_DIR = path.resolve(__dirname, '../../..');
const DOCS_VIDEOS = path.join(ROOT_DIR, 'docs/assets/videos');
const DOCS_IMAGES = path.join(ROOT_DIR, 'docs/assets/images');
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);

fs.mkdirSync(DOCS_VIDEOS, { recursive: true });
fs.mkdirSync(DOCS_IMAGES, { recursive: true });
fs.mkdirSync(PERSIST_DIR, { recursive: true });

const SCRIPT = [
  {
    narration: 'RobOS models the complete enterprise architecture as an OASIS OSLC Core 3.0 & W3C JSON-LD Dual-State Knowledge Graph.',
    target: '#graph-status-bar',
    action: 'hover',
    callout: 'World 1 (main): Verified Production Architecture',
    minHold: 4000,
  },
  {
    narration: 'The Interactive Topology engine visualizes all microservices, databases, Kafka pipelines, and OpenAPI contracts.',
    target: '#tab-btn-topology',
    action: 'click',
    callout: 'Live C4 Software Architecture Topology',
    js: `(() => {
      const btn = document.getElementById('tab-btn-topology');
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: 'Adding entities triggers an immediate W3C SHACL shape validation gate, guaranteeing schema conformance before saving.',
    target: '#btn-open-add-entity-modal',
    action: 'click',
    callout: 'Schema-Driven Entity Validation (W3C SHACL Gate)',
    js: `(() => {
      if (window.openAddEntityModal) {
        window.openAddEntityModal('Database');
        document.getElementById('add-node-title').value = 'Payments Ledger Database';
        document.getElementById('add-node-id').value = 'urn:robos:db:payments-ledger';
        document.getElementById('add-node-package').value = 'core-platform';
        document.getElementById('add-node-desc').value = 'ACID compliant financial transaction storage';
        const engineInput = document.getElementById('dyn-engine');
        if (engineInput) engineInput.value = 'PostgreSQL 16';
        if (window.submitAddEntity) window.submitAddEntity();
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: 'We execute a sub-100ms Semantic Graph Diff comparing World 1 (Production main) against World 2 (feature/TASK-101-auth).',
    target: '#btn-run-diff',
    action: 'click',
    callout: 'Dual-State Graph Diff: World 1 vs World 2',
    js: `(() => {
      const btn = document.getElementById('btn-run-diff');
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: 'The Transitive Blast Radius engine traverses dependency edges, calculating upstream/downstream risk before code is written.',
    target: '#tab-btn-impact',
    action: 'click',
    callout: 'Transitive Blast Radius & Risk Impact Scoring',
    js: `(() => {
      const btn = document.getElementById('tab-btn-impact');
      if (btn) btn.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: 'The Multi-Hop Path Finder uses breadth-first search to reveal multi-service transitive coupling across squads.',
    target: '#tab-btn-query',
    action: 'click',
    callout: 'BFS Multi-Hop Shortest Path Dependency Trace',
    js: `(() => {
      const btn = document.getElementById('tab-btn-query');
      if (btn) btn.click();
      setTimeout(() => {
        if (window.tracePathBetweenNodes) window.tracePathBetweenNodes();
      }, 500);
    })()`,
    minHold: 4500,
  },
  {
    narration: 'Blast radius proofs and semantic diffs attach to pull requests, enabling lead architects to verify changes in under 30 seconds.',
    target: '#tab-btn-visual',
    action: 'click',
    callout: 'Autonomous Blast Radius Proof Package',
    js: `(() => {
      const btn = document.getElementById('tab-btn-visual');
      if (btn) btn.click();
    })()`,
    minHold: 4000,
  },
];

async function main() {
  console.log('=== Running RobOS Big Win E2E Demo: Dual-State SDLC Knowledge Graph ===');

  await runDemo({
    slug: SLUG,
    appId: 'robos-graph',
    windowTitle: 'RobOS Knowledge Graph Explorer',
    windowGeometry: { w: 1920, h: 1080 },
    scenario: scenarios['all-good'],
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
    script: SCRIPT,
  });

  const rawWebm = path.join(__dirname, '../run/demos', SLUG, `${SLUG}.webm`);
  const rawVtt = path.join(__dirname, '../run/demos', SLUG, `${SLUG}.vtt`);

  if (!fs.existsSync(rawWebm)) {
    throw new Error(`Expected recorded webm at ${rawWebm}`);
  }

  // 1. Copy raw WebM and VTT
  const targetWebm = path.join(DOCS_VIDEOS, `${SLUG}.webm`);
  const targetVtt = path.join(DOCS_VIDEOS, `${SLUG}.vtt`);
  fs.copyFileSync(rawWebm, targetWebm);
  if (fs.existsSync(rawVtt)) {
    fs.copyFileSync(rawVtt, targetVtt);
  }
  console.log(`✓ WebM copied to: ${targetWebm}`);

  // 2. Transcode to high-quality 1080p MP4 with burned-in subtitles
  const targetMp4 = path.join(DOCS_VIDEOS, `${SLUG}.mp4`);
  console.log('Burning elegant DejaVu subtitles into final 1080p MP4 video...');
  if (fs.existsSync(rawVtt)) {
    execSync(
      `ffmpeg -y -i "${rawWebm}" ` +
      `-vf "subtitles=${rawVtt}:force_style='Fontname=DejaVu Sans,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BackColour=&H800b101b,BorderStyle=4,Outline=1,Shadow=0,MarginV=30'" ` +
      `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p "${targetMp4}"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(
      `ffmpeg -y -i "${rawWebm}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p "${targetMp4}"`,
      { stdio: 'inherit' }
    );
  }
  console.log(`✓ 1080p MP4 created: ${targetMp4}`);

  // 3. Extract poster frame at 12s (during active topology / graph diff)
  const targetPoster = path.join(DOCS_IMAGES, `${SLUG}-poster.jpg`);
  console.log('Extracting high-res poster frame...');
  execSync(
    `ffmpeg -y -ss 00:00:12 -i "${targetMp4}" -frames:v 1 -q:v 2 "${targetPoster}"`,
    { stdio: 'ignore' }
  );
  console.log(`✓ Poster frame created: ${targetPoster}`);

  // 4. Generate high-quality looping GIF (880x495, 12 fps, optimal Bayer dither)
  const targetGif = path.join(DOCS_IMAGES, `${SLUG}.gif`);
  const tmpPalette = path.join('/tmp', `${SLUG}-palette.png`);
  console.log('Generating crisp preview GIF...');
  execSync(
    `ffmpeg -y -i "${targetMp4}" -vf "fps=12,scale=880:495:flags=lanczos,palettegen=stats_mode=diff" "${tmpPalette}"`,
    { stdio: 'ignore' }
  );
  execSync(
    `ffmpeg -y -i "${targetMp4}" -i "${tmpPalette}" -lavfi "fps=12,scale=880:495:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "${targetGif}"`,
    { stdio: 'ignore' }
  );
  console.log(`✓ Animated GIF created: ${targetGif}`);

  console.log('=== Big Win E2E Demo Build Complete! ===');
}

main().catch(err => {
  console.error('Failed to run Big Win demo:', err);
  process.exit(1);
});

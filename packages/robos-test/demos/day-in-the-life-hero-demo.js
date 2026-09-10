'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const OUT_DIR = path.join(ROOT_DIR, 'docs/assets');
const TMP_DIR = path.join('/tmp', 'robos-hero-build');

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'videos'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'images'), { recursive: true });

console.log('=== Building RobOS Day-in-the-Life Proof-of-Work Walkthrough Video & GIF ===');

// 1. Definition of all segments across the complete lifecycle
const SEGMENTS = [
  // Intro
  {
    type: 'card',
    image: path.join(ROOT_DIR, 'docs/assets/images/day-in-the-life/hero-title.jpg'),
    duration: 2.5,
  },
  // Onboarding Wizard (rapidly advancing through setup steps 1 to 11)
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/robos-onboarding/robos-onboarding.webm'),
    start: 42,
    duration: 15,
    speed: 0.18,
    cues: [
      { start: 0.5, duration: 3.2, text: 'Setup Assistant: Step 1 (GPG Key ready) ➔ Step 2 (Pass Store init) ➔ Step 3 (Pinentry)' },
      { start: 7.5, duration: 3.2, text: 'Rapid Provisioning: Step 4 (Git Profile) ➔ Step 5 (SSH Key) ➔ Step 10 (Software Center)' },
    ],
  },
  // Phase 1 Card
  {
    type: 'card',
    image: path.join(ROOT_DIR, 'docs/assets/images/day-in-the-life/phase1-planning.jpg'),
    duration: 2.5,
  },
  // Phase 1: Planning & Tasks
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/acme-petshop-step1-tasks/acme-petshop-step1-tasks.webm'),
    start: 8,
    duration: 10,
    crop: '1100:780:410:150',
    subtitle: 'Phase 1: Issue Manager decomposes prompt into executable task DAG',
    subStart: 0.5,
    subDuration: 3.0,
  },
  // Knowledge Graph & Dual-State Card
  {
    type: 'card',
    image: path.join(ROOT_DIR, 'docs/assets/images/day-in-the-life/phase-kgraph-dual-state.jpg'),
    duration: 2.5,
  },
  // Knowledge Graph Flagship Explorer
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/kgraph-flagship-explorer/kgraph-flagship-explorer.webm'),
    start: 1,
    duration: 25,
    cues: [
      { start: 0.5, duration: 3.2, text: 'Knowledge Graph Explorer: Interactive SVG topology, node dependencies, & C4 architecture' },
      { start: 5.5, duration: 3.2, text: 'Schema-Driven Entity Creator: ➕ Add Entity modal with live W3C SHACL validation gate' },
      { start: 13.5, duration: 3.2, text: 'Transitive Blast Radius Analyzer & Multi-Hop Path Finder: BFS connection chains' },
    ],
  },
  // Dual-State Architecture: Blast Radius Diffing
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/graph-diff/graph-diff.webm'),
    start: 4,
    duration: 11,
    subtitle: 'Dual-State Sync: World 1 (main) vs World 2 (feature) automated blast radius diff',
    subStart: 0.5,
    subDuration: 3.2,
  },
  // Phase 2 Card
  {
    type: 'card',
    image: path.join(ROOT_DIR, 'docs/assets/images/day-in-the-life/phase2-scaffolding.jpg'),
    duration: 2.5,
  },
  // Phase 2: Scaffolding, Contracts & OpenAPI Web Service Viewer
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/acme-petshop-step3-contracts/acme-petshop-step3-contracts.webm'),
    start: 19,
    duration: 18,
    cues: [
      { start: 0.5, duration: 3.2, text: 'Phase 2: OpenAPI 3.1 Web Service Explorer: Browsing routes, security, & parameters' },
      { start: 8.5, duration: 3.2, text: 'Live Web Service Testing: Execute POST /pets/{id}/adopt & receive 200 OK response' },
    ],
  },
  // Phase 3 Card
  {
    type: 'card',
    image: path.join(ROOT_DIR, 'docs/assets/images/day-in-the-life/phase3-implementation.jpg'),
    duration: 2.5,
  },
  // Phase 3: Autonomous Implementation / Git Projects
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/acme-petshop-step4-git-projects/acme-petshop-step4-git-projects.webm'),
    start: 10,
    duration: 10,
    crop: '1100:750:410:165',
    subtitle: 'Phase 3: Git Projects loads polyglot repositories with GPG pass signed commits',
    subStart: 0.5,
    subDuration: 3.0,
  },
  // Phase 4 Card
  {
    type: 'card',
    image: path.join(ROOT_DIR, 'docs/assets/images/day-in-the-life/phase4-data-protocol.jpg'),
    duration: 2.5,
  },
  // Phase 4: Data & Protocol Testing
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/acme-petshop-step15-data-sources/acme-petshop-step15-data-sources.webm'),
    start: 8,
    duration: 10,
    crop: '1200:780:360:150',
    subtitle: 'Phase 4: Data Sources & REST Client: Live SQL/NoSQL queries & API runner',
    subStart: 0.5,
    subDuration: 3.0,
  },
  // Phase 5 Card
  {
    type: 'card',
    image: path.join(ROOT_DIR, 'docs/assets/images/day-in-the-life/phase5-verification-ide.jpg'),
    duration: 2.5,
  },
  // Phase 5a: IntelliJ IDEA Plugin Breakpoint Execution
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/acme-petshop-step5-ide-execution/acme-petshop-step5-ide-execution.webm'),
    start: 2,
    duration: 18,
    crop: '1040:680:440:200',
    cues: [
      { start: 0.5, duration: 3.2, text: 'Phase 5: IntelliJ IDEA Plugin: Port 63343 IPC, pass secrets, & reproduction breakpoint' },
      { start: 8.5, duration: 3.2, text: 'Paused Thread State: Inspecting stack frames, local variables, & 14/14 Pact tests pass' },
    ],
  },
  // Phase 5b: Agent Code Review Platform PR Sign-Off
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/agent-code-review-ide-plugins-e2e/agent-code-review-ide-plugins-e2e.webm'),
    start: 38,
    duration: 10,
    crop: '1400:900:260:90',
    subtitle: 'Agent Code Review Platform: Autonomous PR audit & 1-click dual-branch merge',
    subStart: 0.5,
    subDuration: 3.0,
  },
  // Phase 6 Card
  {
    type: 'card',
    image: path.join(ROOT_DIR, 'docs/assets/images/day-in-the-life/phase6-cloud-ops.jpg'),
    duration: 2.5,
  },
  // Phase 6: Cloud Ops & Live Observability
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/acme-petshop-step10-continuous-deploy/acme-petshop-step10-continuous-deploy.webm'),
    start: 10,
    duration: 12,
    crop: '1400:900:260:90',
    subtitle: 'Phase 6: Kube Studio & Dev Central: ArgoCD GitOps sync & engineering cockpit',
    subStart: 0.5,
    subDuration: 3.2,
  },
];

// Helper: Format VTT timestamp 00:00:00.000
function formatVttTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

// 2. Transcode each segment into uniform 1080p 30fps H.264 mp4
const segmentFiles = [];
const vttCues = [];
let cumulativeTimelineSec = 0;
let cueIndex = 1;

SEGMENTS.forEach((seg, idx) => {
  const segOut = path.join(TMP_DIR, `seg_${String(idx).padStart(2, '0')}.mp4`);
  segmentFiles.push(segOut);

  console.log(`[${idx + 1}/${SEGMENTS.length}] Rendering segment ${seg.type} (${seg.duration}s)...`);

  if (seg.type === 'card') {
    execSync(
      `ffmpeg -y -loop 1 -i "${seg.image}" -c:v libx264 -t ${seg.duration} -pix_fmt yuv420p -r 30 ` +
      `-vf "scale=1920:1080" "${segOut}"`,
      { stdio: 'ignore' }
    );
  } else {
    const filters = [];
    if (seg.speed) filters.push(`setpts=${seg.speed}*PTS`);
    if (seg.crop) filters.push(`crop=${seg.crop}`);
    filters.push('scale=1920:1080');
    const vfFilter = filters.join(',');
    execSync(
      `ffmpeg -y -ss ${seg.start} -i "${seg.src}" -t ${seg.duration} -c:v libx264 -pix_fmt yuv420p -r 30 ` +
      `-vf "${vfFilter}" "${segOut}"`,
      { stdio: 'ignore' }
    );

    // Record subtitles with exact timing and long pauses
    if (seg.cues) {
      for (const cue of seg.cues) {
        const startT = cumulativeTimelineSec + cue.start;
        const endT = startT + cue.duration;
        vttCues.push({ index: cueIndex++, start: startT, end: endT, text: cue.text });
      }
    } else if (seg.subtitle) {
      const startT = cumulativeTimelineSec + (seg.subStart || 0.5);
      const endT = startT + (seg.subDuration || 3.0);
      vttCues.push({ index: cueIndex++, start: startT, end: endT, text: seg.subtitle });
    }
  }

  cumulativeTimelineSec += seg.duration;
});

// 3. Write WebVTT Subtitle File
const vttPath = path.join(TMP_DIR, 'subtitles.vtt');
let vttContent = 'WEBVTT\n\n';
for (const cue of vttCues) {
  vttContent += `${cue.index}\n${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}\n${cue.text}\n\n`;
}
fs.writeFileSync(vttPath, vttContent, 'utf8');
console.log(`✓ WebVTT subtitles written to ${vttPath} (${vttCues.length} cues across ${cumulativeTimelineSec.toFixed(1)}s timeline)`);

// 4. Concat all segments into a single master video
const concatListPath = path.join(TMP_DIR, 'concat.txt');
const concatContent = segmentFiles.map(f => `file '${f}'`).join('\n');
fs.writeFileSync(concatListPath, concatContent, 'utf8');

const uncaptionedMaster = path.join(TMP_DIR, 'master_uncaptioned.mp4');
console.log('Concatenating all segments into 1080p master video...');
execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${uncaptionedMaster}"`, { stdio: 'ignore' });

// 5. Burn-in small, non-obstructive captions at bottom margin
const finalMp4 = path.join(OUT_DIR, 'videos/robos-proof-of-work-demo.mp4');
console.log('Burning compact, elegant subtitles into final 1080p video...');
// FontSize=13, semi-transparent background capsule, ample vertical margin MarginV=24
execSync(
  `ffmpeg -y -i "${uncaptionedMaster}" ` +
  `-vf "subtitles=${vttPath}:force_style='Fontname=DejaVu Sans,FontSize=13,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BackColour=&H800b101b,BorderStyle=4,Outline=1,Shadow=0,MarginV=24'" ` +
  `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p "${finalMp4}"`,
  { stdio: 'inherit' }
);
console.log(`✓ 1080p Walkthrough Video created: ${finalMp4}`);

// 6. Generate High-Quality Animated Preview GIF (880x495, crisp palette, smooth sampling)
const finalGif = path.join(OUT_DIR, 'images/robos-proof-of-work-demo.gif');
console.log('Generating optimized animated GIF preview across all phases...');
const palettePath = path.join(TMP_DIR, 'palette.png');

// Sample the video smoothly into a high-fidelity GIF preview
execSync(
  `ffmpeg -y -i "${finalMp4}" -vf "fps=10,scale=880:495:flags=lanczos,palettegen=stats_mode=diff" "${palettePath}"`,
  { stdio: 'ignore' }
);
execSync(
  `ffmpeg -y -i "${finalMp4}" -i "${palettePath}" -lavfi "fps=10,scale=880:495:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "${finalGif}"`,
  { stdio: 'ignore' }
);

console.log(`✓ Animated GIF Preview created: ${finalGif}`);
console.log('=== Walkthrough Video and GIF Generation Complete! ===');

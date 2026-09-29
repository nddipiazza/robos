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
    duration: 3.5,
  },
  // Onboarding Wizard (rapidly advancing through setup steps 1 to 11)
  {
    type: 'video',
    src: path.join(ROOT_DIR, 'packages/robos-test/run/demos/robos-onboarding/robos-onboarding.webm'),
    start: 42,
    duration: 15,
    speed: 0.18,
    cues: [
      { start: 0.5, duration: 6.5, text: 'Setup Assistant: Step 1 (GPG Key ready) ➔ Step 2 (Pass Store init) ➔ Step 3 (Pinentry)' },
      { start: 7.5, duration: 7.0, text: 'Rapid Provisioning: Step 4 (Git Profile) ➔ Step 5 (SSH Key) ➔ Step 10 (Software Center)' },
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
    subDuration: 9.0,
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
      { start: 0.5, duration: 7.0, text: 'Knowledge Graph Explorer: Interactive SVG topology, node dependencies, & C4 architecture' },
      { start: 8.0, duration: 7.5, text: 'Schema-Driven Entity Creator: ➕ Add Entity modal with live W3C SHACL validation gate' },
      { start: 16.0, duration: 8.5, text: 'Transitive Blast Radius Analyzer & Multi-Hop Path Finder: BFS connection chains' },
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
    subDuration: 10.0,
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
      { start: 0.5, duration: 7.5, text: 'Phase 2: OpenAPI 3.1 Web Service Explorer: Browsing routes, security, & parameters' },
      { start: 8.5, duration: 8.5, text: 'Live Web Service Testing: Execute POST /pets/{id}/adopt & receive 200 OK response' },
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
    subDuration: 8.5,
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
    subDuration: 8.5,
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
      { start: 0.5, duration: 7.5, text: 'Phase 5: IntelliJ IDEA Plugin: Port 63343 IPC, pass secrets, & reproduction breakpoint' },
      { start: 8.5, duration: 8.5, text: 'Paused Thread State: Inspecting stack frames, local variables, & 14/14 Pact tests pass' },
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
    subDuration: 8.5,
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
    subDuration: 9.5,
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

// Helper: Format ASS timestamp 0:00:00.00
function formatAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
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

// 3. Write WebVTT and ASS Subtitle Files
const vttPath = path.join(TMP_DIR, 'subtitles.vtt');
let vttContent = 'WEBVTT\n\n';
for (const cue of vttCues) {
  vttContent += `${cue.index}\n${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}\n${cue.text}\n\n`;
}
fs.writeFileSync(vttPath, vttContent, 'utf8');
console.log(`✓ WebVTT subtitles written to ${vttPath} (${vttCues.length} cues across ${cumulativeTimelineSec.toFixed(1)}s timeline)`);

const assPath = path.join(TMP_DIR, 'subtitles.ass');
let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,28,&H00FFFFFF,&H000000FF,&H90000000,&Haa0b101b,-1,0,0,0,100,100,0,0,4,1,0,2,60,60,115,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
for (const cue of vttCues) {
  assContent += `Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Default,,0,0,0,,${cue.text}\n`;
}
fs.writeFileSync(assPath, assContent, 'utf8');
console.log(`✓ Pixel-perfect 1080p ASS subtitles written to ${assPath}`);

// 4. Concat all segments into a single master video
const concatListPath = path.join(TMP_DIR, 'concat.txt');
const concatContent = segmentFiles.map(f => `file '${f}'`).join('\n');
fs.writeFileSync(concatListPath, concatContent, 'utf8');

const uncaptionedMaster = path.join(TMP_DIR, 'master_uncaptioned.mp4');
console.log('Concatenating all segments into 1080p master video...');
execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${uncaptionedMaster}"`, { stdio: 'ignore' });

// 5. Burn-in crisp, pixel-perfect 1080p subtitles right above step pill
const finalMp4 = path.join(OUT_DIR, 'videos/robos-proof-of-work-demo.mp4');
console.log('Burning pixel-perfect DejaVu Sans subtitles into final 1080p video...');
execSync(
  `ffmpeg -y -i "${uncaptionedMaster}" ` +
  `-vf "ass=${assPath}" ` +
  `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p "${finalMp4}"`,
  { stdio: 'inherit' }
);
console.log(`✓ 1080p Walkthrough Video created: ${finalMp4}`);

// 6. Generate High-Res Poster Frame
const finalPoster = path.join(OUT_DIR, 'images/robos-proof-of-work-demo-poster.jpg');
console.log('Extracting high-res poster frame at active architecture point...');
execSync(
  `ffmpeg -y -ss 00:00:38 -i "${finalMp4}" -frames:v 1 -q:v 2 "${finalPoster}"`,
  { stdio: 'ignore' }
);
console.log(`✓ Poster Frame created: ${finalPoster}`);

// 7. Extract High-Impact 41s Highlight Reel across key SDLC phases with relaxed, legible pacing
console.log('Extracting high-impact highlight beats for hero loop and animated GIF with generous reading time...');
const highlightListPath = path.join(TMP_DIR, 'highlight_concat.txt');
const highlightBeats = [
  { start: '00:00:00.000', duration: 3.5 }, // Intro Title Card (3.5s)
  { start: '00:00:21.500', duration: 7.5 }, // Phase 1: Task Breakdown & Visual DAG (7.5s)
  { start: '00:00:34.000', duration: 7.5 }, // Knowledge Graph Topology & C4 Architecture (7.5s)
  { start: '00:00:59.000', duration: 7.5 }, // Dual-State Blast Radius Diff (7.5s)
  { start: '00:01:58.000', duration: 7.5 }, // IntelliJ IDEA Breakpoint Debugging (7.5s)
  { start: '00:02:16.000', duration: 7.5 }, // PR Review Theater Signoff & 1-Click Merge (7.5s)
];

const highlightFiles = [];
highlightBeats.forEach((beat, bIdx) => {
  const bOut = path.join(TMP_DIR, `beat_${bIdx}.mp4`);
  highlightFiles.push(bOut);
  execSync(
    `ffmpeg -y -ss ${beat.start} -i "${finalMp4}" -t ${beat.duration} -c:v libx264 -pix_fmt yuv420p -r 30 "${bOut}"`,
    { stdio: 'ignore' }
  );
});

fs.writeFileSync(highlightListPath, highlightFiles.map(f => `file '${f}'`).join('\n'), 'utf8');
const highlightMaster = path.join(TMP_DIR, 'highlight_master.mp4');
execSync(`ffmpeg -y -f concat -safe 0 -i "${highlightListPath}" -c copy "${highlightMaster}"`, { stdio: 'ignore' });

// 8. Generate Looping Hero MP4 for documentation homepage
const finalLoopMp4 = path.join(OUT_DIR, 'videos/robos-proof-of-work-demo-loop.mp4');
console.log('Generating optimized looping hero MP4 video...');
execSync(
  `ffmpeg -y -i "${highlightMaster}" -c:v libx264 -crf 23 -preset fast -pix_fmt yuv420p -vf "scale=880:494:flags=lanczos" "${finalLoopMp4}"`,
  { stdio: 'ignore' }
);
console.log(`✓ Looping Hero Video created: ${finalLoopMp4}`);

// 9. Generate High-Quality, Silky-Smooth Animated Hero GIF Preview (880x494, 10 fps, optimal Bayer dither)
const finalGif = path.join(OUT_DIR, 'images/robos-proof-of-work-demo.gif');
console.log('Generating relaxed-pace, high-impact animated GIF preview from highlight beats...');
const palettePath = path.join(TMP_DIR, 'palette.png');

execSync(
  `ffmpeg -y -i "${highlightMaster}" -vf "fps=10,scale=880:494:flags=lanczos,palettegen=stats_mode=diff" "${palettePath}"`,
  { stdio: 'ignore' }
);
execSync(
  `ffmpeg -y -i "${highlightMaster}" -i "${palettePath}" -lavfi "fps=10,scale=880:494:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "${finalGif}"`,
  { stdio: 'ignore' }
);

console.log(`✓ High-Impact Animated Hero GIF Preview created: ${finalGif}`);
console.log('=== Walkthrough Video, Loop, Poster, and Hero GIF Generation Complete! ===');

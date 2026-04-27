/**
 * narrate-source.js — Add piper narration to a silent screen-capture.
 *
 * Usage:
 *   node packages/robos-test/demos/narrate-source.js \
 *     --source  <raw.webm|trimmed.mp4>   \
 *     --slug    <episode-slug>           \
 *     --cues    <cues.json>              \
 *     --out     <narrated.mp4>           \
 *     --vtt     <captions.vtt>
 *
 * cues.json shape:
 *   [ { "startMs": 0, "label": "Cold open", "narration": "Four people on one team..." }, ... ]
 *
 * Pipeline (mirrors robos-install-narrate.js):
 *   1. Pre-synthesize every cue with piper (en_US-lessac-medium).
 *   2. Build a mono timeline wav where each cue starts at its startMs.
 *   3. Write a WebVTT caption sidecar.
 *   4. Mux source video (copy) + aac audio + mov_text captions → narrated.mp4.
 */
'use strict';

const path  = require('path');
const fs    = require('fs');
const { execFileSync } = require('child_process');

const {
  synthesizeCue, getAudioDurationMs, buildTimelineAudio,
} = require('../lib/narrator');
const { cuesToVtt, writeVttFile } = require('../lib/recorder');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const SOURCE    = flag('--source');
const SLUG      = flag('--slug')   || 'episode';
const CUES_FILE = flag('--cues');
const OUT_VIDEO = flag('--out');
const OUT_VTT   = flag('--vtt');

if (!SOURCE || !CUES_FILE || !OUT_VIDEO || !OUT_VTT) {
  console.error('Usage: node narrate-source.js --source <file> --slug <slug> --cues <cues.json> --out <narrated.mp4> --vtt <captions.vtt>');
  process.exit(1);
}
if (!fs.existsSync(SOURCE))    { console.error(`Source not found: ${SOURCE}`);    process.exit(1); }
if (!fs.existsSync(CUES_FILE)) { console.error(`Cues file not found: ${CUES_FILE}`); process.exit(1); }

const CUES     = JSON.parse(fs.readFileSync(CUES_FILE, 'utf8'));
const CUE_DIR  = path.join(path.dirname(OUT_VIDEO), '.cue-audio');

// ── Helpers ───────────────────────────────────────────────────────────────────
function ffprobeDurationSec(file) {
  return parseFloat(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file,
  ], { encoding: 'utf8' }).trim());
}

function muxH264AndAac(videoPath, audioPath, captionPath, outPath) {
  const args = [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-i', videoPath,
    '-i', audioPath,
  ];
  if (captionPath) args.push('-i', captionPath);
  args.push('-map', '0:v:0', '-map', '1:a:0');
  if (captionPath) args.push('-map', '2:s:0');
  args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k');
  if (captionPath) {
    args.push('-c:s', 'mov_text',
      '-metadata:s:s:0', 'language=eng',
      '-metadata:s:s:0', 'title=English',
    );
  }
  args.push('-shortest', outPath);
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const videoDurSec = ffprobeDurationSec(SOURCE);
  const videoDurMs  = Math.round(videoDurSec * 1000);
  console.log(`Source: ${SOURCE}  (${videoDurSec.toFixed(2)}s)`);
  console.log(`Cues:   ${CUES.length}`);

  fs.rmSync(CUE_DIR, { recursive: true, force: true });
  fs.mkdirSync(CUE_DIR, { recursive: true });

  console.log(`\nSynthesizing ${CUES.length} narration cues with piper...`);
  const cueAudio = [];
  for (let i = 0; i < CUES.length; i++) {
    const cue = CUES[i];
    const wav = path.join(CUE_DIR, `cue-${String(i).padStart(2, '0')}.wav`);
    await synthesizeCue(cue.narration, wav);
    const durMs = getAudioDurationMs(wav);
    cueAudio.push({ wav, durMs });
    console.log(`  [${i + 1}/${CUES.length}] ${(durMs / 1000).toFixed(2)}s  "${cue.narration.slice(0, 60)}..."`);
  }

  // Warn on overruns
  for (let i = 0; i < CUES.length; i++) {
    const startMs = CUES[i].startMs;
    const nextMs  = i + 1 < CUES.length ? CUES[i + 1].startMs : videoDurMs;
    const gap     = nextMs - startMs;
    if (cueAudio[i].durMs > gap) {
      console.log(`  ! cue ${i + 1} is ${(cueAudio[i].durMs / 1000).toFixed(2)}s but slot is ${(gap / 1000).toFixed(2)}s — will overlap`);
    }
  }

  // Timeline wav
  const timelineCues = CUES.map((c, i) => ({ wav: cueAudio[i].wav, startMs: c.startMs }));
  const audioPath = path.join(CUE_DIR, 'timeline.wav');
  console.log('\nBuilding timeline audio...');
  buildTimelineAudio(timelineCues, audioPath, videoDurMs);

  // WebVTT captions
  const vttCues = CUES.map((c, i) => {
    const startMs = c.startMs;
    const endMs   = i + 1 < CUES.length ? CUES[i + 1].startMs : videoDurMs;
    return { startMs, endMs, text: c.narration };
  });
  writeVttFile(vttCues, OUT_VTT);
  console.log(`Wrote captions: ${OUT_VTT}`);

  // Mux
  console.log('Muxing video + audio + captions...');
  fs.mkdirSync(path.dirname(OUT_VIDEO), { recursive: true });
  muxH264AndAac(SOURCE, audioPath, OUT_VTT, OUT_VIDEO);
  console.log(`\nWrote: ${OUT_VIDEO}`);
}

main().catch(err => { console.error(err); process.exit(1); });

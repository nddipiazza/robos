/**
 * Add piper narration to ~/Videos/robos-install.mp4.
 *
 * Pipeline:
 *   1. Pre-synthesize every narration cue with piper (en_US-lessac-medium)
 *   2. Build a mono timeline wav where each cue starts at its given timestamp
 *   3. Write a WebVTT caption sidecar
 *   4. Mux the source mp4 video (copied) with the new audio (aac) into
 *      robos-install-narrated.mp4
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const { execFileSync } = require('child_process');

const {
  synthesizeCue, getAudioDurationMs, buildTimelineAudio,
} = require('../lib/narrator');
const { cuesToVtt, writeVttFile } = require('../lib/recorder');

const HOME = process.env.HOME;
const IN_VIDEO  = path.join(HOME, 'Videos', 'robos-install.mp4');
const OUT_DIR   = path.join(HOME, 'Videos');
const OUT_VIDEO = path.join(OUT_DIR, 'robos-install-narrated.mp4');
const OUT_VTT   = path.join(OUT_DIR, 'robos-install.vtt');
const CUE_DIR   = path.join(OUT_DIR, '.robos-install-cues');

// Cue times are seconds into the video. The user's stamps were MM:SS:cc.
const SCRIPT = [
  {
    atSec: 0.0,
    narration: 'Installing RobOS from the latest GitHub release — the full end-to-end install on a fresh QEMU virtual machine, lightly trimmed so you can see it finish.',
  },
  {
    atSec: 9.09,
    narration: 'Cloud-init kicks off — pulling down Ubuntu 24.04 and the GNOME desktop.',
  },
  {
    atSec: 13.23,
    narration: 'Next: the Dash-to-Panel extension, LightDM display manager, and Node.js.',
  },
  {
    atSec: 19.57,
    narration: 'Then Electron, installed globally, and every RobOS app itself — over forty Electron programs — unpacked from the install tarball and wired into the desktop launcher and panel.',
  },
  {
    atSec: 32.04,
    narration: 'Install complete. RobOS cleans up and schedules a reboot — the last step before handing control over to the new desktop.',
  },
  {
    atSec: 43.05,
    narration: 'On reboot you get the boot sequence every Linux user knows — kernel messages, systemd bringing services online, the display manager taking over.',
  },
  {
    atSec: 82.14,
    narration: 'And there it is — the RobOS login screen, themed dark navy and cyan.',
  },
  {
    atSec: 87.00,
    narration: 'The RobOS desktop. The Active Task widget panel anchors to the right, the dashboard fills the background, and every installed RobOS app is one click away from the launcher.',
  },
];

function ffprobeDurationSec(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ], { encoding: 'utf8' }).trim();
  return parseFloat(out);
}

function muxH264AndAac(videoPath, audioPath, captionPath, outPath) {
  const args = [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-i', videoPath,
    '-i', audioPath,
  ];
  if (captionPath) args.push('-i', captionPath);
  args.push(
    '-map', '0:v:0',
    '-map', '1:a:0',
  );
  if (captionPath) args.push('-map', '2:s:0');
  args.push(
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '160k',
  );
  if (captionPath) {
    args.push('-c:s', 'mov_text',
      '-metadata:s:s:0', 'language=eng',
      '-metadata:s:s:0', 'title=English',
    );
  }
  args.push('-shortest', outPath);
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
}

async function main() {
  if (!fs.existsSync(IN_VIDEO)) {
    throw new Error(`Source video not found: ${IN_VIDEO}`);
  }

  const videoDurSec = ffprobeDurationSec(IN_VIDEO);
  const videoDurMs  = Math.round(videoDurSec * 1000);
  console.log(`Source: ${IN_VIDEO}  (${videoDurSec.toFixed(2)}s)`);

  fs.rmSync(CUE_DIR, { recursive: true, force: true });
  fs.mkdirSync(CUE_DIR, { recursive: true });

  console.log(`Synthesizing ${SCRIPT.length} narration cues with piper...`);
  const cueAudio = [];
  for (let i = 0; i < SCRIPT.length; i++) {
    const wav = path.join(CUE_DIR, `cue-${String(i).padStart(2, '0')}.wav`);
    await synthesizeCue(SCRIPT[i].narration, wav);
    const durMs = getAudioDurationMs(wav);
    cueAudio.push({ wav, durMs });
    console.log(`  [${i+1}/${SCRIPT.length}] ${SCRIPT[i].narration.slice(0, 55)}...  (${(durMs/1000).toFixed(2)}s)`);
  }

  // Warn if any narration overruns its slot
  for (let i = 0; i < SCRIPT.length; i++) {
    const startMs = Math.round(SCRIPT[i].atSec * 1000);
    const nextMs  = i + 1 < SCRIPT.length ? Math.round(SCRIPT[i+1].atSec * 1000) : videoDurMs;
    const gap = nextMs - startMs;
    if (cueAudio[i].durMs > gap) {
      console.log(`  ! cue ${i+1} is ${(cueAudio[i].durMs/1000).toFixed(2)}s but slot is ${(gap/1000).toFixed(2)}s — will overlap into next cue`);
    }
  }

  // Timeline audio
  const timelineCues = SCRIPT.map((s, i) => ({ wav: cueAudio[i].wav, startMs: Math.round(s.atSec * 1000) }));
  const audioPath = path.join(CUE_DIR, 'timeline.wav');
  console.log('Building timeline audio...');
  buildTimelineAudio(timelineCues, audioPath, videoDurMs);

  // Captions (WebVTT)
  const vttCues = SCRIPT.map((s, i) => {
    const startMs = Math.round(s.atSec * 1000);
    const endMs   = i + 1 < SCRIPT.length ? Math.round(SCRIPT[i+1].atSec * 1000) : videoDurMs;
    return { startMs, endMs, text: s.narration };
  });
  writeVttFile(vttCues, OUT_VTT);
  console.log(`Wrote captions: ${OUT_VTT}`);

  // Mux into mp4 with aac audio + mov_text subtitles
  console.log('Muxing video + audio + captions...');
  muxH264AndAac(IN_VIDEO, audioPath, OUT_VTT, OUT_VIDEO);
  console.log(`Wrote: ${OUT_VIDEO}`);
}

main().catch(err => { console.error(err); process.exit(1); });

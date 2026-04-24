/**
 * notifications demo — launches the Notifications app, records the window,
 * walks through filter / search / prefs interactions, emits captions, and
 * produces a final narrated video.
 *
 * Outputs (in packages/robos-test/run/demos/notifications/):
 *   notifications.webm         — silent screen capture
 *   notifications.vtt          — WebVTT captions
 *   notifications-audio.wav    — narration track (timeline)
 *   notifications-final.webm   — muxed video + audio
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const { launchApp, killApp } = require('../lib/harness');
const { evalJS }             = require('../lib/snapshot');
const scenarios              = require('../lib/scenarios');
const {
  findWindowGeometry, startRecording, stopRecording,
  createCaptionTrack, writeVttFile,
} = require('../lib/recorder');
const {
  synthesizeCue, getAudioDurationMs, buildTimelineAudio, muxVideoAudio,
} = require('../lib/narrator');

const OUT_DIR       = path.join(__dirname, '..', 'run', 'demos', 'notifications');
const OUT_VIDEO     = path.join(OUT_DIR, 'notifications.webm');
const OUT_CAPTION   = path.join(OUT_DIR, 'notifications.vtt');
const OUT_AUDIO     = path.join(OUT_DIR, 'notifications-audio.wav');
const OUT_FINAL     = path.join(OUT_DIR, 'notifications-final.webm');
const CUE_AUDIO_DIR = path.join(OUT_DIR, 'cue-audio');

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

const SAMPLE_NOTIFICATIONS = [
  { id: '1', category: 'pr_review', tier: 'critical', title: 'Review requested: auth middleware rewrite', body: 'nddipiazza requested your review on PR #412', read: false, ts: Date.now() - 1 * MIN },
  { id: '2', category: 'ci_cd',     tier: 'warning',  title: 'Flaky test on main', body: 'auth.spec.ts failed 2 of 5 retries', read: false, ts: Date.now() - 15 * MIN },
  { id: '3', category: 'task',      tier: 'info',     title: 'Task assigned: ROB-284', body: 'Desktop widget polish', read: false, ts: Date.now() - 2 * HOUR },
  { id: '4', category: 'agent',     tier: 'info',     title: 'Agent finished: docs refresh', body: 'AI agent completed documentation refresh', read: true,  ts: Date.now() - 5 * HOUR },
  { id: '5', category: 'system',    tier: 'warning',  title: 'Disk usage at 82%', body: '/ partition approaching threshold', read: false, ts: Date.now() - 10 * HOUR },
  { id: '6', category: 'pr_review', tier: 'info',     title: 'PR merged: dashboard cleanup', body: 'Your PR was merged to main', read: true,  ts: Date.now() - 18 * HOUR },
  { id: '7', category: 'ci_cd',     tier: 'critical', title: 'Deploy failed: prod', body: 'Release 0.0.4 failed at smoke test', read: false, ts: Date.now() - 1 * DAY },
];

/**
 * Each script entry is one narration cue.
 *   narration — spoken text + caption
 *   js        — runs in the renderer at cue start
 *   minHold   — minimum time the cue stays on screen (ms)
 *               Actual wait = max(minHold, audioDurationMs + BREATHE_MS).
 */
const BREATHE_MS = 600;
const SCRIPT = [
  {
    narration: 'RobOS Notifications collects every signal from your workflow — pull requests, CI, tasks, agents, and system alerts — in one place.',
    js: null,
    minHold: 2000,
  },
  {
    narration: 'Filter by category. Unchecking Pull Request Review hides those notifications.',
    js: `document.querySelector('[data-cat="pr_review"]').click();`,
    minHold: 2000,
  },
  {
    narration: 'Re-enabling the filter brings them back.',
    js: `document.querySelector('[data-cat="pr_review"]').click();`,
    minHold: 1500,
  },
  {
    narration: 'You can also filter by severity. Hiding Info keeps only Critical and Warning items.',
    js: `document.querySelector('[data-tier="info"]').click();`,
    minHold: 2000,
  },
  {
    narration: 'Info notifications return.',
    js: `document.querySelector('[data-tier="info"]').click();`,
    minHold: 1500,
  },
  {
    narration: 'The search box narrows the list by title and body. Searching for "deploy" surfaces just the deploy-related items.',
    js: `(() => { const i = document.getElementById('search-input'); i.value = 'deploy'; i.dispatchEvent(new Event('input', {bubbles:true})); })();`,
    minHold: 2500,
  },
  {
    narration: 'Clearing the search restores the full list.',
    js: `(() => { const i = document.getElementById('search-input'); i.value = ''; i.dispatchEvent(new Event('input', {bubbles:true})); })();`,
    minHold: 1500,
  },
  {
    narration: 'The Preferences tab controls when and how notifications appear.',
    js: `document.querySelector('.tab[data-tab="prefs"]').click();`,
    minHold: 2000,
  },
  {
    narration: 'Turning on Do Not Disturb suppresses toasts system-wide.',
    js: `document.getElementById('pref-dnd').click();`,
    minHold: 1800,
  },
  {
    narration: 'Back on the Notifications tab, unread counts update in real time.',
    js: `document.querySelector('.tab[data-tab="list"]').click();`,
    minHold: 2500,
  },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function preSynthesize() {
  fs.rmSync(CUE_AUDIO_DIR, { recursive: true, force: true });
  fs.mkdirSync(CUE_AUDIO_DIR, { recursive: true });
  const audio = [];
  for (let i = 0; i < SCRIPT.length; i++) {
    const wav = path.join(CUE_AUDIO_DIR, `cue-${String(i).padStart(2, '0')}.wav`);
    process.stdout.write(`  [tts ${i+1}/${SCRIPT.length}] synthesizing...\r`);
    await synthesizeCue(SCRIPT[i].narration, wav);
    const durationMs = getAudioDurationMs(wav);
    audio.push({ wav, durationMs });
  }
  process.stdout.write('\n');
  return audio;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  process.env.ROBOS_DEMO_SHOW = '1';

  console.log('Pre-synthesizing narration...');
  const cueAudio = await preSynthesize();
  cueAudio.forEach((a, i) => console.log(`    cue ${i+1}: ${(a.durationMs/1000).toFixed(2)}s`));

  const app = await launchApp('notifications', { ...scenarios['all-good'], name: 'demo' });
  let rec = null;
  try {
    const notifsFile = path.join(app.sandboxHome, '.config', 'robos', 'notifications.json');
    fs.writeFileSync(notifsFile, JSON.stringify(SAMPLE_NOTIFICATIONS, null, 2));
    await evalJS(app.port, 'load()');
    await sleep(800);

    const geom = await findWindowGeometry('RobOS Notifications');
    console.log('Window geometry:', geom);

    rec = startRecording({ geometry: geom, outPath: OUT_VIDEO });
    const captions = createCaptionTrack(rec);
    await sleep(500); // brief lead-in

    const cueStartMs = [];
    for (let i = 0; i < SCRIPT.length; i++) {
      const { narration, js, minHold } = SCRIPT[i];
      process.stdout.write(`  [cue ${i+1}/${SCRIPT.length}] ${narration.slice(0, 60)}...\n`);
      if (js) await evalJS(app.port, js);
      const startMs = Date.now() - rec.startedAt;
      captions.add(narration);
      cueStartMs.push(startMs);
      const hold = Math.max(minHold, cueAudio[i].durationMs + BREATHE_MS);
      await sleep(hold);
    }

    const cues = captions.finalize();
    const result = await stopRecording(rec);
    rec = null;
    writeVttFile(cues, OUT_CAPTION);
    console.log(`Wrote ${result.outPath}  (${(result.durationMs/1000).toFixed(1)}s)`);
    console.log(`Wrote ${OUT_CAPTION}  (${cues.length} cues)`);

    console.log('Building narration timeline...');
    const timelineCues = cueAudio.map((a, i) => ({ wav: a.wav, startMs: cueStartMs[i] }));
    buildTimelineAudio(timelineCues, OUT_AUDIO, result.durationMs);
    console.log(`Wrote ${OUT_AUDIO}`);

    console.log('Muxing video + audio + captions...');
    muxVideoAudio(OUT_VIDEO, OUT_AUDIO, OUT_FINAL, { captionPath: OUT_CAPTION });
    console.log(`Wrote ${OUT_FINAL}`);
  } catch (err) {
    if (rec) await stopRecording(rec).catch(() => {});
    console.error('Demo failed:', err);
    process.exitCode = 1;
  } finally {
    await killApp(app);
  }
}

main();

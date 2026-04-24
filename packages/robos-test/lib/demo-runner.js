/**
 * Shared demo runner — takes a demo config and produces:
 *   <out>/<slug>.webm          — silent screen capture
 *   <out>/<slug>.vtt           — captions
 *   <out>/<slug>-audio.wav     — narration timeline
 *   <out>/<slug>-final.webm    — muxed video+audio+captions
 *   <out>/cue-audio/cue-NN.wav — per-cue narration
 *
 * Config shape:
 *   {
 *     slug:        'task-board',
 *     appId:       'task-board',
 *     windowTitle: 'RobOS Task Board',
 *     scenario:    scenarios['issue-manager-github'],
 *     prelaunch:   async (app) => {}   // optional; e.g. seed files or navigate
 *     script:      [ { narration, js, minHold }, ... ]
 *     env:         { ROBOS_DEMO_SHOW: '1' } // optional env overrides
 *   }
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const { launchApp, killApp } = require('./harness');
const { evalJS }             = require('./snapshot');
const {
  findWindowGeometry, startRecording, stopRecording,
  createCaptionTrack, writeVttFile,
} = require('./recorder');
const {
  synthesizeCue, getAudioDurationMs, buildTimelineAudio, muxVideoAudio,
} = require('./narrator');

const BREATHE_MS = 600;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runDemo(config) {
  const {
    slug, appId, windowTitle, scenario, script,
    prelaunch = async () => {},
    env = {},
    outRoot = path.join(__dirname, '..', 'run', 'demos'),
    postSettle = 1200,
  } = config;

  const outDir = path.join(outRoot, slug);
  fs.mkdirSync(outDir, { recursive: true });
  const outVideo   = path.join(outDir, `${slug}.webm`);
  const outCaption = path.join(outDir, `${slug}.vtt`);
  const outAudio   = path.join(outDir, `${slug}-audio.wav`);
  const outFinal   = path.join(outDir, `${slug}-final.webm`);
  const cueAudioDir = path.join(outDir, 'cue-audio');

  for (const [k, v] of Object.entries(env)) process.env[k] = v;

  // Pre-synthesize narration
  console.log(`[${slug}] Pre-synthesizing narration...`);
  fs.rmSync(cueAudioDir, { recursive: true, force: true });
  fs.mkdirSync(cueAudioDir, { recursive: true });
  const cueAudio = [];
  for (let i = 0; i < script.length; i++) {
    const wav = path.join(cueAudioDir, `cue-${String(i).padStart(2, '0')}.wav`);
    process.stdout.write(`  [tts ${i+1}/${script.length}]\r`);
    await synthesizeCue(script[i].narration, wav);
    cueAudio.push({ wav, durationMs: getAudioDurationMs(wav) });
  }
  process.stdout.write('\n');
  cueAudio.forEach((a, i) => console.log(`    cue ${i+1}: ${(a.durationMs/1000).toFixed(2)}s`));

  // Preserve scenario.name (used by sandbox stubs for scenario-aware behavior).
  // Only fall back to 'demo' when the scenario object has no explicit name.
  const app = await launchApp(appId, { name: 'demo', ...scenario });
  let rec = null;
  try {
    await prelaunch(app);
    await sleep(postSettle);

    const geom = await findWindowGeometry(windowTitle);
    console.log(`[${slug}] window: ${geom.w}x${geom.h} @ (${geom.x},${geom.y})`);

    rec = startRecording({ geometry: geom, outPath: outVideo });
    const captions = createCaptionTrack(rec);
    await sleep(500);

    const cueStartMs = [];
    for (let i = 0; i < script.length; i++) {
      const { narration, js, minHold = 1500 } = script[i];
      process.stdout.write(`  [cue ${i+1}/${script.length}] ${narration.slice(0, 56)}...\n`);
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
    writeVttFile(cues, outCaption);
    console.log(`[${slug}] wrote ${result.outPath}  (${(result.durationMs/1000).toFixed(1)}s)`);

    const timelineCues = cueAudio.map((a, i) => ({ wav: a.wav, startMs: cueStartMs[i] }));
    buildTimelineAudio(timelineCues, outAudio, result.durationMs);
    muxVideoAudio(outVideo, outAudio, outFinal, { captionPath: outCaption });
    console.log(`[${slug}] wrote ${outFinal}`);

    return { outDir, outVideo, outCaption, outAudio, outFinal, durationMs: result.durationMs, cues };
  } catch (err) {
    if (rec) await stopRecording(rec).catch(() => {});
    throw err;
  } finally {
    await killApp(app);
  }
}

module.exports = { runDemo };

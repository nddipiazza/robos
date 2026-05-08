/**
 * Narrator — TTS with Piper + audio timeline + video mux.
 *
 * synthesizeCue(text, outWav)    — run Piper, produce a wav
 * getAudioDurationMs(path)       — probe wav duration
 * buildTimelineAudio(cues, out)  — place cue wavs at their start times
 * muxVideoAudio(vid, aud, out)   — combine into a single file
 */
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT   = path.resolve(__dirname, '../../..');
const MODELS_DIR  = path.join(__dirname, '..', 'models');
const DEFAULT_VOICE = 'en_US-lessac-medium';

function synthesizeCue(text, outWav, { voice = DEFAULT_VOICE, dataDir = MODELS_DIR, lengthScale } = {}) {
  fs.mkdirSync(path.dirname(outWav), { recursive: true });
  // Piper requires a full path to the .onnx file when the model name has no extension.
  const modelPath = voice.includes('/') || voice.endsWith('.onnx')
    ? voice
    : path.join(dataDir, `${voice}.onnx`);
  const args = ['-m', modelPath, '--data-dir', dataDir, '-f', outWav];
  if (lengthScale != null) args.push('--length-scale', String(lengthScale));
  return new Promise((resolve, reject) => {
    const proc = spawn('piper', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0 && fs.existsSync(outWav)) resolve({ path: outWav });
      else reject(new Error(`piper exited ${code}: ${stderr}`));
    });
    proc.stdin.write(text + '\n');
    proc.stdin.end();
  });
}

function getAudioDurationMs(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    filePath,
  ], { encoding: 'utf8' }).trim();
  return Math.round(parseFloat(out) * 1000);
}

/**
 * Build a single audio track where each cue wav is placed at cue.startMs.
 *
 * @param {Array<{wav: string, startMs: number}>} cues
 * @param {string} outPath         Output wav path
 * @param {number} totalMs         Desired total duration (track trimmed to this)
 */
function buildTimelineAudio(cues, outPath, totalMs) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (cues.length === 0) {
    // Just emit silence of totalMs
    execFileSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'warning',
      '-f', 'lavfi', '-i', `anullsrc=r=22050:cl=mono`,
      '-t', (totalMs / 1000).toFixed(3),
      '-c:a', 'pcm_s16le',
      outPath,
    ]);
    return outPath;
  }

  const inputs = [];
  for (const c of cues) {
    inputs.push('-i', c.wav);
  }

  // Build filter_complex: delay each input, then amix
  const filterParts = [];
  const mixLabels = [];
  cues.forEach((c, i) => {
    const delay = Math.max(0, Math.round(c.startMs));
    filterParts.push(`[${i}:a]adelay=${delay}|${delay},apad[a${i}]`);
    mixLabels.push(`[a${i}]`);
  });
  filterParts.push(`${mixLabels.join('')}amix=inputs=${cues.length}:duration=first:normalize=0[out]`);
  // The `apad` on each input keeps amix's "first" duration honest; we then trim
  // with -t on the output to the desired totalMs.

  const args = [
    '-y', '-hide_banner', '-loglevel', 'warning',
    ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[out]',
    '-t', (totalMs / 1000).toFixed(3),
    '-c:a', 'pcm_s16le',
    '-ar', '22050',
    '-ac', '1',
    outPath,
  ];
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  return outPath;
}

function muxVideoAudio(videoPath, audioPath, outPath, { captionPath, captionLanguage = 'eng', captionTitle = 'English' } = {}) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const args = [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-i', videoPath,
    '-i', audioPath,
  ];
  if (captionPath) args.push('-i', captionPath);
  args.push(
    '-c:v', 'copy',
    '-c:a', 'libopus', '-b:a', '96k',
    '-shortest',
    '-map', '0:v:0', '-map', '1:a:0',
  );
  if (captionPath) {
    args.push(
      '-map', '2:s:0',
      '-c:s', 'webvtt',
      `-metadata:s:s:0`, `language=${captionLanguage}`,
      `-metadata:s:s:0`, `title=${captionTitle}`,
      '-disposition:s:0', 'default',
    );
  }
  args.push(outPath);
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  return outPath;
}

module.exports = {
  synthesizeCue,
  getAudioDurationMs,
  buildTimelineAudio,
  muxVideoAudio,
  DEFAULT_VOICE,
  MODELS_DIR,
};

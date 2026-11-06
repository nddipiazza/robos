'use strict';

// Webcams and capture cards attached to this computer. ffmpeg reads them with
// DirectShow on Windows, V4L2 on Linux and AVFoundation on macOS, so listing
// and opening them goes through ffmpeg too.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ffmpeg input arguments for a camera input:
 *  - { kind: 'device', format, name, videoSize } for a local webcam
 *  - { url, transport } for a network stream
 */
function inputArgs(input) {
  if (input?.kind === 'device') {
    const size = input.videoSize ? ['-video_size', input.videoSize] : [];
    if (input.format === 'dshow') {
      // A large real-time buffer avoids "real-time buffer too full" frame drops.
      return ['-f', 'dshow', '-rtbufsize', '256M', ...size, '-i', `video=${input.name}`];
    }
    if (input.format === 'avfoundation') {
      return ['-f', 'avfoundation', '-framerate', '30', ...size, '-i', `${input.name}:none`];
    }
    return ['-f', 'v4l2', ...size, '-i', input.name];
  }
  const args = [];
  if (/^rtsps?:/i.test(input?.url || '')) args.push('-rtsp_transport', input.transport || 'tcp');
  args.push('-i', input?.url || '');
  return args;
}

/** Parse `ffmpeg -list_devices true -f dshow -i dummy` output into video device names. */
function parseDshowList(text) {
  const out = [];
  let section = '';
  for (const line of String(text).split(/\r?\n/)) {
    if (/DirectShow video devices/i.test(line)) { section = 'video'; continue; }
    if (/DirectShow audio devices/i.test(line)) { section = 'audio'; continue; }
    if (/Alternative name/i.test(line)) continue;
    const m = /"([^"]+)"(?:\s*\((video|audio|none|video,audio|audio,video)\))?/.exec(line);
    if (!m) continue;
    const type = m[2] || section;
    if (/video/.test(type) && !out.includes(m[1])) out.push(m[1]);
  }
  return out.map((name) => ({ format: 'dshow', name, label: name }));
}

/** Parse `ffmpeg -f avfoundation -list_devices true -i ""` output. */
function parseAvfoundationList(text) {
  const out = [];
  let inVideo = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (/AVFoundation video devices/i.test(line)) { inVideo = true; continue; }
    if (/AVFoundation audio devices/i.test(line)) { inVideo = false; continue; }
    const m = /\]\s*\[(\d+)\]\s*(.+)$/.exec(line);
    if (inVideo && m && !/capture screen/i.test(m[2])) out.push({ format: 'avfoundation', name: m[1], label: m[2].trim() });
  }
  return out;
}

function listV4l2(devDir = '/dev', sysDir = '/sys/class/video4linux') {
  let nodes = [];
  try { nodes = fs.readdirSync(devDir).filter((n) => /^video\d+$/.test(n)); } catch { return []; }
  return nodes
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
    .map((n) => {
      let label = n;
      try { label = `${fs.readFileSync(path.join(sysDir, n, 'name'), 'utf8').trim()} (${n})`; } catch {}
      return { format: 'v4l2', name: path.posix.join(devDir, n), label };
    });
}

function runForText(ffmpegPath, args, spawnFn, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawnFn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) { reject(err); return; }
    let text = '';
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, timeoutMs);
    proc.stdout?.on('data', (d) => { text += d; });
    proc.stderr?.on('data', (d) => { text += d; });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT' ? new Error('ffmpeg was not found. Install it or set its path in Settings.') : err);
    });
    // Listing exits with an error code on purpose (no real input); the text is what matters.
    proc.on('close', () => { clearTimeout(timer); resolve(text); });
  });
}

/** List the webcams on this computer: [{ format, name, label }]. */
async function listLocalDevices({ ffmpegPath = 'ffmpeg', platform = process.platform, spawnFn = spawn } = {}) {
  if (platform === 'win32') {
    return parseDshowList(await runForText(ffmpegPath, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], spawnFn));
  }
  if (platform === 'darwin') {
    return parseAvfoundationList(await runForText(ffmpegPath, ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], spawnFn));
  }
  return listV4l2();
}

module.exports = { inputArgs, listLocalDevices, parseDshowList, parseAvfoundationList, listV4l2 };

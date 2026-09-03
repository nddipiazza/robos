/**
 * Video recorder — captures a named X11 window to webm using ffmpeg x11grab.
 *
 * Usage:
 *   const geom = await findWindowGeometry('RobOS Notifications');
 *   const rec  = startRecording({ geometry: geom, outPath: 'out.webm' });
 *   // ... drive the app ...
 *   await stopRecording(rec);
 */
'use strict';

const { spawn, execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getXauth() {
  if (process.env.XAUTHORITY) return process.env.XAUTHORITY;
  try {
    const uid = process.getuid ? process.getuid() : 1000;
    const candidates = [
      `/run/user/${uid}/.mutter-Xwaylandauth*`,
      `/run/user/${uid}/gdm/Xauthority`,
      path.join(process.env.HOME || '/home/robos', '.Xauthority'),
    ];
    for (const pat of candidates) {
      const found = execSync(`ls ${pat} 2>/dev/null | head -1`, { encoding: 'utf8' }).trim();
      if (found && fs.existsSync(found)) return found;
    }
  } catch {}
  return null;
}

async function findWindowGeometry(title, { display, timeoutMs = 10000 } = {}) {
  const disp  = display || process.env.DISPLAY || ':0.0';
  const xauth = getXauth();
  const env = { ...process.env, DISPLAY: disp };
  if (xauth) env.XAUTHORITY = xauth;

  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      let out = null;
      try {
        out = execSync(`xwininfo -name ${JSON.stringify(title)}`, {
          env,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        // Fallback: search tree for matching title substring
        const tree = execSync(`xwininfo -root -tree`, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        const m = tree.match(new RegExp(`(0x[0-9a-f]+)\\s+"[^"]*${title}[^"]*"`, 'i'));
        if (m) {
          out = execSync(`xwininfo -id ${m[1]}`, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        }
      }
      if (out) {
        const x = parseInt((out.match(/Absolute upper-left X:\s+(-?\d+)/) || [])[1], 10);
        const y = parseInt((out.match(/Absolute upper-left Y:\s+(-?\d+)/) || [])[1], 10);
        const w = parseInt((out.match(/Width:\s+(\d+)/) || [])[1], 10);
        const h = parseInt((out.match(/Height:\s+(\d+)/) || [])[1], 10);
        const mapped = /Map State:\s+IsViewable/.test(out);
        if (Number.isFinite(x + y + w + h) && mapped) {
          return { x, y, w, h, display: disp };
        }
      }
    } catch (e) { lastErr = e; }
    await sleep(300);
  }
  throw new Error(`Window "${title}" not viewable within ${timeoutMs}ms: ${lastErr && lastErr.message}`);
}

function startRecording({ geometry, outPath, framerate = 30 }) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const xauth = getXauth();
  const env = { ...process.env, DISPLAY: geometry.display };
  if (xauth) env.XAUTHORITY = xauth;

  // ffmpeg requires even dimensions for most codecs
  const w = geometry.w - (geometry.w % 2);
  const h = geometry.h - (geometry.h % 2);
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'warning',
    '-f', 'x11grab',
    '-framerate', String(framerate),
    '-video_size', `${w}x${h}`,
    '-i', `${geometry.display}+${geometry.x},${geometry.y}`,
    '-c:v', 'libvpx-vp9',
    '-b:v', '2M',
    '-deadline', 'realtime',
    '-cpu-used', '4',
    '-pix_fmt', 'yuv420p',
    outPath,
  ];
  const proc = spawn('ffmpeg', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d.toString(); });
  proc.on('error', err => { stderr += `\nspawn error: ${err.message}`; });
  return { proc, outPath, startedAt: Date.now(), stderr: () => stderr };
}

async function stopRecording(handle) {
  if (!handle || !handle.proc) return;
  // Graceful shutdown: 'q' on stdin lets ffmpeg finalize the container.
  try { handle.proc.stdin.write('q'); handle.proc.stdin.end(); } catch {}
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try { handle.proc.kill('SIGINT'); } catch {}
      setTimeout(() => {
        try { handle.proc.kill('SIGKILL'); } catch {}
        resolve();
      }, 2000);
    }, 5000);
    handle.proc.on('exit', () => { clearTimeout(t); resolve(); });
    if (handle.proc.exitCode !== null) { clearTimeout(t); resolve(); }
  });
  const durationMs = Date.now() - handle.startedAt;
  return { outPath: handle.outPath, durationMs, stderr: handle.stderr() };
}

// ── Caption recording ────────────────────────────────────────────────────────

function createCaptionTrack(recording) {
  const cues = [];
  return {
    /**
     * Record a narration cue starting NOW, relative to the recording start.
     * The cue ends when the next cue begins (or when finalize is called).
     */
    add(text) {
      const startMs = Date.now() - recording.startedAt;
      if (cues.length > 0 && cues[cues.length - 1].endMs === null) {
        cues[cues.length - 1].endMs = startMs;
      }
      cues.push({ startMs, endMs: null, text });
    },
    /** Close the open cue at the given elapsed ms (or now). */
    finalize(endMs) {
      const finalMs = endMs != null ? endMs : (Date.now() - recording.startedAt);
      if (cues.length > 0 && cues[cues.length - 1].endMs === null) {
        cues[cues.length - 1].endMs = finalMs;
      }
      return cues.slice();
    },
    cues,
  };
}

function formatVttTimestamp(ms) {
  const total = Math.max(0, Math.floor(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const msPart = total % 1000;
  const pad = (n, w) => String(n).padStart(w, '0');
  return `${pad(h,2)}:${pad(m,2)}:${pad(s,2)}.${pad(msPart,3)}`;
}

function cuesToVtt(cues) {
  const lines = ['WEBVTT', ''];
  cues.forEach((cue, i) => {
    const start = formatVttTimestamp(cue.startMs);
    const end   = formatVttTimestamp(cue.endMs != null ? cue.endMs : cue.startMs + 1500);
    lines.push(String(i + 1));
    lines.push(`${start} --> ${end}`);
    lines.push(cue.text);
    lines.push('');
  });
  return lines.join('\n');
}

function writeVttFile(cues, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, cuesToVtt(cues), 'utf8');
  return outPath;
}

module.exports = {
  findWindowGeometry,
  startRecording,
  stopRecording,
  createCaptionTrack,
  cuesToVtt,
  writeVttFile,
  formatVttTimestamp,
};

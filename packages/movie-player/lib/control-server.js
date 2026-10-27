'use strict';

// A small control API so other RobOS apps can use the Audio Player's speaker
// for a moment without ending the music session.
//
// The server listens on loopback only, on a free port. Its port and a random
// token go to ~/.config/robos/audio-player-control.json (readable by this user
// only); every request carries the token in an X-RobOS-Token header, so web
// pages in a browser cannot drive it.
//
//   GET  /api/status       what the Audio Player is playing, and where
//   POST /api/speak-clip   { speakerIp?, filePath | url, title?, artist?, durationMs?, holdMs? }
//                          plays the clip on the speaker the music is cast to;
//                          the song continues where it was afterwards
//   POST /api/pause        pauses the music
//   POST /api/resume       resumes it
//
// The same module has the client side (createAudioPlayerClient) other apps use.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const CONTROL_FILE = 'movie-player-control.json';
const MAX_BODY = 64 * 1024;
const CLIP_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.mp3', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.flac']);

function defaultConfigDir() {
  return process.env.ROBOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'robos');
}

function controlFilePath(configDir = defaultConfigDir()) {
  return path.join(configDir, CONTROL_FILE);
}

function probeDurationMs(filePath) {
  return new Promise((resolve) => {
    let out = '';
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath]);
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', () => {
      const s = Number.parseFloat(out);
      resolve(Number.isFinite(s) ? Math.round(s * 1000) : null);
    });
  });
}

// Checks a speak-clip request; returns { clip } or { error }.
async function validateClip(body, { probe = probeDurationMs } = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const clip = {
    speakerIp: typeof b.speakerIp === 'string' && b.speakerIp.trim() ? b.speakerIp.trim() : null,
    title: String(b.title || 'RobOS').slice(0, 120),
    artist: String(b.artist || '').slice(0, 120),
    holdMs: Math.max(0, Math.min(10000, Number.isFinite(Number(b.holdMs)) ? Number(b.holdMs) : 1500)),
    durationMs: Number(b.durationMs) > 0 ? Math.round(Number(b.durationMs)) : null,
  };
  if (typeof b.filePath === 'string' && b.filePath) {
    const filePath = path.resolve(b.filePath);
    if (!CLIP_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return { error: 'filePath must be an audio file' };
    let st;
    try { st = fs.statSync(filePath); } catch { return { error: `File does not exist: ${filePath}` }; }
    if (!st.isFile()) return { error: 'filePath must be a file' };
    clip.filePath = filePath;
    if (!clip.durationMs) clip.durationMs = await probe(filePath);
  } else if (typeof b.url === 'string' && /^https?:\/\//i.test(b.url)) {
    clip.url = b.url;
  } else {
    return { error: 'speak-clip needs a filePath or an http(s) url' };
  }
  return { clip };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve({});
      try { resolve(JSON.parse(text)); } catch { reject(new Error('Body must be JSON')); }
    });
    req.on('error', reject);
  });
}

function sameToken(given, token) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * `handlers` answer each call: status(), speakClip(clip), pause(), resume().
 * Each returns (or resolves with) a JSON-able result.
 */
function createControlServer({ handlers, configDir = defaultConfigDir(), port = 0, probe = probeDurationMs, log = () => {} }) {
  const token = crypto.randomBytes(24).toString('hex');
  const file = controlFilePath(configDir);
  let server = null;

  async function route(req) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/api/status') return [200, await handlers.status()];
    if (req.method !== 'POST') return [404, { ok: false, error: 'Not found' }];
    const body = await readBody(req);
    if (url.pathname === '/api/speak-clip') {
      const { clip, error } = await validateClip(body, { probe });
      if (error) return [400, { ok: false, error }];
      return [200, await handlers.speakClip(clip)];
    }
    if (url.pathname === '/api/pause') return [200, await handlers.pause()];
    if (url.pathname === '/api/resume') return [200, await handlers.resume()];
    return [404, { ok: false, error: 'Not found' }];
  }

  function onRequest(req, res) {
    const send = (code, payload) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(payload));
    };
    if (!sameToken(req.headers['x-robos-token'], token)) return send(401, { ok: false, error: 'Missing or wrong X-RobOS-Token' });
    route(req)
      .then(([code, payload]) => send(code, payload || { ok: true }))
      .catch((err) => {
        log({ msg: 'control request failed', path: req.url, err: err.message });
        send(500, { ok: false, error: err.message });
      });
  }

  function writeControlFile() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ port: server.address().port, token, pid: process.pid, startedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function start() {
    return new Promise((resolve, reject) => {
      server = http.createServer(onRequest);
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        try { writeControlFile(); } catch (err) { log({ msg: 'could not write control file', err: err.message }); }
        resolve(server.address().port);
      });
    });
  }

  function stop() {
    try {
      const info = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (info.pid === process.pid && info.token === token) fs.unlinkSync(file);
    } catch {}
    if (server) server.close();
    server = null;
  }

  return { start, stop, token, file, port: () => (server && server.address() ? server.address().port : null) };
}

// ── Client side (other RobOS apps) ───────────────────────────────────────────

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

// The running Audio Player's port and token, or null when it isn't running.
function readControlInfo(configDir = defaultConfigDir()) {
  try {
    const info = JSON.parse(fs.readFileSync(controlFilePath(configDir), 'utf8'));
    if (!info || !info.port || !info.token || !pidAlive(info.pid)) return null;
    return info;
  } catch {
    return null;
  }
}

function request(info, method, apiPath, body, timeoutMs) {
  return new Promise((resolve) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: info.port,
      path: apiPath,
      method,
      timeout: timeoutMs,
      headers: { 'X-RobOS-Token': info.token, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}) },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, ...JSON.parse(text) }); } catch { resolve({ status: res.statusCode, ok: false, error: text.slice(0, 200) }); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(payload || undefined);
  });
}

/**
 * Talks to the running Audio Player. Every call resolves with the Audio
 * Player's answer, or null when it isn't running (or doesn't answer).
 */
function createAudioPlayerClient({ configDir = defaultConfigDir(), timeoutMs = 8000 } = {}) {
  const call = (method, apiPath, body) => {
    const info = readControlInfo(configDir);
    return info ? request(info, method, apiPath, body, timeoutMs) : Promise.resolve(null);
  };
  return {
    running: () => Boolean(readControlInfo(configDir)),
    status: () => call('GET', '/api/status'),
    speakClip: (clip) => call('POST', '/api/speak-clip', clip),
    pause: () => call('POST', '/api/pause', {}),
    resume: () => call('POST', '/api/resume', {}),
  };
}

module.exports = { createControlServer, createAudioPlayerClient, readControlInfo, controlFilePath, validateClip, CONTROL_FILE };

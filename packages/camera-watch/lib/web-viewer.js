'use strict';

/**
 * Google-Gated Web Browser Mode for RobOS Camera Watch (`:19227`).
 *
 * Uses the exact same security pattern as `packages/shopping-lists/lib/mobile-server.js`:
 *  1. Outbound-only Cloudflare HTTPS Quick Tunnel (`https://<slug>.trycloudflare.com`)
 *     keeps home router ports closed and encrypts traffic end-to-end with TLS 1.3.
 *  2. Unauthenticated non-loopback / Cloudflare-proxied requests receive `401 Unauthorized`
 *     with a `🔒 Protected by Google Login` gate linking to the owner's private Google Doc.
 *  3. Clicking the 1-tap URL inside the private Google Doc (`/?auth=<256-bit-key>`) verifies
 *     the 256-bit token in constant time (`crypto.timingSafeEqual`), sets a 1-year
 *     `HttpOnly; Secure; SameSite=Lax` HMAC session cookie (`robos_cam_session`), and `302`
 *     redirects to `/` so the token never lingers in the browser URL bar.
 *  4. Serves a responsive, mobile- & desktop-friendly Web Browser Camera Viewer with
 *     Cloudflare-safe HTTP/2 double-buffered live streaming (plus raw MJPEG toggle),
 *     fullscreen mode, instant snapshots, live battery/thermal/FPS telemetry, and remote
 *     zoom / flashlight / lens controls.
 */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const {
  listGoogleAccounts,
  listRobosUsersWithShareStatus,
  shareWithRobosUser,
  revokeRobosUserShare,
  maskEmailAddress,
} = require('./google-doc-share');

const SESSION_COOKIE_NAME = 'robos_cam_session';
const DEFAULT_WEB_PORT = 19227;

function computeSessionCookieValue(secretToken) {
  return crypto.createHmac('sha256', String(secretToken || 'robos-cam-secret'))
    .update('robos-camera-watch-web-session-v1')
    .digest('hex');
}

function parseCookies(cookieHeader = '') {
  const out = {};
  for (const part of String(cookieHeader || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  }
  return out;
}

function safeEqualHex(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (!sa || !sb || sa.length !== sb.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sa, 'utf8'), Buffer.from(sb, 'utf8'));
  } catch {
    return false;
  }
}

function isProxiedExternalRequest(req) {
  return Boolean(
    req.headers['cf-connecting-ip']
    || req.headers['x-forwarded-for']
    || req.headers['x-real-ip']
    || req.headers['cf-ray']
  );
}

function extractRemoteIp(req) {
  const raw = String(req.socket?.remoteAddress || '');
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function isLocalLoopbackRequest(req) {
  if (isProxiedExternalRequest(req)) {
    return false;
  }
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (host && host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
    return false;
  }
  const addr = String(req.socket?.remoteAddress || '');
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function detectLanIp() {
  try {
    const nets = os.networkInterfaces();
    const candidates = [];
    for (const [ifName, entries] of Object.entries(nets)) {
      if (/^(docker|br-|veth|virbr|lo)/i.test(ifName)) continue;
      for (const info of entries || []) {
        if (info && info.family === 'IPv4' && !info.internal && !info.address.startsWith('169.254.')) {
          candidates.push({ ifName, address: info.address });
        }
      }
    }
    const lan = candidates.find((c) => !/^tailscale/i.test(c.ifName) && !c.address.startsWith('100.')) || candidates[0];
    if (lan) return lan.address;
  } catch {}
  return '127.0.0.1';
}

function createWebShareStore({ configDir = process.env.ROBOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'robos') } = {}) {
  const dir = path.join(configDir, 'camera-watch');
  const file = path.join(dir, 'web-share.json');

  function load() {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    const authToken = /^[0-9a-f]{64}$/i.test(String(raw.authToken || ''))
      ? String(raw.authToken).toLowerCase()
      : crypto.randomBytes(32).toString('hex');
    const state = {
      enabled: raw.enabled !== false,
      webPort: Number(raw.webPort) || DEFAULT_WEB_PORT,
      authToken,
      sharedCameraIds: Array.isArray(raw.sharedCameraIds) ? raw.sharedCameraIds : [],
      sharedUsers: Array.isArray(raw.sharedUsers) ? raw.sharedUsers : [],
      publicTunnelUrl: String(raw.publicTunnelUrl || ''),
      accountId: String(raw.accountId || ''),
      ownerEmail: String(raw.ownerEmail || ''),
      folderId: String(raw.folderId || ''),
      folderUrl: String(raw.folderUrl || ''),
      docId: String(raw.docId || ''),
      docUrl: String(raw.docUrl || ''),
      docTitle: String(raw.docTitle || ''),
      syncedAt: String(raw.syncedAt || ''),
    };
    if (!fs.existsSync(file)) save(state);
    return state;
  }

  function save(patch = {}) {
    const current = fs.existsSync(file)
      ? (() => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } })()
      : {};
    const merged = {
      ...current,
      ...patch,
      authToken: /^[0-9a-f]{64}$/i.test(String((patch.authToken ?? current.authToken) || ''))
        ? String(patch.authToken ?? current.authToken).toLowerCase()
        : crypto.randomBytes(32).toString('hex'),
      webPort: Number(patch.webPort ?? current.webPort) || DEFAULT_WEB_PORT,
    };
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return merged;
  }

  function rotateToken() {
    return save({ authToken: crypto.randomBytes(32).toString('hex') });
  }

  return { file, configDir, load, save, rotateToken };
}

function httpGetBuffer(urlStr, { username = '', password = '', timeoutMs = 4500 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { reject(e); return; }
    const mod = u.protocol === 'https:' ? https : http;
    const headers = {};
    if (username || u.username) {
      const usr = username || decodeURIComponent(u.username);
      const pw = password || decodeURIComponent(u.password || '');
      headers.Authorization = `Basic ${Buffer.from(`${usr}:${pw}`).toString('base64')}`;
    }
    const req = mod.get(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Camera request timed out')));
    req.on('error', reject);
  });
}

function httpPostJson(urlStr, payload, { username = '', password = '', timeoutMs = 3500 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { reject(e); return; }
    const mod = u.protocol === 'https:' ? https : http;
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
    };
    if (username) {
      headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
    const req = mod.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Control request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

function grabFfmpegJpeg(streamUrl, { ffmpegPath = 'ffmpeg', spawnFn = spawn, timeoutMs = 6000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (/^rtsps?:/i.test(streamUrl)) args.push('-rtsp_transport', 'tcp');
    if (/^https?:/i.test(streamUrl)) args.push('-use_wallclock_as_timestamps', '1');
    args.push('-i', streamUrl, '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1');
    let proc;
    try { proc = spawnFn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); } catch (e) { reject(e); return; }
    const chunks = [];
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, timeoutMs);
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('close', () => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks);
      if (out.length > 100) resolve(out);
      else reject(new Error('No video frame available'));
    });
  });
}

function renderGoogleLoginGateHtml({ webState, ownerEmail }) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const emailLabel = ownerEmail || webState.ownerEmail || 'your Google account';
  const docUrl = webState.docUrl || '';
  const folderUrl = webState.folderUrl || 'https://drive.google.com';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Protected by Google Login · RobOS Camera Watch</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: #0d1117; color: #f0f6fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .card { max-width: 450px; width: 100%; background: #161b22; border: 1px solid #30363d; border-radius: 18px; padding: 28px 24px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.45); }
    .lock { font-size: 40px; margin-bottom: 10px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { font-size: 14px; color: #8b949e; line-height: 1.55; margin: 0 0 18px; }
    .email-pill { display: inline-block; background: rgba(0,188,212,0.14); color: #00bcd4; border: 1px solid rgba(0,188,212,0.35); border-radius: 999px; padding: 4px 12px; font-size: 13px; font-weight: 600; margin-bottom: 18px; }
    .btn-primary { display: block; width: 100%; box-sizing: border-box; padding: 14px 16px; border-radius: 12px; background: #00bcd4; color: #04222a; font-weight: 800; font-size: 15px; text-decoration: none; margin-bottom: 10px; }
    .btn-secondary { display: block; width: 100%; box-sizing: border-box; padding: 12px 16px; border-radius: 12px; background: #21262d; color: #e2e8f0; font-weight: 600; font-size: 14px; text-decoration: none; border: 1px solid #30363d; margin-bottom: 10px; }
    .steps { text-align: left; font-size: 13px; color: #c9d1d9; background: #0d1117; border: 1px solid #21262d; border-radius: 12px; padding: 12px 14px 12px 28px; margin: 14px 0 0; line-height: 1.55; }
  </style>
</head>
<body>
  <div class="card">
    <div class="lock">🔒</div>
    <h1>Protected by Google Login</h1>
    <p>This live RobOS surveillance camera feed is private and restricted to authorized viewers via Google Docs:</p>
    <div class="email-pill">${esc(emailLabel)}</div>
    ${docUrl ? `<a class="btn-primary" href="${esc(docUrl)}">📄 Sign In via My Google Doc (1-Tap)</a>` : ''}
    <a class="btn-secondary" href="${esc(folderUrl)}">📁 Open Google Drive Folder</a>
    <ol class="steps">
      <li>Tap <strong>Sign In via My Google Doc</strong> above (Google verifies your Google account permissions).</li>
      <li>At the top of the Google Doc, tap <strong>📹 CLICK HERE TO WATCH LIVE CAMERA IN YOUR BROWSER</strong>.</li>
      <li>Your browser receives a 1-year encrypted session cookie and opens the live camera feed!</li>
    </ol>
  </div>
</body>
</html>`;
}

function renderBrowserViewerHtml({ cameras, initialCameraId }) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const firstCam = cameras.find((c) => c.id === initialCameraId) || cameras[0] || { id: '', name: 'RobOS Camera' };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0d1117">
  <link rel="manifest" href="/manifest.webmanifest">
  <title>${esc(firstCam.name)} · RobOS Live Camera</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; }
    header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 18px; background: #161b22; border-bottom: 1px solid #30363d; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; transition: background 0.2s; }
    .dot.offline { background: #ef4444; box-shadow: none; }
    h1 { font-size: 17px; margin: 0; font-weight: 700; }
    .sub { font-size: 12px; color: #8b949e; }
    .pills { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .pill { background: #1f2630; border: 1px solid #30363d; border-radius: 999px; padding: 4px 10px; font-size: 12px; color: #c9d1d9; }
    .pill.motion { background: rgba(239,68,68,0.2); border-color: #ef4444; color: #fca5a5; font-weight: 700; }
    .pill.battery { background: rgba(245,158,11,0.18); border-color: rgba(245,158,11,0.65); color: #fcd34d; font-weight: 700; }
    .pill.battery-low { background: rgba(239,68,68,0.22); border-color: #ef4444; color: #fca5a5; font-weight: 700; }
    .stage-hud { position: absolute; top: 12px; right: 12px; display: flex; gap: 8px; align-items: center; pointer-events: none; z-index: 4; }
    .stage-badge { backdrop-filter: blur(6px); background: rgba(13,17,23,0.84); border: 1px solid rgba(245,158,11,0.75); color: #fcd34d; border-radius: 999px; padding: 5px 12px; font-size: 12.5px; font-weight: 700; box-shadow: 0 4px 14px rgba(0,0,0,0.45); }
    .stage-badge.low { border-color: #ef4444; color: #fca5a5; background: rgba(127,29,29,0.82); }
    .cam-tabs { display: flex; gap: 8px; padding: 10px 18px 0; flex-wrap: wrap; }
    .cam-tab { background: #161b22; color: #c9d1d9; border: 1px solid #30363d; border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .cam-tab.active { background: #00bcd4; color: #04222a; border-color: #00bcd4; }
    main { flex: 1; width: 100%; max-width: 1180px; margin: 0 auto; padding: 14px 16px 28px; display: flex; flex-direction: column; gap: 14px; }
    .stage { position: relative; background: #05070a; border: 1px solid #30363d; border-radius: 14px; overflow: hidden; min-height: 280px; max-height: 76vh; display: flex; align-items: center; justify-content: center; }
    .stage img { width: 100%; height: auto; max-height: 76vh; object-fit: contain; display: block; user-select: none; }
    .overlay-msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #8b949e; font-size: 14px; pointer-events: none; }
    .controls-card { background: #161b22; border: 1px solid #30363d; border-radius: 14px; padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
    .btn-group { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    button.btn, a.btn { background: #21262d; color: #e6edf3; border: 1px solid #30363d; border-radius: 9px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    button.btn:hover, a.btn:hover { border-color: #00bcd4; }
    button.btn.primary, a.btn.primary { background: #00bcd4; color: #04222a; border-color: #00bcd4; font-weight: 700; }
    button.btn.share-btn { background: rgba(0,188,212,0.14); color: #00bcd4; border-color: rgba(0,188,212,0.55); font-weight: 700; }
    button.btn.share-btn:hover { background: #00bcd4; color: #04222a; }
    button.btn.danger-sm { padding: 6px 11px; font-size: 12px; color: #fca5a5; border-color: rgba(239,68,68,0.45); }
    button.btn.danger-sm:hover { border-color: #ef4444; background: rgba(239,68,68,0.15); }
    button.btn.active { border-color: #00bcd4; color: #00bcd4; background: rgba(0,188,212,0.12); }
    .footer-note { font-size: 12px; color: #8b949e; text-align: center; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(1,4,9,0.8); display: none; align-items: center; justify-content: center; padding: 16px; z-index: 60; }
    .modal-backdrop.open { display: flex; }
    .modal { width: min(560px, 100%); max-height: 90vh; overflow-y: auto; background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 24px 60px rgba(0,0,0,0.55); }
    .modal-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .modal-head h2 { margin: 0; font-size: 17px; }
    .modal-sub { font-size: 13px; color: #8b949e; line-height: 1.45; margin: 0; }
    .doc-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; background: #0d1117; border: 1px solid #30363d; border-radius: 10px; padding: 10px 12px; font-size: 12.5px; }
    .user-list { display: flex; flex-direction: column; gap: 8px; }
    .user-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #0d1117; border: 1px solid #30363d; border-radius: 11px; padding: 10px 12px; }
    .user-info { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
    .user-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; background: #1f2630; border: 1px solid #30363d; flex-shrink: 0; }
    .user-meta { min-width: 0; }
    .user-name { font-weight: 700; font-size: 14px; color: #f0f6fc; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .user-sub { font-size: 12px; color: #8b949e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .u-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
    .u-badge.shared { background: rgba(34,197,94,0.16); color: #4ade80; border: 1px solid rgba(34,197,94,0.45); }
    .u-badge.owner { background: rgba(0,188,212,0.14); color: #00bcd4; border: 1px solid rgba(0,188,212,0.4); }
    .u-badge.group { background: #1f2630; color: #94a3b8; border: 1px solid #30363d; font-weight: 600; }
    .custom-email-row { display: flex; gap: 8px; margin-top: 4px; }
    .custom-email-row input { flex: 1; background: #0d1117; color: #e6edf3; border: 1px solid #30363d; border-radius: 9px; padding: 9px 12px; font-size: 13px; }
    .share-msg { padding: 9px 12px; border-radius: 9px; font-size: 13px; display: none; }
    .share-msg.ok { display: block; background: rgba(34,197,94,0.14); border: 1px solid rgba(34,197,94,0.45); color: #86efac; }
    .share-msg.err { display: block; background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.45); color: #fca5a5; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span class="dot" id="live-dot"></span>
      <div>
        <h1 id="cam-title">${esc(firstCam.name)}</h1>
        <div class="sub" id="cam-sub">RobOS Camera Watch · Encrypted Browser Stream</div>
      </div>
    </div>
    <div class="pills">
      <span class="pill" id="p-res">—</span>
      <span class="pill" id="p-fps">Connecting…</span>
      <span class="pill" id="p-power" style="display:none"></span>
      <span class="pill motion" id="p-motion" style="display:none">MOTION</span>
    </div>
  </header>

  <div class="cam-tabs" id="cam-tabs" style="display:none"></div>

  <main>
    <div class="stage" id="stage">
      <img id="live-img" alt="Live surveillance feed" />
      <div class="stage-hud">
        <span class="stage-badge" id="stage-battery" style="display:none"></span>
      </div>
      <div class="overlay-msg" id="overlay-msg">Connecting to live camera…</div>
    </div>

    <div class="controls-card">
      <div class="btn-group">
        <button type="button" class="btn" onclick="sendCtrl({preset:'1'})">1x Wide</button>
        <button type="button" class="btn" onclick="sendCtrl({preset:'2'})">2x Zoom</button>
        <button type="button" class="btn" onclick="sendCtrl({preset:'3'})">4x Zoom</button>
        <button type="button" class="btn" id="btn-torch" onclick="sendCtrl({toggleTorch:true})">💡 Flashlight</button>
        <button type="button" class="btn" onclick="sendCtrl({preset:'4'})">🔄 Flip Lens</button>
      </div>
      <div class="btn-group">
        <button type="button" class="btn share-btn" id="btn-share-robos-user" onclick="openShareModal()">👥 Share with RobOS User</button>
        <a class="btn primary" id="btn-snap" href="#" download="snapshot.jpg">📸 Snapshot</a>
        <button type="button" class="btn" onclick="toggleFullscreen()">⛶ Fullscreen</button>
      </div>
    </div>

    <div class="footer-note">
      🔒 Authenticated via Google Doc Capability Session · Zero Inbound Router Ports · Outbound Cloudflare TLS 1.3
    </div>
  </main>

  <div class="modal-backdrop" id="share-modal" onclick="if(event.target===this)closeShareModal()">
    <div class="modal" role="dialog" aria-labelledby="share-modal-title">
      <div class="modal-head">
        <h2 id="share-modal-title">👥 Share with RobOS User</h2>
        <button type="button" class="btn" onclick="closeShareModal()" style="padding:5px 10px;">✕</button>
      </div>
      <p class="modal-sub">Shares your private Google Drive Doc with the selected RobOS user's Google account so they can open this live camera over Cloudflare HTTPS in 1 tap.</p>
      <div id="share-doc-bar" class="doc-bar" style="display:none"></div>
      <div id="share-msg" class="share-msg"></div>
      <div id="robos-users-list" class="user-list"><div class="user-sub">Loading RobOS users…</div></div>
      <div class="custom-email-row">
        <input id="custom-share-email" type="email" placeholder="Or share Google Doc with another email…" />
        <button type="button" class="btn" id="btn-share-email" onclick="shareCustomEmail()">Share</button>
      </div>
    </div>
  </div>

  <script>
    const INITIAL_CAMERAS = ${JSON.stringify(cameras.map((c) => ({ id: c.id, name: c.name, room: c.room || '' })))};
    let activeId = ${JSON.stringify(firstCam.id)};
    let running = true;
    let frameCount = 0;
    let windowStart = performance.now();
    let currentObjUrl = null;

    const imgEl = document.getElementById('live-img');
    const msgEl = document.getElementById('overlay-msg');
    const dotEl = document.getElementById('live-dot');
    const tabsEl = document.getElementById('cam-tabs');

    function escH(s) {
      return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderTabs(list) {
      if (list.length <= 1) { tabsEl.style.display = 'none'; return; }
      tabsEl.style.display = 'flex';
      tabsEl.innerHTML = '';
      for (const c of list) {
        const b = document.createElement('button');
        b.className = 'cam-tab' + (c.id === activeId ? ' active' : '');
        b.textContent = c.name;
        b.onclick = () => selectCamera(c.id, c.name);
        tabsEl.appendChild(b);
      }
    }

    function selectCamera(id, name) {
      activeId = id;
      if (name) document.getElementById('cam-title').textContent = name;
      document.getElementById('btn-snap').href = '/api/cameras/' + encodeURIComponent(activeId) + '/frame.jpg?download=1';
      renderTabs(INITIAL_CAMERAS);
    }

    selectCamera(activeId, INITIAL_CAMERAS.find(c => c.id === activeId)?.name);

    // Double-buffered HTTP/2 frame pump: never stalls across Cloudflare proxies or mobile 5G handoffs.
    async function pumpFrames() {
      while (running) {
        if (!activeId || document.hidden) {
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
        const t0 = performance.now();
        try {
          const res = await fetch('/api/cameras/' + encodeURIComponent(activeId) + '/frame.jpg?t=' + Date.now(), { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const blob = await res.blob();
          const nextUrl = URL.createObjectURL(blob);
          imgEl.onload = () => {
            if (currentObjUrl) URL.revokeObjectURL(currentObjUrl);
            currentObjUrl = nextUrl;
            if (imgEl.naturalWidth > 0) {
              document.getElementById('p-res').textContent = imgEl.naturalWidth + '×' + imgEl.naturalHeight;
            }
          };
          imgEl.src = nextUrl;
          msgEl.style.display = 'none';
          dotEl.classList.remove('offline');

          frameCount++;
          const now = performance.now();
          if (now - windowStart >= 1500) {
            const fps = (frameCount * 1000) / (now - windowStart);
            document.getElementById('p-fps').textContent = fps.toFixed(1) + ' fps · Live';
            frameCount = 0;
            windowStart = now;
          }
        } catch (err) {
          dotEl.classList.add('offline');
          document.getElementById('p-fps').textContent = 'Reconnecting…';
          await new Promise(r => setTimeout(r, 900));
          continue;
        }
        const elapsed = performance.now() - t0;
        const targetInterval = 115; // ~8.5 fps smooth browser cadence
        if (elapsed < targetInterval) {
          await new Promise(r => setTimeout(r, targetInterval - elapsed));
        }
      }
    }

    async function pollTelemetry() {
      try {
        const r = await fetch('/api/cameras', { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        const cam = (data.cameras || []).find(c => c.id === activeId);
        if (!cam) return;
        if (cam.room) {
          document.getElementById('cam-sub').textContent = cam.room + ' · RobOS Live Camera';
        }
        const pwr = document.getElementById('p-power');
        const stageBatt = document.getElementById('stage-battery');
        const onBattery = typeof cam.batteryPercent === 'number' && cam.batteryPercent >= 0 && !cam.charging;
        if (onBattery) {
          const isLow = cam.batteryPercent <= 20;
          const label = (isLow ? '🪫 Low Battery · ' : '🔋 On Battery · ') + cam.batteryPercent + '%';
          pwr.style.display = '';
          pwr.className = 'pill ' + (isLow ? 'battery-low' : 'battery');
          pwr.textContent = label;
          if (stageBatt) {
            stageBatt.style.display = '';
            stageBatt.className = 'stage-badge' + (isLow ? ' low' : '');
            stageBatt.textContent = label;
          }
        } else {
          pwr.style.display = 'none';
          if (stageBatt) stageBatt.style.display = 'none';
        }
        document.getElementById('p-motion').style.display = cam.motion ? '' : 'none';
        const torchBtn = document.getElementById('btn-torch');
        if (torchBtn) torchBtn.classList.toggle('active', Boolean(cam.torchEnabled));
      } catch {}
    }

    async function sendCtrl(body) {
      if (!activeId) return;
      try {
        await fetch('/api/cameras/' + encodeURIComponent(activeId) + '/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        setTimeout(pollTelemetry, 300);
      } catch {}
    }

    function toggleFullscreen() {
      const el = document.getElementById('stage');
      if (!document.fullscreenElement) el.requestFullscreen?.();
      else document.exitFullscreen?.();
    }

    function showShareMsg(text, isErr) {
      const el = document.getElementById('share-msg');
      if (!text) { el.className = 'share-msg'; el.textContent = ''; return; }
      el.className = 'share-msg ' + (isErr ? 'err' : 'ok');
      el.textContent = text;
    }

    function renderUsersPayload(data) {
      const docBar = document.getElementById('share-doc-bar');
      if (data.docUrl) {
        docBar.style.display = 'flex';
        docBar.innerHTML = '<span>📄 <strong>' + escH(data.docTitle || 'Google Drive Camera Doc') + '</strong></span>' +
          '<span class="btn-group">' +
          '<a class="btn" href="' + escH(data.docUrl) + '" target="_blank" rel="noopener">Open Google Doc</a>' +
          '<button type="button" class="btn" id="copy-gdoc-btn">Copy Link</button>' +
          '</span>';
        const cp = document.getElementById('copy-gdoc-btn');
        if (cp) cp.onclick = async () => {
          try { await navigator.clipboard.writeText(data.docUrl); showShareMsg('Copied Google Doc link to clipboard!', false); } catch {}
        };
      } else {
        docBar.style.display = 'none';
      }

      const listEl = document.getElementById('robos-users-list');
      const users = data.users || [];
      if (!users.length) {
        listEl.innerHTML = '<div class="user-sub">No RobOS users configured yet. Enter a Google email below.</div>';
        return;
      }
      listEl.innerHTML = users.map(u => {
        const groups = (u.groups || []).slice(0, 2).map(g => '<span class="u-badge group">' + escH(g) + '</span>').join('');
        let right = '';
        if (u.isOwner) {
          right = '<span class="u-badge owner">Owner</span>';
        } else if (u.shared) {
          right = '<span class="btn-group"><span class="u-badge shared">Shared ✓</span>' +
            '<button type="button" class="btn danger-sm" data-revoke-uid="' + escH(u.uid) + '" data-perm="' + escH(u.permissionId || '') + '">Revoke</button></span>';
        } else if (u.canShare) {
          right = '<button type="button" class="btn primary" data-share-uid="' + escH(u.uid) + '">Share</button>';
        } else {
          right = '<span class="user-sub">No Google email</span>';
        }
        return '<div class="user-row">' +
          '<div class="user-info">' +
          '<div class="user-avatar">' + escH(u.avatar || '👤') + '</div>' +
          '<div class="user-meta">' +
          '<div class="user-name"><span>' + escH(u.name) + '</span>' + groups + '</div>' +
          '<div class="user-sub">' + escH(u.email || '') + '</div>' +
          '</div></div>' + right + '</div>';
      }).join('');

      listEl.querySelectorAll('[data-share-uid]').forEach(btn => {
        btn.onclick = () => shareWithUid(btn.getAttribute('data-share-uid'), btn);
      });
      listEl.querySelectorAll('[data-revoke-uid]').forEach(btn => {
        btn.onclick = () => revokeUid(btn.getAttribute('data-revoke-uid'), btn.getAttribute('data-perm'), btn);
      });
    }

    async function loadRobosUsers() {
      try {
        const r = await fetch('/api/robos-users', { cache: 'no-store' });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Could not load RobOS users');
        renderUsersPayload(data);
      } catch (err) {
        showShareMsg(err.message, true);
      }
    }

    function openShareModal() {
      showShareMsg('', false);
      document.getElementById('share-modal').classList.add('open');
      loadRobosUsers();
    }

    function closeShareModal() {
      document.getElementById('share-modal').classList.remove('open');
    }

    async function shareWithUid(uid, btn) {
      if (btn) { btn.disabled = true; btn.textContent = 'Sharing…'; }
      showShareMsg('', false);
      try {
        const r = await fetch('/api/robos-users/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Share failed');
        renderUsersPayload(data);
        showShareMsg('Shared Google Doc with ' + (data.sharedWith?.name || uid) + '!', false);
      } catch (err) {
        showShareMsg(err.message, true);
        if (btn) { btn.disabled = false; btn.textContent = 'Share'; }
      }
    }

    async function shareCustomEmail() {
      const inp = document.getElementById('custom-share-email');
      const email = inp.value.trim();
      if (!email) return;
      const btn = document.getElementById('btn-share-email');
      btn.disabled = true;
      btn.textContent = 'Sharing…';
      showShareMsg('', false);
      try {
        const r = await fetch('/api/robos-users/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Share failed');
        inp.value = '';
        renderUsersPayload(data);
        showShareMsg('Shared Google Doc with ' + email + '!', false);
      } catch (err) {
        showShareMsg(err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Share';
      }
    }

    async function revokeUid(uid, permissionId, btn) {
      if (btn) { btn.disabled = true; btn.textContent = 'Revoking…'; }
      showShareMsg('', false);
      try {
        const r = await fetch('/api/robos-users/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, permissionId }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Revoke failed');
        renderUsersPayload(data);
        showShareMsg('Revoked Google Doc access and rotated browser session key.', false);
      } catch (err) {
        showShareMsg(err.message, true);
        if (btn) { btn.disabled = false; btn.textContent = 'Revoke'; }
      }
    }

    pumpFrames();
    pollTelemetry();
    setInterval(pollTelemetry, 3000);
  </script>
</body>
</html>`;
}

/**
 * Creates the Google-gated HTTP/MJPEG/Web Browser server for Camera Watch.
 *
 * Works both inside the Electron `camera-watch` process (reading `getRunner(id)?.latestFrame`)
 * and standalone via `serve-web.js` (fetching directly from ONVIF/HTTP RobOS IP Cameras or ffmpeg).
 */
function createCameraWebServer({
  cameraStore,
  webShareStore = createWebShareStore(),
  getRunner = () => null,
  fetchFn = httpGetBuffer,
  postFn = httpPostJson,
  spawnFn = spawn,
  requireAuthForRemote = true,
  googleDriveOptions = {},
}) {
  // Coalesce concurrent browser frame requests per camera (85ms cache) so multiple viewers
  // watching over Cloudflare never overload a Wi-Fi camera.
  const frameCache = new Map(); // cameraId -> { jpeg: Buffer, at: number, inflight: Promise<Buffer>|null }
  let activePort = DEFAULT_WEB_PORT;

  const effectiveConfigDir = googleDriveOptions.configDir || webShareStore.configDir || process.env.ROBOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'robos');
  const effectiveHomeDir = googleDriveOptions.homeDir || process.env.HOME || os.homedir();

  function currentLanUrl() {
    return `http://${detectLanIp()}:${activePort}`;
  }

  function sharedCamerasList() {
    const all = cameraStore.listCameras();
    const ws = webShareStore.load();
    const chosenIds = ws.sharedCameraIds || [];
    // Prefer explicitly selected cameras; otherwise default to network/ONVIF cameras (excluding offline local USB unless chosen).
    const filtered = chosenIds.length
      ? all.filter((c) => chosenIds.includes(c.id) && c.enabled !== false)
      : all.filter((c) => c.enabled !== false && c.kind !== 'device');
    return filtered.length ? filtered : all.filter((c) => c.enabled !== false);
  }

  function cameraMatchesHostIp(cam, ip) {
    if (!ip) return false;
    if (cam.onvif?.hostname && cam.onvif.hostname === ip) return true;
    for (const raw of [cam.streamUrl, cam.snapshotUrl]) {
      if (/^https?:\/\//i.test(raw || '') || /^rtsps?:\/\//i.test(raw || '')) {
        try {
          if (new URL(raw).hostname === ip) return true;
        } catch {}
      }
    }
    return false;
  }

  async function isAuthorizedLanCameraRequest(req) {
    if (isProxiedExternalRequest(req)) return false;
    const urn = String(req.headers['x-robos-camera-urn'] || '').trim();
    if (!urn.startsWith('urn:uuid:')) return false;
    const senderIp = extractRemoteIp(req);
    if (!senderIp) return false;
    const allCams = cameraStore.listCameras().filter((c) => c.enabled !== false);
    if (allCams.some((c) => cameraMatchesHostIp(c, senderIp))) {
      return true;
    }
    // Live verification against the phone's `/api/status` endpoint on the LAN
    const camPort = Number(req.headers['x-robos-camera-port']) || 8080;
    try {
      const raw = await fetchFn(`http://${senderIp}:${camPort}/api/status`, { timeoutMs: 1200 });
      const st = JSON.parse(raw.toString('utf8'));
      if (st && st.app === 'robos-ip-camera' && (st.urn === urn || st.deviceUrn === urn)) {
        return true;
      }
    } catch {}
    return false;
  }

  function resolveSnapshotEndpoint(cam) {
    if (cam.snapshotUrl) return cam.snapshotUrl;
    if (cam.onvif?.hostname) {
      return `http://${cam.onvif.hostname}:${cam.onvif.port || 80}/snapshot.jpg`;
    }
    if (/^https?:\/\//i.test(cam.streamUrl || '')) {
      try {
        const u = new URL(cam.streamUrl);
        return `${u.origin}/snapshot.jpg`;
      } catch {}
    }
    return '';
  }

  function resolveRobosBaseUrl(cam) {
    if (cam.onvif?.hostname) {
      return `http://${cam.onvif.hostname}:${cam.onvif.port || 8080}`;
    }
    for (const raw of [cam.snapshotUrl, cam.streamUrl]) {
      if (/^https?:\/\//i.test(raw || '')) {
        try { return new URL(raw).origin; } catch {}
      }
    }
    return '';
  }

  async function getFreshFrame(cam) {
    // 1. If running inside Electron Camera Watch with a live runner, reuse its latest frame for zero extra network traffic.
    const runner = getRunner(cam.id);
    if (runner?.latestFrame && Date.now() - (runner.latestFrameAt || 0) < 5000) {
      return runner.latestFrame;
    }

    const now = Date.now();
    let entry = frameCache.get(cam.id);
    if (entry?.jpeg && now - entry.at < 85) {
      return entry.jpeg;
    }
    if (entry?.inflight) {
      return entry.inflight;
    }

    const job = (async () => {
      const snapUrl = resolveSnapshotEndpoint(cam);
      if (snapUrl) {
        try {
          const buf = await fetchFn(snapUrl, { username: cam.username, password: cam.password, timeoutMs: 4000 });
          if (buf && buf.length > 100 && buf[0] === 0xff && buf[1] === 0xd8) {
            frameCache.set(cam.id, { jpeg: buf, at: Date.now(), inflight: null });
            return buf;
          }
        } catch {}
      }
      if (cam.streamUrl) {
        const settings = cameraStore.getSettings?.() || {};
        const buf = await grabFfmpegJpeg(cam.streamUrl, { ffmpegPath: settings.ffmpegPath || 'ffmpeg', spawnFn });
        frameCache.set(cam.id, { jpeg: buf, at: Date.now(), inflight: null });
        return buf;
      }
      throw new Error('Camera is offline or unreachable.');
    })();

    frameCache.set(cam.id, { jpeg: entry?.jpeg || null, at: entry?.at || 0, inflight: job });
    try {
      return await job;
    } finally {
      const cur = frameCache.get(cam.id);
      if (cur?.inflight === job) cur.inflight = null;
    }
  }

  async function enrichCameraTelemetry(cam) {
    const base = resolveRobosBaseUrl(cam);
    const out = {
      id: cam.id,
      name: cam.name,
      kind: cam.kind,
      room: '',
      live: true,
      batteryPercent: -1,
      charging: false,
      temperatureC: 0,
      motion: false,
      torchEnabled: false,
      zoomRatio: 1,
    };
    if (!base) return out;
    try {
      const raw = await fetchFn(`${base}/api/status`, { username: cam.username, password: cam.password, timeoutMs: 1500 });
      const st = JSON.parse(raw.toString('utf8'));
      if (st && st.app === 'robos-ip-camera') {
        out.room = st.room || '';
        out.live = Boolean(st.live);
        out.batteryPercent = typeof st.batteryPercent === 'number' ? st.batteryPercent : -1;
        out.charging = Boolean(st.charging);
        out.temperatureC = Number(st.temperatureC) || 0;
        out.motion = Boolean(st.motion);
        out.torchEnabled = Boolean(st.torchEnabled);
        out.zoomRatio = Number(st.zoomRatio) || 1;
      }
    } catch {}
    return out;
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const sendJson = (status, obj, extraHeaders = {}) => {
      const payload = Buffer.from(JSON.stringify(obj), 'utf8');
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': payload.length,
        ...extraHeaders,
      });
      res.end(payload);
    };

    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = url.pathname;
      const webState = webShareStore.load();
      const secretToken = webState.authToken;
      const expectedCookieVal = computeSessionCookieValue(secretToken);

      // 0. Unproxied Home-LAN hub beacon so the RobOS IP Camera Android app discovers this host on Wi-Fi
      if (req.method === 'GET' && pathname === '/api/robos-camera-hub' && !isProxiedExternalRequest(req)) {
        sendJson(200, { ok: true, app: 'robos-camera-watch-web', docUrl: webState.docUrl || '' });
        return;
      }

      // 1. Exchange `?auth=<256-bit-token>` (from private Google Doc) for a 1-year HttpOnly cookie & 302 redirect
      const queryAuth = url.searchParams.get('auth') || url.searchParams.get('key') || '';
      if (queryAuth && secretToken && safeEqualHex(queryAuth, secretToken)) {
        const isHttps = req.headers['x-forwarded-proto'] === 'https' || Boolean(req.headers['cf-ray']);
        const cookieParts = [
          `${SESSION_COOKIE_NAME}=${expectedCookieVal}`,
          'Path=/',
          'Max-Age=31536000',
          'HttpOnly',
          'SameSite=Lax',
        ];
        if (isHttps) cookieParts.push('Secure');
        url.searchParams.delete('auth');
        url.searchParams.delete('key');
        const cleanTarget = url.pathname + (url.search ? url.search : '');
        res.writeHead(302, {
          'Set-Cookie': cookieParts.join('; '),
          Location: cleanTarget || '/',
        });
        res.end();
        return;
      }

      // 2. Enforce Google-Doc Session Gate on all non-loopback / Cloudflare-proxied requests
      //    (Verified RobOS IP Camera phones on unproxied LAN may access `/api/robos-users*` directly)
      const cookies = parseCookies(req.headers.cookie || '');
      const hasValidSession = safeEqualHex(cookies[SESSION_COOKIE_NAME] || '', expectedCookieVal);
      if (requireAuthForRemote && !isLocalLoopbackRequest(req) && !hasValidSession) {
        const allowLanPhone = pathname.startsWith('/api/robos-users') && await isAuthorizedLanCameraRequest(req);
        if (!allowLanPhone) {
          if (pathname.startsWith('/api/')) {
            sendJson(401, { error: 'Authentication required. Open via your private RobOS Camera Google Doc.' });
            return;
          }
          const accounts = listGoogleAccounts({ homeDir: effectiveHomeDir });
          const ownerEmail = webState.ownerEmail || accounts[0]?.email || '';
          const gateHtml = renderGoogleLoginGateHtml({ webState, ownerEmail });
          res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(gateHtml);
          return;
        }
      }

      if (req.method === 'GET' && pathname === '/manifest.webmanifest') {
        sendJson(200, {
          name: 'RobOS Camera Watch',
          short_name: 'RobOS Cam',
          start_url: '/',
          display: 'standalone',
          background_color: '#0d1117',
          theme_color: '#0d1117',
        });
        return;
      }

      const cams = sharedCamerasList();
      const maskEmails = isProxiedExternalRequest(req);

      // 3. RobOS User Discovery & Google Drive Doc Sharing API
      if (req.method === 'GET' && pathname === '/api/robos-users') {
        const status = await listRobosUsersWithShareStatus({
          webConfig: webShareStore.load(),
          configDir: effectiveConfigDir,
          homeDir: effectiveHomeDir,
          maskEmails,
          ...googleDriveOptions,
        });
        sendJson(200, { ok: true, ...status });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/robos-users/share') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const chosenIds = Array.isArray(body.cameraIds) ? body.cameraIds.filter(Boolean) : [];
        const latest = webShareStore.save({
          enabled: true,
          ...(chosenIds.length ? { sharedCameraIds: chosenIds } : {}),
        });
        const tunnelUrl = latest.publicTunnelUrl || '';
        const authedTunnelUrl = tunnelUrl ? `${tunnelUrl}/?auth=${latest.authToken}` : '';
        const authedLanUrl = `${currentLanUrl()}/?auth=${latest.authToken}`;
        const allEnabled = cameraStore.listCameras().filter((c) => c.enabled !== false);
        const targetCams = chosenIds.length
          ? allEnabled.filter((c) => chosenIds.includes(c.id))
          : sharedCamerasList();

        const sharedRes = await shareWithRobosUser({
          uid: String(body.uid || '').trim(),
          email: String(body.email || '').trim(),
          cameras: targetCams.length ? targetCams : allEnabled,
          webConfig: latest,
          authedTunnelUrl,
          publicTunnelUrl: tunnelUrl,
          authedLanUrl,
          configDir: effectiveConfigDir,
          homeDir: effectiveHomeDir,
          ...googleDriveOptions,
        });

        const prevUsers = Array.isArray(latest.sharedUsers) ? latest.sharedUsers : [];
        const sw = sharedRes.sharedWith;
        const nextSharedUsers = [
          ...prevUsers.filter((u) => String(u?.email || '').toLowerCase() !== String(sw.email || '').toLowerCase()),
          {
            uid: sw.uid,
            name: sw.name,
            email: sw.email,
            permissionId: sw.permissionId,
            role: sw.role || 'reader',
            sharedAt: new Date().toISOString(),
          },
        ];

        const savedState = webShareStore.save({
          accountId: sharedRes.accountId,
          ownerEmail: sharedRes.ownerEmail,
          folderId: sharedRes.folderId,
          folderUrl: sharedRes.folderUrl,
          docId: sharedRes.docId,
          docUrl: sharedRes.docUrl,
          docTitle: sharedRes.docTitle,
          syncedAt: sharedRes.syncedAt,
          sharedUsers: nextSharedUsers,
        });

        const updatedStatus = await listRobosUsersWithShareStatus({
          webConfig: savedState,
          configDir: effectiveConfigDir,
          homeDir: effectiveHomeDir,
          maskEmails,
          ...googleDriveOptions,
        });

        sendJson(200, {
          ok: true,
          sharedWith: {
            ...sw,
            email: maskEmails ? maskEmailAddress(sw.email) : sw.email,
          },
          ...updatedStatus,
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/robos-users/revoke') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const shouldRotate = body.rotateKey !== false;
        const nextState = shouldRotate ? webShareStore.rotateToken() : webShareStore.load();
        const tunnelUrl = nextState.publicTunnelUrl || '';
        const authedTunnelUrl = tunnelUrl ? `${tunnelUrl}/?auth=${nextState.authToken}` : '';
        const authedLanUrl = `${currentLanUrl()}/?auth=${nextState.authToken}`;

        const rev = await revokeRobosUserShare({
          uid: String(body.uid || '').trim(),
          email: String(body.email || '').trim(),
          permissionId: String(body.permissionId || '').trim(),
          cameras: sharedCamerasList(),
          webConfig: nextState,
          authedTunnelUrl,
          publicTunnelUrl: tunnelUrl,
          authedLanUrl,
          configDir: effectiveConfigDir,
          homeDir: effectiveHomeDir,
          ...googleDriveOptions,
        });

        const prevUsers = Array.isArray(nextState.sharedUsers) ? nextState.sharedUsers : [];
        const filteredUsers = prevUsers.filter((u) => {
          if (rev.permissionId && u?.permissionId === rev.permissionId) return false;
          if (rev.email && String(u?.email || '').toLowerCase() === rev.email) return false;
          if (rev.uid && u?.uid === rev.uid) return false;
          return true;
        });

        const savedState = webShareStore.save({
          ...(rev.docId ? { docId: rev.docId, docUrl: rev.docUrl, docTitle: rev.docTitle, syncedAt: rev.syncedAt } : {}),
          sharedUsers: filteredUsers,
        });

        const updatedStatus = await listRobosUsersWithShareStatus({
          webConfig: savedState,
          configDir: effectiveConfigDir,
          homeDir: effectiveHomeDir,
          maskEmails,
          ...googleDriveOptions,
        });

        // Keep the caller's own browser cookie fresh if they initiated revoke from Web Browser Mode
        const extraHeaders = {};
        if (hasValidSession && shouldRotate) {
          const isHttps = req.headers['x-forwarded-proto'] === 'https' || Boolean(req.headers['cf-ray']);
          const refreshedCookie = [
            `${SESSION_COOKIE_NAME}=${computeSessionCookieValue(savedState.authToken)}`,
            'Path=/',
            'Max-Age=31536000',
            'HttpOnly',
            'SameSite=Lax',
            ...(isHttps ? ['Secure'] : []),
          ].join('; ');
          extraHeaders['Set-Cookie'] = refreshedCookie;
        }

        sendJson(200, { ok: true, revoked: true, ...updatedStatus }, extraHeaders);
        return;
      }

      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        const wantedCamId = url.searchParams.get('camera') || '';
        const html = renderBrowserViewerHtml({ cameras: cams, initialCameraId: wantedCamId });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/cameras') {
        const enriched = await Promise.all(cams.map(enrichCameraTelemetry));
        sendJson(200, { ok: true, cameras: enriched });
        return;
      }

      const frameMatch = /^\/api\/cameras\/([^/]+)\/frame\.jpg$/.exec(pathname);
      if (req.method === 'GET' && frameMatch) {
        const camId = decodeURIComponent(frameMatch[1]);
        const cam = cams.find((c) => c.id === camId);
        if (!cam) { sendJson(404, { error: 'Camera not found or not shared.' }); return; }
        try {
          const jpeg = await getFreshFrame(cam);
          const extra = url.searchParams.get('download') === '1'
            ? { 'Content-Disposition': `attachment; filename="${cam.name.replace(/[^\w.-]+/g, '_')}-${Date.now()}.jpg"` }
            : {};
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': jpeg.length,
            ...extra,
          });
          res.end(jpeg);
        } catch (err) {
          sendJson(503, { error: err.message || 'Camera unavailable' });
        }
        return;
      }

      const mjpegMatch = /^\/api\/cameras\/([^/]+)\/mjpeg$/.exec(pathname);
      if (req.method === 'GET' && mjpegMatch) {
        const camId = decodeURIComponent(mjpegMatch[1]);
        const cam = cams.find((c) => c.id === camId);
        if (!cam) { sendJson(404, { error: 'Camera not found.' }); return; }
        res.writeHead(200, {
          'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
          'X-Accel-Buffering': 'no',
          Connection: 'close',
        });
        let closed = false;
        req.on('close', () => { closed = true; });
        while (!closed) {
          try {
            const jpeg = await getFreshFrame(cam);
            if (closed) break;
            res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
            res.write(jpeg);
            res.write('\r\n');
          } catch {}
          await new Promise((r) => setTimeout(r, 125));
        }
        return;
      }

      const ctrlMatch = /^\/api\/cameras\/([^/]+)\/control$/.exec(pathname);
      if (req.method === 'POST' && ctrlMatch) {
        const camId = decodeURIComponent(ctrlMatch[1]);
        const cam = cams.find((c) => c.id === camId);
        if (!cam) { sendJson(404, { error: 'Camera not found.' }); return; }
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const base = resolveRobosBaseUrl(cam);
        if (!base) { sendJson(400, { error: 'Camera does not support remote HTTP control.' }); return; }
        const r = await postFn(`${base}/api/control`, body, { username: cam.username, password: cam.password });
        sendJson(r.status >= 200 && r.status < 300 ? 200 : 502, { ok: r.status >= 200 && r.status < 300 });
        return;
      }

      sendJson(404, { error: 'Not found' });
    } catch (err) {
      sendJson(500, { error: err?.message || 'Internal server error' });
    }
  });

  return {
    server,
    webShareStore,
    sharedCamerasList,
    listen(port = DEFAULT_WEB_PORT, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          activePort = server.address().port;
          const lanIp = detectLanIp();
          resolve({
            port: activePort,
            localUrl: `http://127.0.0.1:${activePort}`,
            lanUrl: `http://${lanIp}:${activePort}`,
          });
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

module.exports = {
  SESSION_COOKIE_NAME,
  DEFAULT_WEB_PORT,
  computeSessionCookieValue,
  isLocalLoopbackRequest,
  createWebShareStore,
  createCameraWebServer,
};

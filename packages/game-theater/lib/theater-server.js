'use strict';

/**
 * RobOS AI Multiplayer Game Theater — HTTP (:19228) + HTTPS (:19229) + WebSocket Game Server.
 *
 * Serves:
 *   - The Godot 4 HTTPS Web Client (`web/godot/index.html`, `.wasm`, `.pck`, `.js`)
 *   - Per-player Google Doc capability token authentication (`?auth=<256-bit-player-token>`)
 *   - Real-time RFC 6455 WebSocket (`/ws`) for Godot 4 multiplayer lobby, seats, game actions,
 *     live AI game generation/modification by ANY game user, and instant GDScript hot-reload
 *   - Full REST API (`/api/*`) for the Electron Theater Studio, CLI, and automated tests
 */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { attachWebSocketServer } = require('./ws-server');
const { detectLanIp, ensureTheaterTlsCert } = require('./tls-cert');
const {
  getTheaterDir,
  loadRawSettings,
  updateTheaterSettings,
  loadTheaterPlayers,
  upsertTheaterPlayer,
  toPublicPlayerProfile,
  buildPlayerLaunchUrl,
  authenticatePlayerRequest,
} = require('./player-registry');
const {
  syncPlayerLaunchDocsWithGoogleDrive,
  invitePlayerToTheaterDoc,
} = require('./player-doc-sync');
const { GameTheaterRuntime } = require('./game-runtime');
const {
  WEB_GODOT_DIR,
  validateBundle,
  ensureGodotWebClientExported,
  generateOrModifyGame,
} = require('./agent-builder');

const SESSION_COOKIE = 'robos_theater_player';
const ROBOS_DASHBOARD_UI_PATH = path.resolve(__dirname, '..', '..', 'robos-ui', 'robos-dashboard.js');

function requireDashboardEngine() {
  for (const candidate of [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dashboard-engine'),
    path.resolve(__dirname, '..', '..', 'robos-lib', 'dashboard-engine'),
    '/usr/local/share/robos/robos-lib/dashboard-engine',
  ].filter(Boolean)) {
    try {
      return require(candidate);
    } catch {}
  }
  return null;
}

function buildResolvedSpectatorDashboard(runtime, options = {}) {
  const liveSnap = runtime.getSpectatorSnapshot();
  const dashMod = requireDashboardEngine();
  if (dashMod && typeof dashMod.createDashboardEngine === 'function') {
    try {
      const eng = dashMod.createDashboardEngine({
        configDir: options.configDir,
      });
      const resolved = eng.resolveDashboard('game-theater-spectator');
      if (resolved?.dashboard && Array.isArray(resolved.dashboard.cards)) {
        resolved.dashboard.cards = resolved.dashboard.cards.map((card) =>
          card.widgetType === 'game-theater'
            ? { ...card, liveData: { ok: true, ...liveSnap } }
            : card,
        );
        return {
          ok: true,
          dashboard: resolved.dashboard,
          spectator: liveSnap,
        };
      }
    } catch {}
  }

  // Fallback self-contained KGraph dashboard definition if robos-lib isn't loaded
  return {
    ok: true,
    spectator: liveSnap,
    dashboard: {
      id: 'game-theater-spectator',
      kgraphId: 'urn:robos:dashboard:game-theater-spectator',
      title: 'Game Theater — Live Spectator Dashboard',
      layoutId: 'hero-top-split',
      layout: {
        id: 'hero-top-split',
        title: 'Hero Top + 2-Card Split',
        gridTemplate: 'repeat(2, minmax(0, 1fr))',
      },
      cards: [
        {
          id: 'game-theater-live-stage',
          title: 'Live Multiplayer Stage (Secret-Safe Spectator View)',
          widgetType: 'game-theater',
          componentTag: 'robos-widget-game-theater',
          slotId: 'hero-top',
          colSpan: 2,
          rowSpan: 1,
          widgetMeta: { icon: '🎭' },
          config: { mode: 'stage' },
          liveData: { ok: true, ...liveSnap },
        },
        {
          id: 'game-theater-leaderboard',
          title: 'Live Standings & Seated Players',
          widgetType: 'game-theater',
          componentTag: 'robos-widget-game-theater',
          slotId: 'bottom-left',
          colSpan: 1,
          rowSpan: 1,
          widgetMeta: { icon: '🏆' },
          config: { mode: 'leaderboard' },
          liveData: { ok: true, ...liveSnap },
        },
        {
          id: 'game-theater-lobby-feed',
          title: 'Lobby Presence, Chat & AI Game Builder',
          widgetType: 'game-theater',
          componentTag: 'robos-widget-game-theater',
          slotId: 'bottom-right',
          colSpan: 1,
          rowSpan: 1,
          widgetMeta: { icon: '🟢' },
          config: { mode: 'lobby' },
          liveData: { ok: true, ...liveSnap },
        },
      ],
    },
  };
}

function renderSpectatorTvWallboardHtml({ tvName = '' } = {}) {
  const safeTv = String(tvName || 'Smart TV Wallboard')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1920, initial-scale=1" />
  <title>RobOS AI Multiplayer Game Theater — Live Spectator Dashboard</title>
  <style>
    :root {
      --bg: #070b12;
      --surface: #0e1626;
      --border: #1e2d47;
      --accent: #00bcd4;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      min-height: 100vh;
      background:
        radial-gradient(circle at 12% 0%, rgba(0, 188, 212, 0.16), transparent 42%),
        radial-gradient(circle at 88% 100%, rgba(168, 85, 247, 0.14), transparent 42%),
        var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-x: hidden;
    }
    body {
      padding: 24px 34px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .tv-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }
    .tv-brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .tv-live-pill {
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid rgba(16, 185, 129, 0.55);
      color: #6ee7b7;
      padding: 6px 13px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.05em;
    }
    .tv-title {
      font-size: 25px;
      font-weight: 850;
      letter-spacing: -0.02em;
      color: #f8fafc;
    }
    .tv-sub {
      font-size: 13px;
      color: var(--muted);
      margin-top: 2px;
    }
    .tv-pills {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .tv-pill {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 7px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 650;
      color: var(--text);
    }
    .tv-pill.cyan {
      border-color: rgba(0, 188, 212, 0.45);
      color: #67e8f9;
      background: rgba(0, 188, 212, 0.11);
    }
    .tv-footer {
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      font-size: 12.5px;
      color: var(--muted);
    }
    /* Scale up embedded RobOS Dashboard slightly for crisp 10-foot 65" TV legibility */
    robos-dashboard .robos-embed-card {
      padding: 18px 20px;
      border-radius: 14px;
      background: rgba(14, 22, 38, 0.92);
      border-color: #1e2d47;
    }
    robos-dashboard .robos-embed-card-title {
      font-size: 14px;
    }
  </style>
</head>
<body>
  <header class="tv-header">
    <div class="tv-brand">
      <span class="tv-live-pill">● LIVE ROBOS DASHBOARD</span>
      <div>
        <div class="tv-title" id="tv-game-headline">RobOS AI Multiplayer Game Theater — Live Spectator</div>
        <div class="tv-sub" id="tv-game-sub">Secret-safe 10-foot spectator view · Showing on ${safeTv}</div>
      </div>
    </div>
    <div class="tv-pills">
      <span class="tv-pill cyan" id="tv-clock-pill" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">🕒 --:--:--</span>
      <span class="tv-pill cyan">📺 ${safeTv}</span>
      <span class="tv-pill">🕸️ urn:robos:dashboard:game-theater-spectator</span>
    </div>
  </header>

  <main>
    <robos-dashboard id="theater-tv-dashboard" layout="hero-top-split"></robos-dashboard>
  </main>

  <footer class="tv-footer">
    <div>RobOS Dashboards &amp; AI Multiplayer Game Theater · Secret-Safe Spectator Feed (<code>__spectator__</code>)</div>
    <div id="tv-footer-meta">Players join on phones or laptops via their personal Google Doc Launch Button</div>
  </footer>

  <script src="/api/robos-dashboard.js"></script>
  <script>
    (function () {
      const dashEl = document.getElementById('theater-tv-dashboard');
      const headlineEl = document.getElementById('tv-game-headline');
      const subEl = document.getElementById('tv-game-sub');
      const clockEl = document.getElementById('tv-clock-pill');
      let lastDigest = '';

      function updateClock() {
        const t = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (clockEl) clockEl.textContent = '🕒 ' + t;
      }

      async function pullSpectatorDashboard() {
        try {
          const res = await fetch('/api/spectator-dashboard', { cache: 'no-store' });
          if (!res.ok) return;
          const json = await res.json();
          if (!json || !json.dashboard) return;
          const sp = json.spectator || {};
          const digest = JSON.stringify({
            matchStatus: sp.matchStatus,
            matchId: sp.matchId,
            activeGame: sp.activeGame,
            seats: sp.seats,
            onlinePlayers: sp.onlinePlayers,
            spectatorView: sp.spectatorView,
            chatLog: sp.chatLog,
            agentStatus: sp.agentStatus,
          });
          if (digest === lastDigest) return;
          lastDigest = digest;

          if (sp.activeGame && sp.activeGame.title) {
            headlineEl.textContent = '🎭 ' + sp.activeGame.title + ' — Live Spectator Dashboard';
            subEl.textContent = (sp.activeGame.description || 'Live RobOS AI Multiplayer Game Theater') + ' · Secret-Safe TV Wallboard';
          }
          dashEl.dashboard = json.dashboard;
        } catch {}
      }

      updateClock();
      setInterval(updateClock, 1000);
      pullSpectatorDashboard();
      setInterval(pullSpectatorDashboard, 900);

      try {
        const es = new EventSource('/api/spectator-events');
        es.onmessage = () => pullSpectatorDashboard();
      } catch {}
    })();
  </script>
</body>
</html>`;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pck': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.ttc': 'font/collection',
  '.otf': 'font/otf',
};

const FONT_CANDIDATES = {
  symbols2: [
    '/usr/share/fonts/truetype/noto/NotoSansSymbols2-Regular.ttf',
    '/usr/share/fonts/noto/NotoSansSymbols2-Regular.ttf',
  ],
  symbols: [
    '/usr/share/fonts/truetype/noto/NotoSansSymbols-Regular.ttf',
    '/usr/share/fonts/noto/NotoSansSymbols-Regular.ttf',
  ],
  dejavu: [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    'C:\\Windows\\Fonts\\seguisym.ttf',
  ],
};

function resolveSystemFontPath(kind) {
  const list = FONT_CANDIDATES[kind] || [];
  for (const candidate of list) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {}
  }
  return '';
}

function parseCookies(req) {
  const raw = String(req.headers?.cookie || '');
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function isLoopbackRequest(req) {
  const remote = String(req.socket?.remoteAddress || '');
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').trim();
  if (forwarded) return false;
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

function readJsonBody(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Request payload too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function renderUnauthorizedHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RobOS AI Multiplayer Game Theater — Player Launch Doc Required</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:#0d1117; color:#e6edf3; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; }
    .card { max-width:480px; background:#161b22; border:1px solid #30363d; border-radius:14px; padding:28px; text-align:center; box-shadow:0 12px 32px rgba(0,0,0,0.45); }
    h1 { font-size:20px; margin:0 0 10px 0; color:#00bcd4; }
    p { font-size:14px; color:#8b949e; line-height:1.55; margin:0 0 16px 0; }
    .badge { display:inline-block; background:rgba(0,188,212,0.12); color:#00bcd4; border:1px solid rgba(0,188,212,0.3); padding:6px 12px; border-radius:999px; font-size:12px; font-weight:600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🎭 Open via Your Personal Google Doc</h1>
    <p>RobOS AI Multiplayer Game Theater identifies each player using their personal Google Drive launch document. Open <strong>"RobOS Game Theater — &lt;Your Name&gt; (Player Launch Doc)"</strong> in Google Docs and click the launch button.</p>
    <span class="badge">🔒 Google-Doc Gated Godot 4 Multiplayer Client</span>
  </div>
</body>
</html>`;
}

function createGameTheaterServer(options = {}) {
  const runtime = options.runtime || new GameTheaterRuntime(options);
  const wsClients = new Set(); // { conn, player }
  const sseClients = new Set();

  if (options.autoExportGodot !== false) {
    try {
      ensureGodotWebClientExported();
    } catch {}
  }

  let serverEndpoints = {
    localHttpUrl: '',
    lanHttpUrl: '',
    localHttpsUrl: '',
    lanHttpsUrl: '',
  };

  function broadcastSnapshots() {
    for (const entry of wsClients) {
      try {
        entry.conn.sendJson({
          type: 'snapshot',
          snapshot: runtime.getSnapshotForPlayer(entry.player),
        });
      } catch {}
    }
    const ssePayload = `data: ${JSON.stringify({ type: 'theater-updated', ts: Date.now() })}\n\n`;
    for (const res of sseClients) {
      try { res.write(ssePayload); } catch {}
    }
  }

  runtime.on('updated', () => {
    broadcastSnapshots();
  });

  function resolveReqAuth(req, parsedUrl) {
    const cookies = parseCookies(req);
    const queryAuth = parsedUrl.searchParams.get('auth') || '';
    const queryAs = parsedUrl.searchParams.get('as') || '';
    const isLoopback = isLoopbackRequest(req);
    return authenticatePlayerRequest(
      {
        queryAuth,
        queryAs,
        cookieVal: cookies[SESSION_COOKIE] || '',
        isLoopback,
      },
      options,
    );
  }

  function buildHostState(viewerPlayer) {
    const settings = loadRawSettings(options);
    const players = loadTheaterPlayers(options);
    const primaryBaseUrl =
      settings.publicTunnelUrl ||
      serverEndpoints.lanHttpsUrl ||
      settings.lanHttpsUrl ||
      serverEndpoints.localHttpUrl ||
      'https://127.0.0.1:19229';

    return {
      ok: true,
      me: toPublicPlayerProfile(viewerPlayer),
      endpoints: {
        ...serverEndpoints,
        publicTunnelUrl: settings.publicTunnelUrl || '',
        primaryBaseUrl,
      },
      hostDoc: settings.hostDoc || {},
      players: players.map((p) => ({
        uid: p.uid,
        name: p.name,
        shortName: p.shortName,
        gamerTag: p.gamerTag,
        avatar: p.avatar,
        color: p.color,
        email: p.email,
        launchUrl: buildPlayerLaunchUrl(primaryBaseUrl, p),
        lanHttpsLaunchUrl: serverEndpoints.lanHttpsUrl
          ? buildPlayerLaunchUrl(serverEndpoints.lanHttpsUrl, p)
          : '',
        localLaunchUrl: serverEndpoints.localHttpUrl
          ? `${serverEndpoints.localHttpUrl}/?auth=${encodeURIComponent(p.authToken)}`
          : '',
        doc: settings.playerDocs?.[p.uid] || null,
      })),
      lobby: runtime.getSnapshotForPlayer(viewerPlayer),
    };
  }

  async function handleHttpRequest(req, res) {
    try {
      const isTls = Boolean(req.socket?.encrypted) || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
      const proto = isTls ? 'https' : 'http';
      const parsedUrl = new URL(req.url || '/', `${proto}://${req.headers.host || '127.0.0.1'}`);
      const pathname = parsedUrl.pathname;

      // ── Public vector symbol fallback fonts for Godot 4 WebAssembly ───────
      if (
        (req.method === 'GET' || req.method === 'HEAD') &&
        /^\/api\/fonts\/(symbols2|symbols|dejavu)\.ttf$/.test(pathname)
      ) {
        const kind = pathname.slice('/api/fonts/'.length, -'.ttf'.length);
        const fontPath = resolveSystemFontPath(kind);
        if (!fontPath) {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
          return res.end();
        }
        const stat = fs.statSync(fontPath);
        res.writeHead(200, {
          'Content-Type': 'font/ttf',
          'Content-Length': stat.size,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        });
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(fontPath).pipe(res);
      }

      // ── Public Secret-Safe RobOS Spectator Dashboard & 10-Foot TV Wallboard ─
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/api/robos-dashboard.js') {
        if (!fs.existsSync(ROBOS_DASHBOARD_UI_PATH)) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('robos-dashboard.js not found');
        }
        const stat = fs.statSync(ROBOS_DASHBOARD_UI_PATH);
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        });
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(ROBOS_DASHBOARD_UI_PATH).pipe(res);
      }

      if (req.method === 'GET' && pathname === '/api/spectator') {
        return sendJson(
          res,
          200,
          { ok: true, spectator: runtime.getSpectatorSnapshot() },
          { 'Access-Control-Allow-Origin': '*' },
        );
      }

      if (req.method === 'GET' && pathname === '/api/spectator-dashboard') {
        return sendJson(
          res,
          200,
          buildResolvedSpectatorDashboard(runtime, options),
          { 'Access-Control-Allow-Origin': '*' },
        );
      }

      if (req.method === 'GET' && pathname === '/api/spectator-events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/tv') {
        const tvName = parsedUrl.searchParams.get('tvName') || '65" Smart TV';
        const html = renderSpectatorTvWallboardHtml({ tvName });
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        if (req.method === 'HEAD') return res.end();
        return res.end(html);
      }

      const authRes = resolveReqAuth(req, parsedUrl);
      if (!authRes.ok) {
        if (pathname.startsWith('/api/')) {
          return sendJson(res, 401, { ok: false, error: authRes.error });
        }
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderUnauthorizedHtml());
      }

      const player = authRes.player;
      const cookieHeaders = [];
      if (authRes.via === 'token' || authRes.via === 'loopback-as') {
        cookieHeaders.push(
          `${SESSION_COOKIE}=${encodeURIComponent(authRes.signedCookie)}; Path=/; Max-Age=${365 * 86400}; HttpOnly; SameSite=Lax${isTls ? '; Secure' : ''}`,
        );
      }
      const extraHeaders = cookieHeaders.length ? { 'Set-Cookie': cookieHeaders } : {};

      // ── SSE live stream for Electron desktop studio ────────────────────────
      if (req.method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...extraHeaders,
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      // ── GET /api/me ────────────────────────────────────────────────────────
      if (req.method === 'GET' && pathname === '/api/me') {
        return sendJson(
          res,
          200,
          {
            ok: true,
            player: toPublicPlayerProfile(player),
            snapshot: runtime.getSnapshotForPlayer(player),
          },
          extraHeaders,
        );
      }

      // ── GET /api/state ─────────────────────────────────────────────────────
      if (req.method === 'GET' && pathname === '/api/state') {
        return sendJson(res, 200, buildHostState(player), extraHeaders);
      }

      // ── GET /api/games ─────────────────────────────────────────────────────
      if (req.method === 'GET' && pathname === '/api/games') {
        return sendJson(
          res,
          200,
          {
            ok: true,
            activeGameId: runtime.activeGameId,
            games: runtime.listGames(),
          },
          extraHeaders,
        );
      }

      // ── GET /api/games/:id ─────────────────────────────────────────────────
      if (req.method === 'GET' && pathname.startsWith('/api/games/')) {
        const gid = decodeURIComponent(pathname.slice('/api/games/'.length));
        const rec = runtime.getGameRecord(gid);
        if (!rec) return sendJson(res, 404, { ok: false, error: `Game "${gid}" not found.` }, extraHeaders);
        return sendJson(
          res,
          200,
          {
            ok: true,
            game: {
              ...rec.manifest,
              serverJs: rec.serverJs,
              clientGd: rec.clientGd,
            },
          },
          extraHeaders,
        );
      }

      // ── POST /api/games/generate (Any authenticated RobOS Game User!) ──────
      if (req.method === 'POST' && pathname === '/api/games/generate') {
        const body = await readJsonBody(req);
        const created = await generateOrModifyGame({
          mode: 'generate',
          runtime,
          title: body.title || '',
          prompt: body.prompt || '',
          requestedBy: player,
          providerId: body.providerId || options.providerId || '',
          aiAsk: options.aiAsk || null,
          skipGodotValidation: Boolean(options.skipGodotValidation),
        });
        return sendJson(res, 200, created, extraHeaders);
      }

      // ── POST /api/games/:id/modify (Any authenticated RobOS Game User!) ────
      if (req.method === 'POST' && /^\/api\/games\/[^/]+\/modify$/.test(pathname)) {
        const gid = decodeURIComponent(pathname.split('/')[3]);
        const body = await readJsonBody(req);
        const modified = await generateOrModifyGame({
          mode: 'modify',
          runtime,
          gameId: gid,
          prompt: body.prompt || '',
          requestedBy: player,
          providerId: body.providerId || options.providerId || '',
          aiAsk: options.aiAsk || null,
          skipGodotValidation: Boolean(options.skipGodotValidation),
        });
        return sendJson(res, 200, modified, extraHeaders);
      }

      // ── POST /api/games/:id/select ─────────────────────────────────────────
      if (req.method === 'POST' && /^\/api\/games\/[^/]+\/select$/.test(pathname)) {
        const gid = decodeURIComponent(pathname.split('/')[3]);
        const selected = runtime.selectGame(gid);
        return sendJson(res, 200, { ok: true, game: selected.manifest }, extraHeaders);
      }

      // ── POST /api/games/:id/source (Live manual code edit + validation) ────
      if (req.method === 'POST' && /^\/api\/games\/[^/]+\/source$/.test(pathname)) {
        const gid = decodeURIComponent(pathname.split('/')[3]);
        const existing = runtime.getGameRecord(gid);
        if (!existing) return sendJson(res, 404, { ok: false, error: `Game "${gid}" not found.` }, extraHeaders);
        const body = await readJsonBody(req);
        const validated = validateBundle(
          {
            manifest: { ...existing.manifest, ...(body.manifest || {}) },
            serverJs: body.serverJs ?? existing.serverJs,
            clientGd: body.clientGd ?? existing.clientGd,
          },
          { skipGodotValidation: Boolean(options.skipGodotValidation) },
        );
        const saved = runtime.saveAndActivateGame({
          id: gid,
          manifest: {
            ...validated.manifest,
            updatedBy: player.uid,
          },
          serverJs: validated.serverJs,
          clientGd: validated.clientGd,
          activate: true,
        });
        return sendJson(res, 200, { ok: true, game: saved.manifest }, extraHeaders);
      }

      // ── POST /api/lobby/seat ───────────────────────────────────────────────
      if (req.method === 'POST' && pathname === '/api/lobby/seat') {
        const body = await readJsonBody(req);
        const result = body.action === 'leave'
          ? runtime.leaveSeat(player.uid)
          : runtime.joinSeat(player);
        return sendJson(res, result.ok ? 200 : 409, result, extraHeaders);
      }

      // ── POST /api/lobby/start ──────────────────────────────────────────────
      if (req.method === 'POST' && pathname === '/api/lobby/start') {
        const body = await readJsonBody(req);
        const result = runtime.startMatch(player, body.options || {});
        return sendJson(res, result.ok ? 200 : 409, result, extraHeaders);
      }

      // ── POST /api/game/action ──────────────────────────────────────────────
      if (req.method === 'POST' && pathname === '/api/game/action') {
        const body = await readJsonBody(req);
        const actionPayload = body.action && typeof body.action === 'object' ? body.action : body;
        const result = runtime.handleGameAction(player, actionPayload);
        return sendJson(res, result.ok ? 200 : 400, result, extraHeaders);
      }

      // ── POST /api/chat ─────────────────────────────────────────────────────
      if (req.method === 'POST' && pathname === '/api/chat') {
        const body = await readJsonBody(req);
        const msg = runtime.addChatMessage(player, body.text || '');
        return sendJson(res, 200, { ok: true, message: msg }, extraHeaders);
      }

      // ── POST /api/players ──────────────────────────────────────────────────
      if (req.method === 'POST' && pathname === '/api/players') {
        const body = await readJsonBody(req);
        const savedPlayer = upsertTheaterPlayer(body, options);
        return sendJson(res, 200, { ok: true, player: savedPlayer }, extraHeaders);
      }

      // ── POST /api/docs/sync ────────────────────────────────────────────────
      if (req.method === 'POST' && pathname === '/api/docs/sync') {
        const body = await readJsonBody(req);
        const active = runtime.getActiveGame();
        const synced = await syncPlayerLaunchDocsWithGoogleDrive({
          ...options,
          webAppUrl: body.webAppUrl || undefined,
          lanHttpsUrl: serverEndpoints.lanHttpsUrl || undefined,
          activeGameTitle: active ? active.manifest.title : '',
          onlyPlayerUids: body.onlyPlayerUids,
        });
        broadcastSnapshots();
        return sendJson(res, 200, synced, extraHeaders);
      }

      // ── POST /api/players/:uid/invite ──────────────────────────────────────
      if (req.method === 'POST' && /^\/api\/players\/[^/]+\/invite$/.test(pathname)) {
        const uid = decodeURIComponent(pathname.split('/')[3]);
        const body = await readJsonBody(req);
        const active = runtime.getActiveGame();
        const invited = await invitePlayerToTheaterDoc(
          { uid, email: body.email, message: body.message },
          {
            ...options,
            lanHttpsUrl: serverEndpoints.lanHttpsUrl || undefined,
            activeGameTitle: active ? active.manifest.title : '',
          },
        );
        broadcastSnapshots();
        return sendJson(res, 200, invited, extraHeaders);
      }

      // ── Static Godot 4 HTTPS Web Client files ──────────────────────────────
      const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const filePath = path.join(WEB_GODOT_DIR, safePath);

      if (!filePath.startsWith(WEB_GODOT_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...extraHeaders });
        return res.end('Not found');
      }

      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Cache-Control': ext === '.wasm' ? 'public, max-age=3600' : 'no-cache',
        ...extraHeaders,
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  function handleWsConnection(conn, context) {
    const player = context.player;
    const clientEntry = { conn, player };
    wsClients.add(clientEntry);
    runtime.markPlayerConnected(player);

    conn.sendJson({
      type: 'snapshot',
      snapshot: runtime.getSnapshotForPlayer(player),
    });

    conn.on('message', async (rawText) => {
      let msg;
      try {
        msg = JSON.parse(rawText);
      } catch {
        return;
      }
      const type = String(msg?.type || '');

      try {
        if (type === 'join_seat') {
          const res = runtime.joinSeat(player);
          if (!res.ok) conn.sendJson({ type: 'action_error', error: res.error, code: res.code });
        } else if (type === 'leave_seat') {
          runtime.leaveSeat(player.uid);
        } else if (type === 'start_match') {
          const res = runtime.startMatch(player, msg.options || {});
          if (!res.ok) conn.sendJson({ type: 'action_error', error: res.error, code: res.code });
        } else if (type === 'game_action') {
          const res = runtime.handleGameAction(player, msg.action || {});
          if (!res.ok) conn.sendJson({ type: 'action_error', error: res.error, code: res.code });
        } else if (type === 'select_game') {
          runtime.selectGame(String(msg.gameId || ''));
        } else if (type === 'chat') {
          runtime.addChatMessage(player, msg.text || '');
        } else if (type === 'generate_game') {
          generateOrModifyGame({
            mode: 'generate',
            runtime,
            title: msg.title || '',
            prompt: msg.prompt || '',
            requestedBy: player,
            providerId: msg.providerId || options.providerId || '',
            aiAsk: options.aiAsk || null,
            skipGodotValidation: Boolean(options.skipGodotValidation),
          })
            .then((created) => {
              conn.sendJson({ type: 'info', message: `Created "${created.game.title}"!` });
            })
            .catch((err) => {
              conn.sendJson({ type: 'action_error', error: err.message });
            });
        } else if (type === 'modify_game') {
          generateOrModifyGame({
            mode: 'modify',
            runtime,
            gameId: msg.gameId || runtime.activeGameId || '',
            prompt: msg.prompt || '',
            requestedBy: player,
            providerId: msg.providerId || options.providerId || '',
            aiAsk: options.aiAsk || null,
            skipGodotValidation: Boolean(options.skipGodotValidation),
          })
            .then((updated) => {
              conn.sendJson({ type: 'info', message: `Updated "${updated.game.title}" (v${updated.game.version})!` });
            })
            .catch((err) => {
              conn.sendJson({ type: 'action_error', error: err.message });
            });
        }
      } catch (err) {
        conn.sendJson({ type: 'action_error', error: err.message });
      }
    });

    conn.on('close', () => {
      wsClients.delete(clientEntry);
      runtime.markPlayerDisconnected(player.uid);
    });
  }

  const httpServer = http.createServer(handleHttpRequest);
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 0;
  httpServer.keepAliveTimeout = 120000;
  attachWebSocketServer(httpServer, {
    pathPrefix: '/ws',
    verifyUpgrade: (req, parsedUrl) => resolveReqAuth(req, parsedUrl),
    onConnection: handleWsConnection,
  });

  let httpsServer = null;

  async function listen({
    httpPort = Number(process.env.GAME_THEATER_PORT || 19228),
    httpsPort = Number(process.env.GAME_THEATER_HTTPS_PORT || 19229),
    host = '0.0.0.0',
    enableHttps = true,
  } = {}) {
    const lanIp = detectLanIp();

    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(httpPort, host, () => {
        httpServer.removeListener('error', reject);
        resolve();
      });
    });

    const boundHttpPort = httpServer.address().port;
    let boundHttpsPort = null;

    if (enableHttps) {
      const tlsDir = path.join(getTheaterDir(options), 'tls');
      const tls = ensureTheaterTlsCert(tlsDir, lanIp);
      httpsServer = https.createServer({ key: tls.key, cert: tls.cert }, handleHttpRequest);
      httpsServer.requestTimeout = 0;
      httpsServer.headersTimeout = 0;
      httpsServer.keepAliveTimeout = 120000;
      attachWebSocketServer(httpsServer, {
        pathPrefix: '/ws',
        verifyUpgrade: (req, parsedUrl) => resolveReqAuth(req, parsedUrl),
        onConnection: handleWsConnection,
      });

      await new Promise((resolve, reject) => {
        httpsServer.once('error', reject);
        httpsServer.listen(httpsPort, host, () => {
          httpsServer.removeListener('error', reject);
          resolve();
        });
      });
      boundHttpsPort = httpsServer.address().port;
    }

    serverEndpoints = {
      httpPort: boundHttpPort,
      httpsPort: boundHttpsPort,
      localHttpUrl: `http://127.0.0.1:${boundHttpPort}`,
      lanHttpUrl: `http://${lanIp}:${boundHttpPort}`,
      localHttpsUrl: boundHttpsPort ? `https://127.0.0.1:${boundHttpsPort}` : '',
      lanHttpsUrl: boundHttpsPort ? `https://${lanIp}:${boundHttpsPort}` : '',
    };

    if (serverEndpoints.lanHttpsUrl) {
      updateTheaterSettings({ lanHttpsUrl: serverEndpoints.lanHttpsUrl }, options);
    }

    return { ...serverEndpoints };
  }

  async function close() {
    runtime.close?.();
    for (const c of wsClients) {
      try { c.conn.close(); } catch {}
    }
    wsClients.clear();
    for (const r of sseClients) {
      try { r.end(); } catch {}
    }
    sseClients.clear();

    await new Promise((resolve) => httpServer.close(() => resolve()));
    if (httpsServer) {
      await new Promise((resolve) => httpsServer.close(() => resolve()));
    }
  }

  return {
    runtime,
    httpServer,
    get httpsServer() {
      return httpsServer;
    },
    get endpoints() {
      return { ...serverEndpoints };
    },
    listen,
    close,
  };
}

module.exports = {
  SESSION_COOKIE,
  createGameTheaterServer,
};

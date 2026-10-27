'use strict';

// LAN server for RobOS Party Game.
//
//   /tv?screen=stage|scoreboard|spotlight   TV page (loaded by browser TVs, or
//                                           captured as JPEG frames for Roku)
//   /join                                   phone page: join, survey, answer
//   /events?…                               Server-Sent Events with fresh views
//   /api/view?…                             same view as JSON (polling fallback)
//   /api/join | /api/survey | /api/answer | /api/double-down   (phone POSTs)
//   /api/claim-host | /api/house             party host claims the role and describes the house
//   /api/narration/<id>                     synthesized narration audio
//   /qr.svg                                 QR code for the join URL

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const WEB_DIR = path.join(__dirname, '..', 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

let QRCode = null;
try {
  QRCode = require('qrcode');
} catch {}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Media players (Roku, Cast speakers) need a length and byte ranges, not a
// chunked stream, before they will play a file.
function sendFileWithRanges(req, res, file) {
  const size = fs.statSync(file).size;
  const type = MIME[path.extname(file)] || 'audio/wav';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function createGameServer({ engine, port = 19213, host = '0.0.0.0', getNarrationAudio = () => null, log = () => {} }) {
  const clients = new Set(); // { res, kind: 'tv'|'player'|'host', screen, guestId }
  let server = null;
  let tickTimer = null;

  function viewFor(client) {
    if (client.kind === 'player') return engine.playerView(client.guestId);
    if (client.kind === 'host') return engine.hostView();
    return engine.tvView(client.screen || 'stage');
  }

  function push(client) {
    try {
      client.res.write(`data: ${JSON.stringify(viewFor(client))}\n\n`);
    } catch {
      clients.delete(client);
    }
  }

  let pending = null;
  function broadcast() {
    // Coalesce bursts of changes (e.g. many answers at once) into one push.
    if (pending) return;
    pending = setImmediate(() => {
      pending = null;
      for (const c of clients) push(c);
    });
  }
  engine.events.on('change', broadcast);

  function playerFromQuery(u) {
    return engine.authGuest(u.searchParams.get('guest'), u.searchParams.get('token'));
  }

  function serveStatic(res, file) {
    const full = path.join(WEB_DIR, file);
    if (!full.startsWith(WEB_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(full).pipe(res);
  }

  async function handle(req, res) {
    const u = new URL(req.url || '/', 'http://localhost');
    const p = u.pathname;

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (p === '/' ) {
        res.writeHead(302, { Location: '/join' });
        res.end();
        return;
      }
      if (p === '/join') return serveStatic(res, 'phone.html');
      if (p === '/tv' || p.startsWith('/tv/')) return serveStatic(res, 'tv.html');
      if (p.startsWith('/static/')) return serveStatic(res, p.slice('/static/'.length));

      if (p === '/events' || p === '/api/view') {
        const kind = u.searchParams.get('role') || 'tv';
        const client = { kind, screen: u.searchParams.get('screen') || 'stage', guestId: null };
        if (kind === 'player') {
          const g = playerFromQuery(u);
          if (!g) return sendJson(res, 401, { error: 'unknown-guest' });
          client.guestId = g.id;
        } else if (kind === 'host') {
          // The host view includes everyone's roles; only the host machine may read it.
          const addr = req.socket.remoteAddress || '';
          if (!/^(::1|127\.|::ffff:127\.)/.test(addr)) return sendJson(res, 403, { error: 'host only' });
        }
        if (p === '/api/view') return sendJson(res, 200, viewFor(client));
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write('retry: 2000\n\n');
        client.res = res;
        clients.add(client);
        push(client);
        const ping = setInterval(() => {
          try { res.write(': ping\n\n'); } catch {}
        }, 15000);
        req.on('close', () => {
          clearInterval(ping);
          clients.delete(client);
        });
        return;
      }

      if (p.startsWith('/api/narration/')) {
        const name = decodeURIComponent(p.slice('/api/narration/'.length));
        const format = name.endsWith('.mp4') ? 'mp4' : 'mp3';
        const id = name.replace(/\.(mp3|mp4)$/, '');
        log({ msg: 'narration request', id, format, from: req.socket.remoteAddress, range: req.headers.range || null });
        const file = await getNarrationAudio(id, format);
        if (!file || !fs.existsSync(file)) return sendJson(res, 404, { error: 'no audio' });
        return sendFileWithRanges(req, res, file);
      }

      if (p === '/qr.svg') {
        const data = engine.state.joinUrl || `http://localhost:${port}/join`;
        if (!QRCode) {
          res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
          res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40"><text x="0" y="25" font-size="12">${data}</text></svg>`);
          return;
        }
        const svg = await QRCode.toString(data, { type: 'svg', margin: 1, color: { dark: '#0d1117', light: '#ffffff' } });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
        res.end(svg);
        return;
      }

      if (p === '/api/health') return sendJson(res, 200, { ok: true, phase: engine.state.phase });
    }

    if (req.method === 'POST' && p.startsWith('/api/')) {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
      try {
        if (p === '/api/join') {
          const g = await engine.addGuest({ name: body.name });
          log({ msg: 'guest joined', name: g.name });
          return sendJson(res, 200, { ok: true, guestId: g.id, token: g.token });
        }
        const g = engine.authGuest(body.guestId, body.token);
        if (!g) return sendJson(res, 401, { error: 'unknown-guest' });
        if (p === '/api/survey') return sendJson(res, 200, { ok: true, progress: engine.submitSurvey(g.id, body.answers || {}) });
        if (p === '/api/answer') return sendJson(res, 200, engine.submitAnswer(g.id, String(body.optionId || '')));
        if (p === '/api/double-down') return sendJson(res, 200, engine.useDoubleDown(g.id));
        if (p === '/api/claim-host') return sendJson(res, 200, engine.claimPartyHost(g.id));
        if (p === '/api/house') return sendJson(res, 200, { ok: true, progress: engine.submitHouse(g.id, body.answers || {}) });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    sendJson(res, 404, { error: 'not found' });
  }

  function start() {
    if (server) return Promise.resolve(server.address().port);
    return new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        handle(req, res).catch((err) => {
          log({ msg: 'request failed', err: err.message });
          try { sendJson(res, 500, { error: err.message }); } catch {}
        });
      });
      server.keepAliveTimeout = 65000;
      server.headersTimeout = 66000;
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && port !== 0) {
          server.listen(0, host);
        } else reject(err);
      });
      server.on('listening', () => {
        tickTimer = setInterval(() => engine.tick().catch?.(() => {}), 500);
        resolve(server.address().port);
      });
      server.listen(port, host);
    });
  }

  function stop() {
    clearInterval(tickTimer);
    for (const c of clients) {
      try { c.res.end(); } catch {}
    }
    clients.clear();
    return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve())).then(() => {
      server = null;
    });
  }

  return { start, stop, broadcast, clientCount: () => clients.size, port: () => server?.address()?.port || null };
}

module.exports = { createGameServer };

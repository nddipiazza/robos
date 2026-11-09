'use strict';

// Serves the personality's face display. The same page is shown in the app
// window, in a separate desktop window, and on a TV, and they all follow one
// live stream of what the personality is doing:
//
//   GET /face?t=TOKEN          the face display page
//   GET /web/<file>            its script and stylesheet
//   GET /events?t=TOKEN        server-sent events: state, mouth, caption, heard, sight
//   GET /sight.jpg?t=TOKEN     what the eyes see right now (picture-in-picture)
//   GET /voice/<id>?t=TOKEN    a spoken line's audio (for TVs that play it)
//
// Everything except the static page files needs the per-launch token. Requests
// from other machines are refused unless a TV cast is on (allowLan), so the
// camera picture and captions stay on this computer otherwise.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const WEB_DIR = path.join(__dirname, '..', 'web');
const STATIC = {
  'face.js': 'text/javascript; charset=utf-8',
  'face.css': 'text/css; charset=utf-8',
  'talk-core.js': 'text/javascript; charset=utf-8',
};
const AUDIO_TYPES = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

function isLoopback(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function createStageServer({ port = 19223, getState, getSight, log = () => {} }) {
  const token = crypto.randomBytes(16).toString('hex');
  const clients = new Set();
  const voices = new Map(); // id → file path
  let server = null;
  let boundPort = 0;
  let allowLan = false;

  function send(res, event) {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch {}
  }

  function broadcast(type, payload = {}) {
    const event = { type, ...payload };
    for (const res of clients) send(res, event);
  }

  function serveFile(res, file, type, extraHeaders = {}) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-store', ...extraHeaders });
      fs.createReadStream(file).pipe(res);
    });
  }

  function handle(req, res) {
    if (!allowLan && !isLoopback(req.socket.remoteAddress)) {
      res.writeHead(403).end('The face display is only shared while it is cast to a TV.');
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    const p = url.pathname;

    const staticMatch = /^\/web\/([\w.-]+)$/.exec(p);
    if (staticMatch && STATIC[staticMatch[1]]) {
      serveFile(res, path.join(WEB_DIR, staticMatch[1]), STATIC[staticMatch[1]]);
      return;
    }
    if (p === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.searchParams.get('t') !== token) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (p === '/face') {
      serveFile(res, path.join(WEB_DIR, 'face.html'), 'text/html; charset=utf-8');
      return;
    }
    if (p === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 1500\n\n');
      clients.add(res);
      send(res, { type: 'state', ...getState() });
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (p === '/sight.jpg') {
      const jpg = getSight();
      if (!jpg) { res.writeHead(404).end('Nothing seen yet'); return; }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': jpg.length, 'Cache-Control': 'no-store' });
      res.end(jpg);
      return;
    }
    const voiceMatch = /^\/voice\/([\w-]+)$/.exec(p);
    if (voiceMatch) {
      const file = voices.get(voiceMatch[1]);
      if (!file) { res.writeHead(404).end('Not found'); return; }
      // The app window reads the audio's loudness for lip sync, which needs CORS.
      serveFile(res, file, AUDIO_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', { 'Access-Control-Allow-Origin': '*' });
      return;
    }
    res.writeHead(404).end('Not found');
  }

  function listen(p) {
    return new Promise((resolve, reject) => {
      const s = http.createServer(handle);
      s.once('error', reject);
      s.listen(p, '0.0.0.0', () => {
        s.removeListener('error', reject);
        resolve(s);
      });
    });
  }

  return {
    token,
    get port() { return boundPort; },
    get clientCount() { return clients.size; },
    localUrl(query = '') {
      return `http://127.0.0.1:${boundPort}/face?t=${token}${query ? `&${query}` : ''}`;
    },
    lanUrl(host, query = '') {
      return `http://${host}:${boundPort}/face?t=${token}${query ? `&${query}` : ''}`;
    },
    voiceUrl(id) {
      return `/voice/${id}?t=${token}`;
    },
    setAllowLan(v) { allowLan = Boolean(v); },
    addVoice(id, file) {
      voices.set(id, file);
      // Keep only the newest lines.
      while (voices.size > 20) voices.delete(voices.keys().next().value);
    },
    broadcast,
    async start() {
      if (server) return boundPort;
      try {
        server = await listen(port);
      } catch (err) {
        if (err.code !== 'EADDRINUSE') throw err;
        log({ msg: 'stage port busy, using a free one', port });
        server = await listen(0);
      }
      boundPort = server.address().port;
      return boundPort;
    },
    stop() {
      for (const res of clients) { try { res.end(); } catch {} }
      clients.clear();
      return new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
        server = null;
      });
    },
  };
}

module.exports = { createStageServer, isLoopback };

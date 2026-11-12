'use strict';

/**
 * RobOS Google Calendar — "RobOS Add Calendar Event" WebApp Server (:19226).
 *
 * Linked from the 1-button "RobOS Calendar — Add Event Access Form" Google Doc.
 * Provides:
 *   - Capability token (`?auth=<256-bit-key>`) + 1-year `HttpOnly` cookie session gate
 *   - REST API for Named Google Calendars, Family Members, Event Creation (live Google CalDAV PUT),
 *     Event Deletion, Natural-Language Smart Parse, Audio Dictation (Whisper STT), and Google Doc Sync
 *   - Server-Sent Events (`/api/stream`) for instant live updates across phone and desktop
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {
  loadCalendarSettings,
  saveNamedCalendarConfig,
  syncNamedCalendarsToThunderbird,
  createNamedCalendarEvent,
  deleteNamedCalendarEvent,
  listEventsAcrossNamedCalendars,
  parseNaturalLanguageEvent,
} = require('./named-calendars');
const {
  syncCalendarAccessDocWithGoogleDrive,
  inviteMemberToCalendarDoc,
} = require('./access-doc-sync');

let dictateAgent = null;
try {
  dictateAgent = require(path.resolve(__dirname, '..', '..', 'shopping-lists', 'lib', 'dictate-agent'));
} catch {}

const WEB_DIR = path.resolve(__dirname, '..', 'web');
const SESSION_COOKIE = 'robos_cal_session';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function detectLanIp() {
  const nets = os.networkInterfaces();
  let fallback = '127.0.0.1';
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (/^(docker|br-|veth|virbr|tun|tap)/i.test(name)) continue;
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(addr.address)) {
        return addr.address;
      }
      fallback = addr.address;
    }
  }
  return fallback;
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

function signSessionToken(secret) {
  return crypto.createHmac('sha256', String(secret)).update('robos-calendar-webapp-v1').digest('hex');
}

function isLoopbackRequest(req) {
  const remote = String(req.socket?.remoteAddress || '');
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').trim();
  if (forwarded) return false;
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

function readJsonBody(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Request payload too large'));
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
  <title>RobOS Add Calendar Event — Access Required</title>
  <style>
    body { margin:0; font-family: system-ui, sans-serif; background:#0d1117; color:#e6edf3; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; }
    .card { max-width:460px; background:#161b22; border:1px solid #30363d; border-radius:14px; padding:28px; text-align:center; box-shadow:0 12px 32px rgba(0,0,0,0.45); }
    h1 { font-size:20px; margin:0 0 10px 0; color:#38bdf8; }
    p { font-size:14px; color:#8b949e; line-height:1.5; margin:0 0 16px 0; }
    .badge { display:inline-block; background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); padding:6px 12px; border-radius:999px; font-size:12px; font-weight:600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔒 Open via Your Google Doc Access Form</h1>
    <p>This RobOS Add Calendar Event web app is protected by your Google Drive access document. Open <strong>"RobOS Calendar — Add Event Access Form"</strong> in Google Docs and tap the launch button.</p>
    <span class="badge">📅 Google-Gated Calendar WebApp</span>
  </div>
</body>
</html>`;
}

function createCalendarWebServer(options = {}) {
  const clients = new Set();

  function broadcastUpdate(eventType = 'calendar-updated', payload = {}) {
    const msg = `data: ${JSON.stringify({ type: eventType, ts: Date.now(), ...payload })}\n\n`;
    for (const res of clients) {
      try { res.write(msg); } catch {}
    }
  }

  // Pre-warm local Whisper STT worker if dictateAgent is available
  if (dictateAgent && typeof dictateAgent.warmUpWhisper === 'function' && process.env.ROBOS_TEST !== '1') {
    setTimeout(() => {
      try { dictateAgent.warmUpWhisper(); } catch {}
    }, 300);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = parsedUrl.pathname;
      const settings = loadCalendarSettings(options);
      const expectedToken = settings.webAuthToken;
      const expectedCookieVal = signSessionToken(expectedToken);

      // Check `?auth=<token>` query parameter
      const queryAuth = parsedUrl.searchParams.get('auth') || '';
      let isAuthed = false;
      let setCookieHeader = null;

      if (queryAuth && queryAuth === expectedToken) {
        isAuthed = true;
        const isHttps = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
        setCookieHeader = `${SESSION_COOKIE}=${expectedCookieVal}; Path=/; Max-Age=${365 * 86400}; HttpOnly; SameSite=Lax${isHttps ? '; Secure' : ''}`;
      } else {
        const cookies = parseCookies(req);
        if (cookies[SESSION_COOKIE] === expectedCookieVal || isLoopbackRequest(req) || options.requireAuth === false) {
          isAuthed = true;
        }
      }

      if (!isAuthed) {
        if (pathname.startsWith('/api/')) {
          return sendJson(res, 401, { ok: false, error: 'Unauthorized. Open via your RobOS Calendar Access Google Doc.' });
        }
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderUnauthorizedHtml());
      }

      const extraHeaders = setCookieHeader ? { 'Set-Cookie': setCookieHeader } : {};

      // ── SSE Stream ──────────────────────────────────────────────────────────
      if (req.method === 'GET' && pathname === '/api/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...extraHeaders,
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      // ── GET /api/state — Named Calendars, Family Members, Upcoming Events, Access Doc ──
      if (req.method === 'GET' && pathname === '/api/state') {
        const state = await listEventsAcrossNamedCalendars(null, options);
        const latestSettings = loadCalendarSettings(options);
        return sendJson(
          res,
          200,
          {
            ok: true,
            email: state.email,
            defaultCalendarId: state.defaultCalendarId,
            calendars: state.calendars,
            familyMembers: state.familyMembers,
            events: state.events,
            accessDoc: latestSettings.accessDoc || {},
            calendarDocs: latestSettings.calendarDocs || {},
            publicTunnelUrl: latestSettings.publicTunnelUrl || '',
            lanWebAppUrl: latestSettings.lanWebAppUrl || '',
          },
          extraHeaders
        );
      }

      // ── POST /api/events — Create a new Google Calendar Event ───────────────
      if (req.method === 'POST' && pathname === '/api/events') {
        const body = await readJsonBody(req);
        const created = await createNamedCalendarEvent(body, options);
        broadcastUpdate('event-created', { event: created.event });
        // Refresh Access Google Doc snapshot asynchronously if configured
        const latestSettings = loadCalendarSettings(options);
        if (latestSettings.accessDoc?.docId && !options.skipNetwork) {
          syncCalendarAccessDocWithGoogleDrive(options).catch(() => {});
        }
        return sendJson(res, 200, created, extraHeaders);
      }

      // ── DELETE /api/events/:id — Delete a Calendar Event ────────────────────
      if (req.method === 'DELETE' && pathname.startsWith('/api/events/')) {
        const eventId = decodeURIComponent(pathname.slice('/api/events/'.length));
        const calendarId = parsedUrl.searchParams.get('calendarId') || '';
        const deleted = await deleteNamedCalendarEvent(eventId, { ...options, calendarId });
        broadcastUpdate('event-deleted', { deletedId: eventId });
        return sendJson(res, 200, deleted, extraHeaders);
      }

      // ── POST /api/parse — Smart Natural Language / Itinerary / Invite Parser ─
      if (req.method === 'POST' && pathname === '/api/parse') {
        const body = await readJsonBody(req);
        const state = await listEventsAcrossNamedCalendars(null, { ...options, skipNetwork: true });
        const parsed = parseNaturalLanguageEvent(body.text || '', {
          ...options,
          familyMembers: state.familyMembers,
          calendars: state.calendars,
        });
        if (body.calendarId && !parsed.calendarId) {
          parsed.calendarId = body.calendarId;
        }
        if (body.autoCreate && parsed.summary) {
          const eventsToCreate =
            body.createAllDetected && Array.isArray(parsed.detectedEvents) && parsed.detectedEvents.length > 1
              ? parsed.detectedEvents
              : [parsed];
          const createdEvents = [];
          let anySynced = false;
          for (const evInput of eventsToCreate) {
            const cRes = await createNamedCalendarEvent(
              {
                ...evInput,
                calendarId: body.calendarId || evInput.calendarId || parsed.calendarId,
              },
              options
            );
            if (cRes.event) createdEvents.push(cRes.event);
            if (cRes.syncedToGoogle) anySynced = true;
          }
          broadcastUpdate('event-created', { event: createdEvents[0], count: createdEvents.length });
          return sendJson(
            res,
            200,
            {
              ok: true,
              parsed,
              created: createdEvents[0],
              createdEvents,
              syncedToGoogle: anySynced,
            },
            extraHeaders
          );
        }
        return sendJson(res, 200, { ok: true, parsed, detectedEvents: parsed.detectedEvents || [parsed] }, extraHeaders);
      }

      // ── POST /api/dictate — Whisper STT Audio Dictation -> Event Parser/Creator ─
      if (req.method === 'POST' && pathname === '/api/dictate') {
        const body = await readJsonBody(req);
        if (!dictateAgent || typeof dictateAgent.transcribeAudioBase64 !== 'function') {
          return sendJson(res, 500, { ok: false, error: 'Whisper STT audio transcriber not available.' }, extraHeaders);
        }
        const stt = await dictateAgent.transcribeAudioBase64({
          audioBase64: body.audioBase64,
          mimeType: body.mimeType || 'audio/webm',
        });
        const transcript = String(stt?.transcript || '').trim();
        if (!transcript) {
          return sendJson(res, 200, { ok: false, error: 'No speech detected in audio.', transcript: '' }, extraHeaders);
        }
        const state = await listEventsAcrossNamedCalendars(null, { ...options, skipNetwork: true });
        const parsed = parseNaturalLanguageEvent(transcript, {
          ...options,
          familyMembers: state.familyMembers,
          calendars: state.calendars,
        });
        let created = null;
        if (body.autoCreate && parsed.summary) {
          const resCreate = await createNamedCalendarEvent(parsed, options);
          created = resCreate.event;
          broadcastUpdate('event-created', { event: created });
        }
        return sendJson(res, 200, { ok: true, transcript, parsed, created }, extraHeaders);
      }

      // ── POST /api/calendars/config — Rename / Color / Set Default Named Calendar ─
      if (req.method === 'POST' && pathname === '/api/calendars/config') {
        const body = await readJsonBody(req);
        const saved = saveNamedCalendarConfig(body, options);
        const syncTb = await syncNamedCalendarsToThunderbird(null, options);
        broadcastUpdate('calendars-updated', {});
        return sendJson(res, 200, { ok: true, saved, thunderbird: syncTb }, extraHeaders);
      }

      // ── POST /api/calendars/invite — Send Calendar Invite Google Doc to Email ─
      if (req.method === 'POST' && pathname === '/api/calendars/invite') {
        const body = await readJsonBody(req);
        const invited = await inviteMemberToCalendarDoc(
          {
            calendar: body.calendar || body.calendarId || body.calendarName || '',
            email: body.email || '',
            message: body.message || '',
          },
          options
        );
        broadcastUpdate('calendars-updated', {});
        return sendJson(res, 200, invited, extraHeaders);
      }

      // ── POST /api/sync-doc — Create / Update Access Google Doc ──────────────
      if (req.method === 'POST' && pathname === '/api/sync-doc') {
        const body = await readJsonBody(req);
        const docRes = await syncCalendarAccessDocWithGoogleDrive({
          ...options,
          shareWithFamily: Boolean(body.shareWithFamily),
        });
        return sendJson(res, 200, docRes, extraHeaders);
      }

      // ── Static Web Assets ───────────────────────────────────────────────────
      let relPath = pathname === '/' ? '/index.html' : pathname;
      relPath = path.posix.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const filePath = path.join(WEB_DIR, relPath);
      if (!filePath.startsWith(WEB_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        ...extraHeaders,
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
  });

  function listen(port = 19226, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        const addr = server.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : port;
        const lanIp = detectLanIp();
        resolve({
          port: actualPort,
          localUrl: `http://127.0.0.1:${actualPort}`,
          lanUrl: `http://${lanIp}:${actualPort}`,
        });
      });
    });
  }

  function close() {
    for (const c of clients) {
      try { c.end(); } catch {}
    }
    clients.clear();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return {
    server,
    listen,
    close,
    broadcastUpdate,
  };
}

module.exports = {
  createCalendarWebServer,
  detectLanIp,
};

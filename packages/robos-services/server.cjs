'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { managed } = require('./lib/catalog.cjs');
const { root, readJSON, writeJSON, token } = require('./lib/store.cjs');

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) fail(400, `${label} must be 1–500 characters`);
  return value.trim();
}
function authorized(req, secret) {
  const actual = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) fail(413, 'Request exceeds 1 MiB'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { fail(400, 'Invalid JSON'); }
}
function createService(id, { dir = root(), secret = token(dir), ports = {}, logger } = {}) {
  const service = managed.find(s => s.id === id);
  if (!service) throw new Error('Unknown service');
  const file = path.join(dir, 'data', `${id}.json`);
  let state = readJSON(file, id === 'grocery-lists' ? { lists: [] } : id === 'home-services' ? { devices: [], scenes: [], automations: [] } : id === 'games' ? { library: [], saves: [], sessions: [] } : { courses: [], progress: [] });
  const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    try {
      // Authenticate health too: it is also the app's authenticated connection check.
      if (!authorized(req, secret)) return send(res, 401, { error: 'A RobOS Services access token is required' });
      const url = new URL(req.url, 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { id, status: 'ok', uptime: process.uptime() });
      if (id === 'gateway') {
        if (req.method === 'GET' && url.pathname === '/services') return send(res, 200, { services: managed.filter(s => s.id !== 'gateway').map(s => ({ id: s.id, name: s.name, path: `/${s.id}` })) });
        const target = managed.find(s => s.id !== 'gateway' && s.id === parts[0]);
        if (!target) return send(res, 404, { error: 'Unknown service' });
        // Fixed loopback destinations; callers cannot supply a proxy URL or port.
        const upstream = http.request({ hostname: '127.0.0.1', port: ports[target.id] || target.port, path: '/' + parts.slice(1).map(encodeURIComponent).join('/') + url.search, method: req.method, timeout: 5000, headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' } }, response => { res.writeHead(response.statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.pipe(res); });
        upstream.on('timeout', () => upstream.destroy(new Error('Service timed out')));
        upstream.on('error', () => { if (!res.headersSent) send(res, 503, { error: `${target.name} is stopped or unavailable. Start it in RobOS Services.` }); else res.destroy(); });
        req.pipe(upstream); return;
      }
      if (req.method === 'GET' && parts.length === 0) return send(res, 200, state);
      const collection = parts[0];
      const allowed = id === 'grocery-lists' ? ['lists'] : id === 'home-services' ? ['devices', 'scenes', 'automations'] : id === 'games' ? ['library', 'saves', 'sessions'] : ['courses', 'progress'];
      if (!allowed.includes(collection)) fail(404, 'Unknown resource');
      // Copy before mutation: failed validation or writes leave in-memory state intact.
      const payload = req.method === 'GET' ? null : await body(req);
      const next = structuredClone(state);
      let rows = next[collection];
      if (id === 'grocery-lists' && parts[2] === 'items') {
        const list = rows.find(r => r.id === parts[1]);
        if (!list) fail(404, 'List not found');
        rows = list.items;
      } else if (parts.length > 2) fail(404, 'Unknown resource');
      const itemId = parts[2] === 'items' ? parts[3] : parts[1];
      if (parts.length > (parts[2] === 'items' ? 4 : 2)) fail(404, 'Unknown resource');
      const index = rows.findIndex(r => r.id === itemId);
      if (req.method === 'GET') { if (itemId && index < 0) fail(404, 'Resource not found'); return send(res, 200, itemId ? rows[index] : rows); }
      let result;
      if (req.method === 'POST' && !itemId) {
        result = { id: crypto.randomUUID(), name: text(payload.name, 'Name'), updatedAt: new Date().toISOString() };
        if (id === 'grocery-lists') { if (parts[2] === 'items') { result.checked = false; result.quantity = typeof payload.quantity === 'string' ? payload.quantity.slice(0, 80) : ''; } else result.items = []; }
        else { if (payload.data !== undefined) result.data = payload.data; if (collection === 'progress') result.learner = text(payload.learner, 'Learner'); }
        rows.push(result);
      } else if (['PATCH', 'DELETE'].includes(req.method) && itemId) {
        if (index < 0) fail(404, 'Resource not found');
        if (req.method === 'DELETE') result = rows.splice(index, 1)[0];
        else {
          result = rows[index];
          if (payload.name !== undefined) result.name = text(payload.name, 'Name');
          if (payload.checked !== undefined && parts[2] === 'items') { if (typeof payload.checked !== 'boolean') fail(400, 'checked must be boolean'); result.checked = payload.checked; }
          if (payload.quantity !== undefined && parts[2] === 'items') result.quantity = text(payload.quantity, 'Quantity');
          if (payload.data !== undefined && id !== 'grocery-lists') result.data = payload.data;
          result.updatedAt = new Date().toISOString();
        }
      } else fail(405, 'Use GET, POST, PATCH or DELETE on a resource');
      writeJSON(file, next); state = next;
      send(res, req.method === 'POST' ? 201 : 200, result);
    } catch (e) { if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Service storage error; check the service log' }); logger?.error({ err: e.message }, 'Request failed'); }
    finally { logger?.info({ service: id, method: req.method, status: res.statusCode, elapsed: Date.now() - started }, 'request'); }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  return server;
}
if (require.main === module) {
  const id = process.argv[2];
  const service = managed.find(s => s.id === id);
  if (!service) throw new Error('Specify a managed service id');
  const logger = require('pino')({ name: `robos-${id}` });
  const server = createService(id, { logger });
  server.on('error', e => { logger.error({ err: e.message }, 'Listener failed'); process.exitCode = 1; });
  server.listen(service.port, '127.0.0.1', () => logger.info({ port: service.port }, 'Service ready'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
module.exports = { createService, authorized };

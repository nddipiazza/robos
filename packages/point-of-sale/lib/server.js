'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PosError } = require('./errors');
const { PROFILES, loadSample } = require('./samples');
const { renderReceipt, receiptJsonLd } = require('./receipt');
const openapi = require('./openapi');

const ROOT = path.join(__dirname, '..', 'renderer');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const COLLECTIONS = ['categories', 'items', 'modifierGroups', 'taxes', 'promotions', 'priceRules', 'inventory'];
const VERSION = require('../package.json').version;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

// `lan: true` is for shops that deliberately serve tablets over the network; otherwise only loopback host names are
// accepted, which also defeats DNS-rebinding pages that point a public name at 127.0.0.1.
function createServer(pos, { lan = false } = {}) {
  const idem = new Map();
  const routes = [];
  const on = (method, pattern, auth, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, auth, handler });
  };
  const need = (staff, perm, body) => pos.authorize(staff, perm, { managerPin: body && body.managerPin });

  // ---- public ----
  on('GET', '/api/health', 'none', () => ({ ok: true, version: VERSION }));
  on('GET', '/api/openapi.json', 'none', () => openapi(VERSION));
  on('GET', '/api/setup', 'none', () => ({ needsSetup: pos.state.staff.length === 0, profiles: Object.entries(PROFILES).map(([id, p]) => ({ id, title: p.title, summary: p.summary })) }));
  on('POST', '/api/setup/:profile', 'none', ({ params }) => {
    if (pos.state.staff.length) throw new PosError('already_setup', 'This shop is already set up. Sign in as an admin to load a sample.', 409);
    return loadSample(pos, params.profile);
  });
  on('POST', '/api/auth/login', 'none', ({ body }) => pos.login(String(body.pin || '')));
  on('POST', '/api/auth/logout', 'staff', ({ token }) => { pos.logout(token); return { ok: true }; });
  on('GET', '/api/public/ready-board', 'none', () => ({ ready: pos.readyBoard(), business: pos.settings.business.name }));

  // ---- kiosk (customer facing) ----
  on('GET', '/api/kiosk/menu', 'none', () => pos.kioskMenu());
  on('POST', '/api/kiosk/orders', 'none', ({ body }) => ({ status: 201, body: pos.kioskCreateOrder(body) }));
  on('GET', '/api/kiosk/orders/:id', 'none', ({ params }) => { const o = pos.getOrder(params.id); if (o.channel !== 'kiosk') throw new PosError('not_found', 'Unknown order', 404); return o; });
  on('POST', '/api/kiosk/orders/:id/pay', 'none', async ({ params, body }) => pos.kioskPay(params.id, body));

  // ---- open checkout API ----
  const idempotent = async (req, run) => {
    const k = req.headers['idempotency-key'];
    if (!k) return run();
    const id = crypto.createHash('sha256').update(`${req.method} ${req.url} ${k}`).digest('hex');
    if (idem.has(id)) return idem.get(id);
    const result = await run();
    idem.set(id, result);
    if (idem.size > 500) idem.delete(idem.keys().next().value);
    return result;
  };
  on('POST', '/api/v1/checkout_sessions', 'key', ({ req, body }) => idempotent(req, () => ({ status: 201, body: pos.createCheckoutSession(body) })));
  on('GET', '/api/v1/checkout_sessions/:id', 'key', ({ params }) => pos.getCheckoutSession(params.id));
  on('POST', '/api/v1/checkout_sessions/:id', 'key', ({ params, body }) => pos.updateCheckoutSession(params.id, body));
  on('POST', '/api/v1/checkout_sessions/:id/complete', 'key', ({ req, params, body }) => idempotent(req, () => pos.completeCheckoutSession(params.id, body)));
  on('POST', '/api/v1/checkout_sessions/:id/cancel', 'key', ({ params }) => pos.cancelCheckoutSession(params.id));

  // ---- staff ----
  on('GET', '/api/me', 'staff', ({ staff }) => pos.publicStaff(staff));
  on('GET', '/api/catalog', 'staff', () => ({
    settings: pos.getSettings(), ...Object.fromEntries(COLLECTIONS.map(c => [c, pos.list(c)])),
    providers: ['manual', 'mock', ...Object.keys(pos.providers)], drawer: pos.currentDrawer() && pos.drawerSummary(pos.currentDrawer()),
  }));
  on('GET', '/api/settings', 'staff', () => pos.getSettings());
  on('PUT', '/api/settings/:section', 'staff', ({ staff, params, body }) => {
    need(staff, params.section === 'cash' ? 'cash.admin' : 'settings');
    return pos.updateSettings(params.section, body, staff);
  });
  for (const c of COLLECTIONS) {
    on('POST', `/api/${c}`, 'staff', ({ staff, body }) => { need(staff, c === 'inventory' ? 'inventory.receive' : 'catalog'); return { status: 201, body: pos.upsert(c, body, staff) }; });
    on('PUT', `/api/${c}/:id`, 'staff', ({ staff, params, body }) => { need(staff, c === 'inventory' ? 'inventory.receive' : 'catalog'); return pos.upsert(c, { ...body, id: params.id }, staff); });
    on('DELETE', `/api/${c}/:id`, 'staff', ({ staff, params }) => { need(staff, 'catalog'); pos.remove(c, params.id, staff); return { ok: true }; });
  }
  on('POST', '/api/inventory/:id/receive', 'staff', ({ staff, params, body }) => { need(staff, 'inventory.receive'); return pos.receiveStock(params.id, body, staff); });
  on('POST', '/api/inventory/:id/adjust', 'staff', ({ staff, params, body }) => { need(staff, 'inventory.adjust', body); return pos.adjustStock(params.id, body, staff); });
  on('POST', '/api/inventory-import', 'staff', ({ staff, body }) => { need(staff, 'inventory.receive'); return pos.importInventoryCsv(body.csv, staff); });
  on('GET', '/api/inventory-low', 'staff', () => pos.lowStock());
  on('GET', '/api/inventory-export.csv', 'staff', ({ staff }) => { need(staff, 'reports'); return { type: 'text/csv', raw: pos.inventoryCsv() }; });

  on('GET', '/api/staff', 'staff', ({ staff }) => { need(staff, 'staff'); return pos.listStaff(); });
  on('POST', '/api/staff', 'staff', ({ staff, body }) => { need(staff, 'staff'); return { status: 201, body: pos.addStaff(body, staff) }; });
  on('POST', '/api/staff/:id/active', 'staff', ({ staff, params, body }) => { need(staff, 'staff'); return pos.setStaffActive(params.id, body.active, staff); });
  on('GET', '/api/apikeys', 'staff', ({ staff }) => { need(staff, 'apikeys'); return pos.listApiKeys(); });
  on('POST', '/api/apikeys', 'staff', ({ staff, body }) => { need(staff, 'apikeys'); return { status: 201, body: pos.createApiKey(body.label, staff) }; });
  on('POST', '/api/apikeys/:id/revoke', 'staff', ({ staff, params }) => { need(staff, 'apikeys'); pos.revokeApiKey(params.id, staff); return { ok: true }; });
  on('POST', '/api/samples/:profile', 'staff', ({ staff, params }) => { need(staff, 'seed'); return loadSample(pos, params.profile); });

  // orders
  on('GET', '/api/orders', 'staff', ({ query }) => pos.listOrders(query));
  on('GET', '/api/open-orders', 'staff', () => pos.openOrders());
  on('POST', '/api/orders', 'staff', ({ staff, body }) => ({ status: 201, body: pos.createOrder(body, staff) }));
  on('GET', '/api/orders/by-number/:n', 'staff', ({ params }) => pos.findByNumber(params.n));
  on('GET', '/api/orders/:id', 'staff', ({ params }) => pos.getOrder(params.id));
  on('POST', '/api/orders/:id/lines', 'staff', ({ staff, params, body }) => { need(staff, 'sell'); return pos.addLine(params.id, body, staff); });
  on('POST', '/api/orders/:id/custom', 'staff', ({ staff, params, body }) => { need(staff, 'sell'); return pos.addCustomLine(params.id, body, staff); });
  on('POST', '/api/orders/:id/scan', 'staff', ({ staff, params, body }) => { need(staff, 'sell'); return pos.scan(params.id, body.code, staff); });
  on('POST', '/api/orders/:id/lines/:lid/qty', 'staff', ({ staff, params, body }) => pos.setLineQty(params.id, params.lid, body.qty, staff));
  on('POST', '/api/orders/:id/lines/:lid/remove', 'staff', ({ staff, params, body }) => pos.removeLine(params.id, params.lid, body, staff));
  on('POST', '/api/orders/:id/lines/:lid/comp', 'staff', ({ staff, params, body }) => pos.compLine(params.id, params.lid, body, staff));
  on('POST', '/api/orders/:id/discounts', 'staff', ({ staff, params, body }) => pos.applyDiscount(params.id, body, staff));
  on('DELETE', '/api/orders/:id/discounts/:did', 'staff', ({ staff, params }) => pos.removeDiscount(params.id, params.did, staff));
  on('POST', '/api/orders/:id/tip', 'staff', ({ staff, params, body }) => pos.setTip(params.id, body, staff));
  on('POST', '/api/orders/:id/age', 'staff', ({ staff, params }) => pos.verifyAge(params.id, staff));
  on('POST', '/api/orders/:id/send', 'staff', ({ staff, params }) => pos.sendOrder(params.id, staff));
  on('POST', '/api/orders/:id/split', 'staff', ({ params, body }) => ({ amounts: pos.splitPreview(params.id, body) }));
  on('POST', '/api/orders/:id/pay', 'staff', ({ staff, params, body }) => pos.pay(params.id, body, staff));
  on('POST', '/api/orders/:id/refund', 'staff', ({ staff, params, body }) => pos.refund(params.id, body, staff));
  on('POST', '/api/orders/:id/void', 'staff', ({ staff, params, body }) => pos.voidOrder(params.id, body, staff));
  on('POST', '/api/orders/:id/prep', 'staff', ({ staff, params, body }) => { need(staff, 'prep'); return pos.setPrepStatus(params.id, body, staff); });
  on('GET', '/api/orders/:id/receipt', 'staff', ({ params }) => ({ type: 'text/plain; charset=utf-8', raw: renderReceipt(pos.getOrder(params.id), pos.settings) }));
  on('GET', '/api/orders/:id/receipt.jsonld', 'staff', ({ params }) => ({ type: 'application/ld+json', raw: JSON.stringify(receiptJsonLd(pos.getOrder(params.id), pos.settings), null, 2) }));
  on('GET', '/api/queue', 'staff', ({ query }) => pos.queue(query));

  // cash drawer
  on('GET', '/api/drawer', 'staff', () => { const d = pos.currentDrawer(); return d ? pos.drawerSummary(d) : null; });
  on('POST', '/api/drawer/open', 'staff', ({ staff, body }) => ({ status: 201, body: pos.openDrawer(body, staff) }));
  on('POST', '/api/drawer/movement', 'staff', ({ staff, body }) => pos.cashMovement(body, staff));
  on('POST', '/api/drawer/close', 'staff', ({ staff, body }) => pos.closeDrawer(body, staff));
  on('GET', '/api/drawers', 'staff', ({ staff }) => { need(staff, 'reports'); return pos.listDrawers(); });
  on('GET', '/api/drawers/:id/z', 'staff', ({ staff, params }) => { need(staff, 'reports'); return pos.zReport(params.id); });

  // reports
  on('GET', '/api/reports/sales', 'staff', ({ staff, query }) => { need(staff, 'reports'); return pos.salesReport(query); });
  on('GET', '/api/reports/orders.csv', 'staff', ({ staff }) => { need(staff, 'reports'); return { type: 'text/csv', raw: pos.ordersCsv() }; });

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) throw new PosError('too_large', 'Request body is too large', 413);
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new PosError('invalid_json', 'Body must be valid JSON'); }
  }

  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    if (rel === '/kiosk') rel = '/kiosk.html';
    if (rel === '/ready') rel = '/ready.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:", 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const hostName = (req.headers.host || '').replace(/:\d+$/, '');
    if (!lan && !LOOPBACK.has(hostName)) { res.writeHead(421); return res.end('Misdirected request'); }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
    const send = (status, payload, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(payload)); };
    try {
      const route = routes.find(r => r.method === req.method && r.re.test(url.pathname));
      if (!route) throw new PosError('not_found', 'No such endpoint', 404);
      const match = route.re.exec(url.pathname);
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
      const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      let staff = null;
      if (route.auth === 'staff') staff = pos.staffFromToken(bearer);
      if (route.auth === 'key') pos.verifyApiKey(bearer);
      // Requiring JSON blocks cross-site HTML form posts: browsers cannot send this type without a CORS preflight, which we never grant.
      if (['POST', 'PUT', 'DELETE'].includes(req.method) && !/^application\/json\b/i.test(req.headers['content-type'] || '')) throw new PosError('unsupported_media_type', 'Send application/json', 415);
      const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      const result = await route.handler({ req, params, query: Object.fromEntries(url.searchParams), body, staff, token: bearer });
      if (result && result.raw !== undefined) { res.writeHead(200, { 'Content-Type': result.type }); return res.end(result.raw); }
      if (result && result.status && result.body !== undefined) return send(result.status, result.body);
      send(200, result === undefined ? { ok: true } : result);
    } catch (e) {
      if (e instanceof PosError) return send(e.status, { error: { code: e.code, message: e.message } });
      console.error(e);
      send(500, { error: { code: 'internal', message: 'Something went wrong' } });
    }
  });
}

function listen(server, { port = 0, host = '127.0.0.1' } = {}) {
  return new Promise(resolve => server.listen(port, host, () => resolve(server.address().port)));
}

module.exports = { createServer, listen };

'use strict';
const { PointOfSale } = require('../lib/pos');
const { createServer, listen } = require('../lib/server');
const { loadSample } = require('../lib/samples');

// Boots a real HTTP server over a sample business. `clock.date` can be moved to test time-based pricing.
async function boot(profile, { date = new Date(2026, 9, 14, 10, 0) } = {}) {
  const clock = { date };
  const pos = new PointOfSale({ now: () => clock.date });
  loadSample(pos, profile);
  const server = createServer(pos);
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  const login = async pin => (await call('POST', '/api/auth/login', { pin })).data.token;
  const tokens = { admin: await login('1111'), manager: await login('2222'), cashier: await login('3333') };
  const api = {
    base, pos, clock, call, tokens,
    get: (path, who = 'cashier') => call('GET', path, undefined, tokens[who]),
    post: (path, body = {}, who = 'cashier') => call('POST', path, body, tokens[who]),
    put: (path, body = {}, who = 'admin') => call('PUT', path, body, tokens[who]),
    // Throws with the server message so a failing step is obvious.
    ok: async (promise) => { const r = await promise; if (r.status >= 300) throw new Error(`${r.status} ${JSON.stringify(r.data)}`); return r.data; },
    close: () => new Promise(r => server.close(r)),
    item: name => pos.state.items.find(i => i.name === name),
    inv: name => pos.state.inventory.find(i => i.name === name),
    opt: (group, name) => pos.state.modifierGroups.find(g => g.name === group).options.find(o => o.name === name).id,
    async openDrawer(float = 20000, who = 'cashier') { return api.ok(api.post('/api/drawer/open', { float }, who)); },
    async newOrder(body = {}, who = 'cashier') { return api.ok(api.post('/api/orders', body, who)); },
    async add(orderId, input, who = 'cashier') { return api.ok(api.post(`/api/orders/${orderId}/lines`, input, who)); },
    async pay(orderId, input, who = 'cashier') { return api.ok(api.post(`/api/orders/${orderId}/pay`, input, who)); },
  };
  return api;
}

module.exports = { boot };

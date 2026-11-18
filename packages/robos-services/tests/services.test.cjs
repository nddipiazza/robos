'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createService } = require('../server.cjs');
const { Manager, systemdArg } = require('../lib/manager.cjs');
const { validateHost } = require('../lib/hosts.cjs');
const { token } = require('../lib/store.cjs');
async function fixture(t, id = 'grocery-lists', options = {}) {
  const dir = options.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'robos-services-test-'));
  const secret = token(dir), server = createService(id, { dir, secret, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (!options.dir) fs.rmSync(dir, { recursive: true, force: true }); });
  const request = (route, method = 'GET', data) => fetch(base + route, { method, headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { dir, secret, server, base, request };
}
test('every route including health requires authentication, browser origins get no CORS grant', async t => {
  const { base } = await fixture(t);
  for (const route of ['/', '/health', '/lists']) {
    const response = await fetch(base + route, { headers: { origin: 'https://example.com' } });
    assert.equal(response.status, 401); assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});
test('grocery list items survive restarts, support edits and deletion', async t => {
  const f = await fixture(t);
  const list = await (await f.request('/lists', 'POST', { name: 'Weekly shop' })).json();
  const item = await (await f.request(`/lists/${list.id}/items`, 'POST', { name: 'Milk', quantity: '2' })).json();
  assert.equal((await f.request(`/lists/${list.id}/items/${item.id}`, 'PATCH', { checked: true })).status, 200);
  const restarted = await fixture(t, 'grocery-lists', { dir: f.dir });
  const items = await (await restarted.request(`/lists/${list.id}/items`)).json();
  assert.equal(items[0].checked, true); assert.equal(items[0].quantity, '2');
  assert.equal((await f.request(`/lists/${list.id}/items/${item.id}`, 'DELETE')).status, 200);
  assert.deepEqual(await (await f.request(`/lists/${list.id}/items`)).json(), []);
});
test('concurrent mutations and invalid input cannot lose or corrupt stored state', async t => {
  const f = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => f.request('/lists', 'POST', { name: `List ${i}` })));
  assert(responses.every(r => r.status === 201));
  assert.equal((await (await f.request('/lists')).json()).length, 12);
  assert.equal((await f.request('/lists', 'POST', { name: '' })).status, 400);
  assert.equal((await f.request('/lists/missing', 'DELETE')).status, 404);
  assert.equal((await f.request('/lists', 'POST', { name: 'Huge', data: 'x'.repeat(1024 * 1024) })).status, 413);
  assert.equal((await (await f.request('/lists')).json()).length, 12);
});
test('home, games and eLearning expose durable distinct collections', async t => {
  for (const [id, route, data] of [['home-services', '/devices', { name: 'Kitchen', data: { driver: 'unconfigured' } }], ['games', '/saves', { name: 'Campaign', data: { level: 3 } }], ['elearning', '/progress', { name: 'Course', learner: 'alice', data: { completed: ['intro'] } }]]) {
    const f = await fixture(t, id);
    assert.equal((await f.request(route, 'POST', data)).status, 201);
    assert.equal((await (await f.request(route)).json())[0].name, data.name);
    assert(fs.existsSync(path.join(f.dir, 'data', `${id}.json`)));
  }
});
test('gateway forwards only fixed service routes and reports stopped services', async t => {
  const grocery = await fixture(t);
  const gateway = await fixture(t, 'gateway', { dir: grocery.dir, secret: grocery.secret, ports: { 'grocery-lists': grocery.server.address().port } });
  assert.equal((await gateway.request('/grocery-lists/lists', 'POST', { name: 'Shared' })).status, 201);
  assert.equal((await (await grocery.request('/lists')).json())[0].name, 'Shared');
  assert.equal((await gateway.request('/http://example.com')).status, 404);
  assert.equal((await gateway.request('/games/health')).status, 503);
});
test('SSH host and unit parameters reject command injection', async () => {
  const valid = { id: 'home', address: '192.168.1.25', user: 'ndipiazza', port: 22 };
  assert.equal(validateHost(valid).port, 22);
  for (const changes of [{ address: '-oProxyCommand=bad' }, { user: 'me;touch /tmp/no' }, { port: 70000 }, { id: 'local' }]) assert.throws(() => validateHost({ ...valid, ...changes }));
  const manager = new Manager({ platform: 'linux', run: async () => ({ stdout: '' }) });
  await assert.rejects(manager.action({ unit: 'ssh.service', action: 'stop' }), /not registered/);
  await assert.rejects(manager.action({ unit: 'robos-foo.service; touch nope', action: 'stop' }), /not registered/);
  assert.equal(systemdArg('/tmp/100%/$folder'), '"/tmp/100%%/$$folder"');
});
test('discovery distinguishes system and user units and surfaces failed discovery', async () => {
  const run = async (bin, args) => {
    if (args.includes('list-unit-files')) return { stdout: 'robos-worker.service enabled enabled\nssh.service enabled enabled' };
    return { stdout: 'Description=Worker\nActiveState=active\nSubState=running\nUnitFileState=enabled\nMainPID=123' };
  };
  const snapshot = await new Manager({ platform: 'linux', run }).list();
  const installed = snapshot.services.filter(s => s.unit === 'robos-worker.service');
  assert.equal(installed.length, 2); assert.deepEqual(installed.map(s => s.scope), ['user', 'system']);
  assert(!snapshot.services.some(s => s.unit === 'ssh.service'));
  const failure = await new Manager({ platform: 'linux', run: async () => { throw new Error('No session bus'); } }).list();
  assert.equal(failure.errors.length, 2); assert(failure.errors[0].includes('No session bus'));
});
test('desktop runtime tracking records assigned endpoints and removes closed listeners', async t => {
  const http = require('node:http');
  const tracker = require('../../robos-lib/service-registry.cjs');
  const server = http.createServer();
  const appId = `robos-services-proof-${process.pid}`;
  tracker.trackServer(server, { appId });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const dir = path.join(os.homedir(), '.config/robos/services/runtime');
  const matches = () => fs.readdirSync(dir).filter(f => f.startsWith(`${process.pid}-`)).map(f => ({ file: f, data: JSON.parse(fs.readFileSync(path.join(dir, f))) })).filter(r => r.data.appId === appId);
  assert.equal(matches().length, 1); assert.equal(matches()[0].data.endpoint.port, server.address().port);
  await new Promise(resolve => server.close(resolve));
  assert.equal(matches().length, 0);
});
test('bundled tracker matches the shared library and app release discovery finds Services', () => {
  assert.equal(fs.readFileSync(path.resolve(__dirname, '../runtime-tracker.cjs'), 'utf8'), fs.readFileSync(path.resolve(__dirname, '../../robos-lib/service-registry.cjs'), 'utf8'));
  const { sourceCatalog } = require('../../../scripts/app-manager/publish-catalog.cjs');
  assert.equal(sourceCatalog().find(s => s.id === 'robos-services').group, 'System & security');
});
test('existing Linux RobOS listeners are detected without restarting their owning app', () => {
  const { listenerRecords } = require('../lib/manager.cjs');
  const output = 'LISTEN 0 511 0.0.0.0:4123 0.0.0.0:* users:(("node",pid=123,fd=12))\nLISTEN 0 511 127.0.0.1:5444 0.0.0.0:* users:(("node",pid=124,fd=12))\nLISTEN 0 511 127.0.0.1:19400 0.0.0.0:* users:(("node",pid=125,fd=12))';
  const records = listenerRecords(output, pid => pid === 124 ? 'node\0/home/other/server.js\0' : 'node\0/home/me/source/robos/packages/audio-player/main.js\0', new Set(['managed:125']));
  assert.equal(records.length, 1); assert.equal(records[0].appId, 'audio-player'); assert.equal(records[0].endpoint, '0.0.0.0:4123'); assert.equal(records[0].control, false);
});

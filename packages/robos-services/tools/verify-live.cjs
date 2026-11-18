'use strict';
// Explicit, reversible integration proof. Uses a uniquely named list and removes it.
const assert = require('node:assert/strict');
const { Hosts, run } = require('../lib/hosts.cjs');
const hosts = new Hosts(), id = process.argv[2];
if (!id || id === 'local') throw new Error('Supply a configured SSH host id');
const host = hosts.get(id), results = [];
async function request(route, method = 'GET', data, authenticated = true) {
  const script = `const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const token=fs.readFileSync(path.join(os.homedir(),'.config/robos/services/access-token'),'utf8').trim();fetch('http://127.0.0.1:19400'+${JSON.stringify(route)},{method:${JSON.stringify(method)},headers:${authenticated ? "{authorization:'Bearer '+token,'content-type':'application/json'}" : '{}'},${data === undefined ? '' : `body:JSON.stringify(${JSON.stringify(data)}),`}}).then(async r=>console.log(JSON.stringify({status:r.status,data:await r.json()}))).catch(e=>{console.error(e.message);process.exitCode=1});`;
  return JSON.parse(await run('ssh', [...hosts.sshArgs(host), 'export PATH="$HOME/.local/share/robos/node/bin:$PATH"; node -'], script));
}
const unit = 'robos-services-grocery-lists.service';
const action = action => hosts.call(id, { command: 'action', unit, scope: 'user', action });
(async () => {
  assert.equal((await request('/health', 'GET', undefined, false)).status, 401); results.push('Unauthenticated access rejected');
  for (const route of ['grocery-lists', 'home-services', 'games', 'elearning']) assert.equal((await request(`/${route}/health`)).status, 200);
  results.push('Gateway authenticates and routes to every enabled service');
  let list;
  try {
    await action('stop'); assert.equal((await request('/grocery-lists/health')).status, 503); results.push('Stopping a service produces a clear gateway unavailable response');
    await action('start');
    const created = await request('/grocery-lists/lists', 'POST', { name: `RobOS verification ${Date.now()}` }); assert.equal(created.status, 201); list = created.data;
    const item = await request(`/grocery-lists/lists/${list.id}/items`, 'POST', { name: 'Verification item', quantity: '2' }); assert.equal(item.status, 201);
    await request(`/grocery-lists/lists/${list.id}/items/${item.data.id}`, 'PATCH', { checked: true });
    await action('restart');
    const persisted = await request(`/grocery-lists/lists/${list.id}/items`); assert.equal(persisted.data[0].checked, true); results.push('Grocery list and checked item survive a real service restart');
    await action('disable');
    let snapshot = await hosts.call(id, { command: 'list' }); assert.equal(snapshot.services.find(s => s.id === 'grocery-lists').startup, 'disabled');
    await action('enable');
    snapshot = await hosts.call(id, { command: 'list' }); assert(snapshot.services.filter(s => s.kind === 'managed').every(s => s.status === 'active' && s.startup === 'enabled'));
    results.push('Startup can be disabled and enabled independently; all managed services left active and enabled');
    const logs = await hosts.call(id, { command: 'action', unit, scope: 'user', action: 'logs' }); assert(logs.logs.includes('Service ready')); results.push('Systemd service logs are readable');
  } finally {
    await action('enable'); await action('start');
    if (list) assert.equal((await request(`/grocery-lists/lists/${list.id}`, 'DELETE')).status, 200);
  }
  console.log(JSON.stringify({ host: host.address, results, cleanup: 'Verification list removed; services active and enabled' }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });

'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { AutoCenter } = require('../../../auto-center/lib/service');
function shop() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-parts-')), s = new AutoCenter({ root: path.join(dir, 'c'), privateRoot: path.join(dir, 'p') }); s.setMode('shop');
  const W = (a, i) => s.workshop(a, i), O = (op, i = {}) => W('orders', { op, ...i }), opened = [];
  s.ui = { openWindow: (url, o) => opened.push({ url, ...o }) };
  return { s, W, O, opened };
}
async function register(origin) {
  const call = async (method, p, body, token) => { const r = await fetch(origin + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const data = await r.json(); if (r.status >= 300) throw new Error(`${r.status} ${JSON.stringify(data)}`); return data; };
  return { call, login: async pin => (await call('POST', '/api/auth/login', { pin })).token };
}
test('the parts counter is RobOS Point of Sale, served locally with its data in the shop’s plugin folder', async () => {
  const { s, W, opened } = shop();
  assert.throws(() => W('partsCounter'), /Turn on "We do auto parts sales"/);
  W('setService', { plugin: 'parts-sales', enabled: true });
  assert.equal(W('partsCounter').setUp, false);
  const plain = new AutoCenter({ root: s.root, privateRoot: s.privateRoot }); plain.setMode('shop');
  await assert.rejects(plain.workshop('openPartsCounter', {}), /opens in its own window/);
  await W('openPartsCounter', { screen: 'register' });
  const { url, origin } = opened[0]; assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/); assert.equal(url, origin + '/');
  const { call } = await register(origin);
  assert.equal((await call('GET', '/api/setup')).needsSetup, true);
  assert.ok((await call('GET', '/api/setup')).profiles.some(p => p.id === 'auto-parts'));
  await W('openPartsCounter', { screen: 'kiosk' }); assert.equal(opened[1].url, origin + '/kiosk');
});
test('the counter sells from the shop’s stock: one shelf count for the counter, repairs and purchase orders', async () => {
  const { s, W, O, opened } = shop();
  W('setService', { plugin: 'parts-sales', enabled: true });
  const napa = O('addSupplier', { name: 'NAPA Auto Parts' });
  const pads = O('addItem', { name: 'Front brake pads', sku: 'BP-100', onHand: '2', reorderPoint: '1', reorderQty: '4', unitCost: '30.00' });
  await W('openPartsCounter', {}); const { call, login } = await register(opened[0].origin);
  await call('POST', '/api/setup/auto-parts', {});
  // The sample's brake pads have the shop's SKU, so the register sells the shop's pads instead of adding its own.
  const stock = () => O('board').items, padsNow = () => stock().find(i => i.sku === 'BP-100');
  assert.equal(stock().filter(i => i.sku === 'BP-100').length, 1); assert.equal(padsNow().onHand, 2);
  assert.ok(stock().some(i => i.sku === 'OIL-5W30-5Q' && i.onHand === 12), 'the other counter parts join Orders → Stock');
  const t = W('partsCounter'); assert.equal(t.setUp, true); assert.ok(t.items > 10);
  // Sell one set of pads at the register.
  const token = await login('3333'), item = (await call('GET', '/api/catalog', undefined, token)).items.find(i => i.sku === 'BP-100');
  await call('POST', '/api/drawer/open', { float: 10000 }, token);
  const order = await call('POST', '/api/orders', { type: 'retail' }, token);
  await call('POST', `/api/orders/${order.id}/lines`, { itemId: item.id, qty: 1 }, token);
  await call('POST', `/api/orders/${order.id}/pay`, { method: 'cash', tendered: 10000 }, token);
  assert.equal(padsNow().onHand, 1);
  const sale = O('movements', { item: pads.id })[0]; assert.equal(sale.kind, 'issue'); assert.equal(sale.referenceLabel, `Counter sale #${order.number}`); assert.equal(sale.by, 'Cleo (Cashier)');
  // The counter sale is part of the shop's private history, and Orders sees the low stock it caused.
  assert.match(require('node:child_process').execFileSync('git', ['log', '--format=%s'], { cwd: path.join(s.privateRoot, 'shop'), encoding: 'utf8' }), new RegExp(`point of sale: sale #${order.number}`));
  assert.equal(O('board').suggestions[0].sku, 'BP-100');
  // A repair takes the last set, so the register can no longer sell one.
  const c = W('registerCustomer', { name: 'Sam Rivera', phone: '555-010-0100' }), v = W('addCustomerVehicle', { customer: c['@id'], year: '2015', make: 'Toyota', model: 'Camry' });
  const { job } = W('intakeRepair', { vehicle: v['@id'], channel: 'phone call', category: 'brakes', answers: {} });
  O('issueToJob', { item: pads.id, job: job['@id'], qty: '1' }); assert.equal(padsNow().onHand, 0);
  const next = await call('POST', '/api/orders', { type: 'retail' }, token);
  await assert.rejects(call('POST', `/api/orders/${next.id}/lines`, { itemId: item.id }, token), /Not enough Front brake pads in stock \(0 left\)/);
  // A purchase order refills the same shelf, and the register can sell again.
  O('createOrder', { supplier: napa.id, lines: [{ item: pads.id, qty: 4 }] }); const po = O('board').orders[0];
  O('placeOrder', { order: po.id, via: 'phone' }); O('receive', { order: po.id, lines: [{ line: po.lines[0].id, qty: '4' }] });
  await call('POST', `/api/orders/${next.id}/lines`, { itemId: item.id }, token);
  assert.equal(padsNow().onHand, 4);
  assert.ok(s.reports({}).pluginCards.some(c => c.label === 'Parts counter sales today' && /1 sale/.test(c.note)));
});

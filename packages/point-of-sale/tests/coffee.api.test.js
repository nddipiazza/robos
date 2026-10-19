'use strict';
// Sample business 2: Bean There Coffee (food service, drinks and food, touchscreen counter + self-checkout).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

async function latte(shop, orderId, { size = 'Small', milk = 'Whole', extras = [], qty = 1 } = {}) {
  return shop.add(orderId, { itemId: shop.item('Latte').id, qty, modifiers: [shop.opt('Size', size), shop.opt('Milk', milk), ...extras.map(e => shop.opt('Extras', e))] });
}

test('modifiers: required choices are enforced and priced; options from other items are refused', async () => {
  const shop = await boot('coffee');
  try {
    const order = await shop.newOrder({ type: 'takeout' });
    const none = await shop.post(`/api/orders/${order.id}/lines`, { itemId: shop.item('Latte').id });
    assert.equal(none.data.error.code, 'modifier_required');
    assert.equal(none.data.error.message, 'Choose Size');
    const noMilk = await shop.post(`/api/orders/${order.id}/lines`, { itemId: shop.item('Latte').id, modifiers: [shop.opt('Size', 'Small')] });
    assert.equal(noMilk.data.error.message, 'Choose Milk');
    const twoSizes = await shop.post(`/api/orders/${order.id}/lines`, { itemId: shop.item('Latte').id, modifiers: [shop.opt('Size', 'Small'), shop.opt('Size', 'Large'), shop.opt('Milk', 'Whole')] });
    assert.equal(twoSizes.data.error.code, 'modifier_limit');
    const four = await shop.post(`/api/orders/${order.id}/lines`, { itemId: shop.item('Latte').id, modifiers: [shop.opt('Size', 'Small'), shop.opt('Milk', 'Whole'), shop.opt('Extras', 'Extra shot'), shop.opt('Extras', 'Vanilla syrup'), shop.opt('Extras', 'Caramel drizzle'), shop.opt('Extras', 'Extra shot')] });
    assert.equal(four.data.error.code, 'modifier_limit');
    const wrong = await shop.post(`/api/orders/${order.id}/lines`, { itemId: shop.item('Espresso').id, modifiers: [shop.opt('Milk', 'Oat')] });
    assert.equal(wrong.data.error.code, 'invalid_modifier');
    const ok = await latte(shop, order.id, { size: 'Medium', milk: 'Oat', extras: ['Extra shot'] });
    assert.equal(ok.lines[0].modifiers.length, 3);
    assert.equal(ok.totals.subtotal, 450 + 50 + 60 + 75);
    assert.equal(ok.totals.tax, Math.round(635 * 0.085));
  } finally { await shop.close(); }
});

test('the same drink with the same choices stacks; different choices stay separate lines', async () => {
  const shop = await boot('coffee');
  try {
    const order = await shop.newOrder({ type: 'dine_in' });
    await latte(shop, order.id);
    const stacked = await latte(shop, order.id);
    assert.equal(stacked.lines.length, 1);
    assert.equal(stacked.lines[0].qty, 2);
    const split = await latte(shop, order.id, { milk: 'Almond' });
    assert.equal(split.lines.length, 2);
    const changed = await shop.ok(shop.post(`/api/orders/${order.id}/lines/${split.lines[0].id}/qty`, { qty: 3 }));
    assert.equal(changed.lines[0].qty, 3);
    assert.equal((await shop.post(`/api/orders/${order.id}/lines/${split.lines[0].id}/qty`, { qty: 0 })).data.error.code, 'invalid_quantity');
  } finally { await shop.close(); }
});

test('order types: dine-in and take-out are allowed, anything else is not', async () => {
  const shop = await boot('coffee');
  try {
    assert.equal((await shop.newOrder({ type: 'dine_in' })).type, 'dine_in');
    assert.equal((await shop.newOrder({ type: 'takeout', customerName: 'Priya' })).customerName, 'Priya');
    assert.equal((await shop.post('/api/orders', { type: 'drive_thru' })).data.error.code, 'invalid_order_type');
    assert.equal((await shop.call('POST', '/api/orders', { type: 'takeout' })).status, 401);
  } finally { await shop.close(); }
});

test('recipes: a latte uses cups, espresso beans and the chosen milk; extra shots use more beans', async () => {
  const shop = await boot('coffee');
  try {
    await shop.openDrawer(10000);
    const order = await shop.newOrder({ type: 'takeout' });
    await latte(shop, order.id, { milk: 'Oat', extras: ['Extra shot'], qty: 2 });
    await shop.pay(order.id, { method: 'cash', tendered: 5000 });
    assert.equal(shop.inv('Cups').onHand, 398);
    assert.equal(shop.inv('Espresso beans').onHand, 5000 - 2 * 36);
    assert.equal(shop.inv('Oat milk').onHand, 8000 - 400);
    assert.equal(shop.inv('Whole milk').onHand, 20000);
  } finally { await shop.close(); }
});

test('running out of an ingredient blocks only the drinks that need it', async () => {
  const shop = await boot('coffee');
  try {
    const oat = shop.inv('Oat milk');
    await shop.ok(shop.post(`/api/inventory/${oat.id}/adjust`, { counted: 150, reason: 'Spilled carton' }, 'manager'));
    const order = await shop.newOrder({ type: 'takeout' });
    const blocked = await shop.post(`/api/orders/${order.id}/lines`, { itemId: shop.item('Latte').id, modifiers: [shop.opt('Size', 'Small'), shop.opt('Milk', 'Oat')] });
    assert.equal(blocked.data.error.code, 'out_of_stock');
    assert.match(blocked.data.error.message, /Oat milk/);
    await latte(shop, order.id, { milk: 'Whole' });
    assert.ok(shop.pos.lowStock().some(i => i.name === 'Oat milk'));
  } finally { await shop.close(); }
});

test('prep queue: paid drinks go to the barista screen, food to the kitchen, and the ready board shows the number', async () => {
  const shop = await boot('coffee');
  try {
    await shop.openDrawer(5000);
    const order = await shop.newOrder({ type: 'dine_in', customerName: 'Alex' });
    await latte(shop, order.id);
    await shop.add(order.id, { itemId: shop.item('Butter Croissant').id });
    assert.deepEqual((await shop.get('/api/queue')).data, []); // pay first: nothing is made before payment
    await shop.pay(order.id, { method: 'cash', tendered: 2000 });
    const barista = (await shop.get('/api/queue?station=barista')).data;
    const kitchen = (await shop.get('/api/queue?station=kitchen')).data;
    assert.equal(barista.length, 1);
    assert.equal(barista[0].lines[0].name, 'Latte');
    assert.equal(kitchen[0].lines[0].name, 'Butter Croissant');
    assert.equal(barista[0].number, order.number);
    const [drink] = barista[0].lines;
    await shop.ok(shop.post(`/api/orders/${order.id}/prep`, { lineIds: [drink.id], status: 'preparing' }));
    await shop.ok(shop.post(`/api/orders/${order.id}/prep`, { lineIds: [drink.id], status: 'ready' }));
    assert.deepEqual((await shop.call('GET', '/api/public/ready-board')).data.ready, []); // croissant still pending
    const pastry = kitchen[0].lines[0];
    await shop.ok(shop.post(`/api/orders/${order.id}/prep`, { lineIds: [pastry.id], status: 'ready' }));
    assert.deepEqual((await shop.call('GET', '/api/public/ready-board')).data.ready, [order.number]);
    await shop.ok(shop.post(`/api/orders/${order.id}/prep`, { status: 'served' }));
    assert.deepEqual((await shop.get('/api/queue')).data, []);
    assert.deepEqual((await shop.call('GET', '/api/public/ready-board')).data.ready, []);
    assert.equal((await shop.post(`/api/orders/${order.id}/prep`, { status: 'preparing' })).data.error.code, 'invalid_transition');
  } finally { await shop.close(); }
});

test('tips: percent presets and fixed amounts flow into the total, card payment and reports', async () => {
  const shop = await boot('coffee');
  try {
    const order = await shop.newOrder({ type: 'takeout' });
    await latte(shop, order.id, { size: 'Large' }); // 5.50
    const tipped = await shop.ok(shop.post(`/api/orders/${order.id}/tip`, { percent: 20 }));
    assert.equal(tipped.totals.tip, 110);
    assert.equal(tipped.totals.total, 550 + 47 + 110); // tax 46.75 -> 47
    assert.equal((await shop.post(`/api/orders/${order.id}/tip`, { percent: 150 })).data.error.code, 'invalid_tip');
    const fixed = await shop.ok(shop.post(`/api/orders/${order.id}/tip`, { amount: 100 }));
    assert.equal(fixed.totals.tip, 100);
    await shop.pay(order.id, { method: 'card', token: 'tok_visa' });
    const report = (await shop.get('/api/reports/sales', 'manager')).data;
    assert.equal(report.tips, 100);
    assert.equal(report.collected, 550 + 47 + 100);
  } finally { await shop.close(); }
});

test('cash with nickel rounding: the total rounds, change is exact, and a Z-report balances', async () => {
  const shop = await boot('coffee');
  try {
    await shop.ok(shop.put('/api/settings/cash', { rounding: 5 }, 'manager'));
    await shop.openDrawer(10000);
    const order = await shop.newOrder({ type: 'takeout' });
    await shop.add(order.id, { itemId: shop.item('Blueberry Muffin').id }); // 3.50 + 0.30 (29.75) = 3.80
    const result = await shop.pay(order.id, { method: 'cash', tendered: 500 });
    assert.equal(result.order.totals.total, 380);
    assert.equal(result.change, 120);
    const second = await shop.newOrder({ type: 'takeout' });
    await shop.add(second.id, { itemId: shop.item('Banana Bread Slice').id }); // 3.00 + 0.26 = 3.26 -> 3.25
    const r2 = await shop.pay(second.id, { method: 'cash', tendered: 400 });
    assert.equal(r2.order.totals.total, 325);
    assert.equal(r2.order.totals.rounding, -1);
    assert.equal(r2.change, 75);
    const drawer = (await shop.get('/api/drawer')).data;
    assert.equal(drawer.expected, 10000 + 380 + 325);
    const z = await shop.ok(shop.post('/api/drawer/close', { counted: 10705 }));
    assert.equal(z.drawer.variance, 0);
    assert.equal(z.sales.rounding, -1);
  } finally { await shop.close(); }
});

test('worker corrections: unsent items vanish, sent items need a manager and a reason, whole orders can be voided', async () => {
  const shop = await boot('coffee');
  try {
    const order = await shop.newOrder({ type: 'takeout' });
    const a = await latte(shop, order.id);
    await shop.add(order.id, { itemId: shop.item('Blueberry Muffin').id });
    const removed = await shop.ok(shop.post(`/api/orders/${order.id}/lines/${a.lines[0].id}/remove`, {}));
    assert.equal(removed.lines.length, 1);
    await shop.ok(shop.post(`/api/orders/${order.id}/send`));
    const muffin = (await shop.get(`/api/orders/${order.id}`)).data.lines[0];
    assert.equal((await shop.post(`/api/orders/${order.id}/lines/${muffin.id}/remove`, { reason: 'Dropped' })).data.error.code, 'manager_required');
    assert.equal((await shop.post(`/api/orders/${order.id}/lines/${muffin.id}/remove`, { managerPin: '2222' })).data.error.code, 'reason_required');
    const voided = await shop.ok(shop.post(`/api/orders/${order.id}/lines/${muffin.id}/remove`, { reason: 'Dropped', managerPin: '2222' }));
    assert.equal(voided.totals.total, 0);
    assert.equal(voided.lines[0].removed, true);
    assert.equal((await shop.get('/api/queue')).data.length, 0);
    const other = await shop.newOrder({ type: 'dine_in' });
    await latte(shop, other.id);
    assert.equal((await shop.post(`/api/orders/${other.id}/void`, {})).data.error.code, 'reason_required');
    const v = await shop.ok(shop.post(`/api/orders/${other.id}/void`, { reason: 'Customer left' }));
    assert.equal(v.status, 'void');
    assert.equal((await shop.post(`/api/orders/${other.id}/lines`, { itemId: shop.item('Espresso').id })).data.error.code, 'order_closed');
    assert.equal((await shop.post(`/api/orders/${order.id}/pay`, { method: 'card', token: 'tok_visa' })).data.error.code, 'empty_order');
  } finally { await shop.close(); }
});

test('two taps on Pay cannot charge twice', async () => {
  const shop = await boot('coffee');
  try {
    const order = await shop.newOrder({ type: 'takeout' });
    await shop.add(order.id, { itemId: shop.item('Butter Croissant').id });
    const staff = shop.pos.state.staff.find(s => s.role === 'cashier');
    const results = await Promise.allSettled([
      shop.pos.pay(order.id, { method: 'card', token: 'tok_a' }, staff),
      shop.pos.pay(order.id, { method: 'card', token: 'tok_b' }, staff),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'busy');
    assert.equal(shop.pos.getOrder(order.id).payments.length, 1);
    assert.equal(shop.inv('Butter Croissant').onHand, 11);
  } finally { await shop.close(); }
});

test('menu input: manager-level admin adds categories, modifier groups and items; edits prices; hides items', async () => {
  const shop = await boot('coffee');
  try {
    assert.equal((await shop.post('/api/categories', { name: 'Seasonal' }, 'cashier')).status, 403);
    assert.equal((await shop.post('/api/categories', { name: 'Seasonal' }, 'manager')).status, 403); // catalog is an admin task
    const cat = await shop.ok(shop.post('/api/categories', { name: 'Seasonal', color: '#ef4444' }, 'admin'));
    const syrup = await shop.ok(shop.post('/api/modifierGroups', { name: 'Spice', max: 2, multiple: true, options: [{ name: 'Cinnamon', price: 25 }, { name: 'Nutmeg', price: 25 }] }, 'admin'));
    assert.equal((await shop.post('/api/modifierGroups', { name: 'Empty', options: [] }, 'admin')).data.error.code, 'invalid_modifier');
    const tax = shop.pos.state.taxes[0];
    const pumpkin = await shop.ok(shop.post('/api/items', { name: 'Pumpkin Latte', categoryId: cat.id, price: 575, taxId: tax.id, station: 'barista', modifierGroupIds: [syrup.id], emoji: '🎃' }, 'admin'));
    const order = await shop.newOrder({ type: 'takeout' });
    const line = await shop.add(order.id, { itemId: pumpkin.id, modifiers: [syrup.options[0].id] });
    assert.equal(line.totals.subtotal, 600);
    await shop.ok(shop.put(`/api/items/${pumpkin.id}`, { price: 625 }, 'admin'));
    const second = await shop.newOrder({ type: 'takeout' });
    assert.equal((await shop.add(second.id, { itemId: pumpkin.id })).totals.subtotal, 625);
    assert.equal(line.totals.subtotal, 600); // earlier ticket keeps the price it was rung at
    assert.equal((await shop.post('/api/items', { name: 'Bad', price: 12.5 }, 'admin')).data.error.code, 'invalid_amount');
    assert.equal((await shop.post('/api/taxes', { name: 'Huge', rateBp: 9000 }, 'admin')).data.error.code, 'invalid_tax');
    await shop.ok(shop.call('DELETE', `/api/items/${pumpkin.id}`, undefined, shop.tokens.admin));
    assert.ok(!(await shop.get('/api/catalog')).data.items.some(i => i.id === pumpkin.id));
    assert.equal((await shop.post(`/api/orders/${second.id}/lines`, { itemId: pumpkin.id })).status, 404);
  } finally { await shop.close(); }
});

test('team: add workers with PINs, PINs are unique, wrong PINs lock the screen briefly, deactivating signs them out', async () => {
  const shop = await boot('coffee');
  try {
    assert.equal((await shop.post('/api/staff', { name: 'Eve', role: 'cashier', pin: '4444' }, 'cashier')).status, 403);
    const eve = await shop.ok(shop.post('/api/staff', { name: 'Eve', role: 'cashier', pin: '4444' }, 'admin'));
    assert.equal(eve.role, 'cashier');
    assert.equal(JSON.stringify(eve).includes('pinHash'), false);
    assert.equal((await shop.post('/api/staff', { name: 'Dup', pin: '4444' }, 'admin')).data.error.code, 'duplicate_pin');
    assert.equal((await shop.post('/api/staff', { name: 'Short', pin: '12' }, 'admin')).data.error.code, 'invalid_pin');
    const token = (await shop.call('POST', '/api/auth/login', { pin: '4444' })).data.token;
    assert.equal((await shop.call('GET', '/api/me', undefined, token)).data.name, 'Eve');
    await shop.ok(shop.post(`/api/staff/${eve.id}/active`, { active: false }, 'admin'));
    assert.equal((await shop.call('GET', '/api/me', undefined, token)).status, 401);
    assert.equal((await shop.call('POST', '/api/auth/login', { pin: '4444' })).status, 401);
    const adminId = shop.pos.state.staff.find(s => s.role === 'admin').id;
    assert.equal((await shop.post(`/api/staff/${adminId}/active`, { active: false }, 'admin')).data.error.code, 'last_admin');
    for (let i = 0; i < 5; i++) await shop.call('POST', '/api/auth/login', { pin: '0000' });
    const locked = await shop.call('POST', '/api/auth/login', { pin: '3333' });
    assert.equal(locked.status, 429);
    shop.clock.date = new Date(shop.clock.date.getTime() + 61000);
    assert.equal((await shop.call('POST', '/api/auth/login', { pin: '3333' })).status, 200);
  } finally { await shop.close(); }
});

test('self-checkout at the coffee shop: order, tip, pay by card, appears on the barista screen', async () => {
  const shop = await boot('coffee');
  try {
    const menu = (await shop.call('GET', '/api/kiosk/menu')).data;
    assert.deepEqual(menu.categories.map(c => c.name), ['Espresso', 'Brewed & Cold', 'Bakery', 'Sandwiches']);
    assert.deepEqual(menu.tips.presets, [15, 18, 20]);
    const latteItem = menu.items.find(i => i.name === 'Latte');
    assert.ok(menu.modifierGroups.some(g => latteItem.modifierGroupIds.includes(g.id) && g.name === 'Milk'));
    const created = await shop.call('POST', '/api/kiosk/orders', { type: 'dine_in', customerName: 'Sky', lines: [{ itemId: latteItem.id, modifiers: [shop.opt('Size', 'Large'), shop.opt('Milk', 'Oat')] }, { itemId: shop.item('Blueberry Muffin').id }] });
    assert.equal(created.status, 201);
    const missing = await shop.call('POST', '/api/kiosk/orders', { lines: [{ itemId: latteItem.id }] });
    assert.equal(missing.data.error.code, 'modifier_required');
    assert.equal((await shop.call('POST', '/api/kiosk/orders', { lines: [] })).data.error.code, 'empty_order');
    const paid = await shop.call('POST', `/api/kiosk/orders/${created.data.id}/pay`, { method: 'card', token: 'tok_kiosk', tip: 100 });
    assert.equal(paid.data.order.status, 'paid');
    assert.equal(paid.data.order.totals.tip, 100);
    const queue = (await shop.get('/api/queue')).data;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].customerName, 'Sky');
    assert.deepEqual(queue[0].lines.map(l => l.station).sort(), ['barista', 'kitchen']);
    // The kiosk cannot pay cash by itself and cannot touch a register order.
    const reg = await shop.newOrder({ type: 'takeout' });
    assert.equal((await shop.call('POST', `/api/kiosk/orders/${reg.id}/pay`, { method: 'card', token: 'tok_x' })).status, 403);
  } finally { await shop.close(); }
});

test('self-checkout can be switched off or restricted by the owner; sold-out items are flagged', async () => {
  const shop = await boot('coffee');
  try {
    const croissant = shop.item('Butter Croissant');
    await shop.ok(shop.post(`/api/inventory/${croissant.inventoryId}/adjust`, { counted: 0, reason: 'Sold out' }, 'manager'));
    const menu = (await shop.call('GET', '/api/kiosk/menu')).data;
    assert.equal(menu.items.find(i => i.name === 'Butter Croissant').soldOut, true);
    assert.equal(menu.items.find(i => i.name === 'Latte').soldOut, false);
    const refused = await shop.call('POST', '/api/kiosk/orders', { lines: [{ itemId: croissant.id }] });
    assert.equal(refused.data.error.code, 'out_of_stock');
    await shop.ok(shop.put('/api/settings/kiosk', { allowPayAtCounter: false }, 'admin'));
    const o = await shop.call('POST', '/api/kiosk/orders', { lines: [{ itemId: shop.item('Espresso').id }] });
    assert.equal((await shop.call('POST', `/api/kiosk/orders/${o.data.id}/pay`, { method: 'counter' })).data.error.code, 'counter_disabled');
    await shop.ok(shop.put('/api/settings/kiosk', { enabled: false }, 'admin'));
    assert.equal((await shop.call('GET', '/api/kiosk/menu')).status, 403);
    assert.equal((await shop.put('/api/settings/kiosk', { enabled: true }, 'manager')).status, 403);
  } finally { await shop.close(); }
});

test('first-run setup: an empty shop offers samples once; afterwards only an admin may replace data', async () => {
  const { PointOfSale } = require('../lib/pos');
  const { createServer, listen } = require('../lib/server');
  const server = createServer(new PointOfSale());
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const json = { 'Content-Type': 'application/json' };
  try {
    const setup = await (await fetch(`${base}/api/setup`)).json();
    assert.equal(setup.needsSetup, true);
    assert.deepEqual(setup.profiles.map(p => p.id), ['retail', 'coffee', 'bar']);
    assert.equal((await fetch(`${base}/api/setup/restaurant`, { method: 'POST', headers: json })).status, 404);
    assert.equal((await fetch(`${base}/api/setup/coffee`, { method: 'POST', headers: json })).status, 200);
    assert.equal((await fetch(`${base}/api/setup/bar`, { method: 'POST', headers: json })).status, 409);
    assert.equal((await (await fetch(`${base}/api/setup`)).json()).needsSetup, false);
  } finally { server.close(); }
});

test('data survives a restart (written atomically to disk)', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { PointOfSale } = require('../lib/pos');
  const { loadSample } = require('../lib/samples');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-'));
  const a = new PointOfSale({ dir });
  loadSample(a, 'coffee');
  const staff = a.state.staff[2];
  a.openDrawer({ float: 5000 }, staff);
  const order = a.createOrder({ type: 'takeout' }, staff);
  a.addLine(order.id, { itemId: a.state.items.find(i => i.name === 'Espresso').id }, staff);
  await a.pay(order.id, { method: 'cash', tendered: 1000 }, staff);
  const b = new PointOfSale({ dir });
  assert.equal(b.getOrder(order.id).status, 'paid');
  assert.equal(b.login('3333').staff.name, 'Cleo (Cashier)');
  assert.equal(b.currentDrawer().float, 5000);
  assert.equal(fs.statSync(path.join(dir, 'store.json')).mode & 0o077, 0); // not readable by other users
});

test('local server hardening: JSON only (no cross-site form posts), loopback host names only, safe headers', async () => {
  const shop = await boot('coffee');
  try {
    const form = await fetch(`${shop.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'pin=3333' });
    assert.equal(form.status, 415);
    const plain = await fetch(`${shop.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"pin":"3333"}' });
    assert.equal(plain.status, 415);
    // A page on another name that resolves to 127.0.0.1 (DNS rebinding) is refused.
    const http = require('node:http');
    const status = await new Promise(resolve => http.get({ host: '127.0.0.1', port: new URL(shop.base).port, path: '/api/health', headers: { Host: 'evil.example.com' } }, r => { r.resume(); resolve(r.statusCode); }));
    assert.equal(status, 421);
    const ok = await fetch(`${shop.base}/api/health`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(ok.headers.get('x-frame-options'), 'DENY');
    // Static files cannot escape the renderer folder.
    const traversal = await fetch(`${shop.base}/..%2f..%2fpackage.json`);
    assert.equal(traversal.status, 404);
    // Staff routes without a token, and with a junk token, are refused.
    assert.equal((await shop.call('GET', '/api/catalog')).status, 401);
    assert.equal((await shop.call('GET', '/api/catalog', undefined, 'junk')).status, 401);
  } finally { await shop.close(); }
});

test('abandoned self-checkout baskets are voided after half an hour and never clutter the staff tab list', async () => {
  const shop = await boot('coffee');
  try {
    const first = await shop.call('POST', '/api/kiosk/orders', { lines: [{ itemId: shop.item('Espresso').id }] });
    assert.equal(first.status, 201);
    assert.equal((await shop.get('/api/open-orders')).data.length, 0);
    shop.clock.date = new Date(shop.clock.date.getTime() + 31 * 60 * 1000);
    await shop.call('POST', '/api/kiosk/orders', { lines: [{ itemId: shop.item('Espresso').id }] });
    assert.equal(shop.pos.getOrder(first.data.id).status, 'void');
  } finally { await shop.close(); }
});

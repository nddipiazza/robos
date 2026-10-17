'use strict';
// Sample business 1: Threadwell Clothing (retail). Every flow below is a day-in-the-life use case.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

const variantOf = (shop, itemName, size) => { const item = shop.item(itemName); return { itemId: item.id, variantId: item.variants.find(v => v.name === size).id, item }; };
const stockOf = (shop, itemName, size) => shop.pos.state.inventory.find(i => i.id === variantOf(shop, itemName, size).item.variants.find(v => v.name === size).inventoryId).onHand;

test('cashier opens the drawer, scans barcodes and takes a cash sale with change', async () => {
  const shop = await boot('clothing');
  try {
    await shop.openDrawer(20000);
    const order = await shop.newOrder({ type: 'retail' });
    const tee = variantOf(shop, 'Classic Tee White', 'M');
    const beanie = shop.item('Wool Beanie');
    await shop.ok(shop.post(`/api/orders/${order.id}/scan`, { code: tee.item.variants.find(v => v.name === 'M').barcode }));
    const scanned = await shop.ok(shop.post(`/api/orders/${order.id}/scan`, { code: beanie.barcode }));
    assert.equal(scanned.totals.subtotal, 2400 + 2200);
    assert.equal(scanned.totals.tax, Math.round(4600 * 0.0825)); // 8.25% sales tax, exact cents
    assert.equal(scanned.totals.total, 4600 + 380);
    const paid = await shop.pay(order.id, { method: 'cash', tendered: 5000 });
    assert.equal(paid.change, 20);
    assert.equal(paid.order.status, 'paid');
    assert.equal(stockOf(shop, 'Classic Tee White', 'M'), 9);
    assert.equal(shop.inv('Wool Beanie').onHand, 14);
    const receipt = (await shop.get(`/api/orders/${order.id}/receipt`)).data;
    assert.match(receipt, /Threadwell Clothing/);
    assert.match(receipt, /TOTAL\s+\$49\.80/);
    assert.match(receipt, /Change\s+\$0\.20/);
  } finally { await shop.close(); }
});

test('scanning the same barcode twice stacks quantity; unknown barcodes are reported', async () => {
  const shop = await boot('clothing');
  try {
    const order = await shop.newOrder({ type: 'retail' });
    const code = shop.item('Canvas Tote').barcode;
    await shop.ok(shop.post(`/api/orders/${order.id}/scan`, { code }));
    const twice = await shop.ok(shop.post(`/api/orders/${order.id}/scan`, { code }));
    assert.equal(twice.lines.length, 1);
    assert.equal(twice.lines[0].qty, 2);
    const miss = await shop.post(`/api/orders/${order.id}/scan`, { code: '000000000000' });
    assert.equal(miss.status, 404);
    assert.equal(miss.data.error.code, 'unknown_code');
  } finally { await shop.close(); }
});

test('a size must be chosen for clothing with variants', async () => {
  const shop = await boot('clothing');
  try {
    const order = await shop.newOrder({ type: 'retail' });
    const r = await shop.post(`/api/orders/${order.id}/lines`, { itemId: shop.item('Slim Jeans').id });
    assert.equal(r.status, 400);
    assert.equal(r.data.error.code, 'variant_required');
  } finally { await shop.close(); }
});

test('card sale: a declined card leaves the order open and stock untouched, then a good card succeeds', async () => {
  const shop = await boot('clothing');
  try {
    const order = await shop.newOrder({ type: 'retail' });
    const jeans = variantOf(shop, 'Slim Jeans', '32');
    await shop.add(order.id, { itemId: jeans.itemId, variantId: jeans.variantId });
    const declined = await shop.post(`/api/orders/${order.id}/pay`, { method: 'card', token: 'tok_decline' });
    assert.equal(declined.status, 402);
    assert.equal(declined.data.error.code, 'card_declined');
    assert.equal((await shop.get(`/api/orders/${order.id}`)).data.status, 'open');
    assert.equal(stockOf(shop, 'Slim Jeans', '32'), 5);
    const ok = await shop.pay(order.id, { method: 'card', token: 'tok_visa' });
    assert.equal(ok.order.status, 'paid');
    assert.match(ok.payment.reference, /^mock_/);
    assert.equal(stockOf(shop, 'Slim Jeans', '32'), 4);
    const again = await shop.post(`/api/orders/${order.id}/pay`, { method: 'card', token: 'tok_visa' });
    assert.equal(again.status, 409); // cannot double-charge a paid order
  } finally { await shop.close(); }
});

test('promo codes: percent code, minimum spend for a fixed code, no stacking the same code', async () => {
  const shop = await boot('clothing');
  try {
    const order = await shop.newOrder({ type: 'retail' });
    const tee = variantOf(shop, 'Classic Tee Black', 'L');
    await shop.add(order.id, { itemId: tee.itemId, variantId: tee.variantId });
    const small = await shop.post(`/api/orders/${order.id}/discounts`, { code: 'welcome5' });
    assert.equal(small.data.error.code, 'minimum_not_met');
    const ten = await shop.ok(shop.post(`/api/orders/${order.id}/discounts`, { code: 'save10' }));
    assert.equal(ten.totals.discount, 240);
    assert.equal((await shop.post(`/api/orders/${order.id}/discounts`, { code: 'SAVE10' })).data.error.code, 'duplicate_discount');
    await shop.add(order.id, { itemId: shop.item('Leather Belt').id, qty: 1 });
    const both = await shop.ok(shop.post(`/api/orders/${order.id}/discounts`, { code: 'WELCOME5' }));
    assert.equal(both.totals.discount, Math.round((2400 + 3800) * 0.1) + 500);
    assert.equal((await shop.post(`/api/orders/${order.id}/discounts`, { code: 'NOPE' })).data.error.code, 'invalid_code');
  } finally { await shop.close(); }
});

test('manual discounts above the cashier limit need a manager PIN, and a reason', async () => {
  const shop = await boot('clothing');
  try {
    const order = await shop.newOrder({ type: 'retail' });
    await shop.add(order.id, { itemId: shop.item('Canvas Tote').id });
    const small = await shop.ok(shop.post(`/api/orders/${order.id}/discounts`, { type: 'percent', value: 10, reason: 'Loyal customer' }));
    assert.equal(small.totals.discount, 180);
    const denied = await shop.post(`/api/orders/${order.id}/discounts`, { type: 'percent', value: 40, reason: 'Damaged' });
    assert.equal(denied.status, 403);
    assert.equal(denied.data.error.code, 'manager_required');
    const wrong = await shop.post(`/api/orders/${order.id}/discounts`, { type: 'percent', value: 40, reason: 'Damaged', managerPin: '3333' });
    assert.equal(wrong.data.error.code, 'bad_override'); // a cashier PIN is not a manager PIN
    const noReason = await shop.post(`/api/orders/${order.id}/discounts`, { type: 'percent', value: 40, managerPin: '2222' });
    assert.equal(noReason.data.error.code, 'reason_required');
    const approved = await shop.ok(shop.post(`/api/orders/${order.id}/discounts`, { type: 'percent', value: 40, reason: 'Damaged', managerPin: '2222' }));
    assert.equal(approved.totals.discount, 180 + 720);
    assert.ok(shop.pos.state.audit.some(a => a.action === 'override'));
  } finally { await shop.close(); }
});

test('stock control: cannot oversell, receiving stock lets the sale go through', async () => {
  const shop = await boot('clothing');
  try {
    const order = await shop.newOrder({ type: 'retail' });
    const socks = shop.item('Wool Socks (pair)');
    await shop.add(order.id, { itemId: socks.id, qty: 2 });
    const over = await shop.post(`/api/orders/${order.id}/lines`, { itemId: socks.id, qty: 1 });
    assert.equal(over.status, 409);
    assert.equal(over.data.error.code, 'out_of_stock');
    assert.equal((await shop.get(`/api/orders/${order.id}`)).data.lines[0].qty, 2); // failed add leaves the ticket unchanged
    const rec = await shop.ok(shop.post(`/api/inventory/${socks.inventoryId}/receive`, { qty: 10, cost: 450 }, 'manager'));
    assert.equal(rec.onHand, 12);
    await shop.add(order.id, { itemId: socks.id, qty: 1 });
    assert.equal((await shop.get(`/api/orders/${order.id}`)).data.lines[0].qty, 3);
    assert.equal(shop.pos.lowStock().some(i => i.name === 'Wool Socks (pair)'), false);
  } finally { await shop.close(); }
});

test('returns: cashier needs a manager, partial refund restocks and reduces the drawer; cannot over-refund', async () => {
  const shop = await boot('clothing');
  try {
    await shop.openDrawer(10000);
    const order = await shop.newOrder({ type: 'retail' });
    const tee = variantOf(shop, 'Classic Tee White', 'S');
    await shop.add(order.id, { itemId: tee.itemId, variantId: tee.variantId, qty: 2 });
    await shop.pay(order.id, { method: 'cash', tendered: 6000 });
    assert.equal(stockOf(shop, 'Classic Tee White', 'S'), 8);
    const lineId = (await shop.get(`/api/orders/${order.id}`)).data.lines[0].id;
    const denied = await shop.post(`/api/orders/${order.id}/refund`, { lines: [{ lineId, qty: 1 }], reason: 'Wrong size' });
    assert.equal(denied.data.error.code, 'manager_required');
    const refunded = await shop.ok(shop.post(`/api/orders/${order.id}/refund`, { lines: [{ lineId, qty: 1 }], reason: 'Wrong size', managerPin: '2222' }));
    assert.equal(refunded.status, 'partially_refunded');
    assert.equal(refunded.refunds[0].amount, Math.round((4800 + 396) / 2));
    assert.equal(refunded.refunds[0].parts[0].method, 'cash');
    assert.equal(stockOf(shop, 'Classic Tee White', 'S'), 9);
    const over = await shop.post(`/api/orders/${order.id}/refund`, { lines: [{ lineId, qty: 2 }], reason: 'Again', managerPin: '2222' });
    assert.equal(over.data.error.code, 'invalid_quantity');
    const drawer = (await shop.get('/api/drawer')).data;
    assert.equal(drawer.cashRefunds, 2598);
    assert.equal(drawer.expected, 10000 + 5196 - 2598);
    const rest = await shop.ok(shop.post(`/api/orders/${order.id}/refund`, { all: true, reason: 'Changed mind' }, 'manager'));
    assert.equal(rest.status, 'refunded');
    assert.equal(rest.refunds.reduce((s, r) => s + r.amount, 0), 5196); // refunded exactly what was paid
  } finally { await shop.close(); }
});

test('exchange: refund the small, sell the large, stock follows', async () => {
  const shop = await boot('clothing');
  try {
    await shop.openDrawer(5000);
    const first = await shop.newOrder({ type: 'retail' });
    const m = variantOf(shop, 'Zip Hoodie', 'M'), l = variantOf(shop, 'Zip Hoodie', 'L');
    await shop.add(first.id, { itemId: m.itemId, variantId: m.variantId });
    await shop.pay(first.id, { method: 'card', token: 'tok_visa' });
    const refund = await shop.ok(shop.post(`/api/orders/${first.id}/refund`, { all: true, reason: 'Exchange for L' }, 'manager'));
    assert.equal(refund.refunds[0].parts[0].method, 'card');
    assert.match(refund.refunds[0].parts[0].reference, /_refund$/);
    const second = await shop.newOrder({ type: 'retail' });
    await shop.add(second.id, { itemId: l.itemId, variantId: l.variantId });
    await shop.pay(second.id, { method: 'cash', tendered: 6000 });
    assert.equal(stockOf(shop, 'Zip Hoodie', 'M'), 6);
    assert.equal(stockOf(shop, 'Zip Hoodie', 'L'), 5);
  } finally { await shop.close(); }
});

test('split tender: part cash, part card', async () => {
  const shop = await boot('clothing');
  try {
    await shop.openDrawer(0);
    const order = await shop.newOrder({ type: 'retail' });
    const jacket = variantOf(shop, 'Rain Jacket', 'M');
    await shop.add(order.id, { itemId: jacket.itemId, variantId: jacket.variantId });
    const total = (await shop.get(`/api/orders/${order.id}`)).data.totals.total;
    assert.equal(total, 12990);
    const first = await shop.pay(order.id, { method: 'cash', amount: 5000, tendered: 5000 });
    assert.equal(first.order.status, 'open');
    assert.equal(first.order.totals.due, 7990);
    const second = await shop.pay(order.id, { method: 'card', token: 'tok_mc' });
    assert.equal(second.order.status, 'paid');
    assert.deepEqual(second.order.payments.map(p => p.method), ['cash', 'card']);
  } finally { await shop.close(); }
});

test('cash rules: must open the drawer first, tender must cover the balance, absurd tenders rejected', async () => {
  const shop = await boot('clothing');
  try {
    const order = await shop.newOrder({ type: 'retail' });
    await shop.add(order.id, { itemId: shop.item('Canvas Tote').id });
    assert.equal((await shop.post(`/api/orders/${order.id}/pay`, { method: 'cash', tendered: 5000 })).data.error.code, 'drawer_closed');
    await shop.openDrawer(0);
    assert.equal((await shop.post('/api/drawer/open', { float: 0 })).data.error.code, 'drawer_open');
    const short = await shop.ok(shop.post(`/api/orders/${order.id}/pay`, { method: 'cash', tendered: 1000 }));
    assert.equal(short.order.status, 'open'); // short tender is a partial payment
    assert.equal(short.order.totals.due, 1949 - 1000);
    assert.equal((await shop.post(`/api/orders/${order.id}/pay`, { method: 'cash', tendered: 5000000 })).data.error.code, 'tender_too_large');
    const done = await shop.pay(order.id, { method: 'cash', tendered: 1000 });
    assert.equal(done.order.status, 'paid');
  } finally { await shop.close(); }
});

test('inventory input: add a product with sizes and opening stock, validate barcodes, reject duplicates', async () => {
  const shop = await boot('clothing');
  try {
    const { withCheckDigit } = require('../lib/gtin');
    const good = withCheckDigit('61200000099');
    const cat = shop.pos.state.categories[0];
    const body = { name: 'Linen Shirt', categoryId: cat.id, price: 6400, variants: [
      { name: 'M', sku: 'LS-M', barcode: good.slice(0, 11) + ((Number(good[11]) + 1) % 10), // wrong check digit
        stock: 4, cost: 2500 },
    ] };
    const bad = await shop.post('/api/items', body, 'admin');
    assert.equal(bad.data.error.code, 'invalid_barcode'); // check digit wrong
    const before = shop.pos.state.inventory.length;
    assert.equal(shop.pos.state.inventory.length, before); // nothing half-created
    body.variants[0].barcode = require('../lib/gtin').withCheckDigit('61200000099');
    const made = await shop.ok(shop.post('/api/items', body, 'admin'));
    assert.equal(shop.pos.state.inventory.length, before + 1);
    assert.equal(shop.pos.state.inventory.find(i => i.id === made.variants[0].inventoryId).onHand, 4);
    const dup = await shop.post('/api/items', { name: 'Other', price: 100, barcode: body.variants[0].barcode }, 'admin');
    assert.equal(dup.data.error.code, 'duplicate_code');
    assert.equal((await shop.post('/api/items', { name: '', price: 100 }, 'admin')).status, 400);
    assert.equal((await shop.post('/api/items', { name: 'X', price: -5 }, 'admin')).data.error.code, 'invalid_amount');
    assert.equal((await shop.post('/api/items', { name: 'Cashier item', price: 100 }, 'cashier')).status, 403);
    // The new product can be scanned at the register straight away.
    const order = await shop.newOrder({ type: 'retail' });
    const scanned = await shop.ok(shop.post(`/api/orders/${order.id}/scan`, { code: body.variants[0].barcode }));
    assert.equal(scanned.lines[0].name, 'Linen Shirt');
  } finally { await shop.close(); }
});

test('inventory input: receive, count-adjust with reason, CSV import, low-stock list, export', async () => {
  const shop = await boot('clothing');
  try {
    const socks = shop.item('Wool Socks (pair)');
    assert.equal((await shop.get('/api/inventory-low')).data.some(i => i.name === 'Wool Socks (pair)'), false);
    await shop.ok(shop.put(`/api/inventory/${socks.inventoryId}`, { reorderPoint: 5 }, 'manager'));
    assert.ok((await shop.get('/api/inventory-low')).data.some(i => i.name === 'Wool Socks (pair)'));
    const noReason = await shop.post(`/api/inventory/${socks.inventoryId}/adjust`, { counted: 1 }, 'manager');
    assert.equal(noReason.data.error.code, 'reason_required');
    const cashierAdjust = await shop.post(`/api/inventory/${socks.inventoryId}/adjust`, { counted: 1, reason: 'recount' }, 'cashier');
    assert.equal(cashierAdjust.status, 403);
    const adj = await shop.ok(shop.post(`/api/inventory/${socks.inventoryId}/adjust`, { counted: 1, reason: 'Damaged in storage' }, 'manager'));
    assert.equal(adj.onHand, 1);
    const csv = 'sku,name,qty,unit,reorder,cost\nGC-100,Gift box,25,each,5,1.50\nTW-SOCKS,Wool Socks (pair),9,,,\n';
    const imported = await shop.ok(shop.post('/api/inventory-import', { csv }, 'manager'));
    assert.deepEqual(imported, { created: 1, received: 1 }); // new SKU created, existing SKU topped up
    assert.equal(shop.inv('Gift box').onHand, 25);
    assert.equal(shop.inv('Wool Socks (pair)').onHand, 10); // 1 counted + 9 imported
    assert.equal(shop.inv('Gift box').cost, 150);
    const exported = (await shop.get('/api/inventory-export.csv', 'manager')).data;
    assert.match(exported, /Gift box/);
    assert.equal((await shop.post('/api/inventory-import', { csv: 'foo\n1' }, 'manager')).data.error.code, 'invalid_csv');
  } finally { await shop.close(); }
});

test('end of day: count the drawer by denomination, small variance ok, large variance needs a manager', async () => {
  const shop = await boot('clothing');
  try {
    await shop.openDrawer(20000);
    const order = await shop.newOrder({ type: 'retail' });
    await shop.add(order.id, { itemId: shop.item('Leather Belt').id });
    await shop.pay(order.id, { method: 'cash', tendered: 5000 }); // 38.00 + 3.14 tax = 41.14
    await shop.ok(shop.post('/api/drawer/movement', { type: 'paid_out', amount: 1500, reason: 'Courier tip' }, 'manager'));
    assert.equal((await shop.post('/api/drawer/movement', { type: 'paid_out', amount: 500, reason: 'x' }, 'cashier')).status, 403);
    const expected = 20000 + 4114 - 1500;
    assert.equal((await shop.get('/api/drawer')).data.expected, expected);
    const big = await shop.post('/api/drawer/close', { counted: expected - 2000 });
    assert.equal(big.data.error.code, 'manager_required');
    const z = await shop.ok(shop.post('/api/drawer/close', { denominations: { 10000: 2, 2000: 0, 500: 0, 100: 0, 25: 0, 10: 1, 5: 0, 1: 4 } , managerPin: '2222' }));
    assert.equal(z.drawer.counted, 20014);
    assert.equal(z.drawer.variance, 20014 - expected);
    assert.equal(z.drawer.status, 'closed');
    assert.equal(z.sales.orders, 1);
    assert.equal((await shop.get('/api/drawer')).data, null);
  } finally { await shop.close(); }
});

test('cash payment administration: manager turns cash off, sets rounding and quick-tender buttons', async () => {
  const shop = await boot('clothing');
  try {
    assert.equal((await shop.put('/api/settings/cash', { enabled: false }, 'cashier')).status, 403);
    assert.equal((await shop.put('/api/settings/cash', { rounding: 3 }, 'manager')).data.error.code, 'invalid_settings');
    assert.equal((await shop.put('/api/settings/cash', { quickTender: [1, 2, 3, 4, 5, 6, 7] }, 'manager')).data.error.code, 'invalid_settings');
    await shop.ok(shop.put('/api/settings/cash', { quickTender: [1000, 2000], rounding: 5, maxTender: 50000, varianceThreshold: 100 }, 'manager'));
    assert.deepEqual(shop.pos.settings.cash.quickTender, [1000, 2000]);
    await shop.openDrawer(0);
    const order = await shop.newOrder({ type: 'retail' });
    await shop.add(order.id, { itemId: shop.item('Wool Socks (pair)').id }); // 14.00 + 1.16 = 15.16 -> 15.15 cash
    const paid = await shop.pay(order.id, { method: 'cash', tendered: 2000 });
    assert.equal(paid.order.totals.rounding, -1);
    assert.equal(paid.order.totals.total, 1515);
    assert.equal(paid.change, 485);
    await shop.ok(shop.put('/api/settings/cash', { enabled: false }, 'manager'));
    const other = await shop.newOrder({ type: 'retail' });
    await shop.add(other.id, { itemId: shop.item('Canvas Tote').id });
    assert.equal((await shop.post(`/api/orders/${other.id}/pay`, { method: 'cash', tendered: 5000 })).data.error.code, 'cash_disabled');
    assert.equal((await shop.post(`/api/orders/${other.id}/pay`, { method: 'card', token: 'tok_visa' })).status, 200);
    await shop.ok(shop.put('/api/settings/cash', { enabled: true, requireOpenDrawer: false }, 'manager'));
  } finally { await shop.close(); }
});

test('self-checkout: customer builds a basket, pays by card; or chooses pay-at-counter and the cashier takes cash', async () => {
  const shop = await boot('clothing');
  try {
    const menu = (await shop.call('GET', '/api/kiosk/menu')).data;
    assert.ok(menu.items.length >= 10);
    const socks = menu.items.find(i => i.name === 'Wool Socks (pair)');
    assert.equal(socks.soldOut, false);
    const tee = variantOf(shop, 'Classic Tee White', 'L');
    const res = await shop.call('POST', '/api/kiosk/orders', { type: 'retail', lines: [{ itemId: tee.itemId, variantId: tee.variantId, qty: 1 }, { itemId: shop.item('Canvas Tote').id, qty: 2 }] });
    assert.equal(res.status, 201);
    assert.equal(res.data.channel, 'kiosk');
    assert.equal(res.data.totals.subtotal, 2400 + 3600);
    const declined = await shop.call('POST', `/api/kiosk/orders/${res.data.id}/pay`, { method: 'card', token: 'tok_decline' });
    assert.equal(declined.status, 402);
    const paid = await shop.call('POST', `/api/kiosk/orders/${res.data.id}/pay`, { method: 'card', token: 'tok_kiosk_demo' });
    assert.equal(paid.data.order.status, 'paid');
    assert.equal(paid.data.order.staffId, null);

    const second = await shop.call('POST', '/api/kiosk/orders', { lines: [{ itemId: shop.item('Wool Beanie').id }] });
    const counter = await shop.call('POST', `/api/kiosk/orders/${second.data.id}/pay`, { method: 'counter' });
    assert.equal(counter.data.payAtCounter, true);
    await shop.openDrawer(0);
    const found = (await shop.get(`/api/orders/by-number/${second.data.number}`)).data;
    assert.equal(found.awaitingPayment, true);
    const done = await shop.pay(found.id, { method: 'cash', tendered: 3000 });
    assert.equal(done.order.status, 'paid');
    assert.equal(done.change, 3000 - 2382);
    // A kiosk cannot reach staff-only data or other channels' orders.
    assert.equal((await shop.call('GET', '/api/orders')).status, 401);
    const regOrder = await shop.newOrder({ type: 'retail' });
    assert.equal((await shop.call('GET', `/api/kiosk/orders/${regOrder.id}`)).status, 404);
  } finally { await shop.close(); }
});

test('open checkout API: key required, create, update, complete (idempotent), decline, cancel', async () => {
  const shop = await boot('clothing');
  try {
    assert.equal((await shop.call('POST', '/api/v1/checkout_sessions', { items: [] })).status, 401);
    assert.equal((await shop.post('/api/apikeys', { label: 'Web shop' }, 'manager')).status, 403);
    const key = (await shop.ok(shop.post('/api/apikeys', { label: 'Web shop' }, 'admin'))).key;
    const api = (m, p, b, h = {}) => fetch(shop.base + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...h }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, data: await r.json() }));
    const tote = shop.item('Canvas Tote');
    const created = await api('POST', '/api/v1/checkout_sessions', { items: [{ id: tote.barcode, quantity: 2 }] });
    assert.equal(created.status, 201);
    assert.equal(created.data.status, 'not_ready_for_payment');
    assert.equal(created.data.currency, 'usd');
    assert.deepEqual(created.data.totals.map(t => t.type), ['items_base_amount', 'subtotal', 'tax', 'total']);
    assert.equal(created.data.totals.find(t => t.type === 'total').amount, 3600 + 297);
    const sid = created.data.id;
    const updated = await api('POST', `/api/v1/checkout_sessions/${sid}`, { fulfillment_option_id: 'retail', items: [{ id: tote.id, quantity: 1 }], buyer: { email: 'sam@example.com' } });
    assert.equal(updated.data.status, 'ready_for_payment');
    assert.equal(updated.data.totals.find(t => t.type === 'total').amount, 1800 + 149);
    assert.equal((await api('GET', `/api/v1/checkout_sessions/${sid}`)).data.id, sid);
    const bad = await api('POST', `/api/v1/checkout_sessions/${sid}/complete`, { payment_data: { token: 'tok_decline' } });
    assert.equal(bad.status, 402);
    const idemKey = { 'Idempotency-Key': 'abc-123' };
    const done = await api('POST', `/api/v1/checkout_sessions/${sid}/complete`, { payment_data: { token: 'tok_visa', provider: 'mock' } }, idemKey);
    assert.equal(done.data.status, 'completed');
    assert.ok(done.data.order.id);
    const replay = await api('POST', `/api/v1/checkout_sessions/${sid}/complete`, { payment_data: { token: 'tok_visa', provider: 'mock' } }, idemKey);
    assert.deepEqual(replay.data, done.data);
    assert.equal(shop.inv('Canvas Tote').onHand, 19); // charged and stocked down exactly once
    assert.equal((await api('POST', `/api/v1/checkout_sessions/${sid}/cancel`)).status, 405);
    const second = await api('POST', '/api/v1/checkout_sessions', { items: [{ id: tote.id, quantity: 1 }], fulfillment_option_id: 'retail' });
    assert.equal(second.data.status, 'ready_for_payment');
    assert.equal((await api('POST', `/api/v1/checkout_sessions/${second.data.id}/cancel`)).data.status, 'canceled');
    assert.equal((await api('POST', '/api/v1/checkout_sessions', { items: [{ id: 'nothing', quantity: 1 }] })).status, 404);
    assert.equal((await api('POST', '/api/v1/checkout_sessions', { items: [{ id: tote.id, quantity: 0 }] })).status, 400);
    const openapi = (await shop.call('GET', '/api/openapi.json')).data;
    assert.ok(openapi.paths['/api/v1/checkout_sessions/{id}/complete']);
  } finally { await shop.close(); }
});

test('receipt is also available as schema.org JSON-LD', async () => {
  const shop = await boot('clothing');
  try {
    await shop.openDrawer(0);
    const order = await shop.newOrder({ type: 'retail' });
    await shop.add(order.id, { itemId: shop.item('Canvas Tote').id });
    await shop.pay(order.id, { method: 'cash', tendered: 2000 });
    const ld = (await shop.get(`/api/orders/${order.id}/receipt.jsonld`)).data;
    assert.equal(ld['@type'], 'Order');
    assert.equal(ld.seller.name, 'Threadwell Clothing');
    assert.equal(ld.totalPaymentDue.price, '19.49');
  } finally { await shop.close(); }
});

test('sales report and CSV export reflect the day', async () => {
  const shop = await boot('clothing');
  try {
    await shop.openDrawer(0);
    for (const code of ['Canvas Tote', 'Wool Beanie']) {
      const order = await shop.newOrder({ type: 'retail' });
      await shop.add(order.id, { itemId: shop.item(code).id });
      await shop.pay(order.id, { method: code === 'Canvas Tote' ? 'cash' : 'card', tendered: 3000, token: 'tok_visa' });
    }
    const report = (await shop.get('/api/reports/sales', 'manager')).data;
    assert.equal(report.orders, 2);
    assert.equal(report.grossSales, 4000);
    assert.equal(report.byCategory[0].key, 'Accessories');
    assert.deepEqual(report.byTender.map(t => t.key).sort(), ['cash', 'card'].sort());
    assert.equal((await shop.get('/api/reports/sales', 'cashier')).status, 403);
    const csv = (await shop.get('/api/reports/orders.csv', 'manager')).data;
    assert.match(csv, /"paid"/);
  } finally { await shop.close(); }
});

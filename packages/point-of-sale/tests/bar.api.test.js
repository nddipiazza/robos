'use strict';
// Sample business 3: The Rusty Anchor (bar): open tabs, rounds, ID checks, happy hour, comps, split checks, tip-out.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

const WED_5PM = new Date(2026, 9, 14, 17, 0);
const WED_7PM = new Date(2026, 9, 14, 19, 0);
const SAT_5PM = new Date(2026, 9, 17, 17, 0);
const ipa = (shop, size = 'Pint') => ({ itemId: shop.item('Hazy IPA').id, modifiers: [shop.opt('Size', size)] });
const oldFashioned = (shop, pour = 'Single') => ({ itemId: shop.item('Old Fashioned').id, modifiers: [shop.pos.state.modifierGroups.find(g => g.name === 'Pour' && g.options.some(o => o.recipe.some(r => r.inventoryId === shop.inv('Bourbon').id))).options.find(o => o.name === pour).id] });

test('open a tab, order rounds, send each round to the bar, then close the tab with a card and tip', async () => {
  const shop = await boot('bar');
  try {
    const tab = await shop.newOrder({ type: 'tab', tabName: 'Dana' });
    await shop.add(tab.id, ipa(shop));
    await shop.add(tab.id, { itemId: shop.item('Pretzel Bites').id });
    const sent = await shop.ok(shop.post(`/api/orders/${tab.id}/send`));
    assert.equal(sent.sent, 2);
    assert.equal((await shop.get('/api/queue?station=bar')).data[0].lines[0].name, 'Hazy IPA');
    assert.equal((await shop.get('/api/queue?station=kitchen')).data[0].lines[0].name, 'Pretzel Bites');
    // Second round: only the new drink is sent.
    await shop.add(tab.id, ipa(shop));
    await shop.add(tab.id, { itemId: shop.item('Wings (6)').id });
    const again = await shop.ok(shop.post(`/api/orders/${tab.id}/send`));
    assert.equal(again.sent, 2);
    const open = (await shop.get('/api/open-orders')).data;
    assert.equal(open.length, 1);
    assert.equal(open[0].tabName, 'Dana');
    // The tab cannot be closed until ID has been checked.
    const blocked = await shop.post(`/api/orders/${tab.id}/pay`, { method: 'card', token: 'tok_visa' });
    assert.equal(blocked.data.error.code, 'age_verification_required');
    await shop.ok(shop.post(`/api/orders/${tab.id}/age`));
    await shop.ok(shop.post(`/api/orders/${tab.id}/tip`, { percent: 20 }));
    const paid = await shop.pay(tab.id, { method: 'card', token: 'tok_visa' });
    // Mixed tax: alcohol 10%, food 8%.
    assert.equal(paid.order.totals.subtotal, 700 + 800 + 700 + 1300);
    assert.deepEqual(paid.order.totals.taxBreakdown.map(t => [t.name, t.amount]), [['Alcohol tax', 140], ['Food tax', 168]]);
    assert.equal(paid.order.totals.tip, 700);
    assert.equal(paid.order.totals.total, 3500 + 140 + 168 + 700);
    assert.equal((await shop.get('/api/open-orders')).data.length, 0);
    assert.ok(paid.order.ageVerifiedBy);
  } finally { await shop.close(); }
});

test('a snacks-only tab does not need an ID check', async () => {
  const shop = await boot('bar');
  try {
    const tab = await shop.newOrder({ type: 'bar' });
    await shop.add(tab.id, { itemId: shop.item('Salted Peanuts').id, qty: 2 });
    assert.equal((await shop.pay(tab.id, { method: 'card', token: 'tok_visa' })).order.status, 'paid');
  } finally { await shop.close(); }
});

test('happy hour: weekday 4-6pm is 25% off drinks, not on food, not at 7pm, not on Saturday', async () => {
  const shop = await boot('bar', { date: WED_5PM });
  try {
    const order = await shop.newOrder({ type: 'bar' });
    const drink = await shop.add(order.id, ipa(shop));
    assert.equal(drink.lines[0].listPrice, 700);
    assert.equal(drink.lines[0].unitPrice, 525);
    assert.equal(drink.lines[0].priceRule, 'Happy Hour -25%');
    const pitcher = await shop.add(order.id, ipa(shop, 'Pitcher'));
    assert.equal(pitcher.totals.subtotal, 525 + 525 + 1300); // the pitcher upcharge is not discounted
    const food = await shop.add(order.id, { itemId: shop.item('Wings (6)').id });
    assert.equal(food.lines.find(l => l.name === 'Wings (6)').unitPrice, 1300);
    assert.match((await shop.get(`/api/orders/${order.id}/receipt`)).data, /Happy Hour -25%/);
    shop.clock.date = WED_7PM;
    const late = await shop.newOrder({ type: 'bar' });
    assert.equal((await shop.add(late.id, ipa(shop))).lines[0].unitPrice, 700);
    shop.clock.date = SAT_5PM;
    shop.tokens.cashier = (await shop.call('POST', '/api/auth/login', { pin: '3333' })).data.token; // the old login expired with the 3 days
    const weekend = await shop.newOrder({ type: 'bar' });
    assert.equal((await shop.add(weekend.id, ipa(shop))).lines[0].unitPrice, 700);
    // The price an hour-ago ticket was rung at does not change when the clock moves on.
    assert.equal((await shop.get(`/api/orders/${order.id}`)).data.lines[0].unitPrice, 525);
  } finally { await shop.close(); }
});

test('pour sizes and recipes: pitchers, doubles and fractional wine bottles deplete the right stock', async () => {
  const shop = await boot('bar');
  try {
    const tab = await shop.newOrder({ type: 'tab', tabName: 'Round 1' });
    await shop.add(tab.id, ipa(shop, 'Pitcher'));
    await shop.add(tab.id, oldFashioned(shop, 'Double'));
    await shop.add(tab.id, { itemId: shop.item('House Red (glass)').id, qty: 3 });
    await shop.add(tab.id, { itemId: shop.item('Salted Peanuts').id });
    await shop.ok(shop.post(`/api/orders/${tab.id}/age`));
    await shop.pay(tab.id, { method: 'card', token: 'tok_visa' });
    assert.equal(shop.inv('IPA keg').onHand, 1984 - 16 - 48);
    assert.equal(shop.inv('Bourbon').onHand, 300 - 4);
    assert.equal(shop.inv('House red (bottles)').onHand, 11.4);
    assert.equal(shop.item('Salted Peanuts').inventoryId && shop.pos.state.inventory.find(i => i.id === shop.item('Salted Peanuts').inventoryId).onHand, 39);
  } finally { await shop.close(); }
});

test('an empty keg blocks pitchers but a short pour of something else still works', async () => {
  const shop = await boot('bar');
  try {
    await shop.ok(shop.post(`/api/inventory/${shop.inv('IPA keg').id}/adjust`, { counted: 50, reason: 'Keg nearly empty' }, 'manager'));
    const tab = await shop.newOrder({ type: 'tab', tabName: 'Late' });
    assert.equal((await shop.post(`/api/orders/${tab.id}/lines`, ipa(shop, 'Pitcher'))).data.error.code, 'out_of_stock');
    await shop.add(tab.id, ipa(shop, 'Pint'));
    assert.ok(shop.pos.lowStock().some(i => i.name === 'IPA keg'));
  } finally { await shop.close(); }
});

test('comps and voids are manager actions with a reason, and show on the receipt', async () => {
  const shop = await boot('bar');
  try {
    const tab = await shop.newOrder({ type: 'tab', tabName: 'Regular' });
    const withDrink = await shop.add(tab.id, oldFashioned(shop));
    await shop.add(tab.id, ipa(shop));
    const lineId = withDrink.lines[0].id;
    assert.equal((await shop.post(`/api/orders/${tab.id}/lines/${lineId}/comp`, { reason: 'Birthday' })).data.error.code, 'manager_required');
    assert.equal((await shop.post(`/api/orders/${tab.id}/lines/${lineId}/comp`, { managerPin: '2222' })).data.error.code, 'reason_required');
    const comped = await shop.ok(shop.post(`/api/orders/${tab.id}/lines/${lineId}/comp`, { reason: 'Birthday', managerPin: '2222' }));
    assert.equal(comped.totals.subtotal, 700);
    assert.equal(comped.lines[0].comped, true);
    assert.match((await shop.get(`/api/orders/${tab.id}/receipt`)).data, /Comped: Birthday/);
    await shop.ok(shop.post(`/api/orders/${tab.id}/send`));
    const ipaLine = (await shop.get(`/api/orders/${tab.id}`)).data.lines[1];
    assert.equal((await shop.post(`/api/orders/${tab.id}/lines/${ipaLine.id}/remove`, { reason: 'Wrong beer' })).data.error.code, 'manager_required');
    const voided = await shop.ok(shop.post(`/api/orders/${tab.id}/lines/${ipaLine.id}/remove`, { reason: 'Wrong beer', managerPin: '2222' }));
    assert.equal(voided.totals.subtotal, 0);
    assert.ok(shop.pos.state.audit.some(a => a.action === 'order.comp'));
    assert.ok(shop.pos.state.audit.some(a => a.action === 'order.void_line'));
  } finally { await shop.close(); }
});

test('split the check evenly three ways: card, cash with change, card; the pennies always add up', async () => {
  const shop = await boot('bar');
  try {
    await shop.openDrawer(10000);
    const tab = await shop.newOrder({ type: 'tab', tabName: 'Three friends' });
    await shop.add(tab.id, ipa(shop, 'Pitcher'));
    await shop.add(tab.id, { itemId: shop.item('Wings (6)').id });
    await shop.ok(shop.post(`/api/orders/${tab.id}/age`));
    await shop.ok(shop.post(`/api/orders/${tab.id}/tip`, { percent: 18 }));
    const due = (await shop.get(`/api/orders/${tab.id}`)).data.totals.due;
    const { amounts } = (await shop.ok(shop.post(`/api/orders/${tab.id}/split`, { parts: 3 })));
    assert.equal(amounts.length, 3);
    assert.equal(amounts.reduce((a, b) => a + b, 0), due);
    assert.ok(Math.max(...amounts) - Math.min(...amounts) <= 1);
    const one = await shop.pay(tab.id, { method: 'card', token: 'tok_a', amount: amounts[0] });
    assert.equal(one.order.status, 'open');
    const two = await shop.pay(tab.id, { method: 'cash', amount: amounts[1], tendered: 2500 });
    assert.equal(two.change, 2500 - amounts[1]);
    const three = await shop.pay(tab.id, { method: 'card', token: 'tok_c', amount: amounts[2] });
    assert.equal(three.order.status, 'paid');
    assert.equal(three.order.payments.length, 3);
    assert.equal(three.order.totals.paid, due);
    assert.equal((await shop.get('/api/drawer')).data.expected, 10000 + amounts[1]);
  } finally { await shop.close(); }
});

test('split by items: each guest pays for their own drinks, and a settled item cannot be removed or paid twice', async () => {
  const shop = await boot('bar');
  try {
    const tab = await shop.newOrder({ type: 'tab', tabName: 'Table 4' });
    await shop.add(tab.id, ipa(shop));
    const b = await shop.add(tab.id, { itemId: shop.item('Margarita').id, modifiers: [shop.pos.state.modifierGroups.find(g => g.name === 'Pour' && g.options[1].recipe[0].inventoryId === shop.inv('Tequila').id).options[0].id] });
    await shop.ok(shop.post(`/api/orders/${tab.id}/age`));
    const [ipaLine] = b.lines;
    const guestA = await shop.pay(tab.id, { method: 'card', token: 'tok_a', lineIds: [ipaLine.id] });
    assert.equal(guestA.payment.amount, 700 + 70);
    assert.equal(guestA.order.status, 'open');
    assert.equal((await shop.post(`/api/orders/${tab.id}/pay`, { method: 'card', token: 'tok_a', lineIds: [ipaLine.id] })).data.error.code, 'line_settled');
    assert.equal((await shop.post(`/api/orders/${tab.id}/lines/${ipaLine.id}/remove`, {})).data.error.code, 'line_settled');
    const guestB = await shop.pay(tab.id, { method: 'card', token: 'tok_b' });
    assert.equal(guestB.payment.amount, 1100 + 110);
    assert.equal(guestB.order.status, 'paid');
  } finally { await shop.close(); }
});

test('cash tips and tip-out: tip on a cash sale, then a manager pays the bartenders out of the drawer', async () => {
  const shop = await boot('bar');
  try {
    await shop.openDrawer(15000);
    const tab = await shop.newOrder({ type: 'bar' });
    await shop.add(tab.id, { itemId: shop.item('Well Whiskey Shot').id });
    await shop.ok(shop.post(`/api/orders/${tab.id}/age`));
    await shop.ok(shop.post(`/api/orders/${tab.id}/tip`, { amount: 200 }));
    const paid = await shop.pay(tab.id, { method: 'cash', tendered: 1000 });
    assert.equal(paid.order.totals.total, 600 + 60 + 200);
    assert.equal(paid.change, 1000 - 860);
    assert.equal((await shop.post('/api/drawer/movement', { type: 'paid_out', amount: 200, reason: 'Tip-out' }, 'cashier')).status, 403);
    const out = await shop.ok(shop.post('/api/drawer/movement', { type: 'paid_out', amount: 200, reason: 'Tip-out: Cleo', managerPin: undefined }, 'manager'));
    assert.equal(out.expected, 15000 + 860 - 200);
    assert.equal((await shop.post('/api/drawer/movement', { type: 'paid_out', amount: 99999999, reason: 'Too much' }, 'manager')).data.error.code, 'insufficient_cash');
    assert.equal((await shop.post('/api/drawer/movement', { type: 'paid_in', amount: 500 }, 'manager')).data.error.code, 'reason_required');
    const withManagerPin = await shop.ok(shop.post('/api/drawer/movement', { type: 'paid_in', amount: 500, reason: 'More change', managerPin: '2222' }, 'cashier'));
    assert.equal(withManagerPin.paidIn, 500);
  } finally { await shop.close(); }
});

test('two bartenders run separate tabs at once; both show on the open-tabs list', async () => {
  const shop = await boot('bar');
  try {
    const mine = await shop.newOrder({ type: 'tab', tabName: 'Pat' }, 'cashier');
    const theirs = await shop.newOrder({ type: 'tab', tabName: 'Lee' }, 'manager');
    await shop.add(mine.id, ipa(shop), 'cashier');
    await shop.add(theirs.id, { itemId: shop.item('Pretzel Bites').id }, 'manager');
    const open = (await shop.get('/api/open-orders')).data;
    assert.deepEqual(open.map(o => o.tabName).sort(), ['Lee', 'Pat']);
    assert.notEqual(open[0].staffId, open[1].staffId);
    assert.deepEqual([mine.number, theirs.number], [1, 2]);
  } finally { await shop.close(); }
});

test('alcohol is never sold unattended: self-checkout hides it and rejects it; the open API rejects it', async () => {
  const shop = await boot('bar');
  try {
    assert.equal((await shop.call('GET', '/api/kiosk/menu')).status, 403); // kiosk is off by default in a bar
    await shop.ok(shop.put('/api/settings/kiosk', { enabled: true }, 'admin'));
    const menu = (await shop.call('GET', '/api/kiosk/menu')).data;
    assert.deepEqual(menu.items.map(i => i.name).sort(), ['Pretzel Bites', 'Salted Peanuts', 'Wings (6)']);
    const refused = await shop.call('POST', '/api/kiosk/orders', { lines: [{ itemId: shop.item('Hazy IPA').id, modifiers: [shop.opt('Size', 'Pint')] }] });
    assert.equal(refused.data.error.code, 'age_restricted');
    const snacks = await shop.call('POST', '/api/kiosk/orders', { lines: [{ itemId: shop.item('Salted Peanuts').id }] });
    assert.equal(snacks.status, 201);
    const key = (await shop.ok(shop.post('/api/apikeys', { label: 'App' }, 'admin'))).key;
    const call = (p, b) => fetch(shop.base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, data: await r.json() }));
    const session = await call('/api/v1/checkout_sessions', { items: [{ id: shop.item('Hazy IPA').id, quantity: 1, modifiers: [shop.opt('Size', 'Pint')] }], fulfillment_option_id: 'bar' });
    assert.equal(session.status, 201);
    const done = await call(`/api/v1/checkout_sessions/${session.data.id}/complete`, { payment_data: { token: 'tok_visa', provider: 'mock' } });
    assert.equal(done.status, 403);
    assert.equal(done.data.error.code, 'age_restricted');
  } finally { await shop.close(); }
});

test('refunding a bar tab is a manager action; drinks already poured are not put back in the keg', async () => {
  const shop = await boot('bar');
  try {
    await shop.openDrawer(0);
    const tab = await shop.newOrder({ type: 'tab', tabName: 'Refund me' });
    await shop.add(tab.id, ipa(shop));
    await shop.ok(shop.post(`/api/orders/${tab.id}/age`));
    await shop.pay(tab.id, { method: 'card', token: 'tok_visa' });
    const keg = shop.inv('IPA keg').onHand;
    assert.equal((await shop.post(`/api/orders/${tab.id}/refund`, { all: true, reason: 'Skunked' })).status, 403);
    const refunded = await shop.ok(shop.post(`/api/orders/${tab.id}/refund`, { all: true, reason: 'Skunked', managerPin: '2222' }));
    assert.equal(refunded.status, 'refunded');
    assert.equal(shop.inv('IPA keg').onHand, keg);
    assert.equal((await shop.post(`/api/orders/${tab.id}/refund`, { all: true, reason: 'Again', managerPin: '2222' })).data.error.code, 'not_refundable');
  } finally { await shop.close(); }
});

test('close of night: Z-report shows sales by category, tenders, tips and the drawer count', async () => {
  const shop = await boot('bar');
  try {
    await shop.openDrawer(20000);
    const sale = async (item, method, tip) => {
      const o = await shop.newOrder({ type: 'bar' });
      await shop.add(o.id, item);
      await shop.ok(shop.post(`/api/orders/${o.id}/age`));
      if (tip) await shop.ok(shop.post(`/api/orders/${o.id}/tip`, { amount: tip }));
      return shop.pay(o.id, method === 'cash' ? { method, tendered: 5000 } : { method, token: 'tok_visa' });
    };
    await sale(ipa(shop), 'cash', 100);
    await sale(oldFashioned(shop), 'card', 300);
    await sale({ itemId: shop.item('House Red (glass)').id }, 'card', 0);
    const cashIn = 700 + 70 + 100;
    const z = await shop.ok(shop.post('/api/drawer/close', { counted: 20000 + cashIn }));
    assert.equal(z.drawer.expected, 20000 + cashIn);
    assert.equal(z.drawer.variance, 0);
    assert.equal(z.sales.orders, 3);
    assert.equal(z.sales.tips, 400);
    assert.deepEqual(z.sales.byCategory.map(c => c.key).sort(), ['Cocktails', 'Draft Beer', 'Wine']);
    assert.equal(z.sales.byTender.find(t => t.key === 'cash').sales, cashIn);
    assert.equal(z.sales.byTender.find(t => t.key === 'card').count, 2);
    assert.equal((await shop.get('/api/drawers', 'manager')).data.length, 1);
  } finally { await shop.close(); }
});

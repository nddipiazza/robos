'use strict';
// Touchscreen end-to-end tests for the bar: tabs, ID checks, happy hour, comps, split payment.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch } = require('./browser');

const T = { timeout: 120000 };
const WED_5PM = new Date(2026, 9, 14, 17, 0);

async function addIpa(b, size = 'Pint') {
  await b.tap(b.tid('item-Hazy IPA'));
  await b.tap(b.tid(`option-Size-${size}`));
  await b.tap(b.tid('add-to-order'));
}

test('bartender opens a tab, sends rounds, holds it, recalls it, checks ID, adds a tip and closes with a card', T, async () => {
  const b = await launch('bar');
  try {
    await b.signIn('3333');
    await b.tap(b.tid('type-tab'));
    await addIpa(b);
    await b.page.fill(b.tid('tab-name'), 'Dana');
    await b.tap(b.tid('tab-open'));
    await b.see(b.tid('order-title'), /Order #1 · Dana/);
    await b.tap(b.tid('item-Pretzel Bites'));
    await b.see(b.tid('subtotal'), /\$15\.00/);
    await b.tap(b.tid('send'));
    await b.seeToast(/Sent 2 item/);
    await b.shot('bar-tab-register');
    await b.tap(b.tid('hold'));
    await b.see(b.tid('tab-1'), /Dana/);
    await b.shot('bar-open-tabs');
    // Meanwhile the bar screen shows the drinks.
    await b.nav('prep');
    await b.tap(b.tid('station-bar'));
    await b.see(b.tid('ticket-1'), /Hazy IPA/);
    assert.equal(await b.page.locator(`${b.tid('ticket-1')} :text("Pretzel")`).count(), 0); // pretzels belong to the kitchen
    await b.nav('tabs');
    await b.tap(b.tid('tab-1'));
    await b.see(b.tid('lines'), /Hazy IPA/);
    await addIpa(b); // second round
    await b.tap(b.tid('send'));
    await b.seeToast(/Sent 1 item/);
    // Payment is blocked until ID is checked.
    await b.tap(b.tid('pay'));
    await b.tap(b.tid('method-card'));
    await b.tap(b.tid('take-card'));
    await b.seeToast(/Check ID/);
    await b.page.keyboard.press('Escape');
    await b.tap(b.tid('age-check'));
    await b.see(b.tid('age-check'), /ID checked/);
    await b.tap(b.tid('tip-open'));
    await b.tap(b.tid('tip-20'));
    await b.see(b.tid('tip'), /\$4\.40/); // 20% of 22.00 before tax
    await b.tap(b.tid('pay'));
    await b.tap(b.tid('method-card'));
    await b.tap(b.tid('take-card'));
    await b.see(b.tid('receipt-text'), /Dana[\s\S]*Hazy IPA[\s\S]*Alcohol tax[\s\S]*Food tax[\s\S]*Tip\s+\$4\.40/);
    await b.shot('bar-receipt');
    assert.equal(b.pos.getOrder(b.pos.state.orders[0].id).status, 'paid');
    assert.deepEqual(b.errors.filter(e => !/409|400/.test(e)), []);
  } finally { await b.close(); }
});

test('happy hour: the 4-6pm price shows on the ticket automatically', T, async () => {
  const b = await launch('bar', { date: WED_5PM });
  try {
    await b.signIn('3333');
    await b.tap(b.tid('type-bar'));
    await addIpa(b);
    await b.see(b.tid('lines'), /Happy Hour -25%/);
    await b.see(b.tid('subtotal'), /\$5\.25/);
    await b.shot('bar-happy-hour');
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('comp a drink: needs a manager PIN and a reason; the ticket drops to zero and the comp is on the receipt', T, async () => {
  const b = await launch('bar');
  try {
    await b.signIn('3333');
    await b.tap(b.tid('type-bar'));
    await b.tap(b.tid('item-Old Fashioned'));
    await b.tap(b.tid('option-Pour-Single'));
    await b.tap(b.tid('add-to-order'));
    await b.see(b.tid('subtotal'), /\$12\.00/);
    await b.tap(b.tid('line-Old Fashioned'));
    await b.tap(b.tid('line-comp'));
    await b.tap(b.tid('reason-ok'));
    await b.seeToast(/reason is required/i);
    await b.page.fill(b.tid('reason'), 'Birthday');
    await b.tap(b.tid('reason-ok'));
    await b.see(b.tid('pin-dialog'), /Manager approval needed/);
    await b.keys('2222');
    await b.tap(b.tid('pin-ok'));
    await b.see(b.tid('subtotal'), /\$0\.00/);
    await b.see(b.tid('lines'), /Comped: Birthday/);
    assert.ok(b.pos.state.audit.some(a => a.action === 'override'));
    assert.deepEqual(b.errors.filter(e => !/403/.test(e)), []);
  } finally { await b.close(); }
});

test('split the check two ways: first half by card, second half in cash with change', T, async () => {
  const b = await launch('bar');
  try {
    const cashier = b.pos.state.staff.find(s => s.role === 'cashier');
    b.pos.openDrawer({ float: 5000 }, cashier);
    await b.signIn('3333');
    await b.tap(b.tid('type-bar'));
    await b.tap(b.tid('item-Margarita'));
    await b.tap(b.tid('option-Pour-Single'));
    await b.tap(b.tid('add-to-order'));
    await b.tap(b.tid('item-Gin & Tonic'));
    await b.tap(b.tid('option-Pour-Single'));
    await b.tap(b.tid('add-to-order'));
    await b.see(b.tid('subtotal'), /\$21\.00/);
    await b.tap(b.tid('age-check'));
    await b.tap(b.tid('pay'));
    await b.see(b.tid('due'), /\$23\.10/);
    await b.tap(b.tid('pay-split-2'));
    await b.tap(b.tid('method-card'));
    await b.tap(b.tid('take-card'));
    await b.seeToast(/Paid \$11\.55/);
    await b.see(b.tid('due'), /\$11\.55/);
    await b.tap(b.tid('method-cash'));
    await b.tap(b.tid('quick-2000'));
    await b.see(b.tid('change'), /Change due \$8\.45/);
    await b.shot('bar-split-payment');
    await b.tap(b.tid('take-cash'));
    await b.see(b.tid('change-due'), /\$8\.45/);
    const order = b.pos.state.orders[0];
    assert.deepEqual(order.payments.map(p => p.method), ['card', 'cash']);
    assert.equal(order.status, 'paid');
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('pay by item: each guest settles their own items, one after the other', T, async () => {
  const b = await launch('bar');
  try {
    await b.signIn('3333');
    await b.tap(b.tid('type-bar'));
    await addIpa(b);
    await b.tap(b.tid('item-Salted Peanuts'));
    await b.tap(b.tid('age-check'));
    await b.tap(b.tid('pay'));
    await b.see(b.tid('due'), /\$10\.94/);
    await b.tap(b.tid('pay-items')); // first line (the beer) is selected for the first guest
    await b.see(b.tid('pay-dialog'), /Hazy IPA \$7\.70/);
    await b.tap(b.tid('method-card'));
    await b.tap(b.tid('take-card'));
    await b.seeToast(/Paid \$7\.70/);
    await b.see(b.tid('due'), /\$3\.24/);
    await b.tap(b.tid('pay-full'));
    await b.tap(b.tid('take-card'));
    await b.see(b.tid('receipt-text'), /TOTAL\s+\$10\.94/);
    assert.deepEqual(b.pos.state.orders[0].payments.map(p => p.amount), [770, 324]);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('the bar does not offer unattended self-checkout', T, async () => {
  const b = await launch('bar');
  try {
    await b.page.goto(b.base + '/kiosk');
    await b.see('body', /Self-checkout is not available/);
    assert.deepEqual(b.errors.filter(e => !/403/.test(e)), []);
  } finally { await b.close(); }
});

test('works on a small phone-sized screen too (responsive layout)', T, async () => {
  const b = await launch('coffee', { viewport: { width: 390, height: 780 } });
  try {
    await b.signIn('3333');
    await b.tap(b.tid('item-Espresso'));
    await b.see(b.tid('total'), /\$3\.26/);
    const overflow = await b.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert.equal(overflow, false);
    await b.shot('coffee-phone');
  } finally { await b.close(); }
});

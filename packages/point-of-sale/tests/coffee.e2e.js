'use strict';
// Touchscreen end-to-end tests for the coffee shop: every step is a finger tap on the real UI.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch } = require('./browser');

const T = { timeout: 120000 };

async function openDrawerInUi(b, float) {
  await b.nav('cash');
  await b.keys(float);
  await b.tap(b.tid('drawer-open'));
  await b.see(b.tid('drawer-panel'), /open/);
}

test('worker rings a custom latte, adds a tip, takes cash with quick-tender, then it flows to prep and the ready board', T, async () => {
  const b = await launch('coffee');
  try {
    await b.signIn('3333');
    await openDrawerInUi(b, '100');
    await b.nav('register');
    await b.tap(b.tid('item-Latte'));
    await b.see(b.tid('customize-dialog'), /Size/);
    assert.equal(await b.page.locator(b.tid('add-to-order')).isDisabled(), true); // size and milk are required
    await b.tap(b.tid('option-Size-Medium'));
    await b.tap(b.tid('option-Milk-Oat'));
    await b.tap(b.tid('option-Extras-Extra shot'));
    await b.see(b.tid('add-to-order'), /\$6\.35/);
    await b.tap(b.tid('add-to-order'));
    await b.see(b.tid('total'), /\$6\.89/); // 6.35 + 8.5% tax
    await b.tap(b.tid('tip-open'));
    await b.tap(b.tid('tip-20'));
    await b.see(b.tid('total'), /\$8\.16/);
    await b.shot('coffee-register-latte');
    await b.tap(b.tid('pay'));
    await b.see(b.tid('due'), /\$8\.16/);
    await b.tap(b.tid('quick-2000'));
    await b.see(b.tid('change'), /Change due \$11\.84/);
    await b.shot('coffee-pay-cash');
    await b.tap(b.tid('take-cash'));
    await b.see(b.tid('change-due'), /\$11\.84/);
    await b.see(b.tid('receipt-text'), /Latte[\s\S]*Oat[\s\S]*TOTAL\s+\$8\.16/);
    await b.tap(b.tid('new-order'));
    await b.see(b.tid('total'), /\$0\.00/);

    await b.nav('prep');
    await b.see(b.tid('ticket-1'), /Latte/);
    await b.shot('coffee-prep-queue');
    await b.tap(b.tid('ticket-1-preparing'));
    await b.tap(b.tid('ticket-1-ready'));
    const board = await b.context.newPage();
    await board.goto(b.base + '/ready');
    await board.waitForFunction(() => /#1/.test(document.body.innerText));
    await b.shot('coffee-ready');
    await b.tap(b.tid('ticket-1-served'));
    await b.see(b.tid('queue-empty'), /Nothing waiting/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('self-checkout: customer picks a drink and a muffin, tips and pays by card, and the barista sees it', T, async () => {
  const b = await launch('coffee');
  try {
    await b.page.goto(b.base + '/kiosk');
    await b.shot('coffee-kiosk-welcome');
    await b.tap(b.tid('start-dine_in'));
    await b.tap(b.tid('item-Latte'));
    await b.tap(b.tid('option-Size-Large'));
    await b.tap(b.tid('option-Milk-Almond'));
    await b.see(b.tid('add-to-order'), /\$6\.10/);
    await b.tap(b.tid('add-to-order'));
    await b.tap(b.tid('item-Blueberry Muffin'));
    await b.see(b.tid('cart-subtotal'), /\$9\.60/);
    await b.shot('coffee-kiosk-menu');
    await b.tap(b.tid('review'));
    await b.see(b.tid('pay-total'), /\$10\.42/); // 9.60 + 8.5% tax (81.6 rounds to 82 cents)
    await b.tap(b.tid('tip-18'));
    await b.see(b.tid('pay-total'), /\$12\.15/);
    await b.shot('coffee-kiosk-review');
    await b.tap(b.tid('pay-card'));
    await b.see(b.tid('order-number'), /#1/);
    await b.shot('coffee-kiosk-done');
    const queue = b.pos.queue();
    assert.equal(queue.length, 1);
    assert.deepEqual(queue[0].lines.map(l => l.name).sort(), ['Blueberry Muffin', 'Latte']);
    assert.equal(b.pos.getOrder(queue[0].orderId).totals.tip, 173);
    await b.tap(b.tid('new-order'));
    await b.see(b.tid('welcome'), /Bean There Coffee/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('self-checkout: customer who prefers cash takes a number, and the cashier collects at the counter', T, async () => {
  const b = await launch('coffee');
  try {
    await b.page.goto(b.base + '/kiosk');
    await b.tap(b.tid('start-takeout'));
    await b.tap(b.tid('item-Butter Croissant'));
    await b.tap(b.tid('option-Warm up-Toasted')); // optional choice: the sheet opens but Add is already enabled
    await b.tap(b.tid('add-to-order'));
    await b.tap(b.tid('review'));
    await b.tap(b.tid('pay-counter'));
    await b.see(b.tid('done'), /Almost done[\s\S]*#1/);
    assert.equal(b.pos.queue().length, 0); // nothing is made until it is paid
    await b.signIn('3333');
    await openDrawerInUi(b, '20');
    await b.nav('tabs');
    await b.see(b.tid('tab-1'), /Order #1|#1/);
    await b.shot('coffee-pay-at-counter-queue');
    await b.tap(b.tid('tab-1'));
    await b.see(b.tid('ticket'), /pay at the counter/);
    await b.tap(b.tid('pay'));
    await b.tap(b.tid('quick-1000'));
    await b.tap(b.tid('take-cash'));
    await b.see(b.tid('change-due'), /\$6\.47/); // 3.25 + 28 cents tax = 3.53, change from 10.00
    assert.equal(b.pos.queue().length, 1); // now it is sent to the kitchen
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('owner adds a new menu item from the Menu & Catalog screen and a worker can sell it immediately', T, async () => {
  const b = await launch('coffee');
  try {
    await b.signIn('1111');
    await b.nav('catalog');
    await b.tap(b.tid('catalog-add'));
    await b.page.fill(b.tid('f-name'), 'Pumpkin Latte');
    await b.page.fill(b.tid('f-price'), '5.75');
    await b.page.selectOption(b.tid('f-categoryId'), { label: 'Espresso' });
    await b.page.fill(b.tid('f-station'), 'barista');
    await b.page.fill(b.tid('f-emoji'), '🎃');
    await b.shot('coffee-menu-editor');
    await b.tap(b.tid('catalog-save'));
    await b.see(b.tid('catalog-table'), /Pumpkin Latte[\s\S]*\$5\.75/);
    // Bad input is explained, not swallowed.
    await b.tap(b.tid('catalog-add'));
    await b.page.fill(b.tid('f-name'), 'Broken');
    await b.page.fill(b.tid('f-price'), '12.505');
    await b.tap(b.tid('catalog-save'));
    await b.seeToast(/enter an amount/i);
    await b.page.keyboard.press('Escape');
    await b.nav('register');
    await b.tap(b.tid('item-Pumpkin Latte'));
    await b.see(b.tid('subtotal'), /\$5\.75/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('manager turns on nickel rounding in Cash settings and the register honours it', T, async () => {
  const b = await launch('coffee');
  try {
    await b.signIn('2222');
    await b.nav('cash');
    await b.keys('100');
    await b.tap(b.tid('drawer-open'));
    await b.see(b.tid('drawer-panel'), /open/);
    await b.page.selectOption(b.tid('f-rounding'), '5');
    await b.page.fill(b.tid('f-quickTender'), '5, 10, 20');
    await b.shot('coffee-cash-admin');
    await b.tap(b.tid('cash-save'));
    await b.seeToast(/Cash settings saved/);
    await b.nav('register');
    await b.tap(b.tid('item-Banana Bread Slice'));
    await b.tap(b.tid('option-Warm up-Toasted'));
    await b.tap(b.tid('add-to-order'));
    await b.see(b.tid('total'), /\$3\.26/);
    await b.tap(b.tid('pay'));
    await b.tap(b.tid('quick-325'));
    await b.tap(b.tid('take-cash'));
    await b.see(b.tid('receipt-text'), /Cash rounding\s+-\$0\.01[\s\S]*TOTAL\s+\$3\.25/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('end of shift: cashier counts the drawer with bill and coin buttons; an exact count closes with zero variance', T, async () => {
  const b = await launch('coffee');
  try {
    await b.signIn('3333');
    await b.nav('cash');
    await b.keys('50');
    await b.tap(b.tid('drawer-open'));
    await b.see(b.tid('drawer-panel'), /open/);
    const staff = b.pos.state.staff.find(s => s.role === 'cashier');
    const order = b.pos.createOrder({ type: 'takeout' }, staff);
    b.pos.addLine(order.id, { itemId: b.pos.state.items.find(i => i.name === 'Espresso').id }, staff);
    await b.pos.pay(order.id, { method: 'cash', tendered: 400 }, staff);
    await b.nav('cash');
    await b.see(b.tid('drawer-Cash sales'), /\$3\.26/);
    assert.equal(await b.page.locator(b.tid('drawer-expected')).count(), 0); // blind count: cashiers do not see the expected total
    await b.tap(b.tid('drawer-close'));
    for (const [denom, taps] of [[2000, 2], [1000, 1], [100, 3], [25, 1], [1, 1]]) {
      for (let i = 0; i < taps; i++) await b.tap(`${b.tid(`denom-${denom}`)} ${b.tid('stepper-plus')}`);
    }
    await b.see(b.tid('count-total'), /\$53\.26/);
    await b.shot('coffee-count-drawer');
    await b.tap(b.tid('close-ok'));
    await b.see(b.tid('z-dialog'), /Expected[\s\S]*\$53\.26/);
    await b.see(b.tid('z-Over / short'), /\$0\.00/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('first run: an empty shop offers sample businesses, then the team signs in with PINs; wrong PIN is refused', T, async () => {
  const b = await launch(null);
  try {
    await b.page.goto(b.base + '/');
    await b.see('body', /Welcome to/);
    await b.shot('first-run-setup');
    await b.tap(b.tid('setup-coffee'));
    await b.see('body', /Enter your PIN/);
    await b.keys('9999');
    await b.tap(b.tid('login-submit'));
    await b.seeToast(/Wrong PIN/);
    await b.keys('3333');
    await b.tap(b.tid('login-submit'));
    await b.see(b.tid('whoami'), /Cleo/);
    await b.tap(b.tid('lock'));
    await b.see('body', /Enter your PIN/);
    assert.deepEqual(b.errors.filter(e => !/401/.test(e)), []);
  } finally { await b.close(); }
});

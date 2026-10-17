'use strict';
// Touchscreen end-to-end tests for the clothing store (retail).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch } = require('./browser');

const T = { timeout: 120000 };
const barcodeOf = (b, name, size) => { const item = b.pos.state.items.find(i => i.name === name); return size ? item.variants.find(v => v.name === size).barcode : item.barcode; };
const stock = (b, name, size) => { const item = b.pos.state.items.find(i => i.name === name); const inv = size ? item.variants.find(v => v.name === size).inventoryId : item.inventoryId; return b.pos.state.inventory.find(i => i.id === inv).onHand; };

test('cashier scans a barcode, taps a size for jeans, applies a promo code and takes a card; then handles a return with manager approval', T, async () => {
  const b = await launch('clothing');
  try {
    await b.signIn('3333');
    // A hardware scanner types the code and presses Enter into the always-focused scan box.
    await b.page.fill(b.tid('scan'), barcodeOf(b, 'Classic Tee White', 'M'));
    await b.page.press(b.tid('scan'), 'Enter');
    await b.see(b.tid('lines'), /Classic Tee White · M/);
    await b.tap(b.tid('item-Slim Jeans'));
    await b.see(b.tid('add-to-order'), /Choose an option/);
    await b.tap(b.tid('variant-32'));
    await b.tap(b.tid('add-to-order'));
    await b.see(b.tid('subtotal'), /\$92\.00/);
    await b.tap(b.tid('discount-open'));
    await b.page.fill(b.tid('promo-code'), 'save10');
    await b.tap(b.tid('promo-apply'));
    await b.see(b.tid('discount'), /-\$9\.20/);
    await b.shot('clothing-register-promo');
    await b.tap(b.tid('pay'));
    await b.see(b.tid('due'), /\$89\.63/); // (92.00 - 9.20) + 8.25% tax
    await b.tap(b.tid('method-card'));
    await b.tap(b.tid('take-card'));
    await b.see(b.tid('receipt-text'), /Classic Tee White M[\s\S]*Slim Jeans 32[\s\S]*Discount SAVE10[\s\S]*TOTAL\s+\$89\.63/);
    assert.equal(stock(b, 'Classic Tee White', 'M'), 9);
    assert.equal(stock(b, 'Slim Jeans', '32'), 4);
    await b.tap(b.tid('new-order'));

    // Return: the cashier cannot refund alone; a manager types their PIN on the spot.
    await b.nav('orders');
    await b.tap(b.tid('order-row-1'));
    await b.tap(b.tid('refund-open'));
    await b.tap(`${b.tid('refund-dialog')} ${b.tid('stepper-plus')}`); // first line: the tee
    await b.page.fill(b.tid('refund-reason'), 'Too small');
    await b.tap(b.tid('refund-confirm'));
    await b.see(b.tid('pin-dialog'), /Manager approval needed/);
    await b.shot('clothing-manager-override');
    await b.keys('3333');
    await b.tap(b.tid('pin-ok'));
    await b.seeToast(/Manager PIN not accepted/); // a cashier PIN cannot approve
    await b.tap(b.tid('refund-confirm'));
    await b.keys('2222');
    await b.tap(b.tid('pin-ok'));
    await b.seeToast(/Refunded/);
    const order = b.pos.state.orders[0];
    assert.equal(order.status, 'partially_refunded');
    assert.equal(stock(b, 'Classic Tee White', 'M'), 10); // back on the shelf
    assert.deepEqual(b.errors.filter(e => !/403/.test(e)), []);
  } finally { await b.close(); }
});

test('cash sale at the register: change due is shown, receipt prints, drawer is required first', T, async () => {
  const b = await launch('clothing');
  try {
    await b.signIn('3333');
    await b.tap(b.tid('item-Wool Beanie'));
    await b.tap(b.tid('pay'));
    await b.tap(b.tid('quick-5000'));
    await b.tap(b.tid('take-cash'));
    await b.seeToast(/Open the cash drawer/);
    await b.page.keyboard.press('Escape');
    await b.nav('cash');
    await b.keys('100');
    await b.tap(b.tid('drawer-open'));
    await b.see(b.tid('drawer-panel'), /open/);
    await b.nav('register');
    await b.see(b.tid('total'), /\$23\.82/); // the unpaid order is still there after visiting another screen: 22.00 + 1.82 tax (181.5 rounds half up)
    await b.tap(b.tid('pay'));
    await b.tap(b.tid('quick-5000'));
    await b.see(b.tid('change'), /Change due \$26\.18/);
    await b.tap(b.tid('take-cash'));
    await b.see(b.tid('change-due'), /\$26\.18/);
    await b.shot('clothing-receipt');
    assert.deepEqual(b.errors.filter(e => !/409/.test(e)), []);
  } finally { await b.close(); }
});

test('manager does inventory input: new stock item, receive a delivery, count the shelf, and import a CSV', T, async () => {
  const b = await launch('clothing');
  try {
    await b.signIn('2222');
    await b.nav('inventory');
    await b.tap(b.tid('inv-add'));
    await b.page.fill(b.tid('f-name'), 'Gift box');
    await b.page.fill(b.tid('f-sku'), 'GC-100');
    await b.page.fill(b.tid('f-onHand'), '25');
    await b.page.fill(b.tid('f-reorderPoint'), '5');
    await b.page.fill(b.tid('f-cost'), '1.50');
    await b.tap(b.tid('inv-save'));
    await b.see(b.tid('onhand-Gift box'), /25 each/);
    await b.tap(b.tid('receive-Gift box'));
    await b.keys('10');
    await b.tap(b.tid('receive-ok'));
    await b.see(b.tid('onhand-Gift box'), /35 each/);
    await b.tap(b.tid('adjust-Gift box'));
    await b.tap(`${b.tid('adjust-dialog')} .numpad button[data-key="⌫"]`);
    await b.tap(`${b.tid('adjust-dialog')} .numpad button[data-key="⌫"]`);
    await b.keys('30');
    await b.tap(b.tid('adjust-ok'));
    await b.seeToast(/reason is required/i);
    await b.page.fill(b.tid('adjust-reason'), 'Recount after delivery');
    await b.tap(b.tid('adjust-ok'));
    await b.see(b.tid('onhand-Gift box'), /30 each/);
    await b.tap(b.tid('inv-import'));
    await b.page.fill(b.tid('csv-text'), 'sku,name,qty,unit,reorder,cost\nTW-SOCKS,Wool Socks (pair),20,,,\nHB-1,Hanger bundle,100,each,20,0.25\n');
    await b.tap(b.tid('csv-ok'));
    await b.see(b.tid('onhand-Hanger bundle'), /100 each/);
    await b.shot('clothing-inventory');
    assert.equal(stock(b, 'Wool Socks (pair)'), 22);
    await b.page.fill(b.tid('inv-filter'), 'hanger');
    await b.see(b.tid('inventory-table'), /Hanger bundle/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('owner adds a clothing item with sizes and a valid barcode; a bad barcode is refused with a clear message', T, async () => {
  const b = await launch('clothing');
  try {
    await b.signIn('1111');
    await b.nav('catalog');
    await b.tap(b.tid('catalog-add'));
    await b.page.fill(b.tid('f-name'), 'Linen Shirt');
    await b.page.fill(b.tid('f-price'), '64.00');
    await b.page.selectOption(b.tid('f-categoryId'), { label: 'Tops' });
    await b.page.fill(b.tid('f-variantsText'), 'M | LS-M | 612000000994 | 4\nL | LS-L | 612000000987 | 6');
    await b.tap(b.tid('catalog-save'));
    await b.seeToast(/check digit/);
    const { withCheckDigit } = require('../lib/gtin');
    await b.page.fill(b.tid('f-variantsText'), `M | LS-M | ${withCheckDigit('61200000099')} | 4\nL | LS-L | ${withCheckDigit('61200000098')} | 6`);
    await b.tap(b.tid('catalog-save'));
    await b.see(b.tid('catalog-table'), /Linen Shirt[\s\S]*M, L/);
    await b.shot('clothing-catalog-editor');
    assert.equal(stock(b, 'Linen Shirt', 'L'), 6);
    assert.deepEqual(b.errors.filter(e => !/400/.test(e)), []);
  } finally { await b.close(); }
});

test('self-checkout in the store: shopper scans a tag, picks a size by touch, chooses pay-at-counter; cashier finds the order and takes cash', T, async () => {
  const b = await launch('clothing');
  try {
    await b.page.goto(b.base + '/kiosk');
    await b.tap(b.tid('start'));
    await b.page.fill(b.tid('scan'), barcodeOf(b, 'Canvas Tote'));
    await b.page.press(b.tid('scan'), 'Enter');
    await b.see(b.tid('cart'), /Canvas Tote/);
    await b.page.fill(b.tid('scan'), '999');
    await b.page.press(b.tid('scan'), 'Enter');
    await b.seeToast(/could not find 999/);
    await b.tap(b.tid('item-Zip Hoodie'));
    await b.tap(b.tid('variant-M'));
    await b.tap(b.tid('add-to-order'));
    await b.see(b.tid('cart-subtotal'), /\$73\.00/);
    await b.shot('clothing-kiosk-cart');
    await b.tap(b.tid('review'));
    await b.see(b.tid('pay-total'), /\$79\.03/); // tax is rounded per line: 1.49 + 4.54
    assert.equal(await b.page.locator(b.tid('tip-none')).count(), 0); // retail: no tipping prompt
    await b.tap(b.tid('pay-counter'));
    await b.see(b.tid('order-number'), /#1/);
    assert.equal(stock(b, 'Zip Hoodie', 'M'), 6); // not sold until paid
    await b.signIn('3333');
    await b.nav('cash'); await b.keys('50'); await b.tap(b.tid('drawer-open')); await b.see(b.tid('drawer-panel'), /open/);
    await b.nav('tabs');
    await b.page.waitForSelector(b.tid('tab-1'));
    await b.tap(b.tid('tab-1'));
    await b.tap(b.tid('pay'));
    await b.keys('100'); // no quick button for a hundred: type it on the pad
    await b.tap(b.tid('take-cash'));
    await b.see(b.tid('change-due'), /\$20\.97/);
    assert.equal(stock(b, 'Zip Hoodie', 'M'), 5);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('shopper at self-checkout who backs out leaves nothing behind for the staff', T, async () => {
  const b = await launch('clothing');
  try {
    await b.page.goto(b.base + '/kiosk');
    await b.tap(b.tid('start'));
    await b.tap(b.tid('item-Canvas Tote'));
    await b.tap(b.tid('review'));
    await b.tap(b.tid('back'));
    await b.see(b.tid('cart'), /Canvas Tote/); // the basket is still there to edit
    await b.tap(b.tid('cancel-order'));
    await b.see(b.tid('welcome'), /Threadwell/);
    assert.equal(b.pos.openOrders().length, 0);
    assert.equal(b.pos.state.orders.filter(o => o.status === 'void').length, 1);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('reports: manager sees the day by category and tender, and a cashier cannot open reports', T, async () => {
  const b = await launch('clothing');
  try {
    const cashier = b.pos.state.staff.find(s => s.role === 'cashier');
    b.pos.openDrawer({ float: 0 }, cashier);
    for (const [name, method] of [['Canvas Tote', 'cash'], ['Wool Beanie', 'card']]) {
      const o = b.pos.createOrder({ type: 'retail' }, cashier);
      b.pos.addLine(o.id, { itemId: b.pos.state.items.find(i => i.name === name).id }, cashier);
      await b.pos.pay(o.id, method === 'cash' ? { method, tendered: 5000 } : { method, token: 'tok_x' }, cashier);
    }
    await b.signIn('3333');
    assert.equal(await b.page.locator(b.tid('nav-reports')).count(), 0);
    await b.tap(b.tid('lock'));
    await b.signIn('2222');
    await b.nav('reports');
    await b.tap(b.tid('range-all')); // the test shop runs on a fixed clock, so use all-time instead of today
    await b.see(b.tid('stat-Orders'), /^2/);
    await b.see(b.tid('stat-Gross sales'), /\$40\.00/);
    await b.see(b.tid('by-category'), /Accessories/);
    await b.see(b.tid('by-tender'), /cash[\s\S]*card|card[\s\S]*cash/);
    await b.shot('clothing-reports');
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMoney, formatMoney, percentOf, roundToIncrement, splitEvenly, allocate } = require('../lib/money');
const { isValidGtin, withCheckDigit } = require('../lib/gtin');
const { PointOfSale } = require('../lib/pos');
const { renderReceipt } = require('../lib/receipt');

test('money parsing accepts dollars and cents and rejects ambiguity', () => {
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('$0.07'), 7);
  assert.equal(parseMoney('3'), 300);
  for (const bad of ['', 'abc', '1.234', '-1', '1,000', '1.']) assert.throws(() => parseMoney(bad), /amount/, bad);
  assert.equal(formatMoney(-1250), '-$12.50');
  assert.equal(formatMoney(5, 'EUR'), '€0.05');
});

test('rounding helpers never lose or invent a cent', () => {
  assert.equal(percentOf(1000, 825), 83); // 82.5 rounds half up
  assert.equal(roundToIncrement(326, 5), 325);
  assert.equal(roundToIncrement(328, 5), 330);
  for (const [total, parts] of [[10000, 3], [1, 3], [999, 7], [0, 4]]) assert.equal(splitEvenly(total, parts).reduce((a, b) => a + b, 0), total);
  assert.throws(() => splitEvenly(100, 0), /at least one/);
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(allocate(7, [5, 0, 5]).reduce((a, b) => a + b, 0), 7);
  assert.deepEqual(allocate(10, [0, 0]), [0, 0]);
});

test('GTIN check digits: known-good codes pass, typos fail', () => {
  for (const good of ['036000291452', '4006381333931', '96385074']) assert.equal(isValidGtin(good), true, good); // UPC-A, EAN-13, EAN-8
  assert.equal(isValidGtin('036000291453'), false);
  assert.equal(isValidGtin('12345'), false);
  assert.equal(isValidGtin('abc'), false);
  assert.equal(isValidGtin(withCheckDigit('61200000001')), true);
});

function shopWith(taxInclusive) {
  const pos = new PointOfSale();
  const admin = pos.addStaff({ name: 'A', role: 'admin', pin: '1111' });
  pos.state.settings.tax.inclusive = taxInclusive;
  const tax = pos.upsert('taxes', { name: 'VAT', rateBp: 2000 });
  const item = pos.upsert('items', { name: 'Widget', price: 1200, taxId: tax.id });
  return { pos, item, staff: pos.state.staff[0], admin };
}

test('tax-inclusive pricing (VAT style): the shelf price is the total and tax is carved out of it', async () => {
  const { pos, item, staff } = shopWith(true);
  const order = pos.createOrder({ type: 'retail' }, staff);
  const o = pos.addLine(order.id, { itemId: item.id, qty: 3 }, staff);
  assert.equal(o.totals.total, 3600);
  assert.equal(o.totals.tax, 600); // 3600 / 1.2 = 3000 net
  assert.equal(o.totals.taxInclusive, true);
  const withDiscount = pos.applyDiscount(order.id, { type: 'percent', value: 5, reason: 'Loyalty' }, staff);
  assert.equal(withDiscount.totals.total, 3420);
  assert.equal(withDiscount.totals.tax, 3420 - Math.round(3420 / 1.2));
  const receipt = renderReceipt(withDiscount, pos.settings);
  assert.match(receipt, /VAT 20\.00% \(incl\.\)/);
});

test('discounts can never push a total below zero and are shared across lines to the cent', () => {
  const { pos, item, staff } = shopWith(false);
  const cheap = pos.upsert('items', { name: 'Cheap', price: 101, taxId: item.taxId });
  const order = pos.createOrder({ type: 'retail' }, staff);
  pos.addLine(order.id, { itemId: item.id }, staff);
  pos.addLine(order.id, { itemId: cheap.id }, staff);
  pos.upsert('promotions', { code: 'HUGE', type: 'fixed', value: 99999 });
  const o = pos.applyDiscount(order.id, { code: 'HUGE' }, staff);
  assert.equal(o.totals.discount, 1301);
  assert.equal(o.totals.total, 0);
  assert.equal(o.lines.reduce((s, l) => s + l.discount, 0), 1301);
});

test('catalog validation: names, prices, tax rates and duplicate SKUs are refused with plain messages', () => {
  const { pos, item } = shopWith(false);
  assert.throws(() => pos.upsert('items', { name: ' ', price: 100 }), /Name is required/);
  assert.throws(() => pos.upsert('items', { name: 'X', price: 1.5 }), /whole number of cents/);
  assert.throws(() => pos.upsert('items', { name: 'X', price: 100, categoryId: 'nope' }), /Unknown category/);
  assert.throws(() => pos.upsert('taxes', { name: 'T', rateBp: 99999 }), /between 0% and 50%/);
  pos.upsert('items', { name: 'Sku', price: 100, sku: 'S-1' });
  assert.throws(() => pos.upsert('items', { name: 'Sku2', price: 100, sku: 'S-1' }), /already belongs to Sku/);
  assert.throws(() => pos.upsert('promotions', { code: 'x', type: 'percent', value: 10 }), /3 to 20/);
  assert.throws(() => pos.upsert('priceRules', { name: 'R', percentOff: 10, start: '25:00', end: '18:00' }), /HH:MM/);
  assert.throws(() => pos.updateSettings('nonsense', {}), /Unknown settings section/);
  assert.throws(() => pos.upsert('items', { id: 'itm_missing', name: 'X', price: 1 }), /Unknown record/);
  assert.ok(item.id);
});

test('a PIN is hashed at rest, never stored or returned in clear', () => {
  const pos = new PointOfSale();
  pos.addStaff({ name: 'A', role: 'admin', pin: '4321' });
  assert.equal(JSON.stringify(pos.state).includes('4321'), false);
  assert.equal(JSON.stringify(pos.listStaff()).includes('Hash'), false);
  assert.equal(pos.login('4321').staff.role, 'admin');
});

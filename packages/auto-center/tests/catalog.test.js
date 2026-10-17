'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { AutoCenter } = require('../lib/service');
const fixture = require('./e2e/support/fixture-catalog');
function shop() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-catalog-')); fixture.build(path.join(dir, 'cache'));
  const s = new AutoCenter({ root: path.join(dir, 'cache'), privateRoot: path.join(dir, 'private') }); s.setMode('shop'); return s;
}
const labels = r => r.map(i => i.label);
test('makes match word prefixes and models are scoped to the make', () => {
  const s = shop();
  assert.deepEqual(labels(s.catalog('make', 'toy')), ['Toyota']);
  assert.deepEqual(labels(s.catalog('make', 'mer')).sort(), ['Mercedes-Benz', 'Mercury']);
  assert.deepEqual(labels(s.catalog('model', 'c', { make: 'Toyota' })).sort(), ['Camry', 'Camry Hybrid', 'Corolla']);
  assert.deepEqual(labels(s.catalog('model', 'c', { make: 'Honda' })), ['Civic']);
});
test('years are the model years that exist, newest first; configs match every typed word', () => {
  const s = shop();
  assert.deepEqual(labels(s.catalog('year', '', { make: 'Toyota', model: 'Camry' })), ['2016', '2015', '2014']);
  assert.deepEqual(labels(s.catalog('config', '2015 honda')), ['2015 Honda Civic']);
  assert.deepEqual(s.catalog('config', '2015 honda zzz'), []);
});
test('trouble codes match by code or description', () => {
  const s = shop();
  assert.deepEqual(labels(s.catalog('dtc', 'P03')), ['P0300', 'P0301']);
  assert.ok(labels(s.catalog('dtc', 'catalyst')).includes('P0420'));
});
test('shop parts rank first, and fitting parts rank above others', () => {
  const s = shop();
  s.workshop('addPart', { name: 'Honda pads', partNumber: 'H1', make: 'Honda', model: 'Civic', cost: '1.00', price: '2.00' });
  s.workshop('addPart', { name: 'Toyota pads', partNumber: 'T1', make: 'Toyota', model: 'Camry', cost: '1.00', price: '2.00' });
  const r = s.catalog('part', 'pads', { make: 'Toyota', model: 'Camry' });
  assert.equal(r[0].name, 'Toyota pads'); assert.equal(r[0].unitPrice, '2.00');
  assert.ok(labels(r).includes('Front brake pads'));
});
test('part and CSV validation', () => {
  const s = shop();
  assert.throws(() => s.workshop('addPart', { name: '' }), /Part name is required/);
  assert.throws(() => s.workshop('addPart', { name: 'X', cost: 'abc' }), /Cost must be an amount/);
  assert.throws(() => s.workshop('addPart', { name: 'X', yearFrom: '2020', yearTo: '2010', make: 'Toyota' }), /Year from is after year to/);
  s.workshop('addPart', { name: 'Oil filter', partNumber: 'OF-1', supplier: 'A' });
  assert.throws(() => s.workshop('addPart', { name: 'Oil filter', partNumber: 'OF-1', supplier: 'A' }), /already in the catalog/);
  assert.deepEqual(s.workshop('importParts', { csv: 'name,part number,supplier\nOil filter,OF-1,A\n"Wiper, blade",W-1,A\n' }), { added: 1, skipped: 1 });
  assert.throws(() => s.workshop('importParts', { csv: 'name,cost\nA,1.00\nB,oops\n' }), /Nothing imported\. Row 3: Cost must be an amount/);
  assert.throws(() => s.workshop('importParts', { csv: 'sku\nA\n' }), /"name" column/);
  assert.equal(s.catalog('part', 'wiper', {}).filter(p => p.source === 'shop').length, 1);
});

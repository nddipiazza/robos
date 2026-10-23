'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createInventory, memoryStore, jsonStore } = require('..');
test('on hand is the sum of the movement ledger', () => {
  const store = memoryStore(), inv = createInventory({ store, namespace: 'test' });
  const pads = inv.addItem({ name: 'Front brake pads', sku: 'BP-100', unit: 'set', reorderPoint: '2', reorderQty: '4', unitCost: '30.00', onHand: '3' });
  assert.equal(pads.onHand, 3); assert.equal(pads.value, 9000);
  assert.equal(inv.receive({ item: pads.id, qty: '4', unitCost: '28.50', referenceLabel: 'PO-0001' }).onHand, 7);
  assert.equal(inv.item(pads.id).unitCost, 2850, 'last received cost becomes the item cost');
  assert.equal(inv.issue({ item: pads.id, qty: '5', referenceLabel: 'RO-0001' }).onHand, 2);
  assert.equal(inv.lowStock().length, 1);
  assert.throws(() => inv.issue({ item: pads.id, qty: '3' }), /Only 2 set of Front brake pads in stock/);
  assert.throws(() => inv.adjust({ item: pads.id, counted: '1' }), /Reason/);
  assert.equal(inv.adjust({ item: pads.id, counted: '1', reason: 'Shelf count' }).onHand, 1);
  assert.throws(() => inv.adjust({ item: pads.id, counted: '1', reason: 'Again' }), /nothing to adjust/);
  assert.deepEqual(inv.movements(pads.id).map(m => [m.kind, m.qty]), [['adjust', -1], ['issue', -5], ['receive', 4], ['adjust', 3]]);
  assert.throws(() => inv.addItem({ name: 'Other', sku: 'bp-100' }), /SKU BP-100 already exists/);
  assert.equal(inv.bySku('bp-100').id, pads.id);
  assert.equal(store.log.length, 4, "one commit per change");
});
test('negative stock can be allowed, and items can be retired', () => {
  const inv = createInventory({ store: memoryStore(), allowNegative: true });
  const oil = inv.addItem({ name: '5W-30 oil', unit: 'quart' });
  assert.equal(inv.issue({ item: oil.id, qty: '2' }).onHand, -2);
  inv.updateItem({ id: oil.id, active: false });
  assert.equal(inv.items().length, 0); assert.throws(() => inv.receive({ item: oil.id, qty: 1 }), /no longer stocked/);
  assert.throws(() => inv.updateItem({ id: oil.id }), /Nothing to change/);
});
test('the JSON file store persists across instances', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inv-')), 'stock.json');
  const a = createInventory({ store: jsonStore(file) }); const i = a.addItem({ name: 'Wiper blade', sku: 'WB-20', onHand: 6 });
  const b = createInventory({ store: jsonStore(file) }); assert.equal(b.item(i.id).onHand, 6);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

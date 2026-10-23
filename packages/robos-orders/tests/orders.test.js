'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { createOrders, createInventory, memoryStore } = require('..');
function setup(opts = {}) {
  const store = memoryStore(), inventory = createInventory({ store }), orders = createOrders({ store, inventory, ...opts });
  const napa = orders.addSupplier({ name: 'NAPA Auto Parts', phone: '555-0170', account: 'A-1182' });
  const pads = inventory.addItem({ name: 'Front brake pads', sku: 'BP-100', reorderPoint: 2, reorderQty: 4, unitCost: '30.00', supplier: 'NAPA Auto Parts' });
  return { store, inventory, orders, napa, pads };
}
test('a purchase order is drafted, placed and received into stock in two deliveries', () => {
  const { inventory, orders, napa, pads } = setup();
  const po = orders.createOrder({ supplier: napa.id, lines: [{ item: pads.id, qty: 4 }, { description: 'Shop rags', qty: 2, unitCost: '9.99' }] });
  assert.equal(po.number, 'PO-0001'); assert.equal(po.total, 4 * 3000 + 1998); assert.equal(po.lines[0].description, 'Front brake pads');
  assert.throws(() => orders.receive({ order: po.id, lines: [{ line: po.lines[0].id, qty: 1 }] }), /not waiting for a delivery/);
  assert.throws(() => orders.placeOrder({ order: po.id }), /how the order was placed/);
  orders.placeOrder({ order: po.id, via: 'phone', reference: 'N-55120', expectedOn: '2026-10-25' });
  assert.equal(orders.onOrder(pads.id), 4);
  assert.throws(() => orders.addLine({ order: po.id, description: 'More' }), /has been placed/);
  assert.throws(() => orders.receive({ order: po.id, lines: [{ line: po.lines[0].id, qty: 5 }] }), /Only 4 of "Front brake pads"/);
  assert.equal(orders.receive({ order: po.id, lines: [{ line: po.lines[0].id, qty: 3, unitCost: '29.00' }], by: 'Dan' }).status, 'partly-received');
  assert.equal(inventory.onHand(pads.id), 3); assert.equal(inventory.item(pads.id).unitCost, 2900); assert.equal(orders.onOrder(pads.id), 1);
  assert.equal(orders.receive({ order: po.id, lines: [{ line: po.lines[0].id, qty: 1 }, { line: po.lines[1].id, qty: 2 }] }).status, 'received');
  assert.equal(inventory.onHand(pads.id), 4); assert.equal(inventory.movements(pads.id)[0].referenceLabel, 'PO-0001');
  assert.equal(orders.suppliers()[0].openOrders, 0);
});
test('low stock suggests a reorder, unless it is already on order', () => {
  const { orders, napa, pads } = setup();
  assert.deepEqual(orders.reorderSuggestions().map(s => [s.name, s.suggestedQty]), [['Front brake pads', 4]]);
  const po = orders.createOrder({ supplier: napa.id, lines: [{ item: pads.id, qty: 4 }] }); orders.placeOrder({ order: po.id, via: 'email' });
  assert.equal(orders.reorderSuggestions().length, 0);
});
test('drafts can be extended, and orders cancelled or closed short with a hook for the app', () => {
  const cancelled = [], received = [];
  const { orders, napa, pads } = setup({ onReceive: ({ received: r }) => { received.push(...r.map(l => l.for)); return []; } });
  orders.createOrder({ supplier: napa.id, lines: [{ description: 'Alternator', qty: 1, unitCost: '180.00', for: 'job-1', forLabel: 'RO-0001' }] });
  const draft = orders.orders({ status: 'draft' })[0];
  const merged = orders.draftEdits({ supplier: napa.id, appendToDraft: true, lines: [{ item: pads.id, qty: 2 }] }); assert.equal(merged.order['@id'], draft.id);
  orders.removeLine({ order: draft.id, line: draft.lines[0].id }); assert.throws(() => orders.placeOrder({ order: draft.id, via: 'phone' }), /at least one line/);
  const po = orders.createOrder({ supplier: napa.id, lines: [{ description: 'Water pump', qty: 2, for: 'job-2' }, { description: 'Belt', qty: 1, for: 'job-3' }] });
  orders.placeOrder({ order: po.id, via: 'website' });
  orders.receive({ order: po.id, lines: [{ line: po.lines[0].id, qty: 2 }] }); assert.deepEqual(received, ['job-2']);
  assert.throws(() => orders.cancelOrder({ order: po.id }), /Reason/);
  const r = orders.cancelOrder({ order: po.id, reason: 'Belt discontinued', onCancel: lines => { cancelled.push(...lines.map(l => l.for)); return []; } });
  assert.equal(r.status, 'closed'); assert.deepEqual(cancelled, ['job-3']); assert.equal(orders.order(po.id).lines[1].remaining, 0);
  assert.equal(orders.cancelOrder({ order: draft.id, reason: 'Not needed' }).status, 'cancelled');
});

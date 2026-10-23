'use strict';
// The register selling from a shared RobOS Inventory, as it does inside RobOS Auto Center's parts counter.
const { test } = require('node:test'), assert = require('node:assert/strict');
const { PointOfSale } = require('../lib/pos');
const { createInventory, memoryStore } = require('../../robos-inventory');
function counter() {
  const store = memoryStore(), inventory = createInventory({ store, namespace: 'test', allowNegative: true });
  const pads = inventory.addItem({ name: 'Front brake pads', sku: 'BP-100', onHand: 5, reorderPoint: 2, unitCost: '30.00' });
  const pos = new PointOfSale({ inventory });
  pos.addStaff({ name: 'Ana', role: 'admin', pin: '1111' }); const staff = pos.state.staff[0];
  pos.openDrawer({ float: 10000 }, staff);
  return { pos, inventory, store, pads, staff };
}
test('a counter sale and its return are movements in the shared stock ledger', async () => {
  const { pos, inventory, store, pads, staff } = counter();
  // A part the business already stocks is sold from that stock: same SKU, no second record, no extra count.
  const item = pos.upsert('items', { name: 'Brake pads (front)', price: 6500, sku: 'BP-100', stock: 99, cost: 3000 });
  assert.equal(item.inventoryId, pads.id); assert.equal(inventory.items().length, 1); assert.equal(inventory.onHand(pads.id), 5);
  assert.equal(pos.list('inventory')[0].onHand, 5); assert.equal(pos.state.inventory.length, 0, 'the register keeps no stock of its own');
  const order = pos.createOrder({ type: 'retail' }, staff); pos.addLine(order.id, { itemId: item.id, qty: 2 }, staff);
  const before = store.log.length; await pos.pay(order.id, { method: 'cash', tendered: 20000 }, staff);
  assert.equal(inventory.onHand(pads.id), 3); assert.equal(store.log.length, before + 1, 'one stock change per sale');
  const sale = inventory.movements(pads.id)[0]; assert.equal(sale.kind, 'issue'); assert.equal(sale.qty, -2); assert.equal(sale.referenceLabel, `Counter sale #${pos.getOrder(order.id).number}`); assert.equal(sale.by, 'Ana');
  // Stock used elsewhere in the business (a repair) is what the register sees next.
  inventory.issue({ item: pads.id, qty: 3, referenceLabel: 'RO-0001' }); assert.equal(pos.stockOf(pads.id).onHand, 0);
  const next = pos.createOrder({ type: 'retail' }, staff); assert.throws(() => pos.addLine(next.id, { itemId: item.id }, staff), /Not enough Front brake pads in stock \(0 left\)/);
  const lineId = pos.getOrder(order.id).lines[0].id;
  await pos.refund(order.id, { lines: [{ lineId, qty: 1 }], reason: 'Wrong part', method: 'cash' }, pos.state.staff[0]);
  const back = inventory.movements(pads.id)[0]; assert.equal(back.kind, 'adjust'); assert.equal(back.qty, 1); assert.match(back.reason, /Returned on sale #\d+: Wrong part/);
  assert.equal(pos.lowStock()[0].name, 'Front brake pads');
});
test('receiving, counting, CSV import and back-office edits go to the shared inventory', () => {
  const { pos, inventory, pads, staff } = counter();
  pos.receiveStock(pads.id, { qty: 4, cost: 2800, note: 'NAPA delivery' }, staff);
  assert.equal(inventory.onHand(pads.id), 9); assert.equal(inventory.item(pads.id).unitCost, 2800);
  pos.adjustStock(pads.id, { counted: 8, reason: 'Shelf count' }, staff);
  assert.deepEqual(inventory.movements(pads.id).slice(0, 2).map(m => [m.kind, m.qty]), [['adjust', -1], ['receive', 4]]);
  assert.deepEqual(pos.importInventoryCsv('name,sku,qty,cost\nWiper blade,WB-20,6,8.50\nFront brake pads,BP-100,2,', staff), { created: 1, received: 1 });
  assert.equal(inventory.bySku('WB-20').onHand, 6); assert.equal(inventory.bySku('WB-20').unitCost, 850); assert.equal(inventory.onHand(pads.id), 10);
  const wb = inventory.bySku('WB-20'); pos.upsert('inventory', { id: wb.id, name: 'Wiper blade 20"', reorderPoint: 2, sku: 'WB-20' }, staff);
  assert.equal(inventory.item(wb.id).name, 'Wiper blade 20"'); assert.equal(inventory.item(wb.id).reorderPoint, 2);
  pos.remove('inventory', wb.id, staff); assert.equal(inventory.items().length, 1, 'removing it at the register retires it');
  assert.equal(pos.inventoryValue(), 10 * 2800);
});
test('a register that kept its own stock moves it into the shared inventory once', () => {
  const alone = new PointOfSale(); alone.addStaff({ name: 'Ana', role: 'admin', pin: '1111' });
  const oil = alone.upsert('items', { name: '5W-30 oil', price: 899, sku: 'OIL-5W30', stock: 12, cost: 450 });
  const pads = alone.upsert('items', { name: 'Brake pads', price: 6500, sku: 'BP-100', stock: 3 });
  const store = memoryStore(), inventory = createInventory({ store, allowNegative: true }), shop = inventory.addItem({ name: 'Front brake pads', sku: 'BP-100', onHand: 5 });
  const pos = new PointOfSale({ inventory }); pos.state = JSON.parse(JSON.stringify(alone.state)); pos.moveStockToShared();
  assert.equal(pos.state.inventory.length, 0);
  assert.equal(pos.state.items.find(i => i.id === pads.id).inventoryId, shop.id, 'matched by SKU, keeping the shop’s count');
  const moved = inventory.bySku('OIL-5W30'); assert.equal(moved.onHand, 12); assert.equal(pos.state.items.find(i => i.id === oil.id).inventoryId, moved.id);
  assert.equal(inventory.onHand(shop.id), 5);
});

'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { AutoCenter } = require('../lib/service');
function shop() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-orders-')); const s = new AutoCenter({ root: path.join(dir, 'c'), privateRoot: path.join(dir, 'p') }); s.setMode('shop');
  const W = (a, i) => s.workshop(a, i), O = (op, i = {}) => W('orders', { op, ...i });
  const c = W('registerCustomer', { name: 'Sam Rivera', phone: '(555) 010-0100' });
  const v = W('addCustomerVehicle', { customer: c['@id'], year: '2015', make: 'Toyota', model: 'Camry' });
  const t = W('addTeammate', { name: 'Maria Lopez', role: 'Technician' });
  const { job } = W('intakeRepair', { vehicle: v['@id'], channel: 'phone call', category: 'brakes', answers: { symptom: ['Grinding'] } });
  const napa = O('addSupplier', { name: 'NAPA Auto Parts', phone: '555-0170' });
  return { s, W, O, t, job: job['@id'], napa };
}
const nodes = s => s.workspace.read()['robos:nodes'];
test('a mechanic’s part request is ordered, received on the purchase order and lands on the job', () => {
  const { s, W, O, t, job, napa } = shop();
  const r = W('requestPart', { job, teammate: t['@id'], name: 'Front brake pads', partNumber: 'BP-100', quantity: 1, urgency: 'car is waiting' });
  assert.equal(O('board').partRequests[0].name, 'Front brake pads');
  assert.equal(O('orderPartRequests', { requests: [r['@id']], supplier: napa.id }).order, 'PO-0001');
  let b = O('board'); assert.equal(b.partRequests.length, 0); assert.equal(b.orders[0].lines[0].forLabel, 'RO-0001');
  assert.throws(() => W('updatePartRequest', { id: r['@id'], status: 'received', unitCost: '1.00' }), /on PO-0001; receive or cancel it under Orders/);
  const po = b.orders[0]; O('placeOrder', { order: po.id, via: 'phone', reference: 'N-1' });
  O('receive', { order: po.id, lines: [{ line: po.lines[0].id, qty: '1', unitCost: '41.20' }], by: 'Dan' });
  const usage = nodes(s).find(n => n['@type'] === 'robos:PartUsage'); assert.equal(usage['robos:unitCostMinor'], 4120); assert.equal(usage['robos:supplier'], 'NAPA Auto Parts');
  assert.equal(nodes(s).find(n => n['@id'] === r['@id'])['robos:requestStatus'], 'received');
  assert.ok(W('board').jobs[0].workItem.some(e => e.detail === '1 × Front brake pads received on PO-0001'));
  assert.equal(W('board').jobs[0].summary.partsCost, 4120);
  assert.match(require('node:child_process').execFileSync('git', ['log', '--format=%s'], { cwd: path.join(s.privateRoot, 'shop'), encoding: 'utf8' }), /orders: PO-0001 received/);
});
test('cancelling an order puts its part requests back on the list', () => {
  const { W, O, t, job, napa } = shop();
  const r = W('requestPart', { job, teammate: t['@id'], name: 'Rotor', quantity: 2 });
  O('orderPartRequests', { requests: [r['@id']], supplier: napa.id });
  const po = O('board').orders[0]; O('placeOrder', { order: po.id, via: 'email' });
  O('cancelOrder', { order: po.id, reason: 'Wrong rotor' });
  const b = O('board'); assert.equal(b.partRequests[0].name, 'Rotor'); assert.equal(b.orders[0].status, 'cancelled');
  assert.ok(W('board').jobs[0].workItem.some(e => e.detail === 'Rotor taken off PO-0001; it needs ordering again'));
});
test('stock fills part requests and can be used on a job, costed at the last cost', () => {
  const { s, W, O, t, job, napa } = shop();
  const pads = O('addItem', { name: 'Front brake pads', sku: 'BP-100', onHand: '2', reorderPoint: '1', reorderQty: '4', unitCost: '30.00', supplier: 'NAPA Auto Parts' });
  const r = W('requestPart', { job, teammate: t['@id'], name: 'Brake pads', partNumber: 'bp-100', quantity: 1 });
  assert.equal(O('board').partRequests[0].stock.onHand, 2);
  assert.equal(O('fillFromStock', { request: r['@id'], item: pads.id, by: 'Dan' }).onHand, 1);
  assert.equal(nodes(s).find(n => n['@id'] === r['@id'])['robos:requestStatus'], 'received');
  assert.throws(() => O('issueToJob', { item: pads.id, job, qty: '2' }), /Only 1 each of Front brake pads in stock/);
  O('issueToJob', { item: pads.id, job, qty: '1' });
  assert.equal(W('board').jobs[0].summary.partsCost, 6000);
  const b = O('board'); assert.equal(b.summary.low, 1); assert.equal(b.suggestions[0].suggestedQty, 4);
  O('createOrder', { supplier: napa.id, lines: [{ item: pads.id, qty: 4 }], appendToDraft: true });
  assert.equal(O('board').suggestions.length, 1, 'a draft does not count as on order');
  const po = O('board').orders[0]; O('placeOrder', { order: po.id, via: 'website' }); assert.equal(O('board').suggestions.length, 0);
  O('receive', { order: po.id, lines: [{ line: po.lines[0].id, qty: '4' }] }); assert.equal(O('board').items[0].onHand, 4);
  assert.deepEqual(O('movements', { item: pads.id }).map(m => [m.kind, m.qty, m.referenceLabel]), [['receive', 4, 'PO-0001'], ['issue', -1, 'RO-0001'], ['issue', -1, 'RO-0001'], ['adjust', 2, '']]);
  assert.throws(() => O('teleport'), /Unknown orders operation/);
});

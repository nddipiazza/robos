'use strict';
// Orders & stock for the shop, built on the shared RobOS Orders and RobOS Inventory components. Records live in
// the shop KGraph and every change is a private-Git commit. Mechanics' part requests can be put on a supplier
// order or filled from stock; receiving the order (or taking from stock) turns the request into part usage on
// the repair job, just like marking it received at the bench.
const crypto = require('node:crypto');
const { createInventory } = require('../../robos-inventory');
const { createOrders } = require('../../robos-orders');
const w = require('./workshop');
const { node, ref } = require('./importer');
const { shop, commit } = require('./shop-operations');
const OPEN_JOB = ['received', 'diagnosing', 'awaiting-approval', 'in-progress'];
function currencyOf(service) { return w.nodes(service).find(n => n['@type'] === 'robos:AutoShop')?.['robos:currency'] || 'USD'; }
function ticketEvent(service, records, jobId, kind, detail) { const wi = w.workItemFor(records, jobId); return wi ? [{ op: 'update', id: wi['@id'], set: { 'robos:events': [...(wi['robos:events'] || []), w.event(service, kind, detail)] } }] : []; }
// The request becomes part usage on its job at the given unit cost, as at the bench.
function requestReceivedEdits(service, records, r, { unitCostMinor, supplier, via }) {
  const job = records.find(n => n['@id'] === w.linked(r, 'robos:job'));
  const usage = node('PartUsage', crypto.randomUUID(), r['schema:name'], { 'robos:job': ref(job['@id']), 'schema:name': r['schema:name'], 'robos:partNumber': r['robos:partNumber'] || '', 'robos:quantity': r['robos:quantity'], 'robos:unitCostMinor': unitCostMinor ?? 0, 'robos:currency': w.approvedEstimate(records, job)?.['robos:currency'] || 'USD', 'robos:supplier': supplier || r['robos:supplier'] || '', 'schema:dateCreated': service.clock().toISOString() });
  return [{ op: 'update', id: r['@id'], set: { 'robos:requestStatus': 'received' } }, { op: 'add', node: usage }, ...ticketEvent(service, records, job['@id'], 'part received', `${r['robos:quantity']} × ${r['schema:name']} received ${via}`)];
}
function components(service) {
  shop(service);
  const store = { nodes: () => w.nodes(service), commit: (edits, message) => commit(service, edits, message) }, currency = currencyOf(service);
  const inventory = createInventory({ store, namespace: 'auto', clock: service.clock, currency });
  const onReceive = ({ order, received }) => {
    const records = w.nodes(service), edits = [];
    for (const l of received.filter(l => l.for)) {
      const r = records.find(n => n['@id'] === l.for && n['@type'] === 'robos:PartRequest'); if (!r || r['robos:requestStatus'] !== 'ordered') continue;
      if (l.receivedQty >= l.qty) edits.push(...requestReceivedEdits(service, records, r, { unitCostMinor: l.unitCostMinor, supplier: order.supplier, via: 'on ' + order.number }));
      else edits.push(...ticketEvent(service, records, w.linked(r, 'robos:job'), 'part arriving', `${l.receivedQty} of ${l.qty} × ${r['schema:name']} arrived on ${order.number}`));
    }
    return edits;
  };
  const orders = createOrders({ store, inventory, namespace: 'auto', clock: service.clock, currency, prefix: 'PO', onReceive });
  return { inventory, orders, store };
}
// A cancelled order line puts its part request back on the list to order.
function reopenEdits(service, number, lines) {
  const records = w.nodes(service), edits = [];
  for (const l of lines.filter(l => l.for)) {
    const r = records.find(n => n['@id'] === l.for && n['@type'] === 'robos:PartRequest'); if (!r || r['robos:requestStatus'] !== 'ordered') continue;
    edits.push({ op: 'update', id: r['@id'], set: { 'robos:requestStatus': 'requested', 'robos:purchaseOrder': null, 'robos:supplier': '' } }, ...ticketEvent(service, records, w.linked(r, 'robos:job'), 'part not ordered', `${r['schema:name']} taken off ${number}; it needs ordering again`));
  }
  return edits;
}
function board(service, c) {
  const records = w.nodes(service), items = c.inventory.items().map(i => ({ ...i, onOrder: c.orders.onOrder(i.id) }));
  const jobs = records.filter(n => n['@type'] === 'robos:RepairOrder' && OPEN_JOB.includes(n['robos:jobStatus']));
  const label = job => { const v = records.find(n => n['@id'] === w.linked(job, 'robos:vehicle')), cu = records.find(n => n['@id'] === w.linked(v || {}, 'robos:customer')); return `${w.key(job)} · ${w.vehicleLabel(v, cu)}`; };
  const partRequests = records.filter(n => n['@type'] === 'robos:PartRequest' && n['robos:requestStatus'] === 'requested').map(r => {
    const job = records.find(n => n['@id'] === w.linked(r, 'robos:job')), stock = c.inventory.bySku(r['robos:partNumber']) || items.find(i => i.name.toLowerCase() === r['schema:name'].trim().toLowerCase());
    return { id: r['@id'], name: r['schema:name'], partNumber: r['robos:partNumber'] || '', quantity: r['robos:quantity'], urgency: r['robos:urgency'], by: r['robos:requestedBy'], note: r['robos:note'] || '', job: job ? label(job) : '', jobOpen: !!job && OPEN_JOB.includes(job['robos:jobStatus']), stock: stock && stock.onHand > 0 ? { id: stock.id, onHand: stock.onHand, name: stock.name } : null };
  }).sort((a, b) => ['car is waiting', 'urgent', 'normal'].indexOf(a.urgency) - ['car is waiting', 'urgent', 'normal'].indexOf(b.urgency));
  return { orders: c.orders.orders(), suppliers: c.orders.suppliers(), items, suggestions: c.orders.reorderSuggestions(), summary: c.inventory.summary(), currency: currencyOf(service), partRequests, jobs: jobs.map(j => ({ id: j['@id'], label: label(j) })) };
}
function orderPartRequests(service, c, input) {
  const records = w.nodes(service), ids = [].concat(input.requests || []); if (!ids.length) throw new Error('Choose the part requests to order');
  const reqs = ids.map(id => { const r = records.find(n => n['@id'] === id && n['@type'] === 'robos:PartRequest'); if (!r) throw new Error('Select a part request'); if (r['robos:requestStatus'] !== 'requested') throw new Error(r['schema:name'] + ' is already ' + r['robos:requestStatus']); return r; });
  const keyOf = r => w.key(records.find(n => n['@id'] === w.linked(r, 'robos:job')) || {});
  const lines = reqs.map(r => ({ description: r['schema:name'], sku: r['robos:partNumber'] || '', qty: r['robos:quantity'], unitCost: input.costs?.[r['@id']], for: r['@id'], forLabel: keyOf(r) }));
  const { edits, order } = c.orders.draftEdits({ supplier: input.supplier, lines, appendToDraft: true }), number = order['robos:orderNumber'];
  for (const r of reqs) edits.push({ op: 'update', id: r['@id'], set: { 'robos:requestStatus': 'ordered', 'robos:supplier': order['robos:supplierName'], 'robos:purchaseOrder': ref(order['@id']) } }, ...ticketEvent(service, records, w.linked(r, 'robos:job'), 'part ordered', `${r['robos:quantity']} × ${r['schema:name']} added to ${number} (${order['robos:supplierName']})`));
  commit(service, edits, `${number}: ${reqs.length} part request(s) ordered`); return { order: number };
}
function fillFromStock(service, c, input) {
  const records = w.nodes(service), r = records.find(n => n['@id'] === input.request && n['@type'] === 'robos:PartRequest'); if (!r) throw new Error('Select a part request');
  if (r['robos:requestStatus'] !== 'requested') throw new Error(r['schema:name'] + ' is already ' + r['robos:requestStatus']);
  const job = records.find(n => n['@id'] === w.linked(r, 'robos:job')); if (!job || !OPEN_JOB.includes(job['robos:jobStatus'])) throw new Error('This ticket is not open for work right now');
  const item = c.inventory.item(input.item), { edits } = c.inventory.movementEdits({ item: item.id, qty: r['robos:quantity'], reference: job['@id'], referenceLabel: w.key(job), by: input.by, reason: 'For ' + r['schema:name'] }, 'issue');
  edits.push(...requestReceivedEdits(service, records, r, { unitCostMinor: item.unitCost, supplier: 'stock', via: 'from stock' }));
  commit(service, edits, `${w.key(job)}: ${r['schema:name']} from stock`); return { onHand: c.inventory.onHand(item.id) };
}
function issueToJob(service, c, input) {
  const records = w.nodes(service), job = w.find(service, 'RepairOrder', input.job, 'Choose the repair ticket'); if (!OPEN_JOB.includes(job['robos:jobStatus'])) throw new Error('This ticket is not open for work right now');
  const item = c.inventory.item(input.item), { edits, movement } = c.inventory.movementEdits({ item: item.id, qty: input.qty, reference: job['@id'], referenceLabel: w.key(job), by: input.by, reason: 'Used on ' + w.key(job) }, 'issue');
  const q = -movement['robos:quantity'];
  edits.push({ op: 'add', node: node('PartUsage', crypto.randomUUID(), item.name, { 'robos:job': ref(job['@id']), 'schema:name': item.name, 'robos:partNumber': item.sku, 'robos:quantity': q, 'robos:unitCostMinor': item.unitCost ?? 0, 'robos:currency': w.approvedEstimate(records, job)?.['robos:currency'] || 'USD', 'robos:supplier': 'stock', 'schema:dateCreated': service.clock().toISOString() }) }, ...ticketEvent(service, records, job['@id'], 'part', `${q} × ${item.name} from stock`));
  commit(service, edits, `${w.key(job)}: ${q} × ${item.name} from stock`); return { onHand: c.inventory.onHand(item.id) };
}
// One workshop action, `orders`, with the operation in input.op.
function orders(service, input = {}) {
  const c = components(service), op = input.op;
  const ops = {
    board: () => board(service, c), addSupplier: () => c.orders.addSupplier(input), createOrder: () => c.orders.createOrder(input), addLine: () => c.orders.addLine(input), removeLine: () => c.orders.removeLine(input),
    placeOrder: () => c.orders.placeOrder(input), receive: () => c.orders.receive(input), cancelOrder: () => { const o = c.orders.order(input.order); return c.orders.cancelOrder({ ...input, onCancel: lines => reopenEdits(service, o.number, lines) }); },
    addItem: () => c.inventory.addItem(input), updateItem: () => c.inventory.updateItem(input), adjust: () => c.inventory.adjust(input), receiveStock: () => c.inventory.receive(input), movements: () => c.inventory.movements(input.item),
    orderPartRequests: () => orderPartRequests(service, c, input), fillFromStock: () => fillFromStock(service, c, input), issueToJob: () => issueToJob(service, c, input),
  };
  if (!ops[op]) throw new Error('Unknown orders operation'); return ops[op]();
}
module.exports = { orders, requestReceivedEdits };

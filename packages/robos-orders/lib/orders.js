'use strict';
// RobOS Orders: suppliers and purchase orders. An order is drafted, placed with the supplier, then received
// in one or more deliveries. Lines for a stock item go into RobOS Inventory when received; a line can also
// be "for" any record of the app (a repair job's part request, a customer order) and the app reacts to it
// through the onReceive hook, inside the same commit. Money is integer minor units (cents).
const crypto = require('node:crypto');
const { minor, quantity } = require('../../robos-inventory/lib/inventory');
const STATUSES = ['draft', 'placed', 'partly-received', 'received', 'closed', 'cancelled'];
const STATUS_LABELS = { draft: 'Draft', placed: 'Placed with supplier', 'partly-received': 'Partly received', received: 'Received', closed: 'Closed short', cancelled: 'Cancelled' };
const OPEN = ['placed', 'partly-received'];
const text = (v, max, label, required = true) => { const s = String(v ?? '').trim(); if (required && !s) throw new Error(label + ' is required'); if (s.length > max) throw new Error(label + ' is too long'); return s; };
const round = n => Math.round(n * 1000) / 1000;
function createOrders({ store, inventory = null, namespace = 'app', clock = () => new Date(), currency = 'USD', prefix = 'PO', onReceive = null } = {}) {
  if (!store || typeof store.nodes !== 'function' || typeof store.commit !== 'function') throw new Error('createOrders needs a store with nodes() and commit()');
  const node = (type, title, props) => ({ '@id': `urn:robos:${namespace}:${type}:${crypto.randomUUID()}`, '@type': 'robos:' + type, 'dcterms:title': title, 'robos:package': namespace, ...props });
  const of = type => store.nodes().filter(n => n['@type'] === 'robos:' + type);
  const findOrder = id => { const n = of('PurchaseOrder').find(n => n['@id'] === id); if (!n) throw new Error('Select an order'); return n; };
  const event = (kind, detail) => ({ at: clock().toISOString(), kind, detail });
  const events = (o, kind, detail) => [...(o['robos:events'] || []), event(kind, detail)];
  const remaining = l => round(l.qty - (l.receivedQty || 0) - (l.cancelledQty || 0));
  const num = o => o['robos:orderNumber'];
  function view(o) {
    const lines = (o['robos:orderLines'] || []).map(l => ({ ...l, remaining: remaining(l), amount: Math.round(l.qty * (l.unitCostMinor || 0)) }));
    return { id: o['@id'], number: num(o), status: o['robos:orderStatus'], statusLabel: STATUS_LABELS[o['robos:orderStatus']], supplierId: o['robos:supplier']?.['@id'] || null, supplier: o['robos:supplierName'] || '', currency: o['robos:currency'] || currency,
      lines, total: lines.reduce((s, l) => s + l.amount, 0), receivedValue: lines.reduce((s, l) => s + Math.round((l.receivedQty || 0) * (l.unitCostMinor || 0)), 0), createdAt: o['schema:orderDate'], placedAt: o['robos:placedAt'] || null,
      expectedOn: o['robos:expectedOn'] || '', via: o['robos:placedVia'] || '', reference: o['robos:supplierReference'] || '', note: o['robos:orderNote'] || '', events: o['robos:events'] || [] };
  }
  function supplierById(id) { const s = of('Supplier').find(n => n['@id'] === id); if (!s) throw new Error('Choose a supplier'); return s; }
  function addSupplier(input) {
    const name = text(input.name, 200, 'Supplier name'); if (of('Supplier').some(s => s['schema:name'].toLowerCase() === name.toLowerCase())) throw new Error('This supplier already exists');
    const email = text(input.email, 200, 'Email', false); if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address');
    const n = node('Supplier', name, { 'schema:name': name, 'schema:telephone': text(input.phone, 50, 'Phone', false), 'schema:email': email.toLowerCase(), 'robos:accountNumber': text(input.account, 100, 'Account number', false), 'robos:supplierNotes': text(input.notes, 1000, 'Notes', false) });
    store.commit([{ op: 'add', node: n }], 'orders: add supplier ' + name); return { id: n['@id'], name };
  }
  const suppliers = () => of('Supplier').map(s => ({ id: s['@id'], name: s['schema:name'], phone: s['schema:telephone'] || '', email: s['schema:email'] || '', account: s['robos:accountNumber'] || '', openOrders: of('PurchaseOrder').filter(o => o['robos:supplier']?.['@id'] === s['@id'] && OPEN.includes(o['robos:orderStatus'])).length })).sort((a, b) => a.name.localeCompare(b.name));
  function buildLine(input) {
    const item = input.item && inventory ? inventory.item(input.item) : null;
    const description = text(input.description || item?.name, 300, 'What is being ordered'), qty = quantity(input.qty ?? 1, 'Quantity');
    const unitCostMinor = minor(input.unitCost, 'Unit cost') ?? item?.unitCost ?? 0;
    return { id: crypto.randomUUID(), item: item?.id || null, description, sku: text(input.sku ?? item?.sku, 100, 'SKU', false), qty, unitCostMinor, receivedQty: 0, cancelledQty: 0, for: input.for ? String(input.for) : null, forLabel: text(input.forLabel, 200, 'For', false) };
  }
  // Returns the edits that create (or extend) a draft order, so callers can commit their own records with it.
  function draftEdits(input) {
    const supplier = supplierById(input.supplier), cur = input.currency || currency, lines = (input.lines || []).map(buildLine);
    const existing = input.appendToDraft ? of('PurchaseOrder').find(o => o['robos:supplier']?.['@id'] === supplier['@id'] && o['robos:orderStatus'] === 'draft' && (o['robos:currency'] || currency) === cur) : null;
    if (existing) return { edits: [{ op: 'update', id: existing['@id'], set: { 'robos:orderLines': [...existing['robos:orderLines'], ...lines], 'robos:events': events(existing, 'lines added', lines.map(l => `${l.qty} × ${l.description}`).join(', ')) } }], order: existing, lines };
    const number = `${prefix}-${String(of('PurchaseOrder').length + 1).padStart(4, '0')}`;
    const o = node('PurchaseOrder', `${number} · ${supplier['schema:name']}`, { 'robos:orderNumber': number, 'robos:orderStatus': 'draft', 'robos:supplier': { '@id': supplier['@id'] }, 'robos:supplierName': supplier['schema:name'], 'robos:currency': cur,
      'robos:orderLines': lines, 'schema:orderDate': clock().toISOString(), 'robos:expectedOn': text(input.expectedOn, 10, 'Expected date', false), 'robos:orderNote': text(input.note, 1000, 'Note', false), 'robos:events': [event('drafted', `Draft for ${supplier['schema:name']}`)] });
    return { edits: [{ op: 'add', node: o }], order: o, lines };
  }
  function createOrder(input) { const { edits, order } = draftEdits(input); store.commit(edits, `orders: ${num(order)} drafted`); return view(store.nodes().find(n => n['@id'] === order['@id'])); }
  function addLine(input) {
    const o = findOrder(input.order); if (o['robos:orderStatus'] !== 'draft') throw new Error(`${num(o)} has been placed; start a new order for more items`);
    const l = buildLine(input); store.commit([{ op: 'update', id: o['@id'], set: { 'robos:orderLines': [...o['robos:orderLines'], l] } }], `orders: ${num(o)} line added`); return l;
  }
  function removeLine(input) {
    const o = findOrder(input.order); if (o['robos:orderStatus'] !== 'draft') throw new Error('Lines can only be removed from a draft');
    const lines = o['robos:orderLines'].filter(l => l.id !== input.line); if (lines.length === o['robos:orderLines'].length) throw new Error('Select a line');
    store.commit([{ op: 'update', id: o['@id'], set: { 'robos:orderLines': lines } }], `orders: ${num(o)} line removed`); return { removed: true };
  }
  function placeOrder(input) {
    const o = findOrder(input.order); if (o['robos:orderStatus'] !== 'draft') throw new Error(`${num(o)} is already ${STATUS_LABELS[o['robos:orderStatus']].toLowerCase()}`);
    if (!o['robos:orderLines'].length) throw new Error('Add at least one line before placing the order');
    const via = ['phone', 'email', 'website', 'in person', 'other'].includes(input.via) ? input.via : null; if (!via) throw new Error('Choose how the order was placed');
    const reference = text(input.reference, 100, 'Supplier order number', false), expectedOn = text(input.expectedOn ?? o['robos:expectedOn'], 10, 'Expected date', false);
    if (expectedOn && !/^\d{4}-\d{2}-\d{2}$/.test(expectedOn)) throw new Error('Expected date must be a date');
    store.commit([{ op: 'update', id: o['@id'], set: { 'robos:orderStatus': 'placed', 'robos:placedAt': clock().toISOString(), 'robos:placedVia': via, 'robos:supplierReference': reference, 'robos:expectedOn': expectedOn, 'robos:events': events(o, 'placed', `Placed by ${via}${reference ? ', supplier ref ' + reference : ''}${expectedOn ? ', expected ' + expectedOn : ''}`) } }], `orders: ${num(o)} placed`);
    return view(findOrder(o['@id']));
  }
  // A delivery: any subset of lines and quantities. Stock lines are received into inventory.
  function receive(input) {
    const o = findOrder(input.order); if (!OPEN.includes(o['robos:orderStatus'])) throw new Error(`${num(o)} is not waiting for a delivery`);
    const want = (input.lines || []).filter(r => r && String(r.qty ?? '').trim() !== '' && Number(r.qty) !== 0); if (!want.length) throw new Error('Enter what arrived');
    const lines = o['robos:orderLines'].map(l => ({ ...l })), edits = [], received = [], by = text(input.by, 200, 'Received by', false);
    for (const r of want) {
      const l = lines.find(x => x.id === r.line); if (!l) throw new Error('Select an order line');
      const qty = quantity(r.qty, 'Quantity received'); if (qty > remaining(l)) throw new Error(`Only ${remaining(l)} of "${l.description}" is still on order`);
      const unitCostMinor = minor(r.unitCost, 'Unit cost') ?? l.unitCostMinor;
      if (l.item) { if (!inventory) throw new Error('This order has stock lines but no inventory is connected'); edits.push(...inventory.movementEdits({ item: l.item, qty, unitCost: unitCostMinor, reference: o['@id'], referenceLabel: num(o), by, reason: 'Received on ' + num(o) }, 'receive').edits); }
      l.receivedQty = round((l.receivedQty || 0) + qty); if (unitCostMinor !== l.unitCostMinor) l.unitCostMinor = unitCostMinor;
      received.push({ ...l, qtyNow: qty });
    }
    const status = lines.every(l => remaining(l) <= 0) ? 'received' : 'partly-received';
    const order = { ...o, 'robos:orderLines': lines };
    const extra = onReceive ? onReceive({ order: view(order), received, by }) || [] : [];
    store.commit([{ op: 'update', id: o['@id'], set: { 'robos:orderLines': lines, 'robos:orderStatus': status, ...(status === 'received' ? { 'robos:receivedAt': clock().toISOString() } : {}), 'robos:events': events(o, 'received', received.map(l => `${l.qtyNow} × ${l.description}`).join(', ') + (by ? ' (by ' + by + ')' : '')) } }, ...edits, ...extra], `orders: ${num(o)} ${status === 'received' ? 'received' : 'partly received'}`);
    return { status, received: received.map(l => ({ line: l.id, qty: l.qtyNow, description: l.description, for: l.for })) };
  }
  // Cancel an order with nothing received, or close the rest of a partly received one.
  function cancelOrder(input) {
    const o = findOrder(input.order), st = o['robos:orderStatus']; if (!['draft', ...OPEN].includes(st)) throw new Error(`${num(o)} is already ${STATUS_LABELS[st].toLowerCase()}`);
    const reason = text(input.reason, 500, 'Reason'), partly = st === 'partly-received';
    const lines = o['robos:orderLines'].map(l => ({ ...l, cancelledQty: round((l.cancelledQty || 0) + remaining(l)) }));
    const status = partly ? 'closed' : 'cancelled', cancelled = o['robos:orderLines'].filter(l => remaining(l) > 0);
    const extra = input.onCancel ? input.onCancel(cancelled) || [] : [];
    store.commit([{ op: 'update', id: o['@id'], set: { 'robos:orderLines': lines, 'robos:orderStatus': status, 'robos:events': events(o, status, reason) } }, ...extra], `orders: ${num(o)} ${status}`);
    return { status, cancelled: cancelled.map(l => ({ line: l.id, qty: remaining(l), for: l.for })) };
  }
  function orders({ status } = {}) { return of('PurchaseOrder').filter(o => !status || [].concat(status).includes(o['robos:orderStatus'])).map(view).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
  function onOrder(itemId) { return round(of('PurchaseOrder').filter(o => OPEN.includes(o['robos:orderStatus'])).flatMap(o => o['robos:orderLines']).filter(l => l.item === itemId).reduce((s, l) => s + remaining(l), 0)); }
  // Low-stock items not already covered by an open order, with how many to order.
  function reorderSuggestions() {
    if (!inventory) return [];
    return inventory.lowStock().map(i => ({ ...i, onOrder: onOrder(i.id) })).filter(i => i.onHand + i.onOrder <= i.reorderPoint).map(i => ({ item: i.id, name: i.name, sku: i.sku, supplier: i.supplier, onHand: i.onHand, onOrder: i.onOrder, reorderPoint: i.reorderPoint, suggestedQty: i.reorderQty || Math.max(1, round(i.reorderPoint - i.onHand - i.onOrder + 1)), unitCost: i.unitCost }));
  }
  return { addSupplier, suppliers, createOrder, draftEdits, addLine, removeLine, placeOrder, receive, cancelOrder, orders, order: id => view(findOrder(id)), onOrder, reorderSuggestions, STATUSES, STATUS_LABELS };
}
module.exports = { createOrders, STATUSES, STATUS_LABELS };

'use strict';
// RobOS Inventory: stock items and a movement ledger. Quantity on hand is the sum of an item's movements
// (receive, issue, adjust), so every change has a dated, reasoned record and nothing is overwritten.
// Money is integer minor units (cents). Records are JSON-LD nodes kept in the app's store (see store.js).
const crypto = require('node:crypto');
const KINDS = ['receive', 'issue', 'adjust'];
function minor(value, label = 'Amount') {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (Number.isSafeInteger(value) && value >= 0) return value;
  const s = String(value).trim().replace(/^\$/, '');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(s)) throw new Error(`${label} must be an amount such as 12.50`);
  const [whole, cents = ''] = s.split('.'); return Number(whole) * 100 + Number(cents.padEnd(2, '0'));
}
function quantity(value, label = 'Quantity', { allowZero = false, allowNegative = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || (!allowNegative && n < 0) || (!allowZero && n === 0) || Math.abs(n) > 1e7) throw new Error(`${label} must be a number${allowZero ? '' : ' other than 0'}`);
  return Math.round(n * 1000) / 1000;
}
const text = (v, max, label, required = true) => { const s = String(v ?? '').trim(); if (required && !s) throw new Error(label + ' is required'); if (s.length > max) throw new Error(label + ' is too long'); return s; };
const ref = id => ({ '@id': id });
const linked = (n, p) => n?.[p]?.['@id'];
function createInventory({ store, namespace = 'app', clock = () => new Date(), currency = 'USD', allowNegative = false } = {}) {
  if (!store || typeof store.nodes !== 'function' || typeof store.commit !== 'function') throw new Error('createInventory needs a store with nodes() and commit()');
  const node = (type, title, props) => ({ '@id': `urn:robos:${namespace}:${type}:${crypto.randomUUID()}`, '@type': 'robos:' + type, 'dcterms:title': title, 'robos:package': namespace, ...props });
  const all = () => store.nodes(), of = type => all().filter(n => n['@type'] === 'robos:' + type);
  const find = id => { const n = of('InventoryItem').find(n => n['@id'] === id); if (!n) throw new Error('Select a stock item'); return n; };
  const movementsOf = id => of('StockMovement').filter(m => linked(m, 'robos:item') === id).sort((a, b) => String(a['schema:startTime']).localeCompare(String(b['schema:startTime'])));
  const onHandOf = id => Math.round(movementsOf(id).reduce((s, m) => s + m['robos:quantity'], 0) * 1000) / 1000;
  function view(n) {
    const onHand = onHandOf(n['@id']), reorderPoint = n['robos:reorderPoint'] ?? null, cost = n['robos:unitCostMinor'] ?? null;
    return { id: n['@id'], sku: n['robos:sku'] || '', name: n['schema:name'], unit: n['robos:unit'] || 'each', location: n['robos:location'] || '', supplier: n['robos:supplierName'] || '', active: n['robos:active'] !== false,
      onHand, reorderPoint, reorderQty: n['robos:reorderQty'] ?? null, unitCost: cost, currency: n['robos:currency'] || currency, value: cost == null ? null : Math.round(Math.max(0, onHand) * cost),
      low: reorderPoint != null && onHand <= reorderPoint, catalog: linked(n, 'robos:catalogItem') || null };
  }
  function addItem(input) {
    const name = text(input.name, 200, 'Item name'), sku = text(input.sku, 100, 'SKU or part number', false);
    const same = sku && of('InventoryItem').find(n => (n['robos:sku'] || '').toLowerCase() === sku.toLowerCase()); if (same) throw new Error(`An item with SKU ${same['robos:sku']} already exists (${same['schema:name']})`);
    if (!sku && of('InventoryItem').some(n => n['schema:name'].toLowerCase() === name.toLowerCase())) throw new Error('An item with this name already exists');
    const reorderPoint = input.reorderPoint === undefined || String(input.reorderPoint).trim() === '' ? null : quantity(input.reorderPoint, 'Reorder point', { allowZero: true });
    const reorderQty = input.reorderQty === undefined || String(input.reorderQty).trim() === '' ? null : quantity(input.reorderQty, 'Reorder quantity');
    const n = node('InventoryItem', name, { 'schema:name': name, 'robos:sku': sku, 'robos:unit': text(input.unit, 30, 'Unit', false) || 'each', 'robos:location': text(input.location, 100, 'Location', false),
      'robos:supplierName': text(input.supplier, 200, 'Supplier', false), 'robos:reorderPoint': reorderPoint, 'robos:reorderQty': reorderQty, 'robos:unitCostMinor': minor(input.unitCost, 'Unit cost'), 'robos:currency': input.currency || currency, 'robos:active': true,
      ...(input.catalog ? { 'robos:catalogItem': ref(input.catalog) } : {}) });
    const edits = [{ op: 'add', node: n }], opening = input.onHand === undefined || String(input.onHand).trim() === '' ? 0 : quantity(input.onHand, 'Opening stock', { allowZero: true });
    if (opening) edits.push({ op: 'add', node: movement(n, 'adjust', opening, { reason: 'Opening stock' }) });
    store.commit(edits, 'inventory: add ' + name); return view(n);
  }
  function updateItem(input) {
    const n = find(input.id), set = {};
    for (const [k, p, max] of [['name', 'schema:name', 200], ['location', 'robos:location', 100], ['supplier', 'robos:supplierName', 200], ['unit', 'robos:unit', 30]]) if (input[k] !== undefined) set[p] = text(input[k], max, k, k === 'name');
    if (input.reorderPoint !== undefined) set['robos:reorderPoint'] = String(input.reorderPoint).trim() === '' ? null : quantity(input.reorderPoint, 'Reorder point', { allowZero: true });
    if (input.reorderQty !== undefined) set['robos:reorderQty'] = String(input.reorderQty).trim() === '' ? null : quantity(input.reorderQty, 'Reorder quantity');
    if (input.unitCost !== undefined) set['robos:unitCostMinor'] = minor(input.unitCost, 'Unit cost');
    if (input.active !== undefined) set['robos:active'] = !!input.active;
    if (!Object.keys(set).length) throw new Error('Nothing to change');
    if (set['schema:name']) set['dcterms:title'] = set['schema:name'];
    store.commit([{ op: 'update', id: n['@id'], set }], 'inventory: update ' + n['schema:name']); return view({ ...n, ...set });
  }
  function movement(item, kind, qty, { unitCost = null, reference = null, referenceLabel = '', reason = '', by = '' } = {}) {
    return node('StockMovement', `${kind} ${qty} × ${item['schema:name']}`, { 'robos:item': ref(item['@id']), 'robos:movementKind': kind, 'robos:quantity': qty, 'robos:unitCostMinor': unitCost, 'robos:currency': item['robos:currency'] || currency,
      'schema:startTime': clock().toISOString(), 'robos:reason': reason, 'robos:performedBy': by, ...(reference ? { 'robos:reference': ref(reference) } : {}), 'robos:referenceLabel': referenceLabel });
  }
  // Build the edits for a movement without saving, so a caller (a purchase order, a repair job) can save
  // its own records in the same commit.
  function movementEdits(input, kind) {
    if (!KINDS.includes(kind)) throw new Error('Unknown stock movement');
    const item = find(input.item); if (item['robos:active'] === false && kind !== 'adjust') throw new Error(item['schema:name'] + ' is no longer stocked');
    const edits = []; let qty;
    if (kind === 'receive') qty = quantity(input.qty, 'Quantity received');
    else if (kind === 'issue') {
      qty = -quantity(input.qty, 'Quantity used'); const have = onHandOf(item['@id']);
      if (!allowNegative && have + qty < 0) throw new Error(`Only ${have} ${item['robos:unit'] || 'each'} of ${item['schema:name']} in stock`);
    } else {
      const reason = text(input.reason, 300, 'Reason for the adjustment');
      qty = input.counted !== undefined && String(input.counted).trim() !== '' ? quantity(input.counted, 'Counted quantity', { allowZero: true }) - onHandOf(item['@id']) : quantity(input.delta, 'Adjustment', { allowNegative: true });
      qty = Math.round(qty * 1000) / 1000; if (!qty) throw new Error('The count matches what is on hand; nothing to adjust');
      input = { ...input, reason };
    }
    const unitCost = kind === 'receive' ? minor(input.unitCost, 'Unit cost') ?? item['robos:unitCostMinor'] ?? null : item['robos:unitCostMinor'] ?? null;
    const m = movement(item, kind, qty, { unitCost, reference: input.reference, referenceLabel: text(input.referenceLabel, 200, 'Reference', false), reason: text(input.reason, 300, 'Note', false), by: text(input.by, 200, 'Name', false) });
    edits.push({ op: 'add', node: m });
    if (kind === 'receive' && unitCost != null && unitCost !== item['robos:unitCostMinor']) edits.push({ op: 'update', id: item['@id'], set: { 'robos:unitCostMinor': unitCost } });
    return { edits, movement: m, item };
  }
  const save = kind => input => { const { edits, movement: m, item } = movementEdits(input, kind); store.commit(edits, `inventory: ${kind} ${Math.abs(m['robos:quantity'])} × ${item['schema:name']}`); return { movement: m['@id'], onHand: onHandOf(item['@id']) }; };
  function items({ includeInactive = false } = {}) { return of('InventoryItem').filter(n => includeInactive || n['robos:active'] !== false).map(view).sort((a, b) => a.name.localeCompare(b.name)); }
  function bySku(sku) { const s = String(sku || '').trim().toLowerCase(); if (!s) return null; const n = of('InventoryItem').find(n => (n['robos:sku'] || '').toLowerCase() === s); return n ? view(n) : null; }
  function movements(id, limit = 50) { find(id); return movementsOf(id).reverse().slice(0, limit).map(m => ({ id: m['@id'], kind: m['robos:movementKind'], qty: m['robos:quantity'], unitCost: m['robos:unitCostMinor'], at: m['schema:startTime'], reason: m['robos:reason'] || '', by: m['robos:performedBy'] || '', reference: linked(m, 'robos:reference'), referenceLabel: m['robos:referenceLabel'] || '' })); }
  function summary() { const list = items(); return { items: list.length, low: list.filter(i => i.low).length, value: list.reduce((s, i) => s + (i.value || 0), 0), currency }; }
  return { addItem, updateItem, receive: save('receive'), issue: save('issue'), adjust: save('adjust'), movementEdits, items, item: id => view(find(id)), bySku, onHand: onHandOf, movements, lowStock: () => items().filter(i => i.low), summary };
}
module.exports = { createInventory, minor, quantity, KINDS };

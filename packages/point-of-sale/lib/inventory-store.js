'use strict';
// Where Point of Sale keeps its stock. On its own, the register keeps stock records in its own store.json (local).
// Embedded in another RobOS app, it can use that app's RobOS Inventory instead (shared): the register then sells
// from the same shelf count as the rest of the business, and every sale, return, delivery and count is a dated
// movement in that inventory's ledger. Both stores hand the register the same record shape:
//   { id, sku, name, unit, onHand, reorderPoint, cost (cents), active }
const round3 = n => Math.round(n * 1000) / 1000;
function localStore(pos) {
  const all = () => pos.state.inventory;
  return {
    shared: false,
    list: () => all(),
    get: id => all().find(i => i.id === id) || null,
    bySku: sku => all().find(i => i.sku === sku) || null,
    create(rec) { all().push(rec); return rec; },
    update(id, rec) { const r = all().find(i => i.id === id); Object.assign(r, rec, { onHand: r.onHand }); return r; },
    // changes: [{ id, delta, kind: 'sale' | 'return' | 'receive' | 'adjust', cost, reason, reference, by }]
    move(changes) { for (const c of changes) { const r = all().find(i => i.id === c.id); if (!r) continue; r.onHand = round3(r.onHand + c.delta); if (c.kind === 'receive' && c.cost !== undefined) r.cost = c.cost; } },
  };
}
function sharedStore(inventory) {
  const view = i => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unit, onHand: i.onHand, reorderPoint: i.reorderPoint ?? 0, cost: i.unitCost ?? 0, active: i.active });
  const get = id => { try { return view(inventory.item(id)); } catch { return null; } };
  const kinds = { sale: 'issue', return: 'adjust', receive: 'receive', adjust: 'adjust' };
  return {
    shared: true,
    list: () => inventory.items({ includeInactive: true }).map(view),
    get,
    bySku: sku => { const i = sku && inventory.bySku(sku); return i ? view(i) : null; },
    create: rec => view(inventory.addItem({ name: rec.name, sku: rec.sku, unit: rec.unit, reorderPoint: rec.reorderPoint, unitCost: rec.cost, onHand: rec.onHand })),
    update(id, rec) { const cur = get(id); inventory.updateItem({ id, name: rec.name, unit: rec.unit, reorderPoint: rec.reorderPoint, unitCost: rec.cost, active: rec.active, ...(rec.sku !== cur?.sku ? { sku: rec.sku } : {}) }); return get(id); },
    move(changes, message) {
      inventory.apply(changes.filter(c => c.delta).map(c => ({ item: c.id, kind: kinds[c.kind], qty: Math.abs(c.delta), delta: c.delta, unitCost: c.kind === 'receive' ? c.cost : undefined,
        reason: c.reason || (c.kind === 'return' ? 'Returned at the counter' : ''), referenceLabel: c.reference || '', by: c.by || '' })), message);
    },
  };
}
module.exports = { localStore, sharedStore, round3 };

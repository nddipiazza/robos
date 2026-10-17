'use strict';

function bump(map, key, patch) {
  const row = map.get(key) || { key, count: 0, qty: 0, sales: 0 };
  row.count += patch.count || 0; row.qty += patch.qty || 0; row.sales += patch.sales || 0;
  map.set(key, row);
}

module.exports = {
  salesReport({ from = '0000', to = '9999' } = {}) {
    const inRange = t => t >= from && t <= to;
    const orders = this.state.orders.filter(o => ['paid', 'partially_refunded', 'refunded'].includes(o.status) && inRange(o.paidAt));
    const byCategory = new Map(), byItem = new Map(), byTender = new Map(), byStaff = new Map(), byType = new Map();
    let gross = 0, discounts = 0, tax = 0, tips = 0, rounding = 0;
    for (const o of orders) {
      gross += o.totals.subtotal; discounts += o.totals.discount; tax += o.totals.tax; tips += o.totals.tip; rounding += o.totals.rounding;
      bump(byType, o.type, { count: 1, sales: o.totals.total });
      bump(byStaff, o.staffId || 'self-service', { count: 1, sales: o.totals.total - o.totals.tip });
      for (const l of o.lines.filter(x => !x.removed)) {
        const item = l.itemId && this.state.items.find(i => i.id === l.itemId);
        const cat = item && this.state.categories.find(c => c.id === item.categoryId);
        bump(byCategory, cat ? cat.name : 'Uncategorized', { qty: l.qty, sales: l.net });
        bump(byItem, l.name, { qty: l.qty, sales: l.net });
      }
      for (const p of o.payments) bump(byTender, p.method, { count: 1, sales: p.amount });
    }
    const refunds = this.state.orders.flatMap(o => o.refunds).filter(r => inRange(r.at));
    for (const r of refunds) for (const part of r.parts) bump(byTender, part.method, { sales: -part.amount });
    const refunded = refunds.reduce((s, r) => s + r.amount, 0);
    const rows = m => [...m.values()].sort((a, b) => b.sales - a.sales);
    const collected = orders.reduce((s, o) => s + o.payments.reduce((a, p) => a + p.amount, 0), 0);
    return {
      from, to, orders: orders.length, grossSales: gross, discounts, netSales: gross - discounts, tax, tips, rounding, refunds: refunded, collected,
      netCollected: collected - refunded, averageTicket: orders.length ? Math.round((gross - discounts) / orders.length) : 0,
      byCategory: rows(byCategory), topItems: rows(byItem).slice(0, 10), byTender: rows(byTender), byStaff: rows(byStaff), byType: rows(byType),
    };
  },

  ordersCsv() {
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['number', 'status', 'type', 'channel', 'paid_at', 'subtotal', 'discount', 'tax', 'tip', 'total', 'tenders']];
    for (const o of this.state.orders) rows.push([o.number, o.status, o.type, o.channel, o.paidAt || '', o.totals.subtotal, o.totals.discount, o.totals.tax, o.totals.tip, o.totals.total, [...new Set(o.payments.map(p => p.method))].join('+')]);
    return rows.map(r => r.map(q).join(',')).join('\n') + '\n';
  },

  inventoryCsv() {
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['sku', 'name', 'unit', 'on_hand', 'reorder_point', 'cost_cents']];
    for (const i of this.state.inventory.filter(x => x.active !== false)) rows.push([i.sku, i.name, i.unit, i.onHand, i.reorderPoint, i.cost]);
    return rows.map(r => r.map(q).join(',')).join('\n') + '\n';
  },
};

'use strict';
const { PosError } = require('./errors');
const { assertCents } = require('./money');

module.exports = {
  currentDrawer(registerId = 'main') {
    return this.state.drawers.find(d => d.registerId === registerId && d.status === 'open') || null;
  },

  openDrawer({ registerId = 'main', float = 0 } = {}, staff) {
    assertCents(float, 'opening float');
    if (this.currentDrawer(registerId)) throw new PosError('drawer_open', 'This register already has an open drawer', 409);
    const drawer = { id: this.id('drw'), registerId, status: 'open', openedAt: this.iso(), openedBy: staff.id, float, movements: [] };
    this.state.drawers.push(drawer);
    this.audit(staff, 'drawer.open', drawer.id, String(float));
    this.save();
    return this.drawerSummary(drawer);
  },

  // Paid in (adding change) and paid out (petty cash, tip-out, bank drop) both need a reason.
  cashMovement({ registerId = 'main', type, amount, reason, managerPin }, staff) {
    const approver = this.authorize(staff, 'cash.movement', { managerPin });
    const drawer = this.currentDrawer(registerId);
    if (!drawer) throw new PosError('drawer_closed', 'Open the cash drawer first', 409);
    if (!['paid_in', 'paid_out'].includes(type)) throw new PosError('invalid_movement', 'Type must be paid_in or paid_out');
    assertCents(amount, 'amount');
    if (amount === 0) throw new PosError('invalid_amount', 'Enter an amount');
    if (!reason || !String(reason).trim()) throw new PosError('reason_required', 'A reason is required');
    if (type === 'paid_out' && amount > this.drawerSummary(drawer).expected) throw new PosError('insufficient_cash', 'There is not that much cash in the drawer', 409);
    drawer.movements.push({ id: this.id('mv'), type, amount, reason: String(reason).trim(), staffId: staff.id, approvedBy: approver.id, at: this.iso() });
    this.audit(staff, `drawer.${type}`, drawer.id, `${amount} ${reason}`);
    this.save();
    return this.drawerSummary(drawer);
  },

  drawerSummary(drawer) {
    let cashSales = 0, cashRefunds = 0, sales = 0;
    for (const o of this.state.orders) {
      for (const p of o.payments) if (p.drawerId === drawer.id) { cashSales += p.cashNet; sales++; }
      for (const r of o.refunds) for (const part of r.parts) if (part.drawerId === drawer.id) cashRefunds += part.amount;
    }
    const paidIn = drawer.movements.filter(m => m.type === 'paid_in').reduce((s, m) => s + m.amount, 0);
    const paidOut = drawer.movements.filter(m => m.type === 'paid_out').reduce((s, m) => s + m.amount, 0);
    const expected = drawer.float + cashSales - cashRefunds + paidIn - paidOut;
    return { ...JSON.parse(JSON.stringify(drawer)), cashSales, cashRefunds, paidIn, paidOut, cashPayments: sales, expected };
  },

  // counted: total cents, or denominations: { "2000": 3, "100": 4 } (bill/coin value in cents -> how many).
  closeDrawer({ registerId = 'main', counted, denominations, managerPin }, staff) {
    const drawer = this.currentDrawer(registerId);
    if (!drawer) throw new PosError('drawer_closed', 'There is no open drawer on this register', 409);
    if (denominations) {
      counted = Object.entries(denominations).reduce((s, [value, n]) => {
        if (!this.settings.cash.denominations.includes(Number(value)) || !Number.isInteger(n) || n < 0) throw new PosError('invalid_count', `Bad count for ${value}`);
        return s + Number(value) * n;
      }, 0);
    }
    assertCents(counted, 'counted cash');
    const summary = this.drawerSummary(drawer);
    const variance = counted - summary.expected;
    if (Math.abs(variance) > this.settings.cash.varianceThreshold) this.authorize(staff, 'drawer.close.variance', { managerPin });
    Object.assign(drawer, { status: 'closed', closedAt: this.iso(), closedBy: staff.id, counted, expected: summary.expected, variance });
    this.audit(staff, 'drawer.close', drawer.id, `variance ${variance}`);
    this.save();
    return this.zReport(drawer.id);
  },

  zReport(drawerId) {
    const drawer = this.find('drawers', drawerId, 'drawer');
    const from = drawer.openedAt, to = drawer.closedAt || this.iso();
    return { drawer: this.drawerSummary(drawer), sales: this.salesReport({ from, to }) };
  },

  listDrawers() { return this.state.drawers.map(d => this.drawerSummary(d)).reverse(); },
};

'use strict';
const { PosError } = require('./errors');
const { assertCents, percentOf, roundToIncrement, allocate, splitEvenly } = require('./money');
const { builtin } = require('./providers');

const PREP_FLOW = { new: ['preparing', 'ready', 'served'], preparing: ['ready', 'served'], ready: ['served'] };
const round3 = n => Math.round(n * 1000) / 1000;
const locks = new WeakMap();

function activeLines(order) { return order.lines.filter(l => !l.removed); }

module.exports = {
  provider(id) {
    const p = this.providers[id] || builtin[id];
    if (!p) throw new PosError('unknown_provider', `No card provider named ${id}`);
    return p;
  },

  // ---- order lifecycle ----------------------------------------------------
  createOrder({ type, tabName, customerName, channel = 'register' } = {}, staff) {
    const allowed = [...this.settings.orderTypes, 'tab', 'retail'];
    const orderType = type || this.settings.orderTypes[0] || 'retail';
    if (!allowed.includes(orderType)) throw new PosError('invalid_order_type', `Order type must be one of ${allowed.join(', ')}`);
    if (channel === 'register' && !staff) throw new PosError('unauthorized', 'Sign in with your PIN', 401);
    const order = {
      id: this.id('ord'), number: ++this.state.counters.order, type: orderType, channel, status: 'open',
      tabName: tabName ? String(tabName).trim() : '', customerName: customerName ? String(customerName).trim() : '',
      staffId: staff ? staff.id : null, createdAt: this.iso(), lines: [], discounts: [], tipSpec: null, rounding: 0,
      ageVerifiedBy: null, payments: [], refunds: [], totals: null, awaitingPayment: false,
    };
    this.state.orders.push(order);
    this.recompute(order);
    this.audit(staff, 'order.create', order.id, orderType);
    this.save();
    return this.getOrder(order.id);
  },

  getOrder(id) { return JSON.parse(JSON.stringify(this.find('orders', id, 'order'))); },

  findByNumber(number) {
    const order = this.state.orders.find(o => o.number === Number(number));
    if (!order) throw new PosError('not_found', 'No order with that number', 404);
    return this.getOrder(order.id);
  },

  listOrders({ status, channel, limit = 200 } = {}) {
    let orders = this.state.orders;
    if (status) orders = orders.filter(o => o.status === status);
    if (channel) orders = orders.filter(o => o.channel === channel);
    return orders.slice(-limit).reverse().map(o => JSON.parse(JSON.stringify(o)));
  },

  // Baskets still being built at a kiosk are not the staff's business until the customer chooses pay-at-counter.
  openOrders() { return this.listOrders({ status: 'open' }).filter(o => (o.lines.some(l => !l.removed) || o.tabName) && (o.channel !== 'kiosk' || o.awaitingPayment)); },

  openEditable(orderId) {
    const order = this.find('orders', orderId, 'order');
    if (order.status !== 'open') throw new PosError('order_closed', `Order ${order.number} is ${order.status}`, 409);
    return order;
  },

  // ---- adding things ------------------------------------------------------
  addLine(orderId, input, staff) {
    const order = this.openEditable(orderId);
    const { item, variant } = this.resolveItem(input);
    const qty = input.qty === undefined ? 1 : input.qty;
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new PosError('invalid_quantity', 'Quantity must be a whole number from 1 to 999');
    if (item.variants.length && !variant) throw new PosError('variant_required', `Choose an option for ${item.name}`);
    const mods = this.resolveModifiers(item, input.modifiers || []);
    if (item.ageRestricted && order.channel === 'kiosk' && !this.settings.kiosk.allowAgeRestricted) throw new PosError('age_restricted', 'Age-restricted items must be rung up by a team member', 403);
    const list = variant && variant.price !== null ? variant.price : item.price;
    const rule = this.activePriceRule(item);
    const unit = rule ? list - percentOf(list, Math.round(rule.percentOff * 100)) : list;
    const tax = item.taxId ? this.state.taxes.find(t => t.id === item.taxId) : null;
    const line = {
      id: this.id('ln'), itemId: item.id, variantId: variant ? variant.id : null, name: item.name, variantName: variant ? variant.name : '',
      sku: variant && variant.sku || item.sku, qty, listPrice: list, unitPrice: unit, priceRule: rule ? rule.name : null,
      modifiers: mods, note: input.note ? String(input.note).slice(0, 140) : '', taxId: tax ? tax.id : null, taxName: tax ? tax.name : '', taxRateBp: tax ? tax.rateBp : 0,
      station: item.station, ageRestricted: item.ageRestricted, removed: false, comped: false, sent: false, prep: null, refundedQty: 0, refundedAmount: 0, settled: false,
    };
    // Merge an identical, still-unsent line so repeated taps/scans stack instead of cluttering the ticket.
    const twin = order.lines.find(l => !l.removed && !l.sent && !l.comped && !l.settled && l.itemId === line.itemId && l.variantId === line.variantId && !l.note && !line.note && sameMods(l, line));
    if (twin) twin.qty += qty; else order.lines.push(line);
    this.recompute(order);
    try { this.assertStock(order); } catch (e) { if (twin) twin.qty -= qty; else order.lines.pop(); this.recompute(order); throw e; }
    this.save();
    return this.getOrder(orderId);
  },

  addCustomLine(orderId, { name, price, taxId, qty = 1 }, staff) {
    const order = this.openEditable(orderId);
    if (!name || !String(name).trim()) throw new PosError('invalid_item', 'Describe the item');
    assertCents(price, 'price');
    const tax = taxId ? this.find('taxes', taxId, 'tax') : (this.state.taxes[0] || null);
    order.lines.push({
      id: this.id('ln'), itemId: null, variantId: null, name: String(name).trim(), variantName: '', sku: '', qty, listPrice: price, unitPrice: price, priceRule: null, modifiers: [], note: '',
      taxId: tax ? tax.id : null, taxName: tax ? tax.name : '', taxRateBp: tax ? tax.rateBp : 0, station: null, ageRestricted: false, removed: false, comped: false, sent: false, prep: null, refundedQty: 0, refundedAmount: 0, settled: false,
    });
    this.recompute(order);
    this.audit(staff, 'order.custom_line', orderId, `${name} ${price}`);
    this.save();
    return this.getOrder(orderId);
  },

  scan(orderId, code, staff) {
    const hit = this.findItem(code);
    if (!hit) throw new PosError('unknown_code', `Nothing matches ${code}`, 404);
    return this.addLine(orderId, { itemId: hit.item.id, variantId: hit.variant && hit.variant.id }, staff);
  },

  resolveItem(input) {
    if (input.itemId) {
      const item = this.state.items.find(i => i.id === input.itemId && i.active !== false);
      if (!item) throw new PosError('not_found', 'Unknown item', 404);
      const variant = input.variantId ? item.variants.find(v => v.id === input.variantId) : null;
      if (input.variantId && !variant) throw new PosError('not_found', 'Unknown option', 404);
      return { item, variant };
    }
    const hit = input.code && this.findItem(input.code);
    if (!hit) throw new PosError('not_found', 'Unknown item', 404);
    return hit;
  },

  resolveModifiers(item, optionIds) {
    const groups = item.modifierGroupIds.map(id => this.state.modifierGroups.find(g => g.id === id)).filter(g => g && g.active !== false);
    const chosen = [];
    for (const optionId of optionIds) {
      const group = groups.find(g => g.options.some(o => o.id === optionId));
      if (!group) throw new PosError('invalid_modifier', 'That option does not belong to this item');
      chosen.push({ groupId: group.id, option: group.options.find(o => o.id === optionId) });
    }
    for (const group of groups) {
      const n = chosen.filter(c => c.groupId === group.id).length;
      if (n < group.min) throw new PosError('modifier_required', `Choose ${group.name}`);
      if (n > group.max) throw new PosError('modifier_limit', `Choose at most ${group.max} for ${group.name}`);
    }
    return chosen.map(c => ({ id: c.option.id, groupId: c.groupId, name: c.option.name, price: c.option.price }));
  },

  activePriceRule(item) {
    const d = this.now();
    const minutes = d.getHours() * 60 + d.getMinutes();
    const toMin = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    return this.state.priceRules.find(r => r.active !== false && r.days.includes(d.getDay()) && minutes >= toMin(r.start) && minutes < toMin(r.end)
      && (r.itemIds.includes(item.id) || r.categoryIds.includes(item.categoryId))) || null;
  },

  setLineQty(orderId, lineId, qty, staff) {
    const order = this.openEditable(orderId);
    const line = order.lines.find(l => l.id === lineId && !l.removed);
    if (!line) throw new PosError('not_found', 'Unknown line', 404);
    if (line.sent) throw new PosError('line_sent', 'This item was already sent; ask a manager to void it', 409);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new PosError('invalid_quantity', 'Quantity must be a whole number from 1 to 999');
    const before = line.qty;
    line.qty = qty;
    this.recompute(order);
    try { this.assertStock(order); } catch (e) { line.qty = before; this.recompute(order); throw e; }
    this.save();
    return this.getOrder(orderId);
  },

  removeLine(orderId, lineId, { reason, managerPin } = {}, staff) {
    const order = this.openEditable(orderId);
    const line = order.lines.find(l => l.id === lineId && !l.removed);
    if (!line) throw new PosError('not_found', 'Unknown line', 404);
    if (line.settled) throw new PosError('line_settled', 'This item was already paid for', 409);
    if (line.sent) {
      const approver = this.authorize(staff, 'void.sent', { managerPin });
      if (!reason) throw new PosError('reason_required', 'A reason is required to void a sent item');
      line.removed = true; line.voidReason = reason; line.voidedBy = approver.id;
      this.audit(staff, 'order.void_line', lineId, reason);
    } else {
      order.lines.splice(order.lines.indexOf(line), 1);
    }
    this.recompute(order);
    this.save();
    return this.getOrder(orderId);
  },

  compLine(orderId, lineId, { reason, managerPin } = {}, staff) {
    const order = this.openEditable(orderId);
    const approver = this.authorize(staff, 'discount.any', { managerPin });
    if (!reason) throw new PosError('reason_required', 'A reason is required to comp an item');
    const line = order.lines.find(l => l.id === lineId && !l.removed);
    if (!line) throw new PosError('not_found', 'Unknown line', 404);
    line.comped = true; line.compReason = reason; line.compBy = approver.id;
    this.recompute(order);
    this.audit(staff, 'order.comp', lineId, reason);
    this.save();
    return this.getOrder(orderId);
  },

  applyDiscount(orderId, input, staff) {
    const order = this.openEditable(orderId);
    let discount;
    if (input.code) {
      const code = String(input.code).trim().toUpperCase();
      const promo = this.state.promotions.find(p => p.active !== false && p.code === code);
      if (!promo) throw new PosError('invalid_code', `${code} is not a valid code`, 404);
      if (order.discounts.some(d => d.promoId === promo.id)) throw new PosError('duplicate_discount', `${code} is already applied`, 409);
      if (order.totals.subtotal < promo.minSubtotal) throw new PosError('minimum_not_met', `${code} needs a subtotal of at least ${(promo.minSubtotal / 100).toFixed(2)}`);
      discount = { id: this.id('dsc'), promoId: promo.id, name: promo.code, type: promo.type, value: promo.value };
    } else {
      if (!['percent', 'fixed'].includes(input.type)) throw new PosError('invalid_discount', 'Discount type must be percent or fixed');
      if (input.type === 'percent' ? !(input.value > 0 && input.value <= 100) : !Number.isInteger(input.value) || input.value <= 0) throw new PosError('invalid_discount', 'Enter a valid discount');
      const percent = input.type === 'percent' ? input.value : (input.value / Math.max(1, order.totals.subtotal)) * 100;
      let approver = staff;
      if (percent > this.settings.discounts.cashierMaxPercent) approver = this.authorize(staff, 'discount.any', { managerPin: input.managerPin });
      if (!input.reason) throw new PosError('reason_required', 'A reason is required for a manual discount');
      discount = { id: this.id('dsc'), name: input.reason, type: input.type, value: input.value, by: approver.id };
    }
    order.discounts.push(discount);
    this.recompute(order);
    this.audit(staff, 'order.discount', orderId, discount.name);
    this.save();
    return this.getOrder(orderId);
  },

  removeDiscount(orderId, discountId, staff) {
    const order = this.openEditable(orderId);
    order.discounts = order.discounts.filter(d => d.id !== discountId);
    this.recompute(order);
    this.save();
    return this.getOrder(orderId);
  },

  setTip(orderId, { percent, amount }, staff) {
    const order = this.openEditable(orderId);
    if (percent !== undefined && percent !== null) {
      if (!(percent >= 0 && percent <= 100)) throw new PosError('invalid_tip', 'Tip percent must be between 0 and 100');
      order.tipSpec = { percent };
    } else if (amount !== undefined && amount !== null) {
      assertCents(amount, 'tip');
      order.tipSpec = { amount };
    } else order.tipSpec = null;
    this.recompute(order);
    this.save();
    return this.getOrder(orderId);
  },

  verifyAge(orderId, staff) {
    const order = this.openEditable(orderId);
    order.ageVerifiedBy = staff.id;
    this.audit(staff, 'order.age_verified', orderId);
    this.save();
    return this.getOrder(orderId);
  },

  assertAge(order) {
    if (activeLines(order).some(l => l.ageRestricted) && !order.ageVerifiedBy) {
      throw new PosError('age_verification_required', 'Check ID and confirm the customer is of age before payment');
    }
  },

  // ---- stock --------------------------------------------------------------
  requirements(order) {
    const need = new Map();
    const add = (id, qty) => need.set(id, round3((need.get(id) || 0) + qty));
    for (const line of activeLines(order)) {
      const item = line.itemId && this.state.items.find(i => i.id === line.itemId);
      if (!item) continue;
      const variant = line.variantId && item.variants.find(v => v.id === line.variantId);
      const direct = variant && variant.inventoryId || item.inventoryId;
      if (direct) add(direct, line.qty);
      for (const r of item.recipe) add(r.inventoryId, r.qty * line.qty);
      for (const m of line.modifiers) {
        const opt = this.state.modifierGroups.flatMap(g => g.options).find(o => o.id === m.id);
        if (opt) for (const r of opt.recipe) add(r.inventoryId, r.qty * line.qty);
      }
    }
    return need;
  },

  assertStock(order) {
    if (this.settings.inventory.allowNegativeStock) return;
    for (const [id, qty] of this.requirements(order)) {
      const rec = this.inv.get(id);
      if (rec && rec.onHand < qty) throw new PosError('out_of_stock', `Not enough ${rec.name} in stock (${rec.onHand} left)`, 409);
    }
  },

  // ---- totals -------------------------------------------------------------
  recompute(order) {
    const lines = activeLines(order);
    for (const l of lines) {
      const mods = l.modifiers.reduce((s, m) => s + m.price, 0);
      l.gross = l.comped ? 0 : (l.unitPrice + mods) * l.qty;
    }
    const subtotal = lines.reduce((s, l) => s + l.gross, 0);
    let discountTotal = 0;
    for (const d of order.discounts) {
      const room = subtotal - discountTotal;
      d.amount = Math.min(room, d.type === 'percent' ? percentOf(subtotal, Math.round(d.value * 100)) : d.value);
      discountTotal += d.amount;
    }
    const shares = allocate(discountTotal, lines.map(l => l.gross));
    const inclusive = this.settings.tax.inclusive;
    const breakdown = new Map();
    let tax = 0, paidLines = 0;
    lines.forEach((l, i) => {
      l.discount = shares[i];
      l.net = l.gross - l.discount;
      l.tax = inclusive ? l.net - Math.round((l.net * 10000) / (10000 + l.taxRateBp)) : percentOf(l.net, l.taxRateBp);
      l.total = inclusive ? l.net : l.net + l.tax;
      tax += l.tax;
      if (l.taxName) breakdown.set(l.taxName, { name: l.taxName, rateBp: l.taxRateBp, amount: (breakdown.get(l.taxName) || { amount: 0 }).amount + l.tax });
      paidLines += l.total;
    });
    const taxable = subtotal - discountTotal;
    let tip = 0;
    if (order.tipSpec) tip = order.tipSpec.percent !== undefined ? percentOf(taxable, Math.round(order.tipSpec.percent * 100)) : order.tipSpec.amount;
    const total = paidLines + tip + order.rounding;
    const paid = order.payments.reduce((s, p) => s + p.amount, 0);
    order.totals = { subtotal, discount: discountTotal, tax, taxInclusive: inclusive, taxBreakdown: [...breakdown.values()], tip, rounding: order.rounding, total, paid, due: Math.max(0, total - paid) };
    return order.totals;
  },

  amountForLines(order, lineIds) {
    const lines = activeLines(order);
    const picked = lineIds.map(id => {
      const l = lines.find(x => x.id === id);
      if (!l) throw new PosError('not_found', 'Unknown line', 404);
      if (l.settled) throw new PosError('line_settled', `${l.name} is already paid for`, 409);
      return l;
    });
    const tipShares = allocate(order.totals.tip, lines.map(l => l.total));
    return picked.reduce((s, l) => s + l.total + tipShares[lines.indexOf(l)], 0);
  },

  splitPreview(orderId, { parts }) {
    return splitEvenly(this.find('orders', orderId, 'order').totals.due, parts);
  },

  // ---- payment ------------------------------------------------------------
  async pay(orderId, input, staff) {
    const order = this.find('orders', orderId, 'order');
    if (order.status !== 'open') throw new PosError('order_closed', `Order ${order.number} is ${order.status}`, 409);
    if (locks.get(order)) throw new PosError('busy', 'This order is being paid', 409);
    locks.set(order, true);
    try {
      if (!activeLines(order).length) throw new PosError('empty_order', 'Add items before taking payment');
      this.assertAge(order);
      this.assertStock(order);
      if (input.tip !== undefined) { order.tipSpec = input.tip && typeof input.tip === 'object' ? input.tip : { amount: assertCents(input.tip, 'tip') }; }
      this.recompute(order);
      const due = order.totals.due;
      if (due <= 0) throw new PosError('nothing_due', 'Nothing left to pay', 409);
      let amount = input.amount !== undefined ? Math.min(assertCents(input.amount, 'amount'), due) : due;
      if (input.lineIds && input.lineIds.length) amount = Math.min(this.amountForLines(order, input.lineIds), due);
      if (amount <= 0) throw new PosError('invalid_amount', 'Enter an amount to pay');
      const payment = { id: this.id('pay'), at: this.iso(), staffId: staff ? staff.id : null, method: input.method, amount: 0 };
      let change = 0;
      if (input.method === 'cash') {
        change = this.takeCash(order, input, amount, due, payment, staff);
      } else if (input.method === 'card') {
        if (!this.settings.card.enabled) throw new PosError('card_disabled', 'Card payments are turned off');
        const providerId = input.provider || this.settings.card.provider;
        const auth = await this.provider(providerId).authorize({ amount, currency: this.settings.business.currency, order, token: input.token, reference: input.reference });
        if (auth.status !== 'approved') { this.audit(staff, 'payment.declined', orderId, auth.reason); this.save(); throw new PosError('card_declined', `Card declined (${auth.reason || 'declined'})`, 402); }
        Object.assign(payment, { amount, provider: providerId, reference: auth.reference });
      } else throw new PosError('invalid_method', 'Payment method must be cash or card');
      order.payments.push(payment);
      if (input.lineIds) for (const id of input.lineIds) order.lines.find(l => l.id === id).settled = true;
      this.recompute(order);
      if (order.totals.due === 0) this.finalize(order, staff);
      this.audit(staff, 'payment', orderId, `${payment.method} ${payment.amount}`);
      this.save();
      return { order: this.getOrder(orderId), payment: { ...payment }, change };
    } finally { locks.delete(order); }
  },

  takeCash(order, input, amount, due, payment, staff) {
    const cash = this.settings.cash;
    if (!cash.enabled) throw new PosError('cash_disabled', 'Cash payments are turned off');
    if (staff) this.authorize(staff, 'cash.tender');
    const drawer = this.currentDrawer(input.registerId);
    if (!drawer && cash.requireOpenDrawer) throw new PosError('drawer_closed', 'Open the cash drawer before taking cash', 409);
    const wholeBalance = input.amount === undefined && !(input.lineIds && input.lineIds.length);
    const target = wholeBalance ? roundToIncrement(due, cash.rounding) : amount;
    const tendered = input.tendered === undefined ? target : assertCents(input.tendered, 'tendered');
    if (tendered > cash.maxTender) throw new PosError('tender_too_large', 'That is more cash than this register accepts');
    if (tendered >= target) {
      if (wholeBalance && target !== due) { order.rounding += target - due; this.recompute(order); }
      payment.amount = target;
      payment.tendered = tendered;
      payment.change = tendered - target;
    } else {
      payment.amount = Math.min(tendered, due);
      payment.tendered = tendered;
      payment.change = tendered - payment.amount;
    }
    if (payment.amount <= 0) throw new PosError('invalid_amount', 'Enter the cash received');
    payment.cashNet = payment.tendered - payment.change;
    payment.drawerId = drawer ? drawer.id : null;
    return payment.change;
  },

  finalize(order, staff) {
    this.inv.move([...this.requirements(order)].filter(([id]) => this.inv.get(id)).map(([id, qty]) => ({ id, delta: -qty, kind: 'sale', reference: `Counter sale #${order.number}`, by: staff && staff.name })), `point of sale: sale #${order.number}`);
    order.status = 'paid';
    order.paidAt = this.iso();
    order.awaitingPayment = false;
    if (this.settings.autoSendOnPay) this.sendLines(order);
    if (activeLines(order).some(l => !l.station)) for (const l of activeLines(order)) if (!l.station) l.sent = true;
  },

  voidOrder(orderId, { reason, managerPin } = {}, staff) {
    const order = this.openEditable(orderId);
    if (!reason) throw new PosError('reason_required', 'A reason is required to void an order');
    if (order.lines.some(l => l.sent && !l.removed) || order.payments.length) this.authorize(staff, 'void.sent', { managerPin });
    if (order.payments.length) throw new PosError('has_payments', 'Refund the payments instead of voiding', 409);
    order.status = 'void';
    order.voidReason = reason;
    this.audit(staff, 'order.void', orderId, reason);
    this.save();
    return this.getOrder(orderId);
  },

  // ---- refunds ------------------------------------------------------------
  async refund(orderId, input, staff) {
    const order = this.find('orders', orderId, 'order');
    const approver = this.authorize(staff, 'refund', { managerPin: input.managerPin });
    if (!['paid', 'partially_refunded'].includes(order.status)) throw new PosError('not_refundable', `Order ${order.number} is ${order.status}`, 409);
    if (!input.reason || !String(input.reason).trim()) throw new PosError('reason_required', 'A reason is required for a refund');
    if (locks.get(order)) throw new PosError('busy', 'This order is being processed', 409);
    locks.set(order, true);
    try {
      const picks = input.all ? activeLines(order).map(l => ({ lineId: l.id, qty: l.qty - l.refundedQty })).filter(p => p.qty > 0) : (input.lines || []);
      if (!picks.length) throw new PosError('nothing_to_refund', 'Choose what to refund');
      let amount = 0;
      const detail = [];
      for (const pick of picks) {
        const line = activeLines(order).find(l => l.id === pick.lineId);
        if (!line) throw new PosError('not_found', 'Unknown line', 404);
        if (!Number.isInteger(pick.qty) || pick.qty < 1 || pick.qty > line.qty - line.refundedQty) throw new PosError('invalid_quantity', `Only ${line.qty - line.refundedQty} of ${line.name} can still be refunded`);
        const cumulative = Math.round((line.total * (line.refundedQty + pick.qty)) / line.qty);
        const part = cumulative - line.refundedAmount;
        line.refundedQty += pick.qty; line.refundedAmount = cumulative;
        amount += part;
        detail.push({ lineId: line.id, qty: pick.qty, amount: part });
      }
      const fully = activeLines(order).every(l => l.refundedQty === l.qty);
      const alreadyRefunded = order.refunds.reduce((s, r) => s + r.amount, 0);
      const paid = order.payments.reduce((s, p) => s + p.amount, 0);
      if (fully) amount = paid - alreadyRefunded; // tip and cash rounding go back with the last item
      amount = Math.min(amount, paid - alreadyRefunded);
      const parts = await this.refundToTenders(order, amount, input.method, staff);
      const restocked = [];
      if (input.restock !== false) {
        for (const d of detail) {
          const line = order.lines.find(l => l.id === d.lineId);
          const item = line.itemId && this.state.items.find(i => i.id === line.itemId);
          const variant = item && line.variantId && item.variants.find(v => v.id === line.variantId);
          const invId = item && (variant && variant.inventoryId || item.inventoryId);
          if (invId && this.inv.get(invId)) restocked.push({ inventoryId: invId, qty: d.qty });
        }
      }
      this.inv.move(restocked.map(r => ({ id: r.inventoryId, delta: r.qty, kind: 'return', reason: `Returned on sale #${order.number}: ${String(input.reason).trim()}`, reference: `Counter sale #${order.number}`, by: staff && staff.name })), `point of sale: return on sale #${order.number}`);
      order.refunds.push({ id: this.id('rf'), at: this.iso(), staffId: staff.id, approvedBy: approver.id, reason: String(input.reason).trim(), lines: detail, amount, parts, restocked });
      order.status = fully ? 'refunded' : 'partially_refunded';
      this.audit(staff, 'order.refund', orderId, `${amount} ${input.reason}`);
      this.save();
      return this.getOrder(orderId);
    } finally { locks.delete(order); }
  },

  async refundToTenders(order, amount, preferred, staff) {
    const methods = ['cash', 'card'];
    const first = preferred || (order.payments[order.payments.length - 1] || {}).method;
    const sequence = [first, ...methods.filter(m => m !== first)];
    const parts = [];
    let left = amount;
    for (const method of sequence) {
      if (left <= 0) break;
      const paid = order.payments.filter(p => p.method === method).reduce((s, p) => s + p.amount, 0);
      const back = order.refunds.flatMap(r => r.parts).filter(p => p.method === method).reduce((s, p) => s + p.amount, 0)
        + parts.filter(p => p.method === method).reduce((s, p) => s + p.amount, 0);
      const take = Math.min(left, paid - back);
      if (take <= 0) continue;
      if (method === 'cash') {
        const drawer = this.currentDrawer();
        if (!drawer && this.settings.cash.requireOpenDrawer) throw new PosError('drawer_closed', 'Open the cash drawer to refund cash', 409);
        parts.push({ method, amount: take, drawerId: drawer ? drawer.id : null });
      } else {
        const original = order.payments.filter(p => p.method === 'card').pop();
        const res = await this.provider(original.provider).refund({ reference: original.reference, amount: take });
        parts.push({ method, amount: take, reference: res.reference });
      }
      left -= take;
    }
    if (left > 0) throw new PosError('refund_exceeds_payment', 'Refund is more than was paid', 409);
    return parts;
  },

  // ---- kitchen / bar / barista queue -------------------------------------
  sendLines(order) {
    let count = 0;
    for (const l of activeLines(order)) {
      if (l.sent) continue;
      l.sent = true;
      if (l.station) { l.prep = 'new'; l.sentAt = this.iso(); count++; }
    }
    return count;
  },

  sendOrder(orderId, staff) {
    const order = this.find('orders', orderId, 'order');
    if (!['open', 'paid'].includes(order.status)) throw new PosError('order_closed', `Order ${order.number} is ${order.status}`, 409);
    const sent = this.sendLines(order);
    this.recompute(order);
    this.audit(staff, 'order.send', orderId, String(sent));
    this.save();
    return { sent, order: this.getOrder(orderId) };
  },

  queue({ station } = {}) {
    const out = [];
    for (const o of this.state.orders) {
      if (o.status === 'void') continue;
      const lines = o.lines.filter(l => !l.removed && ['new', 'preparing', 'ready'].includes(l.prep) && (!station || l.station === station));
      if (lines.length) out.push({ orderId: o.id, number: o.number, type: o.type, tabName: o.tabName, customerName: o.customerName, paid: o.status === 'paid', lines: JSON.parse(JSON.stringify(lines)) });
    }
    return out.sort((a, b) => (a.lines[0].sentAt < b.lines[0].sentAt ? -1 : 1));
  },

  setPrepStatus(orderId, { lineIds, status }, staff) {
    const order = this.find('orders', orderId, 'order');
    let changed = 0;
    for (const l of order.lines) {
      if (l.removed || !PREP_FLOW[l.prep] || (lineIds && !lineIds.includes(l.id))) continue;
      if (!PREP_FLOW[l.prep].includes(status)) continue;
      l.prep = status; l[`${status}At`] = this.iso(); changed++;
    }
    if (!changed) throw new PosError('invalid_transition', 'Nothing to move to that status', 409);
    this.save();
    return this.getOrder(orderId);
  },

  // Order numbers whose prepared items are all ready or picked up, with at least one still waiting for pick-up.
  readyBoard() {
    return this.state.orders.filter(o => o.status !== 'void').filter(o => {
      const prepared = o.lines.filter(l => !l.removed && l.prep);
      return prepared.some(l => l.prep === 'ready') && prepared.every(l => ['ready', 'served'].includes(l.prep));
    }).map(o => o.number);
  },
};

function sameMods(a, b) {
  const key = l => l.modifiers.map(m => m.id).sort().join(',');
  return key(a) === key(b);
}

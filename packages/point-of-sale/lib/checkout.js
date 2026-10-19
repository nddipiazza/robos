'use strict';
const { PosError } = require('./errors');

// Checkout sessions follow the shape of the open Agentic Commerce Protocol checkout API
// (create / retrieve / update / complete / cancel), with amounts in integer minor units.
module.exports = {
  // ---- self-checkout kiosk ------------------------------------------------
  kioskMenu() {
    const k = this.settings.kiosk;
    if (!k.enabled) throw new PosError('kiosk_disabled', 'Self-checkout is not available', 403);
    const items = this.state.items.filter(i => i.active !== false && (k.allowAgeRestricted || !i.ageRestricted)).map(i => ({ ...i, soldOut: this.isSoldOut(i) }));
    const usedGroups = new Set(items.flatMap(i => i.modifierGroupIds));
    return JSON.parse(JSON.stringify({
      business: this.settings.business, kiosk: k, tips: this.settings.tips, orderTypes: this.settings.orderTypes,
      categories: this.state.categories.filter(c => c.active !== false && items.some(i => i.categoryId === c.id)),
      items, modifierGroups: this.state.modifierGroups.filter(g => g.active !== false && usedGroups.has(g.id)),
      // A standalone terminal needs a person to key in the approval code, so unattended card payment needs a gateway provider.
      card: { enabled: this.settings.card.enabled && k.allowCard && this.settings.card.provider !== 'manual', provider: this.settings.card.provider },
    }));
  },

  // Resolve a scanned code to a menu item for the kiosk's own scanner. Only items the kiosk may sell are revealed.
  kioskLookup(code) {
    const k = this.settings.kiosk;
    if (!k.enabled) throw new PosError('kiosk_disabled', 'Self-checkout is not available', 403);
    const hit = this.findItem(code);
    if (!hit || (hit.item.ageRestricted && !k.allowAgeRestricted)) throw new PosError('unknown_code', 'We could not find that item. Ask a team member for help.', 404);
    if (this.isSoldOut(hit.item)) throw new PosError('out_of_stock', `${hit.item.name} is sold out`, 409);
    return { itemId: hit.item.id, variantId: hit.variant ? hit.variant.id : null, name: hit.item.name, needsChoice: !hit.variant && hit.item.variants.length > 0 };
  },

  isSoldOut(item) {
    if (this.settings.inventory.allowNegativeStock) return false;
    const enough = (id, qty) => { const rec = this.state.inventory.find(i => i.id === id); return !rec || rec.onHand >= qty; };
    if (item.variants.length) return item.variants.every(v => v.inventoryId && !enough(v.inventoryId, 1));
    if (item.inventoryId && !enough(item.inventoryId, 1)) return true;
    return item.recipe.some(r => !enough(r.inventoryId, r.qty));
  },

  kioskCreateOrder({ type, lines = [], customerName } = {}) {
    if (!this.settings.kiosk.enabled) throw new PosError('kiosk_disabled', 'Self-checkout is not available', 403);
    if (!lines.length) throw new PosError('empty_order', 'Add something to your order first');
    this.pruneKioskOrders();
    const order = this.createOrder({ type: type || this.settings.orderTypes[0], channel: 'kiosk', customerName }, null);
    try {
      for (const l of lines) this.addLine(order.id, l, null);
    } catch (e) { this.find('orders', order.id).status = 'void'; this.save(); throw e; }
    return this.getOrder(order.id);
  },

  // Baskets nobody paid for within half an hour are voided; the kiosk is unauthenticated, so this keeps it bounded.
  pruneKioskOrders() {
    const cutoff = this.now().getTime() - 30 * 60 * 1000;
    for (const o of this.state.orders) {
      if (o.channel === 'kiosk' && o.status === 'open' && !o.awaitingPayment && !o.payments.length && new Date(o.createdAt).getTime() < cutoff) { o.status = 'void'; o.voidReason = 'abandoned at self-checkout'; }
    }
  },

  async kioskPay(orderId, { method, token, tip }) {
    const order = this.find('orders', orderId, 'order');
    if (order.channel !== 'kiosk') throw new PosError('forbidden', 'Not a self-checkout order', 403);
    const k = this.settings.kiosk;
    if (method === 'cancel') {
      if (order.status === 'open' && !order.payments.length) { order.status = 'void'; order.voidReason = 'customer left self-checkout'; this.save(); }
      return { order: this.getOrder(orderId), canceled: true };
    }
    if (method === 'counter') {
      if (!k.allowPayAtCounter) throw new PosError('counter_disabled', 'Pay-at-counter is turned off', 403);
      if (order.status !== 'open') throw new PosError('order_closed', 'Order is closed', 409);
      this.assertAge(order);
      order.awaitingPayment = true;
      this.save();
      return { order: this.getOrder(orderId), payAtCounter: true };
    }
    if (method !== 'card' || !k.allowCard) throw new PosError('invalid_method', 'Pay by card or at the counter', 400);
    return this.pay(orderId, { method: 'card', token, tip }, null);
  },

  // ---- open checkout API --------------------------------------------------
  sessionView(session) {
    const order = this.find('orders', session.orderId, 'order');
    const cur = this.settings.business.currency.toLowerCase();
    const t = order.totals;
    const lines = order.lines.filter(l => !l.removed);
    const totals = [
      { type: 'items_base_amount', display_text: 'Items', amount: lines.reduce((s, l) => s + l.gross, 0) },
      ...(t.discount ? [{ type: 'discount', display_text: 'Discount', amount: t.discount }] : []),
      { type: 'subtotal', display_text: 'Subtotal', amount: t.subtotal - t.discount },
      { type: 'tax', display_text: t.taxInclusive ? 'Tax (included)' : 'Tax', amount: t.tax },
      { type: 'total', display_text: 'Total', amount: t.total },
    ];
    return {
      id: session.id, status: session.status, currency: cur, buyer: session.buyer || null,
      payment_provider: { provider: 'robos-point-of-sale', supported_payment_methods: ['card'] },
      fulfillment_options: session.fulfillmentOptions, fulfillment_option_id: session.fulfillmentOptionId || null,
      line_items: lines.map(l => ({ id: l.id, item: { id: l.itemId, quantity: l.qty }, base_amount: l.gross, discount: l.discount, subtotal: l.net, tax: l.tax, total: l.total })),
      totals, messages: session.messages || [], links: [],
      ...(session.status === 'completed' ? { order: { id: order.id, checkout_session_id: session.id, number: order.number, status: order.status } } : {}),
    };
  },

  sessionFor(id) {
    const s = this.state.checkoutSessions.find(x => x.id === id);
    if (!s) throw new PosError('not_found', 'Unknown checkout session', 404);
    return s;
  },

  recomputeSessionStatus(session) {
    const order = this.find('orders', session.orderId, 'order');
    if (['completed', 'canceled'].includes(session.status)) return;
    const ready = order.lines.some(l => !l.removed) && session.fulfillmentOptionId;
    session.status = ready ? 'ready_for_payment' : 'not_ready_for_payment';
  },

  applyItems(order, items) {
    for (const l of order.lines.filter(x => !x.removed)) this.removeLine(order.id, l.id, {}, null);
    for (const it of items) {
      if (!it || !it.id || !Number.isInteger(it.quantity) || it.quantity < 1) throw new PosError('invalid_request', 'Each item needs an id and a whole quantity of at least 1');
      const byId = this.state.items.find(i => i.id === it.id && i.active !== false);
      this.addLine(order.id, byId ? { itemId: it.id, variantId: it.variant_id, qty: it.quantity, modifiers: it.modifiers } : { code: it.id, qty: it.quantity, modifiers: it.modifiers }, null);
    }
  },

  createCheckoutSession(input) {
    if (!Array.isArray(input.items) || !input.items.length) throw new PosError('invalid_request', 'items is required');
    const order = this.createOrder({ type: this.settings.orderTypes.includes('takeout') ? 'takeout' : this.settings.orderTypes[0], channel: 'api' }, null);
    try { this.applyItems(order, input.items); } catch (e) { this.find('orders', order.id).status = 'void'; this.save(); throw e; }
    const session = {
      id: this.id('cs'), orderId: order.id, status: 'not_ready_for_payment', buyer: input.buyer || null, createdAt: this.iso(), messages: [],
      fulfillmentOptions: this.settings.orderTypes.map(type => ({ type: type === 'dine_in' ? 'dine_in' : 'pickup', id: type, title: type.replace('_', ' '), total: 0 })),
      fulfillmentOptionId: null,
    };
    this.setSessionFulfillment(session, input.fulfillment_option_id);
    this.state.checkoutSessions.push(session);
    this.recomputeSessionStatus(session);
    this.save();
    return this.sessionView(session);
  },

  setSessionFulfillment(session, id) {
    if (id === undefined) return;
    if (!session.fulfillmentOptions.some(o => o.id === id)) throw new PosError('invalid_request', 'Unknown fulfillment option');
    session.fulfillmentOptionId = id;
    this.find('orders', session.orderId, 'order').type = id;
  },

  getCheckoutSession(id) { return this.sessionView(this.sessionFor(id)); },

  updateCheckoutSession(id, input) {
    const session = this.sessionFor(id);
    if (['completed', 'canceled'].includes(session.status)) throw new PosError('session_closed', `Checkout session is ${session.status}`, 405);
    const order = this.find('orders', session.orderId, 'order');
    if (input.items) {
      if (!Array.isArray(input.items) || !input.items.length) throw new PosError('invalid_request', 'items cannot be empty');
      this.applyItems(order, input.items);
    }
    if (input.buyer) session.buyer = input.buyer;
    this.setSessionFulfillment(session, input.fulfillment_option_id);
    if (input.code) this.applyDiscount(order.id, { code: input.code }, null);
    this.recomputeSessionStatus(session);
    this.save();
    return this.sessionView(session);
  },

  async completeCheckoutSession(id, input) {
    const session = this.sessionFor(id);
    if (session.status === 'completed') return this.sessionView(session);
    if (session.status !== 'ready_for_payment') throw new PosError('not_ready', 'Choose a fulfillment option before paying', 409);
    const data = input.payment_data || {};
    if (!data.token) throw new PosError('invalid_request', 'payment_data.token is required');
    if (input.buyer) session.buyer = input.buyer;
    const order = this.find('orders', session.orderId, 'order');
    if (activeAgeRestricted(order)) throw new PosError('age_restricted', 'Age-restricted items cannot be bought through the API', 403);
    try {
      await this.pay(order.id, { method: 'card', provider: data.provider, token: data.token, reference: data.reference }, null);
    } catch (e) {
      if (e.code === 'card_declined') { session.messages = [{ type: 'error', code: 'payment_declined', content_type: 'plain', content: e.message }]; this.save(); }
      throw e;
    }
    session.status = 'completed';
    session.messages = [];
    this.save();
    return this.sessionView(session);
  },

  cancelCheckoutSession(id) {
    const session = this.sessionFor(id);
    if (['completed', 'canceled'].includes(session.status)) throw new PosError('session_closed', `Checkout session is ${session.status}`, 405);
    const order = this.find('orders', session.orderId, 'order');
    order.status = 'void'; order.voidReason = 'checkout canceled';
    session.status = 'canceled';
    this.save();
    return this.sessionView(session);
  },
};

function activeAgeRestricted(order) { return order.lines.some(l => !l.removed && l.ageRestricted); }

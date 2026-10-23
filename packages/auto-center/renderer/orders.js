'use strict';
// Orders: the shared RobOS Orders & Inventory screens (../../robos-orders/renderer/orders-ui.js), plus the shop's
// own panels: part requests from the mechanic bench to order or fill from stock, and using stock on a ticket.
(() => {
  const U = window.workshopUI, root = document.getElementById('orders');
  const call = (op, input = {}) => window.auto.workshop({ action: 'orders', input: { ...input, op } });
  const say = m => U.say(m);
  function partRequests(ctx) {
    const { el, btn } = ctx, b = ctx.board, list = b.partRequests;
    const box = el('div', { class: 'card', 'data-ro': 'part-requests' }, el('h3', { text: `Parts the mechanics asked for (${list.length})` }), el('p', { class: 'note', text: 'Fill a request from stock, or tick the ones to buy from the same supplier and add them to an order.' }));
    if (!list.length) { box.append(el('p', { class: 'note', text: 'Nothing waiting to be ordered.' })); return box; }
    const ticks = [];
    for (const r of list) {
      const tick = el('input', { type: 'checkbox', 'aria-label': 'Order ' + r.name }), cost = el('input', { placeholder: 'Unit cost (optional)', inputmode: 'decimal', 'aria-label': 'Unit cost for ' + r.name }); ticks.push({ r, tick, cost });
      box.append(el('div', { class: 'row-card', 'data-request': r.name }, el('label', { class: 'check-label' }, tick, el('span', {}, el('b', { text: `${r.quantity} × ${r.name}` }), r.partNumber ? ' · ' + r.partNumber : '', r.urgency !== 'normal' ? el('span', { class: 'badge urgent', text: r.urgency }) : null, el('div', { class: 'note', text: `${r.job} · asked by ${r.by}${r.note ? ' · ' + r.note : ''}` }))),
        el('div', {}, cost, r.stock && r.jobOpen ? btn(`Take from stock (${r.stock.onHand} on hand)`, () => ctx.act('fillFromStock', { request: r.id, item: r.stock.id }, `${r.name} taken from stock for ${r.job.split(' · ')[0]}.`), 'secondary') : null)));
    }
    const sup = el('select', { name: 'supplier', 'aria-label': 'Supplier' }, el('option', { value: '', text: 'Choose a supplier' }), ...b.suppliers.map(s => el('option', { value: s.id, text: s.name })));
    box.append(el('div', { class: 'row' }, el('label', {}, 'Supplier', sup)), btn('Add ticked parts to an order', async () => {
      const chosen = ticks.filter(t => t.tick.checked); if (!chosen.length) throw new Error('Tick the parts to order');
      const r = await call('orderPartRequests', { supplier: sup.value, requests: chosen.map(t => t.r.id), costs: Object.fromEntries(chosen.filter(t => t.cost.value.trim()).map(t => [t.r.id, t.cost.value.trim()])) });
      await ctx.refresh(); say(`Added to ${r.order}. Place it with the supplier below.`);
    }, 'big-btn'));
    return box;
  }
  function useOnTicket(item, ctx) {
    const { el, btn, field, read } = ctx, jobs = ctx.board.jobs; if (!jobs.length || item.onHand <= 0) return [];
    const f = el('form', { class: 'row' }, field('Repair ticket', 'job', { options: jobs.map(j => [j.id, j.label]) }), field('Quantity', 'qty', { value: '1', numeric: true }));
    return [el('details', {}, el('summary', { text: 'Use on a repair ticket' }), f, btn('Use on ticket', () => ctx.act('issueToJob', { item: item.id, ...read(f) }, `${item.name} used on ${jobs.find(j => j.id === read(f).job)?.label.split(' · ')[0]}.`)))];
  }
  let ui = null;
  document.querySelector('[data-view="orders"]').addEventListener('click', () => { if (!ui) ui = window.RobosOrders.mount(root, { call, say, extras: { orders: partRequests }, itemActions: useOnTicket }); else ui.show('orders'); });
})();

'use strict';
// Auto repair at Checkout: pick a finished car, issue its invoice from the approved estimate, take payment (shared),
// then hand back the keys and close the ticket.
(() => {
  const isReady = j => (j.stage === 'in-progress' && j.workComplete) || j.stage === 'ready';
  function lines(ctx, j) {
    const { el, U } = ctx, est = j.estimates.find(e => e.status === 'approved'), box = el('div', {});
    if (est) box.append(el('table', {}, el('thead', {}, el('tr', {}, ...['Item', 'Qty / hours', 'Price'].map(h => el('th', { text: h })))), el('tbody', {}, ...est.lines.map(l => el('tr', {}, el('td', { text: l.description }), el('td', { text: l.type === 'part' ? String(l.quantity) : l.hours + ' h' }), el('td', { text: U.money(l.type === 'part' ? l.quantity * l.unitMinor : Math.round(l.hours * l.unitMinor), est.currency) }))))));
    return box;
  }
  window.autoPlugins.on('checkout', 'repair', {
    id: 'repair', steps: ['Pick a car', 'Invoice', 'Payment', 'Hand back'],
    load: ctx => ctx.w('board'),
    item: (board, id) => board.jobs.find(j => j.id === id),
    pick(ctx, board) {
      const { el, choice } = ctx, ready = board.jobs.filter(isReady), busy = board.jobs.filter(j => j.stage === 'in-progress' && !j.workComplete);
      return el('div', { 'data-section': 'repairs' }, el('h3', { text: 'Cars ready to go home' }),
        ready.length ? el('div', { class: 'choice-grid' }, ...ready.map(j => choice(`${j.key} · ${j.vehicle || ''}`, `${j.customer || ''} · ${j.stage === 'ready' ? 'Invoiced, waiting for payment' : 'Work complete'}`, () => ctx.start('repair', j.id)))) : el('div', { class: 'notice', text: 'No cars are ready for checkout. Mechanics mark a job finished on the Mechanic bench.' }),
        busy.length ? el('details', {}, el('summary', { text: `Still being worked on (${busy.length})` }), ...busy.map(j => el('p', { class: 'note', text: `${j.key} · ${j.vehicle || ''} · ${j.technician || 'unassigned'}` }))) : null);
    },
    invoice(ctx) {
      const { el, U, st } = ctx, j = ctx.item, s = j.summary, issued = j.stage === 'ready';
      ctx.draw(el('div', { class: 'card wizard-card', 'data-step': 'Invoice' }, ctx.stepper(), el('h2', { text: `Invoice for ${j.key}` }), el('p', { class: 'lead', text: `${j.customer || ''} · ${j.vehicle || ''}` }), lines(ctx, j),
        el('dl', { class: 'summary-grid' }, el('dt', { text: 'Approved estimate' }), el('dd', { text: U.money(s.estimateTotal, s.currency) }), el('dt', { text: 'Hours worked' }), el('dd', { text: Object.entries(s.hoursByTeammate).map(([n, h]) => `${n} ${h} h`).join(', ') || 'none' }), el('dt', { text: 'Parts cost to shop' }), el('dd', { text: U.money(s.partsCost, s.currency) }), j.completionNote ? el('dt', { text: 'Work done' }) : null, j.completionNote ? el('dd', { text: j.completionNote }) : null),
        ...window.autoPlugins.of('repairInvoiceNotices').map(h => h(j, ctx)),
        issued ? el('div', { class: 'notice ok', text: `Invoice issued: ${U.money(s.billed, s.currency)}.` }) : ctx.input('Extra charges beyond the estimate (optional, USD)', st.x.extra, v => { st.x.extra = v; }, { name: 'extra', ph: '0.00' }),
        ctx.nav(() => ctx.reset(), issued ? 'Continue to payment' : 'Issue invoice', async () => { if (!issued) await ctx.w('issueInvoice', { job: j.id, extra: st.x.extra }); await ctx.go(2); })));
    },
    finish(ctx) {
      const { el, st } = ctx, j = ctx.item; if (st.x.collectedBy === undefined) st.x.collectedBy = j.customer || '';
      ctx.draw(el('div', { class: 'card wizard-card', 'data-step': 'Hand back' }, ctx.stepper(), el('h2', { text: 'Hand back the car' }), el('p', { class: 'lead', text: `Give ${j.customer || 'the customer'} the keys and close the ticket.` }), ctx.input('Collected by', st.x.collectedBy, v => { st.x.collectedBy = v; }, { name: 'collectedBy' }),
        ctx.nav(() => ctx.go(2), 'Hand over keys and close ticket', async () => { await ctx.w('offboard', { job: j.id, collectedBy: st.x.collectedBy }); await ctx.done({ key: j.key, text: `${j.vehicle} went home with ${st.x.collectedBy}.`, paid: j.summary.paid, currency: j.summary.currency }); })));
    },
  });
})();

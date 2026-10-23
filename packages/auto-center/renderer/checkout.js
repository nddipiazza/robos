'use strict';
// Checkout: pick a finished car, issue the invoice, take payment, hand the car back and close the ticket.
(() => {
  const U = window.workshopUI, el = U.el, root = document.getElementById('checkout');
  const w = (action, input) => window.auto.workshop({ action, input });
  const fail = e => U.say(U.clean(e.message));
  const STEPS = ['Pick a car', 'Invoice', 'Payment', 'Hand back'], TOW_STEPS = ['Pick a call', 'Tow invoice', 'Payment', 'Release'];
  const fresh = () => ({ kind: 'repair', step: 0, jobId: null, method: 'card', amount: null, extra: '', extraNote: '', storageDays: null, collectedBy: '', receipt: null });
  let st = fresh(), board = null, tows = null;
  const btn = (label, onClick, cls = '') => { const b = el('button', { type: 'button', class: cls, text: label }); b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const choice = (title, sub, onClick, disabled, extra) => { const b = el('button', { type: 'button', class: 'choice' }, el('b', { text: title }), sub ? el('small', { text: sub }) : null, extra || null); if (disabled) b.disabled = true; else b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const chip = (label, pressed, onClick) => { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!pressed), text: label }); b.onclick = onClick; return b; };
  const input = (label, value, onInput, o = {}) => { const c = el('input', { type: 'text', placeholder: o.ph || '' }); c.value = value || ''; if (o.name) c.name = o.name; c.addEventListener('input', () => onInput(c.value)); return el('label', {}, label, c); };
  const nav = (back, label, next) => el('div', { class: 'wizard-nav' }, back ? btn('Back', back, 'secondary') : el('span'), el('span', { class: 'grow' }), next ? btn(label, next, 'big-btn') : null);
  const stepper = () => el('ol', { class: 'stepper' }, ...(st.kind === 'tow' ? TOW_STEPS : STEPS).map((t, i) => el('li', { class: i < st.step ? 'done' : i === st.step ? 'current' : '', text: t })));
  const draw = (...k) => root.replaceChildren(...k);
  const job = () => st.kind === 'tow' ? tows.tows.find(t => t.id === st.jobId) : board.jobs.find(j => j.id === st.jobId);
  async function render() {
    try { U.say(''); [board, tows] = await Promise.all([w('board'), w('towBoard')]); if (st.receipt) return receipt(); if (st.step > 0 && !job()) st.step = 0; return (st.kind === 'tow' ? [pick, towInvoice, payment, release] : [pick, invoice, payment, handBack])[st.step](); } catch (e) { fail(e); }
  }
  function pick() {
    const towBills = tows.tows.filter(t => ['delivered', 'invoiced'].includes(t.stage)), ready = board.jobs.filter(j => (j.stage === 'in-progress' && j.workComplete) || j.stage === 'ready'), busy = board.jobs.filter(j => j.stage === 'in-progress' && !j.workComplete);
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Pick a car' }, stepper(), el('h2', { text: 'Which car is being picked up?' }), el('p', { class: 'lead', text: 'These cars are finished and ready to be billed.' }),
      ready.length ? el('div', { class: 'choice-grid' }, ...ready.map(j => choice(`${j.key} · ${j.vehicle || ''}`, `${j.customer || ''} · ${j.stage === 'ready' ? 'Invoiced, waiting for payment' : 'Work complete'}`, () => { st = { ...st, step: 1, jobId: j.id, amount: null, collectedBy: j.customer || '' }; return render(); }))) : el('div', { class: 'notice', text: 'No cars are ready for checkout. Mechanics mark a job finished on the Mechanic bench.' }),
      busy.length ? el('details', {}, el('summary', { text: `Still being worked on (${busy.length})` }), ...busy.map(j => el('p', { class: 'note', text: `${j.key} · ${j.vehicle || ''} · ${j.technician || 'unassigned'}` }))) : null,
      towBills.length ? el('div', { 'data-section': 'tows' }, el('h3', { text: 'Tow calls to bill' }), el('div', { class: 'choice-grid' }, ...towBills.map(t => choice(`${t.key} · ${t.serviceLabel}`, `${t.vehicle} · ${t.billToName || t.customer} · ${t.stage === 'invoiced' ? 'Invoiced, waiting for payment' : 'Done, not invoiced yet'}`, () => openTow(t.id))))) : null));
  }
  function lines(j) {
    const est = j.estimates.find(e => e.status === 'approved'); const box = el('div', {});
    if (est) box.append(el('table', {}, el('thead', {}, el('tr', {}, ...['Item', 'Qty / hours', 'Price'].map(h => el('th', { text: h })))), el('tbody', {}, ...est.lines.map(l => el('tr', {}, el('td', { text: l.description }), el('td', { text: l.type === 'part' ? String(l.quantity) : l.hours + ' h' }), el('td', { text: U.money(l.type === 'part' ? l.quantity * l.unitMinor : Math.round(l.hours * l.unitMinor), est.currency) }))))));
    return box;
  }
  function invoice() {
    const j = job(), s = j.summary, issued = j.stage === 'ready';
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Invoice' }, stepper(), el('h2', { text: `Invoice for ${j.key}` }), el('p', { class: 'lead', text: `${j.customer || ''} · ${j.vehicle || ''}` }), lines(j),
      el('dl', { class: 'summary-grid' }, el('dt', { text: 'Approved estimate' }), el('dd', { text: U.money(s.estimateTotal, s.currency) }), el('dt', { text: 'Hours worked' }), el('dd', { text: Object.entries(s.hoursByTeammate).map(([n, h]) => `${n} ${h} h`).join(', ') || 'none' }), el('dt', { text: 'Parts cost to shop' }), el('dd', { text: U.money(s.partsCost, s.currency) }), j.completionNote ? el('dt', { text: 'Work done' }) : null, j.completionNote ? el('dd', { text: j.completionNote }) : null),
      j.tow && j.tow.balance !== 0 ? el('div', { class: 'notice warn', 'data-tow': j.tow.key }, `This car came in on tow ${j.tow.key}. The tow has its own invoice${j.tow.billed == null ? ', not issued yet' : ' with ' + U.money(j.tow.balance, j.tow.currency) + ' still to pay'}. `, ['delivered', 'invoiced'].includes(j.tow.stage) ? btn('Bill the tow', () => openTow(j.tow.id), 'secondary') : null) : null,
      issued ? el('div', { class: 'notice ok', text: `Invoice issued: ${U.money(s.billed, s.currency)}.` }) : input('Extra charges beyond the estimate (optional, USD)', st.extra, v => { st.extra = v; }, { name: 'extra', ph: '0.00' }),
      nav(() => { st.step = 0; return render(); }, issued ? 'Continue to payment' : 'Issue invoice', async () => { if (!issued) await w('issueInvoice', { job: j.id, extra: st.extra }); st.step = 2; st.amount = null; await render(); })));
  }
  function payment() {
    const j = job(), s = j.summary, balance = s.balance ?? 0, due = (balance / 100).toFixed(2); if (st.amount === null) st.amount = due;
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Payment' }, stepper(), el('h2', { text: 'Take payment' }), el('p', { class: 'lead', text: 'Record each payment as the customer pays. Payments are recorded here; this does not charge a card.' }),
      el('dl', { class: 'summary-grid' }, el('dt', { text: 'Invoice' }), el('dd', { text: U.money(s.billed, s.currency) }), el('dt', { text: 'Paid so far' }), el('dd', { text: U.money(s.paid, s.currency) }), el('dt', { text: 'Balance' }), el('dd', { id: 'balance', text: U.money(balance, s.currency) })),
      balance > 0 ? el('div', {}, input('Amount', st.amount, v => { st.amount = v; }, { name: 'amount' }), el('div', { class: 'chips' }, ...[['card', 'Card'], ['cash', 'Cash'], ['check', 'Check'], ['bank', 'Bank transfer']].map(([v, t]) => chip(t, st.method === v, () => { st.method = v; render(); }))), btn('Record payment', async () => { await window.auto.recordPayment({ requestId: crypto.randomUUID(), job: j.id, amount: st.amount, currency: s.currency, direction: 'received', method: st.method, paidOn: new Date().toLocaleDateString('en-CA'), notes: st.kind === 'tow' ? [j.billTo !== 'customer' ? 'Paid by ' + (j.billToName || j.billTo) : '', j.authorization].filter(Boolean).join(' · ') : '' }); st.amount = null; await render(); }, 'big-btn')) : el('div', { class: 'notice ok', text: 'Paid in full.' }),
      nav(() => { st.step = 1; return render(); }, 'Continue', async () => { if (balance > 0) { U.say(`There is still ${U.money(balance, s.currency)} to pay`); return; } st.step = 3; await render(); })));
  }
  function handBack() {
    const j = job();
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Hand back' }, stepper(), el('h2', { text: 'Hand back the car' }), el('p', { class: 'lead', text: `Give ${j.customer || 'the customer'} the keys and close the ticket.` }), input('Collected by', st.collectedBy, v => { st.collectedBy = v; }, { name: 'collectedBy' }),
      nav(() => { st.step = 2; return render(); }, 'Hand over keys and close ticket', async () => { await w('offboard', { job: j.id, collectedBy: st.collectedBy }); st.receipt = { key: j.key, vehicle: j.vehicle, customer: j.customer, paid: j.summary.paid, currency: j.summary.currency, by: st.collectedBy }; await render(); })));
  }
  function openTow(id) { st = { ...fresh(), kind: 'tow', step: 1, jobId: id, collectedBy: null }; return render(); }
  function towInvoice() {
    const t = job(), s = t.summary, issued = t.stage === 'invoiced'; if (st.storageDays === null) st.storageDays = t.storageDaysSoFar || '';
    const facts = [['Service', t.serviceLabel], ['Pickup', t.pickup], t.kind === 'tow' ? ['Drop-off', t.destinationLabel] : null, t.loadedMiles != null && t.kind === 'tow' ? ['Loaded miles', t.loadedMiles + ' mi'] : null, t.winchHours ? ['Winching', t.winchHours + ' h'] : null, ['After hours', t.afterHours ? 'Yes' : 'No'], ['Bill to', `${t.billToName || t.customer}${t.billTo !== 'customer' ? ' (' + t.billTo + ')' : ''}${t.authorization ? ' · ' + t.authorization : ''}`], t.condition ? ['Condition at pickup', t.condition] : null].filter(Boolean);
    const body = [stepper(), el('h2', { text: `Tow invoice for ${t.key}` }), el('p', { class: 'lead', text: `${t.customer || ''} · ${t.vehicle || ''}` }), el('dl', { class: 'summary-grid' }, ...facts.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))];
    if (issued) body.push(el('table', {}, el('tbody', {}, ...s.lines.map(l => el('tr', {}, el('td', { text: l.description }), el('td', { text: U.money(l.amountMinor, s.currency) }))))), el('div', { class: 'notice ok', text: `Invoice issued: ${U.money(s.billed, s.currency)}.` }));
    else {
      if (t.destination === 'yard') body.push(input('Storage days in the yard', st.storageDays ?? '', v => { st.storageDays = v; }, { name: 'storageDays', ph: '0' }));
      body.push(el('div', { class: 'row' }, input('Extra charge (optional)', st.extra, v => { st.extra = v; }, { name: 'extra', ph: '0.00' }), input('What it is for', st.extraNote, v => { st.extraNote = v; }, { name: 'extraNote', ph: 'Highway toll' })));
      if (s.quoted != null) body.push(el('p', { class: 'note', text: `Quoted on the call: ${U.money(s.quoted, s.currency)}. The invoice uses the rates quoted and the miles actually driven.` }));
    }
    body.push(nav(() => { st = fresh(); return render(); }, issued ? 'Continue to payment' : 'Issue tow invoice', async () => { if (!issued) await w('issueTowInvoice', { tow: t.id, storageDays: st.storageDays, extra: st.extra, extraNote: st.extraNote }); st.step = 2; st.amount = null; await render(); }));
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Tow invoice' }, ...body));
  }
  function release() {
    const t = job(), yard = t.destination === 'yard'; if (st.collectedBy === null) st.collectedBy = t.customer || '';
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Release' }, stepper(), el('h2', { text: yard ? 'Release the vehicle from the yard' : 'Close the tow call' }),
      el('p', { class: 'lead', text: yard ? 'Check the ID of the person collecting it, then hand over the keys.' : t.destination === 'shop' ? 'The car stays at the shop for its repair.' : 'The vehicle was dropped where the customer asked.' }),
      yard ? input('Collected by', st.collectedBy, v => { st.collectedBy = v; }, { name: 'collectedBy' }) : null,
      nav(() => { st.step = 2; return render(); }, yard ? 'Release vehicle and close call' : 'Close tow call', async () => { await w('closeTow', { tow: t.id, releasedTo: st.collectedBy }); st.receipt = { key: t.key, vehicle: t.vehicle, paid: t.summary.paid, currency: t.summary.currency, by: yard ? st.collectedBy : '', tow: true }; await render(); })));
  }
  window.checkoutTow = id => { navigate('checkout'); return openTow(id); };
  function receipt() {
    const r = st.receipt;
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Done' }, el('div', { class: 'notice ok' }, el('b', { text: `${r.key} is closed.` }), r.tow ? ` ${r.vehicle}${r.by ? ' released to ' + r.by : ''}. Paid ${U.money(r.paid, r.currency)}.` : ` ${r.vehicle} went home with ${r.by}. Paid ${U.money(r.paid, r.currency)}.`), el('div', { class: 'choice-grid' }, choice('Next customer', 'Pick another finished car', () => { st = fresh(); return render(); }))));
  }
  document.querySelector('[data-view="checkout"]').addEventListener('click', () => { st = fresh(); render(); });
})();

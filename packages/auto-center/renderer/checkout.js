'use strict';
// Checkout: pick a finished car, issue the invoice, take payment, hand the car back and close the ticket.
(() => {
  const U = window.workshopUI, el = U.el, root = document.getElementById('checkout');
  const w = (action, input) => window.auto.workshop({ action, input });
  const fail = e => U.say(U.clean(e.message));
  const STEPS = ['Pick a car', 'Invoice', 'Payment', 'Hand back'];
  let st = { step: 0, jobId: null, method: 'card', amount: null, extra: '', collectedBy: '', receipt: null }, board = null;
  const btn = (label, onClick, cls = '') => { const b = el('button', { type: 'button', class: cls, text: label }); b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const choice = (title, sub, onClick, disabled, extra) => { const b = el('button', { type: 'button', class: 'choice' }, el('b', { text: title }), sub ? el('small', { text: sub }) : null, extra || null); if (disabled) b.disabled = true; else b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const chip = (label, pressed, onClick) => { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!pressed), text: label }); b.onclick = onClick; return b; };
  const input = (label, value, onInput, o = {}) => { const c = el('input', { type: 'text', placeholder: o.ph || '' }); c.value = value || ''; if (o.name) c.name = o.name; c.addEventListener('input', () => onInput(c.value)); return el('label', {}, label, c); };
  const nav = (back, label, next) => el('div', { class: 'wizard-nav' }, back ? btn('Back', back, 'secondary') : el('span'), el('span', { class: 'grow' }), next ? btn(label, next, 'big-btn') : null);
  const stepper = () => el('ol', { class: 'stepper' }, ...STEPS.map((t, i) => el('li', { class: i < st.step ? 'done' : i === st.step ? 'current' : '', text: t })));
  const draw = (...k) => root.replaceChildren(...k);
  const job = () => board.jobs.find(j => j.id === st.jobId);
  async function render() {
    try { U.say(''); board = await w('board'); if (st.receipt) return receipt(); if (st.step > 0 && !job()) st.step = 0; return [pick, invoice, payment, handBack][st.step](); } catch (e) { fail(e); }
  }
  function pick() {
    const ready = board.jobs.filter(j => (j.stage === 'in-progress' && j.workComplete) || j.stage === 'ready'), busy = board.jobs.filter(j => j.stage === 'in-progress' && !j.workComplete);
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Pick a car' }, stepper(), el('h2', { text: 'Which car is being picked up?' }), el('p', { class: 'lead', text: 'These cars are finished and ready to be billed.' }),
      ready.length ? el('div', { class: 'choice-grid' }, ...ready.map(j => choice(`${j.key} · ${j.vehicle || ''}`, `${j.customer || ''} · ${j.stage === 'ready' ? 'Invoiced, waiting for payment' : 'Work complete'}`, () => { st = { ...st, step: 1, jobId: j.id, amount: null, collectedBy: j.customer || '' }; return render(); }))) : el('div', { class: 'notice', text: 'No cars are ready for checkout. Mechanics mark a job finished on the Mechanic bench.' }),
      busy.length ? el('details', {}, el('summary', { text: `Still being worked on (${busy.length})` }), ...busy.map(j => el('p', { class: 'note', text: `${j.key} · ${j.vehicle || ''} · ${j.technician || 'unassigned'}` }))) : null));
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
      issued ? el('div', { class: 'notice ok', text: `Invoice issued: ${U.money(s.billed, s.currency)}.` }) : input('Extra charges beyond the estimate (optional, USD)', st.extra, v => { st.extra = v; }, { name: 'extra', ph: '0.00' }),
      nav(() => { st.step = 0; return render(); }, issued ? 'Continue to payment' : 'Issue invoice', async () => { if (!issued) await w('issueInvoice', { job: j.id, extra: st.extra }); st.step = 2; st.amount = null; await render(); })));
  }
  function payment() {
    const j = job(), s = j.summary, balance = s.balance ?? 0, due = (balance / 100).toFixed(2); if (st.amount === null) st.amount = due;
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Payment' }, stepper(), el('h2', { text: 'Take payment' }), el('p', { class: 'lead', text: 'Record each payment as the customer pays. Payments are recorded here; this does not charge a card.' }),
      el('dl', { class: 'summary-grid' }, el('dt', { text: 'Invoice' }), el('dd', { text: U.money(s.billed, s.currency) }), el('dt', { text: 'Paid so far' }), el('dd', { text: U.money(s.paid, s.currency) }), el('dt', { text: 'Balance' }), el('dd', { id: 'balance', text: U.money(balance, s.currency) })),
      balance > 0 ? el('div', {}, input('Amount', st.amount, v => { st.amount = v; }, { name: 'amount' }), el('div', { class: 'chips' }, ...[['card', 'Card'], ['cash', 'Cash'], ['check', 'Check'], ['bank', 'Bank transfer']].map(([v, t]) => chip(t, st.method === v, () => { st.method = v; render(); }))), btn('Record payment', async () => { await window.auto.recordPayment({ requestId: crypto.randomUUID(), job: j.id, amount: st.amount, currency: s.currency, direction: 'received', method: st.method, paidOn: new Date().toLocaleDateString('en-CA'), notes: '' }); st.amount = null; await render(); }, 'big-btn')) : el('div', { class: 'notice ok', text: 'Paid in full.' }),
      nav(() => { st.step = 1; return render(); }, 'Continue', async () => { if (balance > 0) { U.say(`There is still ${U.money(balance, s.currency)} to pay`); return; } st.step = 3; await render(); })));
  }
  function handBack() {
    const j = job();
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Hand back' }, stepper(), el('h2', { text: 'Hand back the car' }), el('p', { class: 'lead', text: `Give ${j.customer || 'the customer'} the keys and close the ticket.` }), input('Collected by', st.collectedBy, v => { st.collectedBy = v; }, { name: 'collectedBy' }),
      nav(() => { st.step = 2; return render(); }, 'Hand over keys and close ticket', async () => { await w('offboard', { job: j.id, collectedBy: st.collectedBy }); st.receipt = { key: j.key, vehicle: j.vehicle, customer: j.customer, paid: j.summary.paid, currency: j.summary.currency, by: st.collectedBy }; await render(); })));
  }
  function receipt() {
    const r = st.receipt;
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Done' }, el('div', { class: 'notice ok' }, el('b', { text: `${r.key} is closed.` }), ` ${r.vehicle} went home with ${r.by}. Paid ${U.money(r.paid, r.currency)}.`), el('div', { class: 'choice-grid' }, choice('Next customer', 'Pick another finished car', () => { st = { step: 0, jobId: null, method: 'card', amount: null, extra: '', collectedBy: '', receipt: null }; return render(); }))));
  }
  document.querySelector('[data-view="checkout"]').addEventListener('click', () => { st = { step: 0, jobId: null, method: 'card', amount: null, extra: '', collectedBy: '', receipt: null }; render(); });
})();

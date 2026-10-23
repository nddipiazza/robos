'use strict';
// Checkout: pick what is being paid for, invoice it, take payment, and finish (hand back the keys, release a towed
// vehicle). Each enabled plugin brings a provider for its own jobs: auto repair bills finished cars, towing bills
// finished tow calls. A provider (window.autoPlugins.on('checkout', pluginId, provider)) has:
//   steps: [pick, invoice, 'Payment', finish] labels      load(ctx) -> its data       pick(ctx, data) -> element or null
//   item(data, id) -> { id, key, vehicle, customer, summary: { billed, paid, balance, currency } }
//   invoice(ctx), finish(ctx) draw their steps          paymentNotes(item) -> text recorded with each payment
(() => {
  const U = window.workshopUI, el = U.el, root = document.getElementById('checkout');
  const w = (action, input) => window.auto.workshop({ action, input });
  const fail = e => U.say(U.clean(e.message));
  const fresh = () => ({ provider: null, step: 0, id: null, method: 'card', amount: null, receipt: null, x: {} });
  let st = fresh(), data = {};
  const btn = (label, onClick, cls = '') => { const b = el('button', { type: 'button', class: cls, text: label }); b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const choice = (title, sub, onClick, disabled, extra) => { const b = el('button', { type: 'button', class: 'choice' }, el('b', { text: title }), sub ? el('small', { text: sub }) : null, extra || null); if (disabled) b.disabled = true; else b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const chip = (label, pressed, onClick) => { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!pressed), text: label }); b.onclick = onClick; return b; };
  const input = (label, value, onInput, o = {}) => { const c = el('input', { type: 'text', placeholder: o.ph || '' }); c.value = value ?? ''; if (o.name) c.name = o.name; c.addEventListener('input', () => onInput(c.value)); return el('label', {}, label, c); };
  const nav = (back, label, next) => el('div', { class: 'wizard-nav' }, back ? btn('Back', back, 'secondary') : el('span'), el('span', { class: 'grow' }), next ? btn(label, next, 'big-btn') : null);
  const providers = () => window.autoPlugins.of('checkout');
  const provider = () => providers().find(p => p.id === st.provider);
  const stepper = () => el('ol', { class: 'stepper' }, ...(provider()?.steps || ['Pick', 'Invoice', 'Payment', 'Finish']).map((t, i) => el('li', { class: i < st.step ? 'done' : i === st.step ? 'current' : '', text: t })));
  const draw = (...k) => root.replaceChildren(...k);
  const item = () => provider()?.item(data[st.provider], st.id);
  // What a provider's steps can use.
  const ctx = { el, btn, choice, chip, input, nav, stepper, draw, w, fail, U, money: U.money, get st() { return st; }, get item() { return item(); },
    go: step => { st.step = step; if (step === 2) st.amount = null; return render(); }, start: (providerId, id) => open(providerId, id), reset: () => { st = fresh(); return render(); },
    done: receipt => { st.receipt = receipt; return render(); } };
  async function render() {
    try {
      U.say(''); data = Object.fromEntries(await Promise.all(providers().map(async p => [p.id, await p.load(ctx)])));
      if (st.receipt) return receipt();
      if (st.step > 0 && !item()) st = fresh();
      if (st.step === 0) return pick(); if (st.step === 2) return payment();
      return st.step === 1 ? provider().invoice(ctx) : provider().finish(ctx);
    } catch (e) { fail(e); }
  }
  function pick() {
    const sections = providers().map(p => p.pick(ctx, data[p.id])).filter(Boolean);
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Pick a car' }, el('h2', { text: 'Who is checking out?' }), el('p', { class: 'lead', text: 'Finished work that is ready to be billed.' }),
      ...(sections.length ? sections : [el('div', { class: 'notice', text: 'Turn on a service in Admin → Services to bill its work here.' })])));
  }
  function payment() {
    const j = item(), s = j.summary, balance = s.balance ?? 0, due = (balance / 100).toFixed(2); if (st.amount === null) st.amount = due;
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Payment' }, stepper(), el('h2', { text: 'Take payment' }), el('p', { class: 'lead', text: 'Record each payment as the customer pays. Payments are recorded here; this does not charge a card.' }),
      el('dl', { class: 'summary-grid' }, el('dt', { text: 'Invoice' }), el('dd', { text: U.money(s.billed, s.currency) }), el('dt', { text: 'Paid so far' }), el('dd', { text: U.money(s.paid, s.currency) }), el('dt', { text: 'Balance' }), el('dd', { id: 'balance', text: U.money(balance, s.currency) })),
      balance > 0 ? el('div', {}, input('Amount', st.amount, v => { st.amount = v; }, { name: 'amount' }), el('div', { class: 'chips' }, ...[['card', 'Card'], ['cash', 'Cash'], ['check', 'Check'], ['bank', 'Bank transfer']].map(([v, t]) => chip(t, st.method === v, () => { st.method = v; render(); }))),
        btn('Record payment', async () => { await window.auto.recordPayment({ requestId: crypto.randomUUID(), job: j.id, amount: st.amount, currency: s.currency, direction: 'received', method: st.method, paidOn: new Date().toLocaleDateString('en-CA'), notes: provider().paymentNotes?.(j) || '' }); st.amount = null; await render(); }, 'big-btn')) : el('div', { class: 'notice ok', text: 'Paid in full.' }),
      nav(() => ctx.go(1), 'Continue', async () => { if (balance > 0) { U.say(`There is still ${U.money(balance, s.currency)} to pay`); return; } await ctx.go(3); })));
  }
  function receipt() {
    const r = st.receipt;
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Done' }, el('div', { class: 'notice ok' }, el('b', { text: `${r.key} is closed.` }), ` ${r.text} Paid ${U.money(r.paid, r.currency)}.`), el('div', { class: 'choice-grid' }, choice('Next customer', 'Pick the next finished job', () => { st = fresh(); return render(); }))));
  }
  function open(providerId, id) { st = { ...fresh(), provider: providerId, step: 1, id }; return render(); }
  // Other screens send a job straight to checkout (the Tow desk's "Invoice at Checkout").
  window.autoCheckout = { open: (providerId, id) => { navigate('checkout'); return open(providerId, id); } };
  document.querySelector('[data-view="checkout"]').addEventListener('click', () => { st = fresh(); render(); });
})();

'use strict';
// Parts counter: today's counter sales, and buttons that open RobOS Point of Sale (register or self-checkout) in its own window.
(() => {
  const U = window.workshopUI, el = U.el, root = document.getElementById('parts-counter');
  const w = (action, input) => window.auto.workshop({ action, input });
  const btn = (label, fn, cls = '') => { const b = el('button', { type: 'button', class: cls, text: label }); b.onclick = () => Promise.resolve().then(fn).catch(e => U.say(U.clean(e.message))); return b; };
  async function render() {
    try {
      U.say(''); const t = await w('partsCounter'), money = m => U.money(m, t.currency);
      root.replaceChildren(el('div', { class: 'card wizard-card', 'data-counter': t.setUp ? 'ready' : 'new' }, el('h2', { text: 'Parts counter' }),
        el('p', { class: 'lead', text: 'Sell parts over the counter with RobOS Point of Sale. It opens in its own window: scan barcodes, take card or cash, print receipts and see the day’s sales.' }),
        t.setUp ? el('div', { class: 'metric-grid' }, ...[['Sales today', money(t.netSales), `${t.orders} sale${t.orders === 1 ? '' : 's'}`], ['Collected today', money(t.netCollected), 'Payments less refunds'], ['Counter items', String(t.items), `${t.lowStock} running low`]].map(([l, v, n]) => el('article', { class: 'metric' }, el('span', { text: l }), el('strong', { text: v }), el('small', { text: n }))))
          : el('div', { class: 'notice', text: 'The first time you open the register, it asks you to set it up: load the Auto parts counter sample to try it, or add your own staff PINs, parts and prices in its Back office.' }),
        t.topItems.length ? el('div', {}, el('h3', { text: 'Best sellers today' }), el('ul', {}, ...t.topItems.map(i => el('li', { text: `${i.qty} × ${i.name} · ${money(i.sales)}` })))) : null,
        el('div', { class: 'bench-actions' }, btn('Open the register', async () => { await w('openPartsCounter', { screen: 'register' }); U.say('The parts counter register is open in its own window.'); }, 'big-btn'), btn('Open self-checkout', async () => { await w('openPartsCounter', { screen: 'kiosk' }); U.say('Self-checkout is open in its own window.'); }, 'secondary')),
        el('p', { class: 'note', text: 'The counter sells from the shop’s stock under Orders → Stock. A part sold here, used on a repair or received on a purchase order comes off the same count, and a counter part with the same SKU as a stock item is that item.' })));
    } catch (e) { U.say(U.clean(e.message)); }
  }
  document.querySelector('[data-view="parts-counter"]').addEventListener('click', render);
})();

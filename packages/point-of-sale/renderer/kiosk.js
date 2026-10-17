'use strict';
// Customer self-checkout. No sign-in: it can only browse the menu, build a basket, and pay by card or at the counter.
(function () {
  const POS = window.POS;
  const { h, api, money, toast, guard } = POS;
  const root = document.getElementById('app');
  const IDLE_MS = 120000;
  let menu, cart, orderType, idle;

  async function start() {
    menu = await api('GET', '/api/kiosk/menu', undefined, { anon: true });
    POS.settings = { business: menu.business };
    document.title = `${menu.business.name} · Self-checkout`;
    welcome();
  }

  const bump = () => { clearTimeout(idle); idle = setTimeout(() => { if (cart && cart.length) toast('Starting over because nobody touched the screen'); welcome(); }, IDLE_MS); };
  document.addEventListener('pointerdown', bump);

  function welcome() {
    cart = []; orderType = null;
    root.replaceChildren(h('div', { class: 'welcome', 'data-testid': 'welcome' }, h('h1', null, menu.business.name), h('p', { class: 'muted' }, menu.kiosk.welcome),
      menu.orderTypes.length > 1
        ? h('div', { class: 'row', style: 'justify-content:center;gap:20px' }, menu.orderTypes.map(t => h('button', { class: 'primary go', 'data-testid': `start-${t}`, onclick: () => { orderType = t; ordering(); } }, label(t))))
        : h('button', { class: 'primary go', 'data-testid': 'start', onclick: () => { orderType = menu.orderTypes[0]; ordering(); } }, 'Start your order'),
      h('p', { class: 'muted' }, h('a', { href: '/', style: 'color:var(--muted)' }, 'Staff'))));
    bump();
  }
  const label = t => ({ dine_in: 'Eat here', takeout: 'Take away', retail: 'Start your order', table: 'Table', bar: 'Bar' }[t] || t.replace('_', ' '));

  function lineKey(c) { return `${c.itemId}|${c.variantId}|${[...c.modifiers].sort().join(',')}|${c.note || ''}`; }
  function describe(c) {
    const item = menu.items.find(i => i.id === c.itemId);
    const variant = item.variants.find(v => v.id === c.variantId);
    const groups = menu.modifierGroups.flatMap(g => g.options);
    const mods = c.modifiers.map(id => groups.find(o => o.id === id));
    const unit = (variant && variant.price !== null ? variant.price : item.price) + mods.reduce((s, m) => s + m.price, 0);
    return { item, variant, mods, unit };
  }
  function addToCart(choice) {
    const c = { ...choice, modifiers: choice.modifiers || [] };
    c.key = lineKey(c);
    const twin = cart.find(x => x.key === c.key);
    if (twin) twin.qty += c.qty; else cart.push(c);
  }

  function ordering() {
    let category = null;
    const grid = h('div', { class: 'tiles', 'data-testid': 'tiles' });
    const chips = h('div', { class: 'chips' });
    const cartEl = h('div', { class: 'card ticket', 'data-testid': 'cart' });
    const scan = menu.business.type === 'retail' ? h('input', { class: 'scan', placeholder: 'Scan an item barcode', 'data-testid': 'scan', autocomplete: 'off',
      onkeydown: e => { if (e.key !== 'Enter' || !scan.value.trim()) return; const code = scan.value.trim(); scan.value = ''; const hit = lookup(code); if (!hit) return toast(`We could not find ${code}. Ask a team member for help.`); addToCart(hit); drawCart(); } }) : null;

    function lookup(code) {
      for (const item of menu.items) {
        if (item.soldOut) continue;
        if (item.barcode === code || item.sku === code) { if (item.variants.length) return null; return { itemId: item.id, variantId: null, qty: 1 }; }
        const v = item.variants.find(x => x.barcode === code || x.sku === code);
        if (v) return { itemId: item.id, variantId: v.id, qty: 1 };
      }
      return null;
    }
    function drawChips() {
      chips.replaceChildren(h('button', { class: `chip ${!category ? 'active' : ''}`, 'data-testid': 'cat-all', onclick: () => { category = null; drawChips(); drawTiles(); } }, 'All'), ...menu.categories.map(c => h('button', { class: `chip ${category === c.id ? 'active' : ''}`, 'data-testid': `cat-${c.name}`, onclick: () => { category = c.id; drawChips(); drawTiles(); } }, c.name)));
    }
    function drawTiles() {
      grid.replaceChildren(...menu.items.filter(i => !category || i.categoryId === category).map(i => h('button', { class: `tile ${i.soldOut ? 'soldout' : ''}`, disabled: i.soldOut, style: `--tile:${(menu.categories.find(c => c.id === i.categoryId) || {}).color || 'var(--accent)'}`, 'data-testid': `item-${i.name}`, onclick: guard(() => choose(i)) },
        i.emoji ? h('span', { class: 'emoji', 'aria-hidden': 'true' }, i.emoji) : null, h('span', { class: 'name' }, i.name), h('span', { class: 'price' }, i.soldOut ? 'Sold out' : (i.variants.length ? 'from ' : '') + money(i.price)))));
    }
    async function choose(item) {
      const groups = item.modifierGroupIds.map(id => menu.modifierGroups.find(g => g.id === id)).filter(Boolean);
      if (!item.variants.length && !groups.length) { addToCart({ itemId: item.id, variantId: null, qty: 1 }); return drawCart(); }
      const choice = await POS.customize(item, groups, { allowNote: false });
      if (choice) { addToCart(choice); drawCart(); }
    }
    function drawCart() {
      const rows = cart.map(c => ({ c, d: describe(c) }));
      const sub = rows.reduce((s, r) => s + r.d.unit * r.c.qty, 0);
      cartEl.replaceChildren(
        h('div', { class: 'ticket-head' }, h('b', null, 'Your order'), orderType ? h('span', { class: 'pill', style: 'margin-left:8px' }, label(orderType)) : null),
        h('div', { class: 'lines' }, rows.length ? rows.map(({ c, d }) => h('div', { class: 'line', 'data-testid': `cart-${d.item.name}`, style: 'cursor:default' },
          h('div', { class: 'qty' }, c.qty), h('div', null, h('b', null, d.item.name + (d.variant ? ` · ${d.variant.name}` : '')), h('div', { class: 'mods' }, d.mods.map(m => m.name).join(', '))),
          h('div', { class: 'right' }, money(d.unit * c.qty), h('div', { class: 'row', style: 'margin-top:6px;justify-content:flex-end' },
            h('button', { 'aria-label': `Fewer ${d.item.name}`, style: 'min-height:48px;padding:0 14px', onclick: () => { c.qty--; if (c.qty < 1) cart.splice(cart.indexOf(c), 1); drawCart(); } }, '−'),
            h('button', { 'aria-label': `More ${d.item.name}`, style: 'min-height:48px;padding:0 14px', onclick: () => { c.qty++; drawCart(); } }, '+'))))) : h('p', { class: 'muted center', style: 'margin-top:30px' }, scan ? 'Scan an item or touch it on the screen' : 'Touch an item to add it')),
        h('div', { class: 'totals' }, h('div', { class: 'grand' }, h('span', null, 'Subtotal'), h('span', { 'data-testid': 'cart-subtotal' }, money(sub))), h('div', { class: 'muted' }, 'Tax and any discounts are added at the next step')),
        h('div', { class: 'actions' }, h('button', { 'data-testid': 'cancel-order', onclick: welcome }, 'Start over'), h('button', { class: 'primary', style: 'grid-column:span 2;min-height:76px;font-size:26px', 'data-testid': 'review', disabled: !cart.length, onclick: guard(review) }, 'Review & pay')));
      if (scan) scan.focus();
    }
    root.replaceChildren(h('div', { class: 'layout' }, h('div', { class: 'catalog-pane' }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, menu.business.name), scan ? h('div', { style: 'width:340px' }, scan) : null), chips, grid), cartEl));
    drawChips(); drawTiles(); drawCart();
  }

  async function review() {
    const lines = cart.map(c => ({ itemId: c.itemId, variantId: c.variantId, qty: c.qty, modifiers: c.modifiers, note: c.note }));
    let order;
    try { order = await api('POST', '/api/kiosk/orders', { type: orderType, lines }, { anon: true }); } catch (e) { toast(e.message); return; }
    let tip = 0;
    const totalEl = h('b', { 'data-testid': 'pay-total' }, money(order.totals.total));
    const tipRow = h('div', { class: 'choices', style: 'justify-content:center' });
    const base = order.totals.subtotal - order.totals.discount;
    const drawTip = () => {
      totalEl.textContent = money(order.totals.total + tip);
      tipRow.replaceChildren(h('button', { class: tip === 0 ? 'on' : '', 'data-testid': 'tip-none', onclick: () => { tip = 0; drawTip(); } }, 'No tip'), ...menu.tips.presets.map(p => { const v = Math.round(base * p / 100); return h('button', { class: tip === v ? 'on' : '', 'data-testid': `tip-${p}`, onclick: () => { tip = v; drawTip(); } }, `${p}% · ${money(v)}`); }));
    };
    const pay = guard(async method => {
      const res = await api('POST', `/api/kiosk/orders/${order.id}/pay`, { method, token: 'tok_kiosk', tip: menu.tips.enabled ? tip : undefined }, { anon: true });
      done(res.order, !!res.payAtCounter);
    });
    root.replaceChildren(h('div', { class: 'welcome', 'data-testid': 'review-screen' }, h('h1', null, 'Check your order'),
      h('div', { class: 'card', style: 'max-width:640px;margin:0 auto;text-align:left' }, order.lines.map(l => h('div', { class: 'row' }, h('span', { class: 'grow' }, `${l.qty} × ${l.name}${l.variantName ? ' · ' + l.variantName : ''}`), h('span', null, money(l.gross)))),
        order.totals.discount ? h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Discounts'), h('span', null, '-' + money(order.totals.discount))) : null,
        h('div', { class: 'row' }, h('span', { class: 'grow muted' }, order.totals.taxInclusive ? 'Tax (included)' : 'Tax'), h('span', { 'data-testid': 'pay-tax' }, money(order.totals.tax))),
        h('div', { class: 'row', style: 'font-size:32px;margin-top:8px' }, h('span', { class: 'grow' }, 'Total'), totalEl)),
      menu.tips.enabled ? h('div', { style: 'margin:16px 0' }, h('p', { class: 'muted' }, 'Add a tip?'), tipRow) : null,
      h('div', { class: 'row', style: 'justify-content:center;gap:20px;margin-top:20px' },
        menu.card.enabled ? h('button', { class: 'primary go', style: 'font-size:28px;min-height:96px', 'data-testid': 'pay-card', onclick: () => pay('card') }, 'Pay by card') : null,
        menu.kiosk.allowPayAtCounter ? h('button', { style: 'font-size:28px;min-height:96px', 'data-testid': 'pay-counter', onclick: () => pay('counter') }, 'Pay at the counter') : null),
      h('p', null, h('button', { class: 'ghost', 'data-testid': 'back', onclick: async () => { await api('POST', `/api/kiosk/orders/${order.id}/pay`, { method: 'cancel' }, { anon: true }).catch(() => { }); ordering(); } }, '← Change my order'))));
    if (menu.tips.enabled) drawTip();
  }

  function done(order, atCounter) {
    root.replaceChildren(h('div', { class: 'confirm', 'data-testid': 'done' }, h('h1', null, atCounter ? 'Almost done!' : 'Thank you!'),
      h('p', null, atCounter ? 'Take this number to the counter to pay:' : (order.lines.some(l => l.station) ? 'We are making your order. Your number is:' : 'Your receipt number is:')),
      h('div', { class: 'big-number', style: 'font-size:140px', 'data-testid': 'order-number' }, `#${order.number}`),
      h('button', { class: 'primary go', style: 'margin-top:30px', 'data-testid': 'new-order', onclick: welcome }, 'Start a new order')));
    clearTimeout(idle); idle = setTimeout(welcome, 20000);
  }

  start().catch(e => { root.replaceChildren(h('div', { class: 'welcome' }, h('h1', null, 'Self-checkout is not available'), h('p', { class: 'muted' }, e.message))); });
})();

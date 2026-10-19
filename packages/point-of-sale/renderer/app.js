'use strict';
// Staff app shell: first-run setup, PIN sign-in, navigation, open tabs, prep queue and order history.
(function () {
  const { h, api, money, toast, guard, dialog } = window.POS;
  const POS = window.POS;
  const root = document.getElementById('app');
  const state = POS.state = { me: null, cat: null, view: 'register', order: null, timer: null };

  const VIEWS = [
    ['register', 'Register', 'sell'], ['tabs', 'Tabs', 'tabs'], ['prep', 'Prep', 'prep'], ['orders', 'Orders', 'orders.view'],
    ['inventory', 'Inventory', 'inventory.view'], ['catalog', 'Menu & Catalog', 'catalog'], ['cash', 'Cash', 'drawer.open'],
    ['reports', 'Reports', 'reports'], ['team', 'Team & API', 'staff'], ['settings', 'Settings', 'settings'],
  ];
  const can = perm => state.me && state.me.permissions.includes(perm);
  POS.can = can;

  POS.onSignedOut = () => { if (state.me) { state.me = null; POS.token = null; sessionStorage.removeItem('pos-token'); boot(); } };

  async function loadCatalog() {
    state.cat = await api('GET', '/api/catalog');
    POS.settings = state.cat.settings;
    return state.cat;
  }
  POS.loadCatalog = loadCatalog;

  async function boot() {
    clearInterval(state.timer);
    const saved = sessionStorage.getItem('pos-token');
    if (saved) {
      POS.token = saved;
      try { state.me = await api('GET', '/api/me'); await loadCatalog(); return shell(); } catch { POS.token = null; sessionStorage.removeItem('pos-token'); }
    }
    const setup = await api('GET', '/api/setup', undefined, { anon: true });
    if (setup.needsSetup) return setupScreen(setup);
    loginScreen();
  }

  function setupScreen(setup) {
    root.replaceChildren(h('main', null, h('div', { class: 'screen-center' }, h('div', { class: 'keep-small' },
      h('h1', null, 'Welcome to ', h('span', { class: 'brand' }, 'Rob', h('b', null, 'OS'), ' Point of Sale')),
      h('p', { class: 'muted' }, 'Open-source cash register for shops, cafés and bars. Start with a sample business to look around, then edit it into your own. Sample team PINs: owner 1111, manager 2222, cashier 3333.'),
      setup.profiles.map(p => h('button', { class: 'card', style: 'display:block;width:100%;text-align:left;margin-bottom:10px', 'data-testid': `setup-${p.id}`, onclick: guard(async () => { await api('POST', `/api/setup/${p.id}`, {}, { anon: true }); boot(); }) },
        h('b', null, p.title), h('div', { class: 'muted' }, p.summary)))))));
  }

  function loginScreen() {
    const name = (POS.settings && POS.settings.business.name) || 'RobOS Point of Sale';
    const pad = POS.numpad({ mask: true, max: 8, testid: 'login' });
    const go = guard(async () => {
      const res = await api('POST', '/api/auth/login', { pin: pad.get() }, { anon: true });
      POS.token = res.token; sessionStorage.setItem('pos-token', res.token);
      state.me = res.staff; await loadCatalog(); state.view = 'register'; shell();
    });
    root.replaceChildren(h('main', null, h('div', { class: 'screen-center' }, h('div', { class: 'card', style: 'width:min(420px,100%)' },
      h('h2', { class: 'center' }, 'Enter your PIN'), h('p', { class: 'muted center' }, 'Sign in to start selling'), pad,
      h('button', { class: 'primary', style: 'width:100%;margin-top:10px', 'data-testid': 'login-submit', onclick: () => { go().then(() => pad.set('')); } }, 'Sign in'),
      h('p', { class: 'center muted' }, h('a', { href: '/kiosk', style: 'color:var(--accent)' }, 'Open self-checkout'), ' · ', h('a', { href: '/ready', style: 'color:var(--accent)' }, 'Order-ready board'))))));
    document.title = `${name} · Sign in`;
  }

  function shell() {
    const nav = h('div', { class: 'nav', role: 'tablist' }, VIEWS.filter(v => can(v[2])).map(([id, label]) => h('button', { role: 'tab', class: state.view === id ? 'active' : '', 'data-testid': `nav-${id}`, onclick: () => { state.view = id; shell(); } }, label)));
    const main = h('main', { 'data-testid': `view-${state.view}` });
    root.replaceChildren(h('div', { class: 'topbar' },
      h('span', { class: 'brand' }, 'Rob', h('b', null, 'OS'), ' POS'), h('span', { class: 'pill', 'data-testid': 'business-name' }, POS.settings.business.name), nav,
      h('span', { class: 'pill', 'data-testid': 'whoami' }, `${state.me.name}`),
      h('button', { 'data-testid': 'lock', onclick: guard(async () => { await api('POST', '/api/auth/logout', {}); POS.token = null; sessionStorage.removeItem('pos-token'); state.me = null; state.order = null; boot(); }) }, 'Lock')), main);
    document.title = `${POS.settings.business.name} · ${VIEWS.find(v => v[0] === state.view)[1]}`;
    clearInterval(state.timer);
    const render = { register: POS.registerView, tabs: tabsView, prep: prepView, orders: ordersView, inventory: POS.inventoryView, catalog: POS.catalogView, cash: POS.cashView, reports: POS.reportsView, team: POS.teamView, settings: POS.settingsView }[state.view];
    Promise.resolve(render(main)).catch(e => toast(e.message));
  }
  POS.shell = shell;
  POS.go = view => { state.view = view; shell(); };

  // ---- open tabs & self-checkout orders waiting for payment ----
  async function tabsView(main) {
    const orders = await api('GET', '/api/open-orders');
    const waiting = orders.filter(o => o.awaitingPayment);
    const tabs = orders.filter(o => !o.awaitingPayment);
    const open = id => { state.order = orders.find(o => o.id === id); POS.go('register'); };
    const card = o => h('button', { class: 'card', style: 'text-align:left;min-height:96px', 'data-testid': `tab-${o.number}`, onclick: () => open(o.id) },
      h('div', { class: 'row' }, h('b', { class: 'grow' }, o.tabName || o.customerName || `Order #${o.number}`), h('span', { class: 'pill' }, `#${o.number}`)),
      h('div', { class: 'muted' }, `${o.lines.filter(l => !l.removed).length} item(s) · ${o.type.replace('_', ' ')}`), h('b', null, money(o.totals.total)));
    const lookup = POS.numpad({ max: 6, testid: 'lookup' });
    main.append(
      h('div', { class: 'grid2' },
        h('div', null, h('h2', null, `Open tabs (${tabs.length})`), tabs.length ? h('div', { class: 'tickets' }, tabs.map(card)) : h('p', { class: 'muted', 'data-testid': 'no-tabs' }, 'No open tabs. Start one from the Register with the Tab button.')),
        h('div', null, h('h2', null, `Self-checkout waiting to pay (${waiting.length})`), waiting.length ? h('div', { class: 'tickets' }, waiting.map(card)) : h('p', { class: 'muted' }, 'Nobody is waiting at the counter.'),
          h('div', { class: 'card', style: 'margin-top:14px;max-width:360px' }, h('h3', null, 'Find an order by number'), lookup,
            h('button', { class: 'primary', style: 'width:100%;margin-top:8px', 'data-testid': 'lookup-go', onclick: guard(async () => { state.order = await api('GET', `/api/orders/by-number/${lookup.get()}`); POS.go('register'); }) }, 'Open order')))));
  }

  // ---- prep queue (kitchen / barista / bar screen) ----
  async function prepView(main) {
    const stations = [...new Set(state.cat.items.map(i => i.station).filter(Boolean))];
    let station = state.station || '';
    const holder = h('div', { 'data-testid': 'queue' });
    const chips = h('div', { class: 'tabs-row' }, ['', ...stations].map(s => h('button', { class: `chip ${station === s ? 'active' : ''}`, 'data-testid': `station-${s || 'all'}`, onclick: () => { state.station = s; POS.go('prep'); } }, s || 'All stations')));
    main.append(chips, holder);
    const draw = async () => {
      const queue = await api('GET', `/api/queue${station ? `?station=${station}` : ''}`);
      holder.replaceChildren(queue.length ? h('div', { class: 'tickets' }, queue.map(t => {
        const status = t.lines.every(l => l.prep === 'ready') ? 'ready' : t.lines.some(l => l.prep === 'preparing') ? 'preparing' : 'new';
        const next = status === 'new' ? ['preparing', 'Start'] : status === 'preparing' ? ['ready', 'Ready'] : ['served', 'Picked up'];
        return h('div', { class: `card ticket-card ${status}`, 'data-testid': `ticket-${t.number}` },
          h('div', { class: 'row' }, h('span', { class: 'num' }, `#${t.number}`), h('span', { class: 'grow muted' }, t.tabName || t.customerName || t.type.replace('_', ' ')), h('span', { class: `pill ${t.paid ? 'ok' : 'warn'}` }, t.paid ? 'paid' : 'unpaid')),
          t.lines.map(l => h('div', { style: 'padding:6px 0' }, h('b', null, `${l.qty} × ${l.name}${l.variantName ? ' ' + l.variantName : ''}`), h('div', { class: 'muted' }, l.modifiers.map(m => m.name).join(', ')), l.note ? h('div', { class: 'tag' }, `“${l.note}”`) : null)),
          h('button', { class: status === 'ready' ? 'good' : 'primary', style: 'width:100%;margin-top:8px', 'data-testid': `ticket-${t.number}-${next[0]}`, onclick: guard(async () => { await api('POST', `/api/orders/${t.orderId}/prep`, { status: next[0], lineIds: t.lines.filter(l => !station || l.station === station).map(l => l.id) }); draw(); }) }, next[1]));
      })) : h('p', { class: 'muted', 'data-testid': 'queue-empty' }, 'Nothing waiting. New orders appear here as soon as they are sent.'));
    };
    await draw();
    state.timer = setInterval(() => draw().catch(() => { }), 3000);
  }

  // ---- order history, receipts, refunds ----
  async function ordersView(main) {
    const orders = await api('GET', '/api/orders?limit=100');
    main.append(h('h2', null, 'Recent orders'), h('table', { 'data-testid': 'orders-table' }, h('thead', null, h('tr', null, ['#', 'When', 'Type', 'Status', 'Total'].map((c, i) => h('th', { class: i === 4 ? 'num' : '' }, c)))),
      h('tbody', null, orders.map(o => h('tr', { 'data-testid': `order-row-${o.number}`, style: 'cursor:pointer', onclick: () => orderDetail(o.id) },
        h('td', null, o.number), h('td', null, new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), h('td', null, o.type.replace('_', ' ')),
        h('td', null, h('span', { class: `pill ${o.status === 'paid' ? 'ok' : o.status === 'open' ? 'warn' : 'bad'}` }, o.status.replace('_', ' '))), h('td', { class: 'num' }, money(o.totals.total)))))));
    if (!orders.length) main.append(h('p', { class: 'muted' }, 'No orders yet today.'));
  }

  async function orderDetail(id) {
    const order = await api('GET', `/api/orders/${id}`);
    const receipt = await api('GET', `/api/orders/${id}/receipt`);
    const actions = [{ label: 'Close' }];
    if (['paid', 'partially_refunded'].includes(order.status)) actions.unshift({ label: 'Refund…', kind: 'danger', testid: 'refund-open', onclick: () => refundDialog(order) });
    dialog(`Order #${order.number}`, h('pre', { class: 'receipt', 'data-testid': 'receipt-text' }, receipt), { actions, testid: 'order-dialog' });
  }
  POS.orderDetail = orderDetail;

  function refundDialog(order) {
    const picks = new Map();
    const reason = h('input', { placeholder: 'Reason (required)', 'data-testid': 'refund-reason' });
    const restock = h('input', { type: 'checkbox', checked: true, style: 'width:28px;min-height:28px' });
    const rows = order.lines.filter(l => !l.removed && l.qty - l.refundedQty > 0).map(l => {
      const max = l.qty - l.refundedQty;
      const step = POS.stepper(0, { min: 0, max, onChange: v => picks.set(l.id, v) });
      return h('div', { class: 'row', style: 'padding:8px 0;border-bottom:1px dashed var(--border)' }, h('span', { class: 'grow' }, `${l.name}${l.variantName ? ' ' + l.variantName : ''} (${money(l.total / l.qty | 0)} each, ${max} left)`), step);
    });
    dialog(`Refund order #${order.number}`, h('div', null, rows, h('label', null, 'Reason'), reason, h('label', { class: 'row' }, restock, 'Put returned items back in stock')), {
      testid: 'refund-dialog', actions: [{ label: 'Cancel' }, {
        label: 'Refund', kind: 'danger', testid: 'refund-confirm', onclick: async () => {
          const lines = [...picks].filter(([, q]) => q > 0).map(([lineId, qty]) => ({ lineId, qty }));
          if (!lines.length) { toast('Choose at least one item'); return false; }
          const res = await POS.withOverride(pin => api('POST', `/api/orders/${order.id}/refund`, { lines, reason: reason.value, restock: restock.checked, managerPin: pin }));
          if (!res) return false;
          toast(`Refunded ${money(res.refunds[res.refunds.length - 1].amount)}`, 'ok');
          if (state.view === 'orders') POS.go('orders');
        },
      }],
    });
  }

  POS.on = boot;
  boot().catch(e => { root.textContent = e.message; });
})();

'use strict';
// RobOS Orders & Inventory UI: Orders, Stock and Suppliers tabs for any RobOS app. No framework and no inline
// code, so it runs under a strict Content-Security-Policy. Mount it with a bridge to the app's backend:
//   RobosOrders.mount(root, { call: (op, input) => Promise, say: text => {}, extras: { orders(ctx), stock(ctx) }, itemActions(item, ctx) })
// `call('board')` returns { orders, suppliers, items, suggestions, summary, currency, ...appData }; the other
// ops are addSupplier, createOrder, addLine, removeLine, placeOrder, receive, cancelOrder, addItem, updateItem,
// adjust, receiveStock and movements. `extras` and `itemActions` add app-specific panels and buttons.
(() => {
  const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (v === undefined || v === null || v === false) continue; if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else e.setAttribute(k, v); } e.append(...kids.flat().filter(k => k !== null && k !== undefined && k !== false)); return e; };
  const money = (minor, cur = 'USD') => minor == null ? '—' : (minor / 100).toLocaleString(undefined, { style: 'currency', currency: cur });
  const qty = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
  const clean = m => String(m || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  function mount(root, opts) {
    const call = opts.call, say = opts.say || (() => {}); let tab = opts.tab || 'orders', board = null;
    const btn = (label, fn, cls = '') => { const b = el('button', { type: 'button', class: cls, text: label }); b.addEventListener('click', () => Promise.resolve().then(fn).catch(e => say(clean(e.message)))); return b; };
    const field = (label, name, o = {}) => { const c = o.options ? el('select', { name }, ...o.options.map(([v, t]) => el('option', { value: v, text: t }))) : o.area ? el('textarea', { name, rows: '2' }) : el('input', { name, type: o.type || 'text', placeholder: o.ph || '', inputmode: o.numeric ? 'decimal' : null }); if (o.value !== undefined && o.value !== null) c.value = o.value; return el('label', { class: o.cls || null }, label, c); };
    const read = f => Object.fromEntries([...f.querySelectorAll('[name]')].map(c => [c.name, c.value]));
    const act = async (op, input, done) => { const r = await call(op, input); await render(); if (done) say(typeof done === 'function' ? done(r) : done); return r; };
    const ctx = { el, btn, field, read, money, act, call, say, refresh: () => render(), get board() { return board; } };
    const supplierOptions = () => [['', 'Choose a supplier'], ...board.suppliers.map(s => [s.id, s.name])];
    const supplierFor = name => board.suppliers.find(s => s.name.toLowerCase() === String(name || '').toLowerCase())?.id || '';
    async function render() {
      try {
        board = await call('board');
        const tabs = el('div', { class: 'tabs ro-tabs', role: 'tablist' }, ...[['orders', 'Orders'], ['stock', 'Stock'], ['suppliers', 'Suppliers']].map(([id, label]) => { const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), 'data-ro-tab': id, text: label + (id === 'stock' && board.summary.low ? ` (${board.summary.low} low)` : '') }); b.addEventListener('click', () => { tab = id; say(''); render(); }); return b; }));
        root.replaceChildren(el('div', { class: 'ro' }, tabs, ...({ orders, stock, suppliers }[tab])()));
      } catch (e) { say(clean(e.message)); }
    }
    // ---- orders
    function orders() {
      const by = (...s) => board.orders.filter(o => s.includes(o.status));
      return [opts.extras?.orders?.(ctx), reorderPanel(), newOrder(),
        group('Drafts', by('draft'), 'Add lines, then place the order with the supplier.'), group('Waiting for delivery', by('placed', 'partly-received'), 'Receive each delivery as it arrives. Stock lines go straight into Stock.'),
        el('details', { class: 'card ro-history' }, el('summary', { text: `Received, closed and cancelled (${by('received', 'closed', 'cancelled').length})` }), ...by('received', 'closed', 'cancelled').slice(0, 25).map(orderCard))];
    }
    function group(title, list, hint) { return el('section', { class: 'ro-group', 'data-ro-group': title }, el('h3', { text: `${title} (${list.length})` }), el('p', { class: 'note', text: hint }), ...(list.length ? list.map(orderCard) : [el('p', { class: 'note', text: 'Nothing here right now.' })])); }
    function reorderPanel() {
      const s = board.suggestions; if (!s.length) return null;
      const rows = s.map(x => ({ x, qtyIn: el('input', { name: 'qty', value: qty(x.suggestedQty), inputmode: 'decimal', 'aria-label': 'Quantity for ' + x.name }), sup: el('select', { name: 'supplier', 'aria-label': 'Supplier for ' + x.name }, ...supplierOptions().map(([v, t]) => el('option', { value: v, text: t }))) }));
      rows.forEach(r => { r.sup.value = supplierFor(r.x.supplier); });
      return el('div', { class: 'card ro-reorder', 'data-ro': 'reorder' }, el('h3', { text: `Running low (${s.length})` }), el('p', { class: 'note', text: 'At or below the reorder point, counting what is already on order.' }),
        el('table', { class: 'ro-table' }, el('thead', {}, el('tr', {}, ...['Item', 'On hand', 'On order', 'Reorder at', 'Order', 'Supplier'].map(h => el('th', { text: h })))), el('tbody', {}, ...rows.map(r => el('tr', {}, el('td', { text: r.x.name + (r.x.sku ? ' · ' + r.x.sku : '') }), el('td', { text: qty(r.x.onHand) }), el('td', { text: qty(r.x.onOrder) }), el('td', { text: qty(r.x.reorderPoint) }), el('td', {}, r.qtyIn), el('td', {}, r.sup))))),
        btn('Add to draft orders', async () => {
          const bySup = {}; for (const r of rows) { if (!r.sup.value) throw new Error(`Choose a supplier for ${r.x.name}`); (bySup[r.sup.value] ||= []).push({ item: r.x.item, qty: r.qtyIn.value }); }
          for (const [supplier, lines] of Object.entries(bySup)) await call('createOrder', { supplier, lines, appendToDraft: true });
          await render(); say('Added to draft orders. Review and place them below.');
        }, 'big-btn'));
    }
    function newOrder() {
      if (!board.suppliers.length) return el('div', { class: 'notice warn', text: 'Add a supplier on the Suppliers tab before you start an order.' });
      const f = el('form', { class: 'card ro-new-order', 'data-ro': 'new-order' }, el('h3', { text: 'Start an order' }), el('div', { class: 'row' }, field('Supplier', 'supplier', { options: supplierOptions() }), field('Expected (optional)', 'expectedOn', { type: 'date' })), field('Note (optional)', 'note'));
      f.append(btn('Start draft order', () => act('createOrder', read(f), o => `${o.number} started. Add the items below.`)));
      return el('details', { class: 'ro-drawer' }, el('summary', { text: '+ Start an order' }), f);
    }
    function lineTable(o, editable) {
      return el('table', { class: 'ro-table' }, el('thead', {}, el('tr', {}, ...['Item', 'Qty', 'Received', 'Unit cost', 'Amount', 'For', ''].map(h => el('th', { text: h })))),
        el('tbody', {}, ...o.lines.map(l => el('tr', { 'data-line': l.description }, el('td', { text: l.description + (l.sku ? ' · ' + l.sku : '') + (l.item ? '' : ' (not stocked)') }), el('td', { text: qty(l.qty) }), el('td', { text: l.cancelledQty ? `${qty(l.receivedQty)} (${qty(l.cancelledQty)} cancelled)` : qty(l.receivedQty) }), el('td', { text: money(l.unitCostMinor, o.currency) }), el('td', { text: money(l.amount, o.currency) }), el('td', { text: l.forLabel || '' }),
          el('td', {}, editable ? btn('Remove', () => act('removeLine', { order: o.id, line: l.id }), 'secondary') : null)))),
        el('tfoot', {}, el('tr', {}, el('th', { text: 'Total', colspan: '4' }), el('th', { text: money(o.total, o.currency) }), el('th', { colspan: '2' }))));
    }
    function orderCard(o) {
      const card = el('article', { class: 'card ro-order', 'data-order': o.number, 'data-status': o.status }, el('div', { class: 'ro-order-top' }, el('b', { text: `${o.number} · ${o.supplier}` }), el('span', { class: 'badge', text: o.statusLabel }), o.expectedOn ? el('span', { class: 'note', text: 'Expected ' + o.expectedOn }) : null, o.reference ? el('span', { class: 'note', text: 'Supplier ref ' + o.reference }) : null), o.note ? el('p', { class: 'note', text: o.note }) : null, lineTable(o, o.status === 'draft'));
      if (o.status === 'draft') {
        const items = board.items.filter(i => i.active);
        const add = el('form', { class: 'row ro-add-line' }, field('Stock item', 'item', { options: [['', 'Not a stock item'], ...items.map(i => [i.id, i.name + (i.sku ? ' · ' + i.sku : '')])] }), field('Or describe it', 'description', { ph: 'Coolant hose' }), field('Qty', 'qty', { value: '1', numeric: true }), field('Unit cost', 'unitCost', { ph: 'Item cost', numeric: true }));
        const place = el('form', { class: 'row ro-place' }, field('Placed by', 'via', { options: [['phone', 'Phone'], ['email', 'Email'], ['website', 'Website'], ['in person', 'In person'], ['other', 'Other']] }), field('Supplier order number', 'reference'), field('Expected', 'expectedOn', { type: 'date', value: o.expectedOn }));
        card.append(add, btn('Add line', () => act('addLine', { order: o.id, ...read(add) })), place, btn('Place order', () => act('placeOrder', { order: o.id, ...read(place) }, `${o.number} placed with ${o.supplier}.`), 'big-btn'), cancelBox(o, 'Cancel draft'));
      } else if (['placed', 'partly-received'].includes(o.status)) {
        const open = o.lines.filter(l => l.remaining > 0), inputs = open.map(l => ({ l, q: el('input', { name: 'qty', value: qty(l.remaining), inputmode: 'decimal', 'aria-label': 'Received ' + l.description }), c: el('input', { name: 'unitCost', placeholder: (l.unitCostMinor / 100).toFixed(2), inputmode: 'decimal', 'aria-label': 'Invoice cost ' + l.description }) }));
        const by = el('input', { name: 'by', placeholder: 'Your name' });
        card.append(el('div', { class: 'ro-receive' }, el('h4', { text: 'Receive a delivery' }), el('table', { class: 'ro-table' }, el('thead', {}, el('tr', {}, ...['Item', 'Still due', 'Arrived', 'Invoice unit cost'].map(h => el('th', { text: h })))), el('tbody', {}, ...inputs.map(r => el('tr', {}, el('td', { text: r.l.description }), el('td', { text: qty(r.l.remaining) }), el('td', {}, r.q), el('td', {}, r.c))))),
          el('label', {}, 'Received by', by), btn('Receive delivery', () => act('receive', { order: o.id, by: by.value, lines: inputs.map(r => ({ line: r.l.id, qty: r.q.value, unitCost: r.c.value })) }, r => r.status === 'received' ? `${o.number} received in full.` : `Delivery recorded; ${o.number} is partly received.`), 'big-btn')),
          cancelBox(o, o.status === 'placed' ? 'Cancel order' : 'Close the rest of the order'));
      }
      card.append(el('details', {}, el('summary', { text: 'Order history' }), el('ol', { class: 'timeline' }, ...o.events.slice().reverse().map(e => el('li', {}, el('b', { text: e.kind }), ' ', el('span', { text: e.detail }))))));
      return card;
    }
    function cancelBox(o, label) { const r = el('input', { name: 'reason', placeholder: 'Reason' }); return el('details', { class: 'ro-cancel' }, el('summary', { text: label }), el('label', {}, 'Why?', r), btn(label, () => act('cancelOrder', { order: o.id, reason: r.value }, `${o.number} ${o.status === 'partly-received' ? 'closed' : 'cancelled'}.`), 'secondary')); }
    // ---- stock
    function stock() {
      const s = board.summary, items = board.items;
      const add = el('form', { class: 'card ro-add-item', 'data-ro': 'add-item' }, el('h3', { text: 'Add a stock item' }), el('div', { class: 'row' }, field('Name', 'name', { ph: 'Front brake pads' }), field('SKU or part number', 'sku'), field('Unit', 'unit', { ph: 'each' })),
        el('div', { class: 'row' }, field('Opening count', 'onHand', { ph: '0', numeric: true }), field('Reorder when at or below', 'reorderPoint', { ph: '2', numeric: true }), field('Reorder quantity', 'reorderQty', { ph: '4', numeric: true })),
        el('div', { class: 'row' }, field('Unit cost', 'unitCost', { ph: '30.00', numeric: true }), field('Usual supplier', 'supplier', { options: [['', 'None'], ...board.suppliers.map(x => [x.name, x.name])] }), field('Shelf or bin', 'location', { ph: 'Rack B2' })));
      add.append(btn('Add stock item', () => act('addItem', read(add), i => `${i.name} added.`), 'big-btn'));
      return [el('div', { class: 'metric-grid ro-metrics' }, ...[['Stock items', s.items, ''], ['Running low', s.low, 'At or below the reorder point'], ['Stock value', money(s.value, s.currency), 'On hand × last cost']].map(([l, v, n]) => el('article', { class: 'metric' }, el('span', { text: l }), el('strong', { text: String(v) }), el('small', { text: n })))),
        opts.extras?.stock?.(ctx), items.length ? el('div', { class: 'ro-items' }, ...items.map(itemCard)) : el('p', { class: 'note', text: 'No stock items yet.' }), el('details', { class: 'ro-drawer', open: items.length ? null : '' }, el('summary', { text: '+ Add a stock item' }), add)];
    }
    function itemCard(i) {
      const card = el('article', { class: 'card ro-item' + (i.low ? ' low' : ''), 'data-item': i.name }, el('div', { class: 'ro-order-top' }, el('b', { text: i.name }), i.sku ? el('span', { class: 'note', text: i.sku }) : null, i.low ? el('span', { class: 'badge urgent', text: 'Low' }) : null),
        el('dl', { class: 'summary-grid' }, el('dt', { text: 'On hand' }), el('dd', { text: `${qty(i.onHand)} ${i.unit}` }), el('dt', { text: 'On order' }), el('dd', { text: qty(i.onOrder || 0) }), el('dt', { text: 'Reorder at' }), el('dd', { text: i.reorderPoint == null ? 'Not set' : qty(i.reorderPoint) + (i.reorderQty ? `, order ${qty(i.reorderQty)}` : '') }),
          el('dt', { text: 'Last cost' }), el('dd', { text: money(i.unitCost, i.currency) }), i.location ? el('dt', { text: 'Location' }) : null, i.location ? el('dd', { text: i.location }) : null, i.supplier ? el('dt', { text: 'Supplier' }) : null, i.supplier ? el('dd', { text: i.supplier }) : null));
      const count = el('form', { class: 'row' }, field('Counted on the shelf', 'counted', { numeric: true }), field('Reason', 'reason', { ph: 'Monthly count' }));
      const recv = el('form', { class: 'row' }, field('Quantity', 'qty', { numeric: true }), field('Unit cost', 'unitCost', { numeric: true }), field('Note', 'reason', { ph: 'Bought at the counter' }));
      const history = el('details', { class: 'ro-moves' }, el('summary', { text: 'Stock history' }));
      history.addEventListener('toggle', async () => { if (!history.open || history.dataset.loaded) return; history.dataset.loaded = '1'; const list = await call('movements', { item: i.id }); history.append(el('ol', { class: 'timeline' }, ...list.map(m => el('li', {}, el('b', { text: `${m.qty > 0 ? '+' : ''}${qty(m.qty)}` }), ` ${m.kind} · ${new Date(m.at).toLocaleDateString()}${m.referenceLabel ? ' · ' + m.referenceLabel : ''}${m.reason ? ' · ' + m.reason : ''}${m.by ? ' · ' + m.by : ''}`)))); });
      card.append(el('div', { class: 'ro-item-actions' }, ...(opts.itemActions?.(i, ctx) || []),
        el('details', {}, el('summary', { text: 'Count' }), count, btn('Save count', () => act('adjust', { item: i.id, ...read(count) }, `${i.name} count saved.`))),
        el('details', {}, el('summary', { text: 'Receive without an order' }), recv, btn('Add to stock', () => act('receiveStock', { item: i.id, ...read(recv) }, `${i.name} received.`))), history));
      return card;
    }
    // ---- suppliers
    function suppliers() {
      const f = el('form', { class: 'card', 'data-ro': 'add-supplier' }, el('h3', { text: 'Add a supplier' }), el('div', { class: 'row' }, field('Name', 'name', { ph: 'NAPA Auto Parts' }), field('Phone', 'phone', { type: 'tel' }), field('Email', 'email', { type: 'email' })), el('div', { class: 'row' }, field('Your account number', 'account'), field('Notes', 'notes')));
      f.append(btn('Add supplier', () => act('addSupplier', read(f), s => `${s.name} added.`), 'big-btn'));
      return [...(board.suppliers.length ? board.suppliers.map(s => el('div', { class: 'row-card', 'data-supplier': s.name }, el('div', {}, el('b', { text: s.name }), el('div', { class: 'note', text: [s.phone, s.email, s.account ? 'account ' + s.account : '', s.openOrders ? s.openOrders + ' open order(s)' : ''].filter(Boolean).join(' · ') })))) : [el('p', { class: 'note', text: 'No suppliers yet.' })]), f];
    }
    render();
    return { render, show: t => { tab = t; return render(); } };
  }
  window.RobosOrders = { mount, money };
})();

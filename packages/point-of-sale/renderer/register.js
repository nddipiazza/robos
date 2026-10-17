'use strict';
// The worker order-entry screen: big tiles, tickets, discounts, tips, tabs and the payment sheet.
(function () {
  const POS = window.POS;
  const { h, api, money, toast, guard, dialog } = POS;

  POS.registerView = async function (main) {
    const st = POS.state, cat = st.cat, settings = cat.settings;
    let category = st.category || null;
    let search = '';
    const types = [...new Set([...settings.orderTypes, 'tab'])];
    st.orderType = st.orderType || settings.orderTypes[0];

    const grid = h('div', { class: 'tiles', 'data-testid': 'tiles' });
    const chipRow = h('div', { class: 'chips' });
    const ticket = h('div', { class: 'card ticket', 'data-testid': 'ticket' });
    const scan = h('input', { placeholder: 'Scan barcode or type SKU, press Enter', 'data-testid': 'scan', autocomplete: 'off', enterkeyhint: 'go',
      onkeydown: guard(async e => { if (e.key !== 'Enter' || !scan.value.trim()) return; const code = scan.value.trim(); scan.value = ''; await ensureOrder(); await apply(api('POST', `/api/orders/${st.order.id}/scan`, { code })); scan.focus(); }) });
    const find = h('input', { type: 'search', placeholder: 'Search items', 'aria-label': 'Search items', 'data-testid': 'item-search', oninput: e => { search = e.target.value.toLowerCase(); drawTiles(); } });

    main.append(h('div', { class: 'register' },
      h('div', { class: 'catalog-pane' },
        h('div', { class: 'row wrap' }, h('div', { class: 'row', role: 'group', 'aria-label': 'Order type' }, types.map(t => h('button', { class: `chip ${st.orderType === t ? 'active' : ''}`, 'data-testid': `type-${t}`, disabled: !!(st.order && st.order.lines.length), onclick: () => { st.orderType = t; POS.go('register'); } }, t.replace('_', ' ')))), h('div', { class: 'grow' }, scan), h('div', { style: 'width:200px' }, find)),
        chipRow, grid),
      ticket));

    function drawChips() {
      chipRow.replaceChildren(h('button', { class: `chip ${!category ? 'active' : ''}`, 'data-testid': 'cat-all', onclick: () => { category = null; st.category = null; drawChips(); drawTiles(); } }, 'All'),
        ...cat.categories.map(c => h('button', { class: `chip ${category === c.id ? 'active' : ''}`, style: `border-bottom:4px solid ${c.color}`, 'data-testid': `cat-${c.name}`, onclick: () => { category = c.id; st.category = c.id; drawChips(); drawTiles(); } }, c.name)));
    }
    function drawTiles() {
      const items = cat.items.filter(i => (!category || i.categoryId === category) && (!search || i.name.toLowerCase().includes(search)));
      grid.replaceChildren(...items.map(i => {
        const color = (cat.categories.find(c => c.id === i.categoryId) || {}).color;
        return h('button', { class: 'tile', style: `--tile:${color || 'var(--accent)'}`, 'data-testid': `item-${i.name}`, onclick: guard(() => pick(i)) },
          i.emoji ? h('span', { class: 'emoji', 'aria-hidden': 'true' }, i.emoji) : null, h('span', { class: 'name' }, i.name), h('span', { class: 'price' }, (i.variants.length ? 'from ' : '') + money(i.price)));
      }));
      if (!items.length) grid.append(h('p', { class: 'muted' }, 'No items match.'));
    }

    async function ensureOrder() {
      if (st.order && st.order.status === 'open') return st.order;
      let tabName = '';
      if (st.orderType === 'tab') {
        tabName = await new Promise(resolve => {
          const input = h('input', { placeholder: 'Name for the tab', 'data-testid': 'tab-name' });
          let done = false;
          dialog('Open a tab', input, { testid: 'tab-dialog', onClose: () => { if (!done) resolve(null); }, actions: [{ label: 'Cancel' }, { label: 'Open tab', kind: 'primary', testid: 'tab-open', onclick: () => { if (!input.value.trim()) { toast('Enter a name for the tab'); return false; } done = true; resolve(input.value.trim()); } }] });
        });
        if (!tabName) throw new Error('Tab not opened');
      }
      st.order = await api('POST', '/api/orders', { type: st.orderType, tabName });
      return st.order;
    }

    async function apply(promise) { st.order = await promise; drawTicket(); }

    async function pick(item) {
      const groups = item.modifierGroupIds.map(id => cat.modifierGroups.find(g => g.id === id)).filter(Boolean);
      if (!item.variants.length && !groups.length) { await ensureOrder(); return apply(api('POST', `/api/orders/${st.order.id}/lines`, { itemId: item.id })); }
      const choice = await POS.customize(item, groups);
      if (!choice) return;
      await ensureOrder();
      await apply(api('POST', `/api/orders/${st.order.id}/lines`, choice));
    }

    function drawTicket() {
      const o = st.order;
      const lines = o ? o.lines.filter(l => !l.removed) : [];
      const t = o ? o.totals : { subtotal: 0, discount: 0, tax: 0, tip: 0, total: 0, due: 0, rounding: 0 };
      const hasSent = lines.some(l => l.sent);
      const unsent = lines.some(l => !l.sent && l.station);
      ticket.replaceChildren(
        h('div', { class: 'ticket-head' }, h('div', { class: 'row' }, h('b', { class: 'grow', 'data-testid': 'order-title' }, o ? `Order #${o.number}${o.tabName ? ' · ' + o.tabName : ''}` : 'New order'), o ? h('span', { class: 'pill' }, o.type.replace('_', ' ')) : null),
          o && o.awaitingPayment ? h('div', { class: 'pill warn' }, 'Customer chose to pay at the counter') : null),
        h('div', { class: 'lines', 'data-testid': 'lines' }, lines.length ? lines.map(l => h('div', { class: 'line', 'data-testid': `line-${l.name}`, onclick: guard(() => lineDialog(l)) },
          h('div', { class: 'qty' }, l.qty), h('div', null, h('b', null, l.name + (l.variantName ? ` · ${l.variantName}` : '')), h('div', { class: 'mods' }, l.modifiers.map(m => m.name).join(', ')), l.note ? h('div', { class: 'mods' }, `“${l.note}”`) : null,
            l.priceRule ? h('div', { class: 'tag' }, l.priceRule) : null, l.comped ? h('div', { class: 'tag' }, `Comped: ${l.compReason}`) : null, l.sent && l.station ? h('div', { class: 'tag' }, `Sent · ${l.prep || ''}`) : null, l.settled ? h('div', { class: 'tag' }, 'Paid') : null),
          h('div', { class: 'right' }, money(l.gross)))) : h('p', { class: 'muted center', style: 'margin-top:30px' }, 'Tap an item to start the order')),
        o && o.discounts.length ? h('div', { class: 'totals' }, o.discounts.map(d => h('div', null, h('span', null, `${d.name} `, h('button', { class: 'ghost', style: 'min-height:32px;padding:0 8px', 'aria-label': `Remove ${d.name}`, onclick: guard(() => apply(api('DELETE', `/api/orders/${o.id}/discounts/${d.id}`))) }, '✕')), h('span', null, '-' + money(d.amount))))) : null,
        h('div', { class: 'totals' },
          h('div', null, h('span', null, 'Subtotal'), h('span', { 'data-testid': 'subtotal' }, money(t.subtotal))),
          t.discount ? h('div', null, h('span', null, 'Discount'), h('span', { 'data-testid': 'discount' }, '-' + money(t.discount))) : null,
          h('div', null, h('span', null, t.taxInclusive ? 'Tax (included)' : 'Tax'), h('span', { 'data-testid': 'tax' }, money(t.tax))),
          t.tip ? h('div', null, h('span', null, 'Tip'), h('span', { 'data-testid': 'tip' }, money(t.tip))) : null,
          h('div', { class: 'grand' }, h('span', null, 'Total'), h('span', { 'data-testid': 'total' }, money(t.total)))),
        h('div', { class: 'actions' },
          h('button', { 'data-testid': 'send', disabled: !lines.length || !unsent, onclick: guard(async () => { const r = await api('POST', `/api/orders/${o.id}/send`, {}); st.order = r.order; toast(`Sent ${r.sent} item(s) to prep`, 'ok'); drawTicket(); }) }, 'Send'),
          h('button', { 'data-testid': 'discount-open', disabled: !lines.length, onclick: guard(discountDialog) }, 'Discount'),
          h('button', { 'data-testid': 'tip-open', disabled: !lines.length || !settings.tips.enabled, onclick: guard(tipDialog) }, 'Tip'),
          h('button', { 'data-testid': 'age-check', disabled: !lines.some(l => l.ageRestricted) || (o && o.ageVerifiedBy), class: lines.some(l => l.ageRestricted) && !(o && o.ageVerifiedBy) ? 'danger' : '', onclick: guard(() => apply(api('POST', `/api/orders/${o.id}/age`, {}))) }, o && o.ageVerifiedBy ? 'ID checked ✓' : 'Check ID'),
          h('button', { 'data-testid': 'hold', disabled: !o || !o.lines.length, onclick: () => { st.order = null; POS.go('tabs'); } }, 'Hold'),
          h('button', { class: 'danger', 'data-testid': 'void-order', disabled: !o, onclick: guard(voidDialog) }, 'Void'),
          h('button', { class: 'primary pay', 'data-testid': 'pay', disabled: !lines.length, onclick: guard(payDialog) }, lines.length ? `Pay ${money(t.due)}` : 'Pay')));
    }

    async function lineDialog(line) {
      const o = st.order;
      const qty = POS.stepper(line.qty, { min: 1, max: 99 });
      const actions = [{ label: 'Close' }];
      if (!line.sent) actions.unshift({ label: 'Update quantity', kind: 'primary', testid: 'line-update', onclick: () => apply(api('POST', `/api/orders/${o.id}/lines/${line.id}/qty`, { qty: qty.get() })) });
      actions.unshift({ label: 'Comp', testid: 'line-comp', onclick: () => reasonDialog('Comp this item', async (reason, pin) => apply(api('POST', `/api/orders/${o.id}/lines/${line.id}/comp`, { reason, managerPin: pin }))), keepOpen: false });
      actions.unshift({ label: 'Remove', kind: 'danger', testid: 'line-remove', onclick: async () => {
        if (!line.sent) { await apply(api('POST', `/api/orders/${o.id}/lines/${line.id}/remove`, {})); return; }
        await reasonDialog('Void a sent item', (reason, pin) => apply(api('POST', `/api/orders/${o.id}/lines/${line.id}/remove`, { reason, managerPin: pin })));
      } });
      dialog(line.name, h('div', { class: 'row' }, line.sent ? h('span', { class: 'muted' }, 'Already sent to prep.') : qty), { actions: line.settled ? [{ label: 'Close' }] : actions, testid: 'line-dialog' });
    }

    // Ask for a reason (quick buttons), then run `fn(reason, managerPin)` with manager override when needed.
    function reasonDialog(title, fn) {
      const reasons = ['Customer changed mind', 'Wrong item', 'Spilled / dropped', 'Birthday / regular', 'Quality issue'];
      const input = h('input', { placeholder: 'Reason', 'data-testid': 'reason' });
      const body = h('div', null, h('div', { class: 'choices', style: 'margin-bottom:10px' }, reasons.map(r => h('button', { type: 'button', onclick: () => { input.value = r; } }, r))), input);
      return new Promise(resolve => dialog(title, body, { testid: 'reason-dialog', onClose: resolve, actions: [{ label: 'Cancel' }, { label: 'Confirm', kind: 'primary', testid: 'reason-ok', onclick: async () => { if (!input.value.trim()) { toast('A reason is required'); return false; } const r = await POS.withOverride(pin => fn(input.value.trim(), pin)); if (r === undefined) return false; } }] }));
    }

    async function discountDialog() {
      const o = st.order;
      const code = h('input', { placeholder: 'Promo code', 'data-testid': 'promo-code', autocapitalize: 'characters' });
      let reasonText = 'Manual discount';
      const run = guard(async body => { await apply(POS.withOverride(pin => api('POST', `/api/orders/${o.id}/discounts`, { ...body, managerPin: pin })).then(r => r || st.order)); d.close(); });
      const amount = POS.numpad({ decimal: true, max: 8, testid: 'disc', label: t => `$${t || '0'}` });
      const reason = h('input', { value: reasonText, oninput: e => { reasonText = e.target.value; }, 'data-testid': 'disc-reason' });
      const d = dialog('Discount', h('div', null,
        h('label', null, 'Promo code'), h('div', { class: 'row' }, code, h('button', { class: 'primary', 'data-testid': 'promo-apply', onclick: () => run({ code: code.value }) }, 'Apply')),
        h('label', null, 'Percent off'), h('div', { class: 'choices' }, [5, 10, 15, 20, 50].map(p => h('button', { 'data-testid': `pct-${p}`, onclick: () => run({ type: 'percent', value: p, reason: reasonText }) }, `${p}%`))),
        h('label', null, 'Dollar amount off'), amount, h('button', { style: 'margin-top:8px;width:100%', 'data-testid': 'amount-apply', onclick: () => { const c = POS.parseMoney(amount.get()); if (!c) return toast('Enter an amount'); run({ type: 'fixed', value: c, reason: reasonText }); } }, 'Apply dollar discount'),
        h('label', null, 'Reason (manual discounts)'), reason), { testid: 'discount-dialog', actions: [{ label: 'Close' }] });
    }

    function tipDialog() {
      const o = st.order;
      const custom = POS.numpad({ decimal: true, max: 7, testid: 'tipcustom', label: t => `$${t || '0'}` });
      const set = guard(async body => { await apply(api('POST', `/api/orders/${o.id}/tip`, body)); d.close(); });
      const d = dialog('Add a tip', h('div', null, h('div', { class: 'choices' }, settings.tips.presets.map(p => h('button', { class: 'primary', 'data-testid': `tip-${p}`, onclick: () => set({ percent: p }) }, `${p}%`)), h('button', { 'data-testid': 'tip-none', onclick: () => set({}) }, 'No tip')), h('label', null, 'Custom amount'), custom,
        h('button', { style: 'width:100%;margin-top:8px', 'data-testid': 'tip-custom-apply', onclick: () => { const c = POS.parseMoney(custom.get()); if (c === null) return toast('Enter an amount'); set({ amount: c }); } }, 'Use custom tip')), { testid: 'tip-dialog', actions: [{ label: 'Close' }] });
    }

    async function voidDialog() {
      const o = st.order;
      if (!o.lines.length) { st.order = null; drawTicket(); return; }
      await reasonDialog('Void this order', async (reason, pin) => { await api('POST', `/api/orders/${o.id}/void`, { reason, managerPin: pin }); st.order = null; drawTicket(); return true; });
    }

    // ---- payment sheet ----
    function payDialog() {
      const o = st.order;
      const methods = [settings.cash.enabled && 'cash', settings.card.enabled && 'card'].filter(Boolean);
      const sheet = { method: methods[0], amount: null, lineIds: [], tendered: '', reference: '' };
      const body = h('div');
      const open = o.lines.filter(l => !l.removed && !l.settled);
      const dueNow = () => (sheet.amount !== null ? sheet.amount : sheet.lineIds.length ? null : o.totals.due);
      const draw = () => {
        const due = o.totals.due;
        body.replaceChildren(
          h('div', { class: 'center' }, h('div', { class: 'muted' }, 'Balance due'), h('div', { class: 'big-number', 'data-testid': 'due' }, money(due))),
          o.totals.paid ? h('p', { class: 'center muted' }, `Already paid ${money(o.totals.paid)}`) : null,
          h('div', { class: 'row wrap', style: 'justify-content:center;margin:8px 0' },
            h('span', { class: 'muted' }, 'Pay'), h('button', { class: `chip ${sheet.amount === null && !sheet.lineIds.length ? 'active' : ''}`, 'data-testid': 'pay-full', onclick: () => { sheet.amount = null; sheet.lineIds = []; draw(); } }, 'All'),
            [2, 3, 4].map(n => h('button', { class: `chip ${sheet.amount !== null && sheet.split === n ? 'active' : ''}`, 'data-testid': `pay-split-${n}`, onclick: guard(async () => { const { amounts } = await api('POST', `/api/orders/${o.id}/split`, { parts: n }); sheet.amount = amounts[0]; sheet.split = n; sheet.lineIds = []; draw(); }) }, `Split ÷${n}`)),
            open.length > 1 ? h('button', { class: `chip ${sheet.lineIds.length ? 'active' : ''}`, 'data-testid': 'pay-items', onclick: () => { sheet.lineIds = sheet.lineIds.length ? [] : [open[0].id]; sheet.amount = null; draw(); } }, 'By item') : null),
          sheet.lineIds.length || (open.length > 1 && sheet.lineIds.length) ? h('div', { class: 'choices', style: 'margin-bottom:8px' }, open.map(l => h('button', { class: sheet.lineIds.includes(l.id) ? 'on' : '', 'data-testid': `pay-line-${l.name}`, onclick: () => { sheet.lineIds = sheet.lineIds.includes(l.id) ? sheet.lineIds.filter(x => x !== l.id) : [...sheet.lineIds, l.id]; draw(); } }, `${l.name} ${money(l.total)}`))) : null,
          h('div', { class: 'tabs-row', style: 'justify-content:center' }, methods.map(m => h('button', { class: `chip ${sheet.method === m ? 'active' : ''}`, 'data-testid': `method-${m}`, onclick: () => { sheet.method = m; draw(); } }, m === 'cash' ? 'Cash' : 'Card'))),
          sheet.method === 'cash' ? cashPane(due) : cardPane());
      };

      const cashPane = due => {
        const target = sheet.amount !== null ? sheet.amount : (sheet.lineIds.length ? null : roundCash(due));
        const pad = POS.numpad({ decimal: true, max: 8, value: sheet.tendered, testid: 'tender', label: t => `$${t || '0'}`, onChange: t => { sheet.tendered = t; showChange(); } });
        const info = h('div', { class: 'center', style: 'min-height:30px', 'data-testid': 'change' });
        const showChange = () => { const c = POS.parseMoney(sheet.tendered); info.textContent = c !== null && target !== null && c >= target ? `Change due ${money(c - target)}` : ''; };
        const quick = [...new Set([target, ...settings.cash.quickTender, target === null ? null : Math.ceil(target / 100) * 100].filter(v => v))].sort((a, b) => a - b).slice(0, 7);
        showChange();
        return h('div', null, h('div', { class: 'choices', style: 'justify-content:center;margin-bottom:8px' }, quick.map(v => h('button', { 'data-testid': `quick-${v}`, onclick: () => pad.set((v / 100).toFixed(2).replace(/\.00$/, '')) }, v === target ? `Exact ${money(v)}` : money(v)))), pad, info,
          h('button', { class: 'primary', style: 'width:100%;margin-top:8px;min-height:68px', 'data-testid': 'take-cash', onclick: guard(() => submit({ method: 'cash', tendered: POS.parseMoney(sheet.tendered) === null ? undefined : POS.parseMoney(sheet.tendered) })) }, 'Take cash'));
      };
      const roundCash = due => { const inc = settings.cash.rounding; return inc > 1 ? Math.round(due / inc) * inc : due; };

      const cardPane = () => {
        const provider = settings.card.provider;
        if (provider === 'manual') {
          const ref = h('input', { placeholder: 'Terminal approval code', 'data-testid': 'card-ref', value: sheet.reference, oninput: e => { sheet.reference = e.target.value; } });
          return h('div', null, h('p', { class: 'muted center' }, 'Take the card on the terminal, then key in its approval code.'), ref, h('button', { class: 'primary', style: 'width:100%;margin-top:8px;min-height:68px', 'data-testid': 'take-card', onclick: guard(() => submit({ method: 'card', reference: sheet.reference })) }, 'Record card payment'));
        }
        return h('div', null, h('p', { class: 'muted center' }, 'Test gateway: no real money moves.'),
          h('div', { class: 'row' }, h('button', { class: 'primary grow', style: 'min-height:68px', 'data-testid': 'take-card', onclick: guard(() => submit({ method: 'card', token: 'tok_visa' })) }, 'Tap / insert card'), h('button', { 'data-testid': 'take-card-decline', onclick: guard(() => submit({ method: 'card', token: 'tok_decline' })) }, 'Simulate decline')));
      };

      async function submit(extra) {
        const body = { ...extra };
        if (sheet.lineIds.length) body.lineIds = sheet.lineIds; else if (sheet.amount !== null) body.amount = sheet.amount;
        const res = await api('POST', `/api/orders/${o.id}/pay`, body);
        st.order = res.order;
        if (res.order.status === 'paid') { dlg.close(); await receiptDialog(res); } else { toast(`Paid ${money(res.payment.amount)} · ${money(res.order.totals.due)} left`, 'ok'); sheet.amount = null; sheet.lineIds = []; sheet.tendered = ''; Object.assign(o, res.order); draw(); drawTicket(); }
      }
      const dlg = dialog(`Pay order #${o.number}`, body, { testid: 'pay-dialog', actions: [{ label: 'Cancel' }] });
      draw();
    }

    async function receiptDialog(res) {
      const text = await api('GET', `/api/orders/${res.order.id}/receipt`);
      const change = res.change || res.order.payments.reduce((s, p) => s + (p.change || 0), 0);
      const done = () => { st.order = null; drawTicket(); POS.loadCatalog().then(() => { }); };
      dialog('Paid', h('div', null, change ? h('div', { class: 'center' }, h('div', { class: 'muted' }, 'Change due'), h('div', { class: 'big-number', 'data-testid': 'change-due' }, money(change))) : h('p', { class: 'center', 'data-testid': 'paid-ok' }, 'Payment complete.'),
        h('pre', { class: 'receipt', 'data-testid': 'receipt-text' }, text)), { testid: 'receipt-dialog', onClose: done, actions: [{ label: 'Print', onclick: () => { window.print(); return false; } }, { label: 'New order', kind: 'primary', testid: 'new-order' }] });
    }

    drawChips(); drawTiles(); drawTicket();
    if (settings.business.type === 'retail') scan.focus();
  };
})();

'use strict';
// Back office: inventory input, menu & catalog editor, cash administration, reports, team & API keys, settings.
(function () {
  const POS = window.POS;
  const { h, api, money, toast, guard, dialog } = POS;
  const st = () => POS.state;

  // ---- tiny form builder: fields -> inputs, read() -> validated payload ----
  function form(fields, values = {}) {
    const inputs = {};
    const el = h('div');
    for (const f of fields) {
      let input;
      const v = values[f.key];
      if (f.type === 'select') input = h('select', { 'data-testid': `f-${f.key}` }, f.options.map(o => h('option', { value: o.value, selected: String(o.value) === String(v ?? f.default ?? '') }, o.label)));
      else if (f.type === 'check') input = h('input', { type: 'checkbox', checked: !!(v ?? f.default), style: 'width:32px;min-height:32px', 'data-testid': `f-${f.key}` });
      else if (f.type === 'lines') input = h('textarea', { placeholder: f.placeholder || '', 'data-testid': `f-${f.key}`, value: v || '' });
      else if (f.type === 'multi') {
        const picked = new Set(v || []);
        input = h('div', { class: 'choices', 'data-testid': `f-${f.key}` }, f.options.map(o => h('button', { type: 'button', class: picked.has(o.value) ? 'on' : '', 'data-value': o.value, onclick: e => { picked.has(o.value) ? picked.delete(o.value) : picked.add(o.value); e.currentTarget.classList.toggle('on'); } }, o.label)));
        input.get = () => [...picked];
      } else if (f.type === 'color') input = h('input', { type: 'color', value: v || '#3b82f6', 'data-testid': `f-${f.key}`, style: 'padding:4px' });
      else input = h('input', { type: f.type === 'password' ? 'password' : 'text', inputmode: ['money', 'number', 'percent'].includes(f.type) ? 'decimal' : undefined, value: v ?? f.default ?? '', placeholder: f.placeholder || '', autocomplete: 'off', 'data-testid': `f-${f.key}` });
      inputs[f.key] = input;
      el.append(f.type === 'check' ? h('label', { class: 'row', style: 'color:var(--text)' }, input, f.label) : h('div', null, h('label', null, f.label, f.hint ? h('span', { class: 'muted' }, ` — ${f.hint}`) : null), input));
    }
    const read = () => {
      const out = {};
      for (const f of fields) {
        const input = inputs[f.key];
        let raw = f.type === 'check' ? input.checked : f.type === 'multi' ? input.get() : input.value;
        if (f.type === 'money') { if (String(raw).trim() === '' && !f.required) { out[f.key] = f.empty; continue; } raw = POS.parseMoney(raw); if (raw === null) throw new Error(`${f.label}: enter an amount like 4.50`); }
        else if (f.type === 'number' || f.type === 'percent') { if (String(raw).trim() === '') { if (f.required) throw new Error(`${f.label} is required`); out[f.key] = f.empty; continue; } raw = Number(raw); if (Number.isNaN(raw)) throw new Error(`${f.label}: enter a number`); }
        else if (f.type === 'select' && f.numeric) raw = Number(raw);
        else if (f.type === 'text' || f.type === 'lines') raw = String(raw).trim();
        out[f.key] = raw;
      }
      return out;
    };
    return { el, read };
  }

  function table(cols, rows, { testid, rowKey } = {}) {
    return h('table', { 'data-testid': testid }, h('thead', null, h('tr', null, cols.map(c => h('th', { class: c.num ? 'num' : '' }, c.label)))),
      h('tbody', null, rows.map(r => h('tr', { class: r.cls || '', 'data-testid': rowKey ? rowKey(r.data) : undefined, style: r.onclick ? 'cursor:pointer' : '', onclick: r.onclick }, r.cells.map((c, i) => h('td', { class: cols[i].num ? 'num' : '' }, c))))));
  }

  const opts = list => list.map(x => ({ value: x.id, label: x.name }));

  // ---- inventory ----
  POS.inventoryView = async function (main) {
    const cat = await POS.loadCatalog();
    const q = h('input', { type: 'search', placeholder: 'Filter inventory', 'data-testid': 'inv-filter', style: 'max-width:320px' });
    const holder = h('div');
    const draw = () => {
      const f = q.value.toLowerCase();
      const rows = cat.inventory.filter(i => !f || i.name.toLowerCase().includes(f) || i.sku.toLowerCase().includes(f)).map(i => ({
        data: i, cls: i.onHand <= i.reorderPoint ? 'low' : '',
        cells: [i.name, i.sku || '—', h('span', { 'data-testid': `onhand-${i.name}` }, `${i.onHand} ${i.unit}`), `${i.reorderPoint}`, money(Math.round(i.cost)), h('div', { class: 'row', style: 'justify-content:flex-end' },
          i.onHand <= i.reorderPoint ? h('span', { class: 'pill warn' }, 'Low') : null,
          POS.can('inventory.receive') ? h('button', { 'data-testid': `receive-${i.name}`, onclick: () => receive(i) }, 'Receive') : null,
          POS.can('inventory.adjust') ? h('button', { 'data-testid': `adjust-${i.name}`, onclick: () => adjust(i) }, 'Count') : null)],
      }));
      holder.replaceChildren(table([{ label: 'Item' }, { label: 'SKU' }, { label: 'On hand' }, { label: 'Reorder at' }, { label: 'Unit cost', num: true }, { label: '' }], rows, { testid: 'inventory-table' }));
    };
    q.addEventListener('input', draw);
    main.append(h('div', { class: 'row wrap' }, h('h2', { class: 'grow' }, 'Inventory'), q,
      POS.can('inventory.receive') ? h('button', { class: 'primary', 'data-testid': 'inv-add', onclick: addNew }, '+ New stock item') : null,
      POS.can('inventory.receive') ? h('button', { 'data-testid': 'inv-import', onclick: importCsv }, 'Import CSV') : null,
      POS.can('reports') ? h('button', { onclick: guard(() => download('/api/inventory-export.csv', 'inventory.csv')) }, 'Export CSV') : null), holder);
    draw();
    const refresh = async () => { await POS.loadCatalog(); POS.go('inventory'); };

    function receive(item) {
      const pad = POS.numpad({ decimal: true, max: 8, testid: 'recv', label: t => `${t || '0'} ${item.unit}` });
      dialog(`Receive ${item.name}`, h('div', null, h('p', { class: 'muted' }, `On hand now: ${item.onHand} ${item.unit}`), pad), { testid: 'receive-dialog', actions: [{ label: 'Cancel' }, { label: 'Add to stock', kind: 'primary', testid: 'receive-ok', onclick: async () => { const qty = Number(pad.get()); if (!(qty > 0)) { toast('Enter how many arrived'); return false; } await api('POST', `/api/inventory/${item.id}/receive`, { qty }); toast('Stock updated', 'ok'); await refresh(); } }] });
    }
    function adjust(item) {
      const pad = POS.numpad({ decimal: true, max: 8, testid: 'count', value: String(item.onHand), label: t => `${t || '0'} ${item.unit}` });
      const reason = h('input', { placeholder: 'Reason (required)', 'data-testid': 'adjust-reason' });
      dialog(`Count ${item.name}`, h('div', null, h('p', { class: 'muted' }, 'Enter what is actually on the shelf.'), pad, h('label', null, 'Reason'), reason), { testid: 'adjust-dialog', actions: [{ label: 'Cancel' }, { label: 'Save count', kind: 'primary', testid: 'adjust-ok', onclick: async () => { await POS.withOverride(pin => api('POST', `/api/inventory/${item.id}/adjust`, { counted: Number(pad.get()), reason: reason.value, managerPin: pin })); await refresh(); } }] });
    }
    function addNew() {
      const f = form([{ key: 'name', label: 'Name' }, { key: 'sku', label: 'SKU' }, { key: 'unit', label: 'Unit', default: 'each', hint: 'each, oz, g, ml…' }, { key: 'onHand', label: 'Opening quantity', type: 'number', default: 0 }, { key: 'reorderPoint', label: 'Reorder at', type: 'number', default: 0 }, { key: 'cost', label: 'Unit cost', type: 'money', empty: 0 }]);
      dialog('New stock item', f.el, { testid: 'inv-new-dialog', actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', testid: 'inv-save', onclick: async () => { await api('POST', '/api/inventory', f.read()); await refresh(); } }] });
    }
    function importCsv() {
      const ta = h('textarea', { 'data-testid': 'csv-text', placeholder: 'sku,name,qty,unit,reorder,cost\nGC-100,Gift box,25,each,5,1.50' });
      dialog('Import stock from CSV', h('div', null, h('p', { class: 'muted' }, 'Columns: name and qty are required. Existing SKUs are topped up; new ones are created.'), ta), { testid: 'csv-dialog', actions: [{ label: 'Cancel' }, { label: 'Import', kind: 'primary', testid: 'csv-ok', onclick: async () => { const r = await api('POST', '/api/inventory-import', { csv: ta.value }); toast(`Created ${r.created}, topped up ${r.received}`, 'ok'); await refresh(); } }] });
    }
  };

  async function download(path, name) {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${POS.token}` } });
    if (!res.ok) throw new Error('Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ---- menu & catalog ----
  POS.catalogView = async function (main) {
    const cat = await POS.loadCatalog();
    const section = st().catalogSection || 'items';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, value) => ({ value, label }));
    const pct = bp => `${(bp / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
    const itemName = id => (cat.categories.find(c => c.id === id) || {}).name || '—';
    const defs = {
      items: {
        label: 'Items', singular: 'item', rows: cat.items,
        cols: [{ label: 'Item' }, { label: 'Category' }, { label: 'Price', num: true }, { label: 'Sizes / options' }, { label: 'Station' }],
        cells: i => [`${i.emoji || ''} ${i.name}`, itemName(i.categoryId), money(i.price), i.variants.map(v => v.name).join(', ') || '—', i.station || '—'],
        fields: rec => [
          { key: 'name', label: 'Name' }, { key: 'categoryId', label: 'Category', type: 'select', options: [{ value: '', label: '— none —' }, ...opts(cat.categories)] },
          { key: 'price', label: 'Price', type: 'money', required: true, hint: 'e.g. 4.50' }, { key: 'taxId', label: 'Tax', type: 'select', options: [{ value: '', label: 'No tax' }, ...opts(cat.taxes)], default: cat.taxes[0] && cat.taxes[0].id },
          { key: 'emoji', label: 'Icon (emoji)' }, { key: 'station', label: 'Prep station', hint: 'kitchen, barista, bar — blank for retail' }, { key: 'sku', label: 'SKU' }, { key: 'barcode', label: 'Barcode (UPC/EAN)' },
          { key: 'ageRestricted', label: 'Age-restricted (ID check required)', type: 'check' },
          ...(rec && rec.variants.length ? [] : [{ key: 'stock', label: 'Opening stock', type: 'number', hint: 'leave blank if not tracked', empty: undefined }]),
          { key: 'variantsText', label: 'Sizes / variants', type: 'lines', placeholder: 'One per line:  name | sku | barcode | opening stock | price (optional)' },
          { key: 'modifierGroupIds', label: 'Option groups', type: 'multi', options: cat.modifierGroups.map(g => ({ value: g.id, label: g.name })) },
        ],
        toForm: i => ({ ...i, price: (i.price / 100).toFixed(2), categoryId: i.categoryId || '', taxId: i.taxId || '', variantsText: i.variants.map(v => [v.name, v.sku, v.barcode, '', v.price === null ? '' : (v.price / 100).toFixed(2)].join(' | ')).join('\n') }),
        toPayload: (v, rec) => {
          const variants = v.variantsText ? v.variantsText.split('\n').filter(l => l.trim()).map(line => {
            const [name, sku, barcode, stock, price] = line.split('|').map(s => s.trim());
            const old = rec && rec.variants.find(x => x.name === name);
            const out = { ...(old ? { id: old.id, inventoryId: old.inventoryId } : {}), name, sku: sku || '', barcode: barcode || '' };
            if (stock !== undefined && stock !== '') out.stock = Number(stock);
            if (price) out.price = POS.parseMoney(price);
            return out;
          }) : [];
          const { variantsText, ...rest } = v;
          return { ...rest, variants, categoryId: rest.categoryId || null, taxId: rest.taxId || null, station: rest.station || null };
        },
      },
      categories: { label: 'Categories', singular: 'category', rows: cat.categories, cols: [{ label: 'Name' }, { label: 'Colour' }], cells: c => [c.name, h('span', { class: 'pill', style: `border-color:${c.color}` }, c.color)], fields: () => [{ key: 'name', label: 'Name' }, { key: 'color', label: 'Colour', type: 'color' }] },
      modifierGroups: {
        label: 'Option groups', singular: 'option group', rows: cat.modifierGroups, cols: [{ label: 'Group' }, { label: 'Rule' }, { label: 'Options' }],
        cells: g => [g.name, g.required ? `choose ${g.min === g.max ? g.max : `${g.min}-${g.max}`}` : `optional, up to ${g.max}`, g.options.map(o => o.name + (o.price ? ` +${money(o.price)}` : '')).join(', ')],
        fields: () => [{ key: 'name', label: 'Name' }, { key: 'required', label: 'Customer must choose', type: 'check' }, { key: 'max', label: 'Maximum choices', type: 'number', default: 1 }, { key: 'optionsText', label: 'Options', type: 'lines', placeholder: 'One per line:  name | extra price' }],
        toForm: g => ({ ...g, optionsText: g.options.map(o => `${o.name} | ${o.price ? (o.price / 100).toFixed(2) : ''}`).join('\n') }),
        toPayload: (v, rec) => ({ name: v.name, required: v.required, max: v.max || 1, multiple: (v.max || 1) > 1, options: v.optionsText.split('\n').filter(l => l.trim()).map(line => { const [name, price] = line.split('|').map(s => s.trim()); const old = rec && rec.options.find(o => o.name === name); return { ...(old ? { id: old.id, recipe: old.recipe } : {}), name, price: price ? POS.parseMoney(price) : 0 }; }) }),
      },
      taxes: { label: 'Taxes', singular: 'tax', rows: cat.taxes, cols: [{ label: 'Name' }, { label: 'Rate', num: true }], cells: t => [t.name, pct(t.rateBp)], fields: () => [{ key: 'name', label: 'Name' }, { key: 'rate', label: 'Rate %', type: 'percent', hint: 'e.g. 8.25' }], toForm: t => ({ ...t, rate: t.rateBp / 100 }), toPayload: v => ({ name: v.name, rateBp: Math.round(v.rate * 100) }) },
      promotions: {
        label: 'Promo codes', singular: 'promo code', rows: cat.promotions, cols: [{ label: 'Code' }, { label: 'Discount' }, { label: 'Minimum spend', num: true }],
        cells: p => [p.code, p.type === 'percent' ? `${p.value}% off` : `${money(p.value)} off`, p.minSubtotal ? money(p.minSubtotal) : '—'],
        fields: () => [{ key: 'code', label: 'Code' }, { key: 'type', label: 'Type', type: 'select', options: [{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Dollars off' }] }, { key: 'value', label: 'Amount', hint: '10 for 10%, or 5.00 for $5 off' }, { key: 'min', label: 'Minimum spend', type: 'money', empty: 0 }],
        toForm: p => ({ ...p, value: p.type === 'percent' ? p.value : (p.value / 100).toFixed(2), min: p.minSubtotal ? (p.minSubtotal / 100).toFixed(2) : '' }),
        toPayload: v => ({ code: v.code, type: v.type, value: v.type === 'percent' ? Number(v.value) : POS.parseMoney(v.value), minSubtotal: v.min || 0 }),
      },
      priceRules: {
        label: 'Happy hour', singular: 'price rule', rows: cat.priceRules, cols: [{ label: 'Rule' }, { label: 'Off', num: true }, { label: 'When' }, { label: 'Applies to' }],
        cells: r => [r.name, `${r.percentOff}%`, `${r.days.map(d => days[d].label).join(' ')} ${r.start}–${r.end}`, r.categoryIds.map(itemName).join(', ') || 'chosen items'],
        fields: () => [{ key: 'name', label: 'Name' }, { key: 'percentOff', label: 'Percent off', type: 'number' }, { key: 'start', label: 'Starts (HH:MM)', default: '16:00' }, { key: 'end', label: 'Ends (HH:MM)', default: '18:00' }, { key: 'days', label: 'Days', type: 'multi', options: days }, { key: 'categoryIds', label: 'Categories', type: 'multi', options: opts(cat.categories) }],
        toForm: r => ({ ...r }), toPayload: v => ({ ...v }),
      },
    };
    const def = defs[section];
    main.append(h('div', { class: 'tabs-row' }, Object.entries(defs).map(([id, d]) => h('button', { class: `chip ${id === section ? 'active' : ''}`, 'data-testid': `cat-tab-${id}`, onclick: () => { st().catalogSection = id; POS.go('catalog'); } }, d.label))),
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, def.label), h('button', { class: 'primary', 'data-testid': 'catalog-add', onclick: () => edit(null) }, `+ Add ${def.singular}`)),
      table(def.cols, def.rows.map(r => ({ data: r, cells: def.cells(r), onclick: () => edit(r) })), { testid: 'catalog-table', rowKey: r => `row-${r.name || r.code}` }));

    function edit(rec) {
      const values = rec ? (def.toForm ? def.toForm(rec) : rec) : {};
      const f = form(def.fields(rec), values);
      const actions = [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', testid: 'catalog-save', onclick: async () => {
        const read = f.read();
        const body = def.toPayload ? def.toPayload(read, rec) : read;
        await (rec ? api('PUT', `/api/${section}/${rec.id}`, body) : api('POST', `/api/${section}`, body));
        toast('Saved', 'ok'); await POS.loadCatalog(); POS.go('catalog');
      } }];
      if (rec) actions.unshift({ label: section === 'items' ? 'Hide from menu' : 'Remove', kind: 'danger', testid: 'catalog-remove', onclick: async () => { await api('DELETE', `/api/${section}/${rec.id}`); await POS.loadCatalog(); POS.go('catalog'); } });
      dialog(`${rec ? 'Edit' : 'Add'} ${def.singular}`, f.el, { actions, wide: section === 'items', testid: 'catalog-dialog' });
    }
  };

  // ---- cash drawer & cash payment administration ----
  POS.cashView = async function (main) {
    const cat = await POS.loadCatalog();
    const s = cat.settings.cash;
    const drawer = await api('GET', '/api/drawer');
    const panel = h('div', { class: 'card', 'data-testid': 'drawer-panel' });
    if (!drawer) {
      const pad = POS.numpad({ decimal: true, max: 8, testid: 'float', label: t => `$${t || '0'}` });
      panel.append(h('h2', null, 'Cash drawer is closed'), h('p', { class: 'muted' }, 'Count the starting cash in the drawer and enter it to begin taking cash.'), pad,
        h('button', { class: 'primary', style: 'width:100%;margin-top:8px;min-height:68px', 'data-testid': 'drawer-open', onclick: guard(async () => { const c = POS.parseMoney(pad.get() || '0'); await api('POST', '/api/drawer/open', { float: c }); toast('Drawer open', 'ok'); await POS.loadCatalog(); POS.go('cash'); }) }, 'Open drawer'));
    } else {
      panel.append(h('h2', null, 'Cash drawer is open ', h('span', { class: 'pill ok' }, 'open')),
        h('div', { class: 'tiles-stat' }, [['Starting float', drawer.float], ['Cash sales', drawer.cashSales], ['Cash refunds', drawer.cashRefunds], ['Paid in', drawer.paidIn], ['Paid out', drawer.paidOut]].map(([l, v]) => h('div', { class: 'stat' }, h('b', { 'data-testid': `drawer-${l}` }, money(v)), h('span', null, l))), POS.can('drawer.close.variance') ? h('div', { class: 'stat' }, h('b', { 'data-testid': 'drawer-expected' }, money(drawer.expected)), h('span', null, 'Expected in drawer')) : null),
        h('div', { class: 'row wrap' }, h('button', { 'data-testid': 'paid-in', onclick: () => movement('paid_in') }, 'Paid in'), h('button', { 'data-testid': 'paid-out', onclick: () => movement('paid_out') }, 'Paid out'), h('button', { class: 'danger', 'data-testid': 'drawer-close', onclick: () => closeDrawer(drawer) }, 'Count & close drawer')));
    }
    main.append(panel);
    if (POS.can('cash.admin')) main.append(settingsCard());

    function movement(type) {
      const pad = POS.numpad({ decimal: true, max: 8, testid: 'move', label: t => `$${t || '0'}` });
      const reason = h('input', { placeholder: type === 'paid_in' ? 'Reason, e.g. added change' : 'Reason, e.g. tip-out, supplies', 'data-testid': 'move-reason' });
      dialog(type === 'paid_in' ? 'Paid in' : 'Paid out', h('div', null, pad, h('label', null, 'Reason'), reason), { testid: 'move-dialog', actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', testid: 'move-ok', onclick: async () => { const amount = POS.parseMoney(pad.get() || '0'); await POS.withOverride(pin => api('POST', '/api/drawer/movement', { type, amount, reason: reason.value, managerPin: pin })); await POS.loadCatalog(); POS.go('cash'); } }] });
    }

    function closeDrawer() {
      const counts = {};
      const total = h('div', { class: 'big-number center', 'data-testid': 'count-total' }, money(0));
      const recalc = () => { total.textContent = money(Object.entries(counts).reduce((a, [v, n]) => a + Number(v) * n, 0)); };
      const rows = s.denominations.map(d => { counts[d] = 0; const step = POS.stepper(0, { min: 0, max: 999, onChange: n => { counts[d] = n; recalc(); } }); return h('div', { class: 'row', 'data-testid': `denom-${d}`, style: 'padding:6px 0;border-bottom:1px dashed var(--border)' }, h('span', { class: 'grow' }, money(d)), step); });
      dialog('Count the drawer', h('div', null, total, rows), { wide: true, testid: 'close-dialog', actions: [{ label: 'Cancel' }, { label: 'Close drawer', kind: 'primary', testid: 'close-ok', onclick: async () => {
        const z = await POS.withOverride(pin => api('POST', '/api/drawer/close', { denominations: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v])), managerPin: pin }));
        if (!z) return false;
        await POS.loadCatalog();
        dialog('Drawer closed', h('div', null, h('div', { class: 'tiles-stat' }, [['Expected', z.drawer.expected], ['Counted', z.drawer.counted], ['Over / short', z.drawer.variance]].map(([l, v]) => h('div', { class: 'stat' }, h('b', { 'data-testid': `z-${l}` }, money(v)), h('span', null, l)))), h('p', null, `${z.sales.orders} order(s), net sales ${money(z.sales.netSales)}, tips ${money(z.sales.tips)}.`)), { testid: 'z-dialog', onClose: () => POS.go('cash'), actions: [{ label: 'Done', kind: 'primary' }] });
      } }] });
    }

    function settingsCard() {
      const f = form([
        { key: 'enabled', label: 'Accept cash payments', type: 'check' }, { key: 'requireOpenDrawer', label: 'Require an open drawer before taking cash', type: 'check' },
        { key: 'rounding', label: 'Cash rounding (cents)', type: 'select', numeric: true, options: [[0, 'None'], [5, 'Nearest 5¢ (no pennies)'], [10, 'Nearest 10¢'], [25, 'Nearest 25¢'], [100, 'Nearest $1']].map(([value, label]) => ({ value, label })) },
        { key: 'quickTender', label: 'Quick-tender buttons', hint: 'dollars, comma separated' }, { key: 'maxTender', label: 'Largest cash tender accepted', type: 'money' }, { key: 'varianceThreshold', label: 'Over/short a cashier may close without a manager', type: 'money' },
        { key: 'denominations', label: 'Bills & coins counted at close', hint: 'dollars, comma separated' },
      ], { ...s, quickTender: s.quickTender.map(c => c / 100).join(', '), maxTender: (s.maxTender / 100).toFixed(2), varianceThreshold: (s.varianceThreshold / 100).toFixed(2), denominations: s.denominations.map(c => c / 100).join(', ') });
      const cents = text => text.split(',').map(x => x.trim()).filter(Boolean).map(x => Math.round(Number(x) * 100));
      return h('div', { class: 'card', style: 'margin-top:14px', 'data-testid': 'cash-settings' }, h('h2', null, 'Cash payment settings'), f.el,
        h('button', { class: 'primary', style: 'margin-top:12px', 'data-testid': 'cash-save', onclick: guard(async () => { const v = f.read(); await api('PUT', '/api/settings/cash', { ...v, quickTender: cents(v.quickTender), denominations: cents(v.denominations) }); await POS.loadCatalog(); toast('Cash settings saved', 'ok'); POS.go('cash'); }) }, 'Save cash settings'));
    }
  };

  // ---- reports ----
  POS.reportsView = async function (main) {
    const range = st().range || 'today';
    const from = range === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString() : '0000';
    const r = await api('GET', `/api/reports/sales?from=${encodeURIComponent(from)}`);
    const drawers = await api('GET', '/api/drawers');
    const bars = (rows, testid) => { const max = Math.max(1, ...rows.map(x => Math.abs(x.sales))); return table([{ label: 'Name' }, { label: 'Sales', num: true }, { label: '' }], rows.map(x => ({ cells: [x.key, money(x.sales), h('div', { class: 'bar', style: `width:${Math.max(2, Math.round(Math.abs(x.sales) / max * 100))}%` })] })), { testid }); };
    main.append(h('div', { class: 'row wrap' }, h('h2', { class: 'grow' }, 'Sales report'), ['today', 'all'].map(x => h('button', { class: `chip ${range === x ? 'active' : ''}`, 'data-testid': `range-${x}`, onclick: () => { st().range = x; POS.go('reports'); } }, x === 'today' ? 'Today' : 'All time')), h('button', { onclick: guard(() => download('/api/reports/orders.csv', 'orders.csv')) }, 'Export orders CSV')),
      h('div', { class: 'tiles-stat' }, [['Orders', r.orders, v => v], ['Gross sales', r.grossSales, money], ['Discounts', r.discounts, money], ['Net sales', r.netSales, money], ['Tax', r.tax, money], ['Tips', r.tips, money], ['Refunds', r.refunds, money], ['Average ticket', r.averageTicket, money]].map(([l, v, fmt]) => h('div', { class: 'stat', 'data-testid': `stat-${l}` }, h('b', null, fmt(v)), h('span', null, l)))),
      h('div', { class: 'grid2' }, h('div', { class: 'card' }, h('h3', null, 'By category'), bars(r.byCategory, 'by-category')), h('div', { class: 'card' }, h('h3', null, 'By tender'), bars(r.byTender, 'by-tender')), h('div', { class: 'card' }, h('h3', null, 'Top items'), bars(r.topItems, 'top-items')),
        h('div', { class: 'card' }, h('h3', null, 'Cash drawers'), drawers.length ? table([{ label: 'Opened' }, { label: 'Status' }, { label: 'Over/short', num: true }], drawers.map(d => ({ cells: [new Date(d.openedAt).toLocaleString(), d.status, d.status === 'closed' ? money(d.variance) : '—'] })), { testid: 'drawers-table' }) : h('p', { class: 'muted' }, 'No drawers yet.'))));
  };

  // ---- team & API keys ----
  POS.teamView = async function (main) {
    const staff = await api('GET', '/api/staff');
    const keys = await api('GET', '/api/apikeys');
    const f = form([{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role', type: 'select', options: [{ value: 'cashier', label: 'Cashier / server' }, { value: 'manager', label: 'Manager' }, { value: 'admin', label: 'Admin' }] }, { key: 'pin', label: 'PIN (4–8 digits)', type: 'password' }]);
    const keyLabel = h('input', { placeholder: 'What will use this key? e.g. Website', 'data-testid': 'key-label' });
    main.append(h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', null, 'Team'), table([{ label: 'Name' }, { label: 'Role' }, { label: '' }], staff.map(s => ({ cells: [s.name, s.role, s.active ? h('button', { 'data-testid': `deactivate-${s.name}`, onclick: guard(async () => { await api('POST', `/api/staff/${s.id}/active`, { active: false }); POS.go('team'); }) }, 'Deactivate') : h('span', { class: 'pill bad' }, 'inactive')] })), { testid: 'staff-table' }),
        h('h3', { style: 'margin-top:16px' }, 'Add a team member'), f.el, h('button', { class: 'primary', style: 'margin-top:12px', 'data-testid': 'staff-add', onclick: guard(async () => { await api('POST', '/api/staff', f.read()); toast('Team member added', 'ok'); POS.go('team'); }) }, 'Add')),
      h('div', { class: 'card' }, h('h2', null, 'Checkout API keys'), h('p', { class: 'muted' }, 'Websites and apps use a key to create checkout sessions at ', h('code', null, '/api/v1/checkout_sessions'), '. Full reference: ', h('a', { href: '/api/openapi.json', target: '_blank', style: 'color:var(--accent)' }, 'OpenAPI document'), '.'),
        table([{ label: 'Label' }, { label: 'Created' }, { label: '' }], keys.map(k => ({ cells: [k.label, new Date(k.createdAt).toLocaleDateString(), k.active ? h('button', { onclick: guard(async () => { await api('POST', `/api/apikeys/${k.id}/revoke`, {}); POS.go('team'); }) }, 'Revoke') : h('span', { class: 'pill bad' }, 'revoked')] })), { testid: 'keys-table' }),
        h('label', null, 'New key'), keyLabel, h('button', { class: 'primary', style: 'margin-top:10px', 'data-testid': 'key-create', onclick: guard(async () => { const k = await api('POST', '/api/apikeys', { label: keyLabel.value }); dialog('Copy your key now', h('div', null, h('p', { class: 'muted' }, 'It is shown only once.'), h('pre', { class: 'receipt', 'data-testid': 'key-secret' }, k.key)), { onClose: () => POS.go('team'), actions: [{ label: 'Done', kind: 'primary' }], testid: 'key-dialog' }); }) }, 'Create API key'))));
  };

  // ---- settings & sample businesses ----
  POS.settingsView = async function (main) {
    const cat = await POS.loadCatalog();
    const s = cat.settings;
    const sections = [
      ['business', 'Business', [{ key: 'name', label: 'Business name' }, { key: 'type', label: 'Type', type: 'select', options: [{ value: 'retail', label: 'Retail shop' }, { value: 'food', label: 'Food service' }, { value: 'bar', label: 'Bar' }] }, { key: 'currency', label: 'Currency (ISO 4217)' }, { key: 'address', label: 'Address (on receipts)' }, { key: 'receiptFooter', label: 'Receipt footer' }]],
      ['tax', 'Tax', [{ key: 'inclusive', label: 'Prices already include tax', type: 'check' }]],
      ['tips', 'Tips', [{ key: 'enabled', label: 'Offer tips', type: 'check' }, { key: 'presets', label: 'Tip buttons', hint: 'percent, comma separated' }]],
      ['card', 'Card payments', [{ key: 'enabled', label: 'Accept cards', type: 'check' }, { key: 'provider', label: 'Card provider', type: 'select', options: cat.providers.map(p => ({ value: p, label: p === 'manual' ? 'Standalone terminal (key in approval code)' : p === 'mock' ? 'Test gateway (DEMO ONLY: approves any card)' : p })) }]],
      ['kiosk', 'Self-checkout', [{ key: 'enabled', label: 'Enable self-checkout', type: 'check' }, { key: 'allowCard', label: 'Allow card payment at the kiosk', type: 'check' }, { key: 'allowPayAtCounter', label: 'Allow "pay at the counter"', type: 'check' }, { key: 'allowAgeRestricted', label: 'Allow age-restricted items (not recommended)', type: 'check' }, { key: 'welcome', label: 'Welcome message' }]],
      ['inventory', 'Stock', [{ key: 'allowNegativeStock', label: 'Allow selling below zero stock', type: 'check' }]],
      ['discounts', 'Discounts', [{ key: 'cashierMaxPercent', label: 'Largest discount a cashier may give (%)', type: 'number' }]],
    ];
    const cards = sections.map(([id, label, fields]) => {
      const values = { ...s[id] }; if (id === 'tips') values.presets = s.tips.presets.join(', ');
      const f = form(fields, values);
      return h('div', { class: 'card', 'data-testid': `settings-${id}` }, h('h3', null, label), f.el, h('button', { class: 'primary', style: 'margin-top:10px', 'data-testid': `save-${id}`, onclick: guard(async () => { const v = f.read(); if (id === 'tips') v.presets = v.presets.split(',').map(x => Number(x.trim())).filter(Boolean); await api('PUT', `/api/settings/${id}`, v); await POS.loadCatalog(); toast(`${label} saved`, 'ok'); POS.go('settings'); }) }, 'Save'));
    });
    const samples = await api('GET', '/api/setup', undefined, { anon: true });
    main.append(h('div', { class: 'grid2' }, cards),
      POS.can('seed') ? h('div', { class: 'card', style: 'margin-top:14px', 'data-testid': 'samples' }, h('h2', null, 'Sample businesses'), h('p', { class: 'muted' }, 'Replace everything in this shop with a ready-made example. This deletes the current menu, stock and sales.'),
        h('div', { class: 'row wrap' }, samples.profiles.map(p => h('button', { 'data-testid': `sample-${p.id}`, class: 'danger', onclick: () => dialog(`Replace all data with “${p.title}”?`, h('p', null, 'Current items, stock, orders and team will be deleted. Sample PINs: 1111 / 2222 / 3333.'), { testid: 'sample-confirm', actions: [{ label: 'Keep my data' }, { label: 'Replace everything', kind: 'danger', testid: 'sample-yes', onclick: async () => { await api('POST', `/api/samples/${p.id}`, {}); POS.token = null; sessionStorage.removeItem('pos-token'); POS.state.me = null; POS.state.order = null; POS.on(); } }] }) }, p.title)))) : null);
  };
})();

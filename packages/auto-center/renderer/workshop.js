'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) k === 'text' ? e.textContent = v : k === 'class' ? e.className = v : e.setAttribute(k, v); e.append(...kids.filter(Boolean)); return e; };
  const money = (minor, cur = 'USD') => minor == null ? '—' : (minor / 100).toLocaleString(undefined, { style: 'currency', currency: cur });
  let board;
  const say = m => { $('message').textContent = m; };
  async function call(action, input) { try { const r = await window.auto.workshop({ action, input }); say(''); await load(); return r; } catch (e) { say(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); return null; } }
  function field(label, name, opts = {}) {
    const control = opts.options ? el('select', { name }, ...opts.options.map(([v, t]) => el('option', { value: v, text: t }))) : opts.area ? el('textarea', { name, maxlength: 5000 }) : el('input', { name, type: opts.type || 'text', placeholder: opts.ph || '' });
    if (opts.required) control.required = true; if (opts.value !== undefined) control.value = opts.value;
    const wrapper = el('label', {}, label, control); if (opts.ta) window.typeahead.attach(control, opts.ta); return wrapper;
  }
  // Pick one of the loaded records by typing; a hidden field carries the chosen id.
  function picker(label, name, items, opts = {}) {
    const hidden = el('input', { type: 'hidden', name }), visible = el('input', { type: 'text', 'data-for': name, placeholder: opts.ph || 'Start typing…', 'aria-label': label });
    if (opts.value) { const hit = items.find(i => i.label === opts.value); if (hit) { visible.value = hit.label; hidden.value = hit.value; } }
    const wrapper = el('label', {}, label, visible, hidden);
    const sync = () => { const exact = items.filter(i => i.label.toLowerCase() === visible.value.trim().toLowerCase()); hidden.value = exact.length === 1 ? exact[0].value : ''; };
    visible.addEventListener('input', sync);
    window.typeahead.local(visible, () => items.map(i => ({ ...i })), it => { hidden.value = it.value; opts.onPick?.(it); });
    return wrapper;
  }
  function form(id, submitLabel, fields, onSubmit) {
    const f = el('form', { id }, ...fields, el('button', { text: submitLabel }));
    f.onsubmit = async ev => { ev.preventDefault(); const data = Object.fromEntries(new FormData(f)); if (await onSubmit(data)) f.reset(); };
    return f;
  }
  function drawer(title, id, ...kids) { return el('details', { class: 'card entry-drawer', id }, el('summary', { text: title }), ...kids); }
  function frontDesk() {
    const dir = board.directory, people = [['', 'Not linked to a RobOS user'], ...dir.people.map(p => [p.id, p.name + (p.email ? ' · ' + p.email : '')])], groups = [['', 'No group'], ...dir.groups.map(g => [g.id, g.name])];
    const customers = board.customers.map(c => ({ label: c.name, value: c.id, detail: [c.phone, c.email].filter(Boolean).join(' · ') })), vehicles = board.vehicles.filter(v => v.customer).map(v => ({ label: v.name, value: v.id, detail: [v.year, v.make, v.model, v.plate].filter(Boolean).join(' ') }));
    const vform = () => document.getElementById('wvehicle-form'), vv = n => vform()?.querySelector(`[name="${n}"]`);
    return [
      drawer('+ Add a teammate', 'ws-teammate-drawer', form('teammate-form', 'Add teammate', [field('Name', 'name', { required: true }), field('Role', 'role', { required: true, ph: 'Technician' }), field('RobOS person', 'personId', { options: people }), field('Hourly labor cost (USD)', 'hourlyCost', { ph: '30.00' })], d => call('addTeammate', d))),
      drawer('+ Add a customer', 'ws-customer-drawer', form('customer-form', 'Add customer', [field('Name', 'name', { required: true }), field('Phone', 'phone'), field('Email', 'email'), field('RobOS user', 'userId', { options: people }), field('RobOS group', 'groupId', { options: groups }), field('Notes', 'notes', { area: true })], d => call('addCustomer', d))),
      drawer('+ Add a customer vehicle', 'ws-vehicle-drawer', form('wvehicle-form', 'Add vehicle', [picker('Customer', 'customer', customers), field('Find year, make and model', 'find', { ph: '2015 Toyota Camry', ta: { source: window.typeahead.remote('config', () => ({})), onPick: it => { vv('year').value = it.year; vv('make').value = it.make; vv('model').value = it.model; if (!vv('name').value) vv('name').value = `${it.year} ${it.make} ${it.model}`; } } }), field('Vehicle name', 'name', { required: true }), field('Year', 'year', { ta: { source: q => window.auto.catalog({ kind: 'year', query: q, ctx: { make: vv('make').value, model: vv('model').value } }), openOnFocus: true, minChars: 0 } }), field('Make', 'make', { ta: { source: window.typeahead.remote('make'), onPick: () => { vv('model').value = ''; } } }), field('Model', 'model', { ta: { source: q => window.auto.catalog({ kind: 'model', query: q, ctx: { make: vv('make').value } }), openOnFocus: true, onPick: it => { if (it.make) vv('make').value = it.make; } } }), field('VIN', 'vin'), field('Plate', 'plate')], d => call('addCustomerVehicle', d))),
      drawer('+ Parts catalog (add or import)', 'ws-parts-drawer',
        form('part-add-form', 'Add part to catalog', [field('Part name', 'name', { required: true, ph: 'Ceramic brake pads, front' }), field('Part number', 'partNumber'), field('Supplier', 'supplier'), field('Your cost (USD)', 'cost'), field('Price to customer (USD)', 'price'), field('Category', 'category'), field('Fits make', 'make', { ta: { source: window.typeahead.remote('make') } }), field('Fits model', 'model', { ta: { source: q => window.auto.catalog({ kind: 'model', query: q, ctx: { make: document.querySelector('#part-add-form [name="make"]')?.value || '' } }), openOnFocus: true } }), field('Year from', 'yearFrom'), field('Year to', 'yearTo')], d => call('addPart', d)),
        el('p', { class: 'note', text: 'Or import a supplier price list (CSV with a name column; optional part number, supplier, cost, price, category, make, model, year from, year to). Fitment columns are your supplier’s hints, not verified fitment.' }),
        el('form', { id: 'parts-import-form' }, el('label', {}, 'Parts file (CSV)', el('input', { type: 'file', name: 'file', accept: '.csv,text/csv' })), el('label', {}, 'Or paste CSV text', el('textarea', { name: 'csv', rows: '4' })), el('button', { text: 'Import parts' }))),
      drawer('+ Take in a car and open a repair', 'ws-intake-drawer', form('intake-form', 'Open repair ticket', [picker('Vehicle', 'vehicle', vehicles, { ph: 'Customer, vehicle or plate' }), field('Customer concern', 'concern', { required: true, ph: 'Grinding noise when braking' }), field('Odometer in', 'odometer', { ph: '84000' }), field('Parking bay', 'location')], d => call('openRepair', d))),
    ];
  }
  function roster() {
    const dir = board.directory, person = id => dir.people.find(p => p.id === id)?.name, group = id => dir.groups.find(g => g.id === id)?.name;
    const team = el('div', { class: 'card', id: 'ws-team' }, el('h3', { text: 'Team' }), ...(board.teammates.length ? board.teammates.map(t => el('p', { class: 'roster-row', text: `${t.name} · ${t.role}${t.personId ? ' · RobOS: ' + (person(t.personId) || t.personId) : ''}` })) : [el('p', { class: 'note', text: 'No teammates yet.' })]));
    const cust = el('div', { class: 'card', id: 'ws-customers' }, el('h3', { text: 'Customers' }), ...(board.customers.length ? board.customers.map(c => el('p', { class: 'roster-row', text: `${c.name}${c.phone ? ' · ' + c.phone : ''}${c.email ? ' · ' + c.email : ''}${c.userId ? ' · RobOS user: ' + (person(c.userId) || c.userId) : ''}${c.groupId ? ' · group: ' + (group(c.groupId) || c.groupId) : ''} · ${board.vehicles.filter(v => v.customer === c.id).length} vehicle(s)` })) : [el('p', { class: 'note', text: 'No customers yet.' })]));
    return el('div', { class: 'forms' }, team, cust);
  }
  async function importPartsSubmit(f) {
    const file = f.querySelector('[name="file"]').files[0], text = file ? await file.text() : f.querySelector('[name="csv"]').value;
    const r = await call('importParts', { csv: text }); if (r) { say(`Imported ${r.added} part(s)${r.skipped ? `, skipped ${r.skipped} already in the catalog` : ''}.`); f.reset(); }
  }
  function stageBar(job) {
    const idx = board.stages.findIndex(s => s.id === job.stage);
    return el('ol', { class: 'stage-bar', 'aria-label': 'Repair progress' }, ...board.stages.map((s, i) => el('li', { class: i < idx ? 'done' : i === idx ? 'current' : '', text: s.label })));
  }
  function lineRows(container, job) {
    const add = (type) => { const row = el('div', { class: 'row est-line', 'data-type': type }, el('input', { name: 'description', placeholder: type === 'part' ? 'Part' : 'Labor', 'aria-label': type + ' description' }),
      type === 'part' ? el('input', { name: 'quantity', value: '1', 'aria-label': 'Quantity' }) : el('input', { name: 'hours', placeholder: 'Hours', 'aria-label': 'Hours' }),
      el('input', { name: 'price', placeholder: type === 'part' ? 'Unit price' : 'Rate / hour', 'aria-label': 'Price' })); container.append(row);
      const q = n => row.querySelector(`[name="${n}"]`), info = job.vehicleInfo || {};
      window.typeahead.attach(q('description'), type === 'part'
        ? { source: t => window.auto.catalog({ kind: 'part', query: t, ctx: { make: info.make, model: info.model } }), onPick: it => { row.dataset.partNumber = it.partNumber || ''; if (it.unitPrice && !q('price').value) q('price').value = it.unitPrice; } }
        : { source: t => window.auto.catalog({ kind: 'labor', query: t, ctx: {} }), onPick: it => { if (it.hours && !q('hours').value) q('hours').value = it.hours; } }); };
    return { addPart: () => add('part'), addLabor: () => add('labor'), read: () => [...container.querySelectorAll('.est-line')].map(r => { const v = n => r.querySelector(`[name="${n}"]`)?.value; return r.dataset.type === 'part' ? { type: 'part', partNumber: r.dataset.partNumber || '', description: v('description'), quantity: v('quantity'), unitPrice: v('price') } : { type: 'labor', description: v('description'), hours: v('hours'), rate: v('price') }; }) };
  }
  function estimatePanel(job) {
    const box = el('div', { class: 'card sub', 'data-panel': 'estimate' }, el('h4', { text: 'Estimate' }));
    for (const e of job.estimates) {
      const c = el('p', { class: 'note', text: `v${e.version} · ${e.status} · ${money(e.total, e.currency)}` }); box.append(c);
      if (e.status === 'sent') {
        const f = el('form', { class: 'decision' }, field('Decided by', 'approvedBy', { required: true, value: job.customer || '' }), field('Channel', 'channel', { options: [['in person', 'In person'], ['phone', 'Phone'], ['email', 'Email'], ['text message', 'Text message']] }),
          el('button', { type: 'button', 'data-decision': 'approved', text: 'Customer approves' }), el('button', { type: 'button', 'data-decision': 'declined', class: 'secondary', text: 'Customer declines' }));
        f.querySelectorAll('button').forEach(b => b.onclick = () => { const d = Object.fromEntries(new FormData(f)); call('decideEstimate', { ...d, estimate: e.id, decision: b.dataset.decision }); });
        box.append(f);
      }
    }
    if (['received', 'diagnosing', 'awaiting-approval'].includes(job.stage)) {
      const rows = el('div'), api = lineRows(rows, job);
      const f = el('form', { class: 'estimate-form' }, rows, el('button', { type: 'button', text: '+ Part', 'data-add': 'part' }), el('button', { type: 'button', text: '+ Labor', 'data-add': 'labor' }), el('button', { text: job.estimates.length ? 'Send revised estimate' : 'Send estimate' }));
      f.querySelector('[data-add="part"]').onclick = api.addPart; f.querySelector('[data-add="labor"]').onclick = api.addLabor; api.addPart(); api.addLabor();
      f.onsubmit = ev => { ev.preventDefault(); call('createEstimate', { job: job.id, lines: api.read() }); };
      box.append(f);
    }
    return box;
  }
  function actions(job) {
    const panels = [];
    if (['received', 'diagnosing'].includes(job.stage)) panels.push(el('div', { class: 'card sub', 'data-panel': 'diagnosis' }, el('h4', { text: 'Diagnosis' }), form('diag-' + job.key, 'Record diagnosis', [field('Findings', 'findings', { area: true, required: true }), field('Trouble codes', 'codes', { ph: 'P0300', ta: { multi: true, source: window.typeahead.remote('dtc') } })], d => call('diagnose', { ...d, job: job.id }))));
    if (['received', 'diagnosing', 'awaiting-approval', 'in-progress', 'ready', 'closed'].includes(job.stage)) panels.push(estimatePanel(job));
    if (job.stage === 'in-progress') {
      panels.push(el('div', { class: 'card sub', 'data-panel': 'parts' }, el('h4', { text: 'Parts used' }), form('part-' + job.key, 'Add part', [field('Part', 'name', { required: true, ta: { source: t => window.auto.catalog({ kind: 'part', query: t, ctx: { make: (job.vehicleInfo || {}).make, model: (job.vehicleInfo || {}).model } }), onPick: it => { const f = document.getElementById('part-' + job.key); if (it.unitCost) f.querySelector('[name="unitCost"]').value = it.unitCost; if (it.supplier) f.querySelector('[name="supplier"]').value = it.supplier; } } }), field('Qty', 'quantity', { value: '1' }), field('Unit cost', 'unitCost', { required: true }), field('Supplier', 'supplier')], d => call('usePart', { ...d, job: job.id }))));
      const mates = board.teammates.map(t => ({ label: t.name, value: t.id, detail: t.role }));
      panels.push(el('div', { class: 'card sub', 'data-panel': 'hours' }, el('h4', { text: 'Hours by teammate' }), form('hours-' + job.key, 'Log hours', [picker('Teammate', 'teammate', mates, { ph: 'Start typing a name' }), field('Hours', 'hours', { required: true }), field('Date', 'date', { type: 'date' }), field('Note', 'note')], d => call('logHours', { ...d, job: job.id }))));
      panels.push(el('div', { class: 'card sub', 'data-panel': 'invoice' }, el('h4', { text: 'Finish and invoice' }), form('invoice-' + job.key, 'Issue invoice', [field('Extra charges (USD, optional)', 'extra', { ph: '0.00' })], d => call('issueInvoice', { ...d, job: job.id }))));
    }
    if (job.stage === 'ready') {
      const s = job.summary;
      panels.push(el('div', { class: 'card sub', 'data-panel': 'payment' }, el('h4', { text: 'Payment and return' }), el('p', { class: 'note', text: `Invoice ${money(s.billed, s.currency)} · paid ${money(s.paid, s.currency)} · balance ${money(s.balance, s.currency)}` }),
        form('pay-' + job.key, 'Record payment', [field('Amount', 'amount', { required: true, value: s.balance ? (s.balance / 100).toFixed(2) : '' }), field('Method', 'method', { options: [['card', 'Card'], ['cash', 'Cash'], ['check', 'Check'], ['bank', 'Bank transfer']] })], async d => {
          try { await window.auto.recordPayment({ requestId: crypto.randomUUID(), job: job.id, amount: d.amount, currency: s.currency, direction: 'received', method: d.method, paidOn: new Date().toLocaleDateString('en-CA'), notes: '' }); say(''); await load(); return true; } catch (e) { say(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); return false; } }),
        form('return-' + job.key, 'Return vehicle to customer', [field('Collected by', 'collectedBy', { required: true, value: job.customer || '' })], d => call('offboard', { ...d, job: job.id }))));
    }
    return panels;
  }
  function timeline(job) { return el('ol', { class: 'timeline', 'aria-label': 'Ticket history' }, ...job.workItem.slice().reverse().map(ev => el('li', {}, el('b', { text: ev.kind }), ' ', el('span', { text: ev.detail })))); }
  function summary(job) {
    const s = job.summary, hours = Object.entries(s.hoursByTeammate).map(([n, h]) => `${n} ${h}h`).join(', ') || 'no hours yet';
    return el('p', { class: 'note job-summary', text: `Estimate ${money(s.estimateTotal, s.currency)} · parts cost ${money(s.partsCost, s.currency)} · ${hours} · paid ${money(s.paid, s.currency)}` });
  }
  function jobCard(job) {
    return el('article', { class: 'card ticket', 'data-key': job.key, 'data-stage': job.stage }, el('h3', { text: `${job.key} · ${job.title}` }), el('p', { class: 'note', text: `${job.customer || 'Unknown customer'} · ${job.vehicle}` }), stageBar(job), summary(job), ...actions(job), el('details', {}, el('summary', { text: 'Ticket history' }), timeline(job)));
  }
  async function load() {
    board = await window.auto.workshop({ action: 'board' });
    const counts = Object.fromEntries(board.stages.map(s => [s.id, board.jobs.filter(j => j.stage === s.id).length]));
    $('ws-pipeline').replaceChildren(...board.stages.map(s => el('div', { class: 'pipe-step' }, el('b', { text: String(counts[s.id]) }), el('span', { text: s.label }))));
    const open = [...document.querySelectorAll('#ws-desk details[open]')].map(d => d.id);
    $('ws-desk').replaceChildren(...frontDesk(), roster()); for (const id of open) $(id)?.setAttribute('open', '');
    const openForms = new Set([...document.querySelectorAll('#ws-jobs details[open]')].map(d => d.closest('.ticket')?.dataset.key));
    $('ws-jobs').replaceChildren(...(board.jobs.length ? board.jobs.map(jobCard) : [el('p', { class: 'note', text: 'No repairs yet. Add a customer and vehicle, then take the car in.' })]));
    document.querySelectorAll('#ws-jobs .ticket').forEach(t => { if (openForms.has(t.dataset.key)) t.querySelector('details')?.setAttribute('open', ''); });
  }
  document.addEventListener('submit', ev => { if (ev.target.id === 'parts-import-form') { ev.preventDefault(); importPartsSubmit(ev.target); } });
  document.querySelector('[data-view="workshop"]').addEventListener('click', () => load().catch(e => say(e.message)));
  window.workshopReload = load;
})();

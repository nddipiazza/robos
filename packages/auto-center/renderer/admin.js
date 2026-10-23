'use strict';
// Admin for the shop owner: team, customers, parts catalog, intake form, shop settings and backups.
(() => {
  const U = window.workshopUI, el = U.el, root = document.getElementById('admin');
  const w = (action, input) => window.auto.workshop({ action, input });
  const fail = e => U.say(U.clean(e.message));
  const TABS = [['team', 'Team'], ['customers', 'Customers'], ['parts', 'Parts catalog'], ['intake', 'Intake form'], ['tow', 'Tow trucks'], ['settings', 'Shop settings'], ['backup', 'Backup']];
  let tab = 'team', board = null;
  const btn = (label, onClick, cls = '') => { const b = el('button', { type: 'button', class: cls, text: label }); b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const input = (label, value, name, o = {}) => { const c = o.area ? el('textarea', { rows: '4' }) : el('input', { type: o.type || 'text', placeholder: o.ph || '' }); c.value = value || ''; c.name = name; const l = el('label', {}, label, c); if (o.ta) window.typeahead.attach(c, o.ta); return l; };
  const val = (form, n) => form.querySelector(`[name="${n}"]`)?.value ?? '';
  const read = form => Object.fromEntries([...form.querySelectorAll('[name]')].map(c => [c.name, c.value]));
  const money = minor => minor == null ? '' : (minor / 100).toFixed(2);
  async function render() {
    try { U.say(''); board = await w('board'); const tabs = el('div', { class: 'tabs', role: 'tablist' }, ...TABS.map(([id, label]) => { const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), text: label }); b.onclick = () => { tab = id; render(); }; return b; }));
      const body = await ({ team, customers, parts, intake, tow, settings, backup }[tab])(); root.replaceChildren(el('div', { class: 'card wizard-card' }, el('h2', { text: 'Shop admin' }), el('p', { class: 'lead', text: 'Set up your team, your catalog and your shop. Day-to-day work happens in Front desk, Mechanic bench and Checkout.' }), tabs, body)); } catch (e) { fail(e); }
  }
  function team() {
    const rows = board.teammates.map(t => {
      const person = board.directory.people.find(p => p.id === t.personId)?.name;
      const row = el('div', { class: 'row-card', 'data-teammate': t.name }, el('div', {}, el('b', { text: t.name }), t.active ? null : el('span', { class: 'badge', text: 'Inactive' }), el('div', { class: 'note', text: `${t.role}${person ? ' · RobOS: ' + person : ''} · cost ${money(t.hourlyCost)} per hour` })));
      const edit = el('div', {}), f = el('form', { class: 'edit-teammate', hidden: '' }, input('Role', t.role, 'role'), input('Hourly cost (USD)', money(t.hourlyCost), 'hourlyCost'), btn('Save changes', async () => { await w('updateTeammate', { id: t.id, ...read(f) }); await render(); }));
      edit.append(btn('Edit', () => { f.hidden = !f.hidden; }, 'secondary'), btn(t.active ? 'Deactivate' : 'Reactivate', async () => { await w('updateTeammate', { id: t.id, active: !t.active }); await render(); }, 'secondary'), f); row.append(edit); return row;
    });
    const add = el('form', { id: 'admin-team-form' }, el('h3', { text: 'Add a team member' }), input('Name', '', 'name'), input('Role', '', 'role', { ph: 'Technician' }));
    const sel = el('select', { name: 'personId' }, el('option', { value: '', text: 'Not linked to a RobOS user' }), ...board.directory.people.map(p => el('option', { value: p.id, text: p.name + (p.email ? ' · ' + p.email : '') })));
    add.append(el('label', {}, 'RobOS user', sel), input('Hourly labor cost (USD, optional)', '', 'hourlyCost', { ph: '30.00' }), btn('Add team member', async () => { await w('addTeammate', read(add)); await render(); }, 'big-btn'));
    return el('div', {}, el('h3', { text: `Team (${board.teammates.filter(t => t.active).length} active)` }), ...(rows.length ? rows : [el('p', { class: 'note', text: 'No team members yet.' })]), add);
  }
  function customers() {
    const imp = el('form', { id: 'admin-customer-import-form' }, el('h3', { text: 'Bring in your existing customers' }), el('p', { class: 'note', text: 'Export your customers from your old system as a CSV with one row per vehicle. Only a name column is required. Optional columns: phone, email, preferred contact, notes, year, make, model, VIN, plate. A customer with several vehicles can appear on several rows. Running the import twice does not create duplicates.' }), el('label', {}, 'Choose a CSV file', el('input', { type: 'file', name: 'file', accept: '.csv,text/csv' })), input('Or paste CSV text', '', 'csv', { area: true }),
      btn('Import customers', async () => { const f = imp.querySelector('[name="file"]').files[0], csv = f ? await f.text() : val(imp, 'csv'); const r = await w('importCustomers', { csv }); U.say(`Imported ${r.customersAdded} customer(s) and ${r.vehiclesAdded} vehicle(s)${r.customersExisting ? `; ${r.customersExisting} customer(s) were already on file` : ''}${r.skipped ? `; skipped ${r.skipped} vehicle(s) already on file` : ''}.`); await render(); U.say(`Imported ${r.customersAdded} customer(s) and ${r.vehiclesAdded} vehicle(s).`); }, 'big-btn'));
    return el('div', {}, imp, el('h3', { text: `Customers (${board.customers.length})` }), el('p', { class: 'note', text: 'New customers are added from the Front desk when they call, text, email or walk in.' }), ...board.customers.map(c => el('div', { class: 'row-card' }, el('div', {}, el('b', { text: c.name }), el('div', { class: 'note', text: [c.phone, c.email, c.preferred ? 'prefers ' + c.preferred : '', board.vehicles.filter(v => v.customer === c.id).length + ' vehicle(s)'].filter(Boolean).join(' · ') })))));
  }
  function parts() {
    const add = el('form', { id: 'admin-part-form' }, el('h3', { text: 'Add a part' }));
    add.append(input('Part name', '', 'name', { ph: 'Ceramic brake pads, front' }), input('Part number', '', 'partNumber'), input('Supplier', '', 'supplier'), el('div', { class: 'row' }, input('Your cost (USD)', '', 'cost'), input('Price to customer (USD)', '', 'price')), input('Category', '', 'category'),
      el('div', { class: 'row' }, input('Fits make', '', 'make', { ta: { source: window.typeahead.remote('make') } }), input('Fits model', '', 'model', { ta: { source: q => window.auto.catalog({ kind: 'model', query: q, ctx: { make: val(add, 'make') } }), openOnFocus: true } })), el('div', { class: 'row' }, input('Year from', '', 'yearFrom'), input('Year to', '', 'yearTo')),
      btn('Add to catalog', async () => { await w('addPart', read(add)); U.say('Part added to the catalog.'); add.reset(); }, 'big-btn'));
    const imp = el('form', { id: 'admin-import-form' }, el('h3', { text: 'Import a supplier price list' }), el('p', { class: 'note', text: 'CSV with a name column. Optional: part number, supplier, cost, price, category, make, model, year from, year to. Fitment columns are hints, not verified fitment.' }), el('label', {}, 'Choose a CSV file', el('input', { type: 'file', name: 'file', accept: '.csv,text/csv' })), input('Or paste CSV text', '', 'csv', { area: true }),
      btn('Import parts', async () => { const f = imp.querySelector('[name="file"]').files[0], csv = f ? await f.text() : val(imp, 'csv'); const r = await w('importParts', { csv }); U.say(`Imported ${r.added} part(s)${r.skipped ? `, skipped ${r.skipped} already in the catalog` : ''}.`); imp.reset(); }, 'big-btn'));
    const find = el('div', { class: 'q-block' }, el('h3', { text: 'Search your catalog' }), input('Start typing a part', '', 'search', { ta: { source: q => window.auto.catalog({ kind: 'part', query: q, ctx: {} }), openOnFocus: false } }));
    return el('div', {}, find, add, imp);
  }
  async function intake() {
    const f = await w('intakeForm', {});
    return el('div', {}, el('h3', { text: 'Issue intake form' }), el('p', { class: 'note', text: 'Front desk asks these questions, taken from the shop knowledge graph (data/intake-form.jsonld). To customise it, copy that file to your shop data folder as intake-form.jsonld and edit the categories and questions.' }),
      ...f.categories.map(c => el('details', { class: 'card' }, el('summary', { text: `${c.label} (${c.questions.length} questions)` }), el('p', { class: 'note', text: c.description }), el('ul', {}, ...c.questions.map(q => el('li', { text: `${q.label}${q.options.length ? ' — ' + q.options.join(', ') : ''}` }))))),
      el('details', { class: 'card' }, el('summary', { text: `Asked for every problem (${f.common.length})` }), el('ul', {}, ...f.common.map(q => el('li', { text: `${q.label} — ${q.options.join(', ')}` })))));
  }
  // Tow trucks, the rate card every tow quote and invoice uses, and the tow call questions.
  async function tow() {
    const [b, f] = await Promise.all([w('towBoard'), w('towForm')]), r = b.rates || {};
    const rows = b.trucks.map(t => el('div', { class: 'row-card', 'data-truck': t.name }, el('div', {}, el('b', { text: t.name }), t.active ? null : el('span', { class: 'badge', text: 'Out of service' }), el('div', { class: 'note', text: [t.typeLabel, t.plate, t.onCall ? 'out on ' + t.onCall : ''].filter(Boolean).join(' · ') })),
      btn(t.active ? 'Take out of service' : 'Back in service', async () => { await w('saveTowTruck', { id: t.id, active: !t.active }); await render(); }, 'secondary')));
    const type = el('select', { name: 'truckType' }, ...Object.entries(b.truckTypes).map(([v, t]) => el('option', { value: v, text: t })));
    const add = el('form', { id: 'admin-truck-form' }, el('h3', { text: 'Add a truck' }), input('Truck name', '', 'name', { ph: 'Truck 1' }), el('label', {}, 'Type', type), input('Plate (optional)', '', 'plate'),
      el('p', { class: 'note', text: 'Flatbeds carry all-wheel-drive, electric, damaged and lowered cars. A wheel-lift lifts two wheels and tows the car on the other two. A heavy-duty wrecker handles anything, including trailers.' }),
      btn('Add truck', async () => { await w('saveTowTruck', read(add)); await render(); U.say('Truck added.'); }, 'big-btn'));
    const cur = el('select', { name: 'currency' }, ...['USD', 'CAD', 'EUR', 'GBP'].map(c => el('option', { value: c, text: c }))); cur.value = r.currency || board.settings.currency;
    const rates = el('form', { id: 'admin-tow-rates-form' }, el('h3', { text: 'Tow rates' }), el('p', { class: 'note', text: 'Quotes on the call and tow invoices use these rates. A call keeps the rates it was quoted with, even if you change them later.' }),
      el('div', { class: 'row' }, input('Hook-up fee', money(r.hookup), 'hookup', { ph: '95.00' }), input('Per loaded mile', money(r.perMile), 'perMile', { ph: '4.50' }), input('Miles included in hook-up', r.includedMiles ?? '', 'includedMiles', { ph: '5' })),
      el('div', { class: 'row' }, input('Roadside service (jump, lockout, tire, fuel)', money(r.roadside), 'roadside', { ph: '75.00' }), input('Winching per hour', money(r.winchPerHour), 'winchPerHour', { ph: '120.00' })),
      el('div', { class: 'row' }, input('After-hours surcharge', money(r.afterHours), 'afterHours', { ph: '50.00' }), input('Yard storage per day', money(r.storagePerDay), 'storagePerDay', { ph: '40.00' }), el('label', {}, 'Currency', cur)),
      btn('Save tow rates', async () => { await w('saveTowRates', read(rates)); await render(); U.say('Tow rates saved.'); }, 'big-btn'));
    const questions = el('details', { class: 'card' }, el('summary', { text: `Tow call questions (${f.services.length} services)` }), el('p', { class: 'note', text: 'The Tow desk asks these questions, taken from the shop knowledge graph (data/tow-form.jsonld). Copy it to your shop data folder as tow-form.jsonld to change them.' }),
      ...f.services.map(s => el('div', {}, el('b', { text: s.label }), el('ul', {}, ...s.questions.map(q => el('li', { text: `${q.label} — ${q.options.join(', ')}` }))))), el('b', { text: 'Asked on every call' }), el('ul', {}, ...f.common.map(q => el('li', { text: `${q.label} — ${q.options.join(', ')}` }))));
    return el('div', {}, el('h3', { text: `Trucks (${b.trucks.filter(t => t.active).length} in service)` }), ...(rows.length ? rows : [el('p', { class: 'note', text: 'No trucks yet.' })]), add, rates, questions,
      el('p', { class: 'note', text: 'Tow drivers are team members. Add them on the Team tab with a role such as "Tow driver".' }));
  }
  function settings() {
    const s = board.settings, f = el('form', { id: 'admin-settings-form' }, el('h3', { text: 'Shop settings' }), input('Shop name', s.name, 'name'), input('Shop phone', s.phone, 'phone', { type: 'tel' }));
    const cur = el('select', { name: 'currency' }, ...['USD', 'CAD', 'EUR', 'GBP'].map(c => el('option', { value: c, text: c }))); cur.value = s.currency;
    f.append(el('label', {}, 'Currency', cur), input('Default labor rate per hour', money(s.defaultRateMinor), 'defaultRate', { ph: '110.00' }), btn('Save settings', async () => { await w('saveSettings', read(f)); U.say('Settings saved.'); await render(); U.say('Settings saved.'); }, 'big-btn')); return f;
  }
  async function backup() {
    const g = await window.auto.gitops({ action: 'status' }), box = el('div', {}, el('h3', { text: 'Backup' }), el('p', { class: 'note', text: 'Every change in your shop is saved in a private history on this computer. Connect it to a private GitHub repository so a lost or broken computer never costs you your customers’ records.' }));
    box.append(el('div', { class: g.remote ? 'notice ok' : 'notice warn', id: 'backup-status', text: `${g.remote ? 'Backed up to ' + g.remote : 'Not backed up yet: no remote is connected.'} ${g.dirty ? 'Some changes are not saved to history yet.' : 'All changes are saved to history.'}` }));
    const repo = input('Private GitHub repository (owner/name)', g.remote ? g.remote.replace('https://github.com/', '') : '', 'repository', { ph: 'your-shop/records' });
    box.append(repo, btn('Connect', async () => { await window.auto.gitops({ action: 'configure', repository: val(repo, 'repository').trim() }); U.say('Connected. Use Back up now to send your records.'); await render(); U.say('Connected. Use Back up now to send your records.'); }), btn('Back up now', async () => { await window.auto.gitops({ action: 'sync' }); U.say('Backed up.'); await render(); U.say('Backed up.'); }, 'big-btn'));
    return box;
  }
  document.querySelector('[data-view="admin"]').addEventListener('click', () => { tab = 'team'; render(); });
})();

'use strict';
// Front desk: a guided intake (contact, customer, vehicle, issue, confirm) plus follow-ups and contact logging.
(() => {
  const U = window.workshopUI, el = U.el, root = document.getElementById('frontdesk');
  const w = (action, input) => window.auto.workshop({ action, input });
  const fail = e => { U.say(U.clean(e.message)); };
  const STEPS = ['Contact', 'Customer', 'Vehicle', 'Issue', 'Confirm'];
  const CHANNEL_HINTS = { 'phone call': 'They called the shop', 'text message': 'They texted us', email: 'They emailed us', 'walk-in': 'They are here in person', website: 'They used our website', other: 'Some other way' };
  const fresh = () => ({ view: 'home', step: 0, channel: '', mode: '', customer: null, found: [], query: '', draft: { name: '', phone: '', email: '', preferred: '', userId: '', groupId: '' }, addingVehicle: false, vehicle: { year: '', make: '', model: '', plate: '', vin: '' }, vehicleId: '', category: '', answers: {}, notes: '', odometer: '', location: '', result: null, form: null });
  let s = fresh(), board = null;
  const btn = (label, onClick, cls = '') => { const b = el('button', { type: 'button', class: cls, text: label }); b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const choice = (title, sub, pressed, onClick, disabled) => { const b = el('button', { type: 'button', class: 'choice', 'aria-pressed': String(!!pressed) }, el('b', { text: title }), sub ? el('small', { text: sub }) : null); if (disabled) b.disabled = true; else b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const chip = (label, pressed, onClick) => { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!pressed), text: label }); b.onclick = onClick; return b; };
  function input(label, value, onInput, o = {}) {
    const c = o.area ? el('textarea', { rows: '3' }) : el('input', { type: o.type || 'text', placeholder: o.ph || '' }); c.value = value || ''; if (o.name) c.name = o.name;
    c.addEventListener('input', () => onInput(c.value)); const l = el('label', {}, label, c); if (o.ta) window.typeahead.attach(c, o.ta); return l;
  }
  const stepper = () => el('ol', { class: 'stepper', 'aria-label': 'Intake steps' }, ...STEPS.map((t, i) => el('li', { class: i < s.step ? 'done' : i === s.step ? 'current' : '', text: t })));
  const nav = (backFn, nextLabel, nextFn) => el('div', { class: 'wizard-nav' }, backFn ? btn('Back', backFn, 'secondary') : el('span'), el('span', { class: 'grow' }), nextFn ? btn(nextLabel, nextFn, 'big-btn') : null);
  const draw = (...kids) => { root.replaceChildren(...kids); };
  async function loadBoard() { board = await w('board'); }

  // ---- home
  async function home() {
    await loadBoard();
    const jobs = board.jobs, open = jobs.filter(j => j.stage !== 'closed');
    const needEstimate = open.filter(j => ['received', 'diagnosing'].includes(j.stage)), waiting = open.filter(j => j.stage === 'awaiting-approval'), extra = open.filter(j => j.needsApproval);
    draw(el('div', { class: 'card wizard-card' }, el('h2', { text: 'What would you like to do?' }), el('p', { class: 'lead', text: 'Start with a customer, log a conversation, or work through the follow-ups below.' }),
      el('div', { class: 'choice-grid' }, choice('Start an intake', 'A customer is calling, texting, emailing or standing here', false, () => { s = fresh(); s.view = 'wizard'; return render(); }), choice('Log a call, text or email', 'Record a conversation about a ticket', false, () => { s.view = 'contact'; return render(); }))),
      followUps('Estimates to prepare', needEstimate, 'Add an itemized estimate once the car has been looked at.'), followUps('Waiting for the customer to approve', waiting, 'Call, text or email the customer, then record their answer.'), followUps('Mechanic recommends more work', extra, 'The mechanic found something else. Contact the customer before more work is done.'));
  }
  function followUps(title, jobs, hint) {
    const box = el('div', { class: 'card' }, el('h3', { text: `${title} (${jobs.length})` }), el('p', { class: 'note', text: hint }));
    if (!jobs.length) box.append(el('p', { class: 'note', text: 'Nothing here right now.' }));
    for (const j of jobs) {
      const c = board.customers.find(c => c.id === j.customerId) || {};
      const card = el('div', { class: 'row-card' }, el('div', {}, el('b', { text: `${j.key} · ${j.vehicle || ''}` }), j.priority === 'urgent' ? el('span', { class: 'badge urgent', text: 'Urgent' }) : null, el('div', { class: 'note', text: `${j.customer || ''}${c.phone ? ' · ' + c.phone : ''}${c.preferred ? ' · prefers ' + c.preferred : ''}` }), j.needsApproval ? el('div', { class: 'note', text: 'Mechanic says: ' + j.needsApproval }) : null),
        btn('Open', () => { s.view = 'ticket'; s.ticketId = j.id; return render(); }));
      box.append(card);
    }
    return box;
  }
  // ---- ticket actions for the front desk
  async function ticket() {
    await loadBoard(); const job = board.jobs.find(j => j.id === s.ticketId); if (!job) { s.view = 'home'; return render(); }
    const c = board.customers.find(c => c.id === job.customerId) || {};
    draw(el('div', { class: 'card wizard-card' }, el('h2', { text: `${job.key} · ${job.title}` }), el('p', { class: 'lead', text: `${job.customer || ''} · ${job.vehicle || ''}${c.phone ? ' · ' + c.phone : ''}${c.email ? ' · ' + c.email : ''}` }),
      ['received', 'diagnosing', 'awaiting-approval'].includes(job.stage) ? U.estimatePanel(job) : el('p', { class: 'notice', text: 'This ticket is already approved. Use Mechanic bench and Checkout from here.' }),
      contactPanel(job.id), el('details', {}, el('summary', { text: 'Ticket history' }), el('ol', { class: 'timeline' }, ...job.workItem.slice().reverse().map(ev => el('li', {}, el('b', { text: ev.kind }), ' ', el('span', { text: ev.detail }))))), nav(() => { s.view = 'home'; return render(); })));
  }
  function contactPanel(jobId) {
    const f = el('form', { id: 'contact-form', class: 'bench-panel' }, el('h3', { text: 'Log a conversation' }));
    let channel = 'phone call', direction = 'outgoing', note = '';
    const chips = el('div', { class: 'chips' }); const draw2 = () => chips.replaceChildren(...['phone call', 'text message', 'email', 'walk-in'].map(c => chip(c, channel === c, () => { channel = c; draw2(); })), el('span', { class: 'note', text: '  ' }), ...[['outgoing', 'We contacted them'], ['incoming', 'They contacted us']].map(([v, t]) => chip(t, direction === v, () => { direction = v; draw2(); }))); draw2();
    f.append(chips, input('What was said', '', v => { note = v; }, { area: true, name: 'note' }), btn('Save to ticket', async () => { try { await w('logContact', { job: jobId, channel, direction, note }); U.say(''); await render(); } catch (e) { fail(e); } }));
    return f;
  }
  async function contactLog() {
    await loadBoard(); const open = board.jobs.filter(j => j.stage !== 'closed');
    const hidden = el('input', { type: 'hidden', name: 'job' }), visible = el('input', { type: 'text', placeholder: 'Type a ticket number, customer or vehicle', 'data-for': 'job', 'aria-label': 'Ticket' });
    const items = open.map(j => ({ label: `${j.key} · ${j.customer || ''} · ${j.vehicle || ''}`, value: j.id }));
    const pickLabel = el('label', {}, 'Ticket', visible, hidden);
    window.typeahead.local(visible, () => items, it => { s.ticketId = it.value; });
    draw(el('div', { class: 'card wizard-card' }, el('h2', { text: 'Log a call, text or email' }), el('p', { class: 'lead', text: 'Which ticket was the conversation about?' }), pickLabel,
      nav(() => { s.view = 'home'; return render(); }, 'Continue', async () => { if (!items.some(i => i.value === s.ticketId)) { U.say('Pick a ticket from the list'); return; } s.view = 'ticket'; await render(); })));
  }
  // ---- intake wizard
  async function wizardView() {
    if (!s.form) s.form = await w('intakeForm'); await loadBoard();
    if (s.result) return done();
    const body = [stepper()];
    if (s.step === 0) body.push(stepContact()); if (s.step === 1) body.push(stepCustomer()); if (s.step === 2) body.push(stepVehicle()); if (s.step === 3) body.push(stepIssue()); if (s.step === 4) body.push(stepConfirm());
    draw(el('div', { class: 'card wizard-card', 'data-step': STEPS[s.step] }, ...body));
  }
  function stepContact() {
    return el('div', {}, el('h2', { text: 'How did the customer reach us?' }), el('p', { class: 'lead', text: 'This is saved on the ticket so everyone knows how to reply.' }),
      el('div', { class: 'choice-grid' }, ...s.form.channels.map(c => choice(c.charAt(0).toUpperCase() + c.slice(1), CHANNEL_HINTS[c], s.channel === c, () => { s.channel = c; return render(); }))),
      nav(() => { s.view = 'home'; return render(); }, 'Next', () => { if (!s.channel) { U.say('Choose how the customer reached us'); return; } U.say(''); s.step = 1; return render(); }));
  }
  function stepCustomer() {
    const box = el('div', {}, el('h2', { text: 'Who are we helping?' }), el('div', { class: 'choice-grid' }, choice('Existing customer', 'Look them up by phone, email or name', s.mode === 'existing', () => { s.mode = 'existing'; return render(); }), choice('New customer', 'Take their name and phone number', s.mode === 'new', () => { s.mode = 'new'; s.customer = null; return render(); })));
    if (s.mode === 'existing') {
      const results = el('div', { class: 'result-list', id: 'customer-results' });
      const search = async q => { s.query = q; s.found = q.trim().length >= 3 || /\D/.test(q) && q.trim().length >= 2 ? await w('findCustomers', { query: q }) : []; showResults(); };
      const showResults = () => {
        results.replaceChildren(...s.found.map(c => choice(c.name, [c.phone, c.email, c.vehicles.length + ' vehicle(s)'].filter(Boolean).join(' · '), s.customer?.id === c.id, () => { s.customer = c; s.vehicleId = ''; return render(); })));
        if (s.query.trim().length >= 3 && !s.found.length) results.append(el('div', { class: 'notice warn' }, 'No customer found. ', btn('Add as a new customer', () => { s.mode = 'new'; if (/@/.test(s.query)) s.draft.email = s.query; else if (/^[\d\s()+.-]+$/.test(s.query)) s.draft.phone = s.query; else s.draft.name = s.query; return render(); })));
      };
      box.append(input('Phone number, email or name', s.query, search, { ph: '555 010 0100', name: 'lookup' }), results); showResults();
      if (s.customer) box.append(el('div', { class: 'notice ok', text: `Selected ${s.customer.name}.` }));
    }
    if (s.mode === 'new') {
      const d = s.draft;
      box.append(input('Customer name', d.name, v => { d.name = v; }, { name: 'name' }), input('Phone number', d.phone, v => { d.phone = v; }, { name: 'phone', ph: '555 010 0100', type: 'tel' }), input('Email (optional)', d.email, v => { d.email = v; }, { name: 'email', type: 'email' }),
        el('div', { class: 'q-block' }, el('h4', { text: 'How do they prefer to be contacted?' }), el('div', { class: 'chips' }, ...['phone call', 'text message', 'email'].map(c => chip(c, d.preferred === c, () => { d.preferred = d.preferred === c ? '' : c; render(); })))),
        el('details', {}, el('summary', { text: 'Link to RobOS user or group (optional)' }), el('p', { class: 'note', text: 'Use this for fleet or business accounts that already exist in RobOS People and Groups.' }), userLinks(d)));
    }
    box.append(nav(() => { s.step = 0; return render(); }, 'Next', async () => {
      if (s.mode === 'existing') { if (!s.customer) { U.say('Select a customer, or choose New customer'); return; } }
      else if (s.mode === 'new') { if (!s.customer) { const d = s.draft; const c = await w('registerCustomer', { name: d.name, phone: d.phone, email: d.email, preferredContact: d.preferred, userId: d.userId, groupId: d.groupId }); s.customer = { id: c['@id'], name: c['schema:name'], phone: c['schema:telephone'], email: c['schema:email'], vehicles: [] }; } }
      else { U.say('Choose existing or new customer'); return; }
      U.say(''); s.step = 2; s.addingVehicle = !s.customer.vehicles.length; await render();
    }));
    return box;
  }
  function userLinks(d) {
    const dir = board.directory, wrap = el('div', {});
    const sel = (label, key, items) => { const c = el('select', {}, el('option', { value: '', text: 'None' }), ...items.map(i => el('option', { value: i.id, text: i.name }))); c.value = d[key]; c.onchange = () => { d[key] = c.value; }; return el('label', {}, label, c); };
    wrap.append(sel('RobOS user', 'userId', dir.people), sel('RobOS group', 'groupId', dir.groups)); return wrap;
  }
  function stepVehicle() {
    const c = s.customer, box = el('div', {}, el('h2', { text: `Which vehicle is ${c.name} asking about?` }));
    if (c.vehicles.length) box.append(el('div', { class: 'choice-grid' }, ...c.vehicles.map(v => choice(v.name, [v.plate, v.openTicket ? 'Already open: ' + v.openTicket : ''].filter(Boolean).join(' · '), s.vehicleId === v.id && !s.addingVehicle, () => { s.vehicleId = v.id; s.addingVehicle = false; return render(); }, !!v.openTicket)), choice('Another vehicle', 'Add a different car for this customer', s.addingVehicle, () => { s.addingVehicle = true; s.vehicleId = ''; return render(); })));
    if (s.addingVehicle) {
      const v = s.vehicle, f = n => root.querySelector(`[name="${n}"]`);
      box.append(input('Find year, make and model', '', () => {}, { name: 'find', ph: '2015 Toyota Camry', ta: { source: window.typeahead.remote('config'), onPick: it => { v.year = it.year; v.make = it.make; v.model = it.model; f('year').value = it.year; f('make').value = it.make; f('model').value = it.model; } } }),
        el('div', { class: 'row' }, input('Year', v.year, x => { v.year = x; }, { name: 'year', ta: { source: q => window.auto.catalog({ kind: 'year', query: q, ctx: { make: v.make, model: v.model } }), openOnFocus: true, minChars: 0 } }),
          input('Make', v.make, x => { v.make = x; }, { name: 'make', ta: { source: window.typeahead.remote('make'), onPick: () => { v.model = ''; f('model').value = ''; } } }),
          input('Model', v.model, x => { v.model = x; }, { name: 'model', ta: { source: q => window.auto.catalog({ kind: 'model', query: q, ctx: { make: v.make } }), openOnFocus: true, onPick: it => { if (it.make) { v.make = it.make; f('make').value = it.make; } } } })),
        el('div', { class: 'row' }, input('Licence plate (optional)', v.plate, x => { v.plate = x; }, { name: 'plate' }), input('VIN (optional)', v.vin, x => { v.vin = x; }, { name: 'vin' })));
    }
    box.append(nav(() => { s.step = 1; return render(); }, 'Next', async () => {
      if (s.addingVehicle) { const v = s.vehicle; if (!v.year || !v.make || !v.model) { U.say('Enter the year, make and model so we know which car we are looking at'); return; }
        const n = await w('addCustomerVehicle', { customer: c.id, name: `${v.year} ${v.make} ${v.model}`, year: v.year, make: v.make, model: v.model, plate: v.plate, vin: v.vin }); s.vehicleId = n['@id']; c.vehicles.push({ id: n['@id'], name: n['dcterms:title'] }); s.addingVehicle = false; s.vehicle = { year: '', make: '', model: '', plate: '', vin: '' }; }
      else if (!s.vehicleId) { U.say('Choose a vehicle'); return; }
      U.say(''); s.step = 3; await render();
    }));
    return box;
  }
  function questionBlock(q) {
    const cur = s.answers[q.key]; const block = el('div', { class: 'q-block', 'data-question': q.key }, el('h4', { text: q.label }));
    if (q.type === 'text') { block.append(input('', cur || '', v => { s.answers[q.key] = v; }, { name: 'q-' + q.key })); return block; }
    const multi = q.type === 'multi';
    block.append(el('div', { class: 'chips' }, ...q.options.map(o => chip(o, multi ? (cur || []).includes(o) : cur === o, () => { if (multi) { const set = new Set(cur || []); set.has(o) ? set.delete(o) : set.add(o); s.answers[q.key] = [...set]; } else s.answers[q.key] = cur === o ? '' : o; render(); }))));
    return block;
  }
  function stepIssue() {
    const cat = s.form.categories.find(c => c.id === s.category), box = el('div', {}, el('h2', { text: 'What is the problem?' }), el('p', { class: 'lead', text: 'Pick the closest match. The questions that follow help the mechanic before they even look at the car.' }),
      el('div', { class: 'choice-grid' }, ...s.form.categories.map(c => choice(c.label, c.description, s.category === c.id, () => { if (s.category !== c.id) { s.answers = {}; } s.category = c.id; return render(); }))));
    if (cat) { box.append(el('h3', { text: cat.label + ': tell us more' }), ...cat.questions.map(questionBlock), el('h3', { text: 'A few more details' }), ...s.form.common.map(questionBlock), input('Anything else, in the customer’s own words', s.notes, v => { s.notes = v; }, { area: true, name: 'notes' })); }
    box.append(nav(() => { s.step = 2; return render(); }, 'Review', () => { if (!s.category) { U.say('Choose what the problem is about'); return; } U.say(''); s.step = 4; return render(); }));
    return box;
  }
  const answerLine = v => Array.isArray(v) ? v.join(', ') : v;
  function stepConfirm() {
    const cat = s.form.categories.find(c => c.id === s.category), veh = s.customer.vehicles.find(v => v.id === s.vehicleId);
    const rows = [['Contacted by', s.channel], ['Customer', `${s.customer.name}${s.customer.phone ? ' · ' + s.customer.phone : ''}`], ['Vehicle', veh?.name || ''], ['Problem', cat.label]];
    for (const q of [...cat.questions, ...s.form.common]) { const a = s.answers[q.key]; if (a && a.length) rows.push([q.label.replace(/\?$/, ''), answerLine(a)]); }
    if (s.notes) rows.push(['Customer says', s.notes]);
    const urgent = s.answers.urgency === 'Emergency or unsafe' || s.answers.driveable === 'No, it needs to be towed';
    return el('div', {}, el('h2', { text: 'Check and open the ticket' }), urgent ? el('div', { class: 'notice warn', text: 'This looks urgent or unsafe. The ticket will be marked Urgent.' }) : null,
      el('dl', { class: 'summary-grid' }, ...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
      el('div', { class: 'row' }, input('Odometer (optional)', s.odometer, v => { s.odometer = v; }, { name: 'odometer', ph: '84000' }), input('Where is the car parked? (optional)', s.location, v => { s.location = v; }, { name: 'location', ph: 'Bay 2' })),
      nav(() => { s.step = 3; return render(); }, 'Open ticket', async () => {
        const r = await w('intakeRepair', { vehicle: s.vehicleId, channel: s.channel, category: s.category, answers: s.answers, notes: s.notes, odometer: s.odometer, location: s.location });
        s.result = { key: r.job['robos:workItemKey'], id: r.job['@id'] }; U.say(''); await render();
      }));
  }
  function done() {
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Done' }, el('div', { class: 'notice ok' }, el('b', { text: `Ticket ${s.result.key} is open.` }), ` ${s.customer.name}'s ${s.customer.vehicles.find(v => v.id === s.vehicleId)?.name || 'vehicle'} is checked in and the mechanics can see the details.`),
      el('p', { class: 'lead', text: 'What next?' }), el('div', { class: 'choice-grid' }, choice('Start another intake', 'Next customer', false, () => { s = fresh(); s.view = 'wizard'; return render(); }), choice('Prepare the estimate', 'Add parts and labor for this ticket', false, () => { s.view = 'ticket'; s.ticketId = s.result.id; return render(); }), choice('Back to front desk', '', false, () => { s = fresh(); return render(); }))));
  }
  async function render() {
    try { U.say(''); if (s.view === 'home') await home(); else if (s.view === 'wizard') await wizardView(); else if (s.view === 'contact') await contactLog(); else if (s.view === 'ticket') await ticket(); } catch (e) { fail(e); }
  }
  document.querySelector('[data-view="frontdesk"]').addEventListener('click', () => { s = fresh(); render(); });
  window.addEventListener('auto-workshop-changed', () => { if (!root.hidden && s.view === 'ticket') render(); });
})();

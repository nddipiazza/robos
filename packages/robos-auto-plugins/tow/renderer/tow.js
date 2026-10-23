'use strict';
// Tow desk: take a tow or roadside call (caller, vehicle, service, pickup, quote), then dispatch a truck and
// follow each call to the drop-off. Invoices and payments for tows happen at Checkout.
(() => {
  const U = window.workshopUI, el = U.el, root = document.getElementById('tow');
  const w = (action, input) => window.auto.workshop({ action, input });
  const fail = e => U.say(U.clean(e.message));
  const STEPS = ['Caller', 'Vehicle', 'Service', 'Pickup', 'Quote'];
  const BILL_LABELS = { customer: 'The customer', 'motor club': 'Motor club', insurance: 'Insurance', 'police or city': 'Police or city', 'fleet account': 'Fleet account' };
  const afterHoursNow = () => { const d = new Date(), h = d.getHours(); return h < 7 || h >= 19 || d.getDay() === 0 || d.getDay() === 6; };
  const freshCall = () => ({ step: 0, mode: '', query: '', found: [], customer: null, draft: { name: '', phone: '' }, vehicleId: '', addingVehicle: false, vehicle: { year: '', make: '', model: '', plate: '' }, service: '', answers: {}, pickupAddress: '', pickupNotes: '', destination: 'shop', destinationAddress: '', estimatedMiles: '', billTo: 'customer', billToName: '', authorization: '', afterHours: afterHoursNow(), notes: '', result: null });
  let view = 'board', c = freshCall(), board = null, form = null;
  const btn = (label, onClick, cls = '') => { const b = el('button', { type: 'button', class: cls, text: label }); b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const choice = (title, sub, pressed, onClick, disabled) => { const b = el('button', { type: 'button', class: 'choice', 'aria-pressed': String(!!pressed) }, el('b', { text: title }), sub ? el('small', { text: sub }) : null); if (disabled) b.disabled = true; else b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const chip = (label, pressed, onClick) => { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!pressed), text: label }); b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  function input(label, value, onInput, o = {}) {
    const x = o.area ? el('textarea', { rows: '3' }) : el('input', { type: o.type || 'text', placeholder: o.ph || '' }); x.value = value ?? ''; if (o.name) x.name = o.name;
    x.addEventListener('input', () => onInput(x.value)); const l = el('label', {}, label, x); if (o.ta) window.typeahead.attach(x, o.ta); return l;
  }
  const nav = (back, label, next) => el('div', { class: 'wizard-nav' }, back ? btn('Back', back, 'secondary') : el('span'), el('span', { class: 'grow' }), next ? btn(label, next, 'big-btn') : null);
  const draw = (...kids) => root.replaceChildren(...kids);
  const money = (minor, cur) => U.money(minor, cur || board?.rates?.currency || 'USD');
  async function load() { board = await w('towBoard'); }

  // ---- dispatch board
  function towCard(t) {
    const card = el('article', { class: 'card tow-card', 'data-key': t.key, 'data-stage': t.stage },
      el('div', { class: 'tow-card-top' }, el('b', { text: `${t.key} · ${t.serviceLabel}` }), t.priority === 'urgent' ? el('span', { class: 'badge urgent', text: 'Urgent' }) : null, el('span', { class: 'badge', text: t.stageLabel }), t.repairKey ? el('span', { class: 'badge', text: 'Repair ' + t.repairKey }) : null),
      el('p', { class: 'tow-vehicle', text: `${t.vehicle}${t.phone ? ' · ' + t.phone : ''}` }),
      el('dl', { class: 'summary-grid' }, el('dt', { text: 'Pickup' }), el('dd', { text: t.pickup + (t.pickupNotes ? ' (' + t.pickupNotes + ')' : '') }), t.kind === 'tow' ? el('dt', { text: 'Drop-off' }) : null, t.kind === 'tow' ? el('dd', { text: t.destinationLabel }) : null,
        t.needs !== 'any' ? el('dt', { text: 'Truck needed' }) : null, t.needs !== 'any' ? el('dd', { text: `${t.needs === 'flatbed' ? 'Flatbed' : 'Heavy-duty wrecker'}: ${t.needReasons.join(', ')}` }) : null,
        t.truck ? el('dt', { text: 'Truck' }) : null, t.truck ? el('dd', { text: `${t.truck} · ${t.driver}${t.etaMinutes && t.stage === 'dispatched' ? ' · ETA ' + new Date(Date.parse(t.dispatchedAt) + t.etaMinutes * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}` }) : null,
        el('dt', { text: 'Bill to' }), el('dd', { text: `${t.billToName || BILL_LABELS[t.billTo]}${t.billTo !== 'customer' ? ' (' + t.billTo + ')' : ''}${t.authorization ? ' · ' + t.authorization : ''}` }),
        el('dt', { text: t.summary.billed == null ? 'Quoted' : 'Invoiced' }), el('dd', { text: t.summary.billed == null ? (t.summary.quoted == null ? 'No rates set' : money(t.summary.quoted, t.summary.currency)) : `${money(t.summary.billed, t.summary.currency)} · balance ${money(t.summary.balance, t.summary.currency)}` })));
    card.append(actions(t), el('details', {}, el('summary', { text: 'Call history' }), el('ol', { class: 'timeline' }, ...t.events.slice().reverse().map(ev => el('li', {}, el('b', { text: ev.kind }), ' ', el('span', { text: ev.detail }))))));
    return card;
  }
  const act = async (action, input, done) => { await w(action, input); await render(); if (done) U.say(done); };
  function cancelBox(t) {
    let reason = ''; return el('details', { class: 'tow-cancel' }, el('summary', { text: 'Cancel this call' }), input('Why is it cancelled?', '', v => { reason = v; }, { name: 'reason', ph: 'Customer got a jump from a friend' }), btn('Cancel call', () => act('cancelTow', { tow: t.id, reason }, `${t.key} cancelled.`), 'secondary'));
  }
  function actions(t) {
    const box = el('div', { class: 'bench-panel tow-actions' });
    if (t.stage === 'requested') {
      const fits = tr => t.kind !== 'tow' || t.needs === 'any' || tr.type === 'heavy-duty' || (t.needs === 'flatbed' && tr.type === 'flatbed');
      const trucks = board.trucks.filter(tr => tr.active), drivers = board.drivers;
      const truck = el('select', { name: 'truck' }, ...trucks.map(tr => el('option', { value: tr.id, text: `${tr.name} · ${tr.typeLabel}${tr.onCall ? ' · out on ' + tr.onCall : fits(tr) ? '' : ' · not suitable'}` })));
      const free = trucks.find(tr => !tr.onCall && fits(tr)); if (free) truck.value = free.id;
      const driver = el('select', { name: 'driver' }, ...drivers.map(d => el('option', { value: d.id, text: `${d.name} · ${d.role}${d.onCall ? ' · driving ' + d.onCall : ''}` })));
      const freeDriver = drivers.find(d => !d.onCall && /tow|driver/i.test(d.role)) || drivers.find(d => !d.onCall); if (freeDriver) driver.value = freeDriver.id;
      let eta = '';
      if (!trucks.length) box.append(el('div', { class: 'notice warn', text: 'Add a tow truck in Admin → Tow trucks before dispatching.' }));
      else box.append(el('h4', { text: 'Dispatch a truck' }), el('div', { class: 'row' }, el('label', {}, 'Truck', truck), el('label', {}, 'Driver', driver), input('ETA (minutes)', '', v => { eta = v; }, { name: 'eta', ph: '30' })), btn('Dispatch', () => act('dispatchTow', { tow: t.id, truck: truck.value, driver: driver.value, etaMinutes: eta }, `${t.key} dispatched.`), 'big-btn'));
      box.append(cancelBox(t));
    } else if (t.stage === 'dispatched') box.append(btn('Driver is at the vehicle', () => act('arriveTow', { tow: t.id }), 'big-btn'), cancelBox(t));
    else if (t.stage === 'on-scene' && t.kind === 'tow') {
      let condition = '', odometer = '';
      box.append(el('h4', { text: 'Before it goes on the truck' }), el('p', { class: 'note', text: 'Walk around the vehicle and note any damage that is already there. It protects you and the customer.' }), input('Condition at pickup', '', v => { condition = v; }, { area: true, name: 'condition', ph: 'No visible damage' }), input('Odometer (optional)', '', v => { odometer = v; }, { name: 'odometer' }),
        btn('Vehicle is on the truck', () => act('hookTow', { tow: t.id, condition, odometer }), 'big-btn'));
    } else if (t.stage === 'in-tow' || t.stage === 'on-scene') {
      let miles = '', winch = '', note = '', location = '';
      const done = t.kind === 'tow' ? 'Dropped off' : 'Service done';
      box.append(el('h4', { text: t.kind === 'tow' ? 'Drop-off' : 'Finish the service' }), el('div', { class: 'row' }, t.kind === 'tow' ? input('Loaded miles', '', v => { miles = v; }, { name: 'miles', ph: String(t.estimatedMiles || '') }) : null, t.kind !== 'roadside' ? input('Winch time (hours, if any)', '', v => { winch = v; }, { name: 'winch', ph: '0' }) : null,
        t.kind === 'tow' && t.destination !== 'other' ? input(t.destination === 'yard' ? 'Spot in the yard' : 'Where it is parked', '', v => { location = v; }, { name: 'location', ph: t.destination === 'yard' ? 'Yard row C' : 'Lot B' }) : null), input('Note (optional)', '', v => { note = v; }, { name: 'note' }),
        btn(done, () => act('deliverTow', { tow: t.id, loadedMiles: miles, winchHours: winch, note, location }, t.kind === 'tow' && t.destination !== 'other' ? `${t.key} dropped off and checked in.` : `${t.key} done.`), 'big-btn'));
    } else if (t.stage === 'delivered') box.append(btn('Invoice at Checkout', () => window.autoCheckout.open('tow', t.id), 'big-btn'));
    else if (t.stage === 'invoiced') box.append(btn('Take payment at Checkout', () => window.autoCheckout.open('tow', t.id), 'big-btn'));
    return box;
  }
  function section(title, tows, hint) {
    return el('div', { class: 'tow-section', 'data-section': title }, el('h3', { text: `${title} (${tows.length})` }), hint ? el('p', { class: 'note', text: hint }) : null, ...(tows.length ? tows.map(towCard) : [el('p', { class: 'note', text: 'Nothing here right now.' })]));
  }
  async function boardView() {
    await load(); const by = (...s) => board.tows.filter(t => s.includes(t.stage));
    const setup = [!board.rates ? 'set your tow rates' : '', !board.trucks.length ? 'add your trucks' : ''].filter(Boolean);
    draw(el('div', { class: 'card wizard-card tow-desk' }, el('h2', { text: 'Tow desk' }), el('p', { class: 'lead', text: 'Take tow and roadside calls, send a truck, and follow each call until the vehicle is dropped off.' }),
      setup.length ? el('div', { class: 'notice warn', text: `Before your first call, ${setup.join(' and ')} in Admin → Tow trucks.` }) : null,
      el('div', { class: 'choice-grid' }, choice('Take a tow or roadside call', 'Breakdown, accident, jump start, lockout, flat tire, fuel or winch-out', false, () => startCall())),
      el('div', { class: 'tow-fleet', 'aria-label': 'Trucks' }, ...board.trucks.filter(t => t.active).map(t => el('div', { class: 'tow-truck' + (t.onCall ? ' busy' : ''), 'data-truck': t.name }, el('b', { text: t.name }), el('small', { text: t.typeLabel }), el('span', { text: t.onCall ? 'Out on ' + t.onCall : 'Available' }))))),
      section('Waiting for a truck', by('requested'), 'Pick a truck that can carry the vehicle and a driver who is free.'), section('On the road', by('dispatched', 'on-scene', 'in-tow')), section('Ready to bill', by('delivered', 'invoiced'), 'Invoice and take payment at Checkout. Motor club and insurance calls are billed to them.'),
      el('details', { class: 'card' }, el('summary', { text: `Closed and cancelled (${by('closed', 'cancelled').length})` }), ...by('closed', 'cancelled').slice(0, 20).map(t => el('p', { class: 'note', text: `${t.key} · ${t.serviceLabel} · ${t.vehicle} · ${t.stageLabel}${t.summary.billed != null ? ' · ' + money(t.summary.billed, t.summary.currency) : ''}` }))));
  }

  // ---- call wizard
  const stepper = () => el('ol', { class: 'stepper', 'aria-label': 'Tow call steps' }, ...STEPS.map((s, i) => el('li', { class: i < c.step ? 'done' : i === c.step ? 'current' : '', text: s })));
  async function callView() {
    if (!form) form = await w('towForm'); await load();
    if (c.result) return doneView();
    draw(el('div', { class: 'card wizard-card', 'data-step': STEPS[c.step] }, stepper(), [stepCaller, stepVehicle, stepService, stepPickup, stepQuote][c.step]()));
  }
  function stepCaller() {
    const box = el('div', {}, el('h2', { text: 'Who is calling?' }), el('p', { class: 'lead', text: 'Get a callback number first, in case the call drops.' }),
      el('div', { class: 'choice-grid' }, choice('Existing customer', 'Look them up by phone, email or name', c.mode === 'existing', () => { c.mode = 'existing'; return render(); }), choice('New caller', 'Take their name and phone number', c.mode === 'new', () => { c.mode = 'new'; c.customer = null; return render(); })));
    if (c.mode === 'existing') {
      const results = el('div', { class: 'result-list', id: 'tow-customer-results' });
      const show = () => results.replaceChildren(...c.found.map(x => choice(x.name, [x.phone, x.email, x.vehicles.length + ' vehicle(s)'].filter(Boolean).join(' · '), c.customer?.id === x.id, () => { c.customer = x; c.vehicleId = ''; return render(); })));
      box.append(input('Phone number, email or name', c.query, async q => { c.query = q; c.found = q.trim().length >= 3 ? await w('findCustomers', { query: q }) : []; show(); }, { name: 'lookup', ph: '555 010 0100' }), results); show();
      if (c.customer) box.append(el('div', { class: 'notice ok', text: `Selected ${c.customer.name}.` }));
    }
    if (c.mode === 'new') box.append(input('Caller name', c.draft.name, v => { c.draft.name = v; }, { name: 'name' }), input('Callback phone', c.draft.phone, v => { c.draft.phone = v; }, { name: 'phone', type: 'tel', ph: '555 010 0100' }));
    box.append(nav(() => { view = 'board'; return render(); }, 'Next', async () => {
      if (c.mode === 'existing' && !c.customer) { U.say('Select the caller, or choose New caller'); return; }
      if (c.mode === 'new' && !c.customer) { const n = await w('registerCustomer', { name: c.draft.name, phone: c.draft.phone, preferredContact: 'phone call' }); c.customer = { id: n['@id'], name: n['schema:name'], phone: n['schema:telephone'], vehicles: [] }; }
      if (!c.mode) { U.say('Choose existing customer or new caller'); return; }
      U.say(''); c.step = 1; c.addingVehicle = !c.customer.vehicles.length; await render();
    }));
    return box;
  }
  function stepVehicle() {
    const box = el('div', {}, el('h2', { text: `Which vehicle needs help?` }), el('p', { class: 'lead', text: `${c.customer.name}${c.customer.phone ? ' · ' + c.customer.phone : ''}` }));
    if (c.customer.vehicles.length) box.append(el('div', { class: 'choice-grid' }, ...c.customer.vehicles.map(v => choice(v.name, v.plate || '', c.vehicleId === v.id && !c.addingVehicle, () => { c.vehicleId = v.id; c.addingVehicle = false; return render(); })), choice('Another vehicle', 'Add it now', c.addingVehicle, () => { c.addingVehicle = true; c.vehicleId = ''; return render(); })));
    if (c.addingVehicle) {
      const v = c.vehicle, f = n => root.querySelector(`[name="${n}"]`);
      box.append(el('div', { class: 'row' }, input('Year', v.year, x => { v.year = x; }, { name: 'year', ph: '2015' }), input('Make', v.make, x => { v.make = x; }, { name: 'make', ta: { source: window.typeahead.remote('make'), onPick: () => { v.model = ''; f('model').value = ''; } } }),
        input('Model', v.model, x => { v.model = x; }, { name: 'model', ta: { source: q => window.auto.catalog({ kind: 'model', query: q, ctx: { make: v.make } }), openOnFocus: true, onPick: it => { if (it.make) { v.make = it.make; f('make').value = it.make; } } } }), input('Plate (optional)', v.plate, x => { v.plate = x; }, { name: 'plate' })));
    }
    box.append(nav(() => { c.step = 0; return render(); }, 'Next', async () => {
      if (c.addingVehicle) { const v = c.vehicle; if (!v.year || !v.make || !v.model) { U.say('Enter the year, make and model so the driver knows what to look for'); return; }
        const n = await w('addCustomerVehicle', { customer: c.customer.id, year: v.year, make: v.make, model: v.model, plate: v.plate }); c.vehicleId = n['@id']; c.customer.vehicles.push({ id: n['@id'], name: `${n['dcterms:title']} — ${c.customer.name}`, plate: v.plate }); c.addingVehicle = false; }
      else if (!c.vehicleId) { U.say('Choose a vehicle'); return; }
      U.say(''); c.step = 2; await render();
    }));
    return box;
  }
  function questionBlock(q) {
    const cur = c.answers[q.key], block = el('div', { class: 'q-block', 'data-question': q.key }, el('h4', { text: q.label })), multi = q.type === 'multi';
    block.append(el('div', { class: 'chips' }, ...q.options.map(o => chip(o, multi ? (cur || []).includes(o) : cur === o, () => { if (multi) { const s = new Set(cur || []); s.has(o) ? s.delete(o) : s.add(o); c.answers[q.key] = [...s]; } else c.answers[q.key] = cur === o ? '' : o; return render(); }))));
    return block;
  }
  const svc = () => form.services.find(s => s.id === c.service);
  function stepService() {
    const box = el('div', {}, el('h2', { text: 'What do they need?' }), el('div', { class: 'choice-grid' }, ...form.services.map(s => choice(s.label, s.description, c.service === s.id, () => { if (c.service !== s.id) c.answers = {}; c.service = s.id; return render(); }))));
    if (svc()) box.append(el('h3', { text: svc().label + ': a few questions' }), ...svc().questions.map(questionBlock), ...form.common.map(questionBlock));
    box.append(nav(() => { c.step = 1; return render(); }, 'Next', () => { if (!c.service) { U.say('Choose what the caller needs'); return; } U.say(''); c.step = 3; return render(); }));
    return box;
  }
  function stepPickup() {
    const s = svc(), box = el('div', {}, el('h2', { text: 'Where is the vehicle?' }), input('Pickup location', c.pickupAddress, v => { c.pickupAddress = v; }, { name: 'pickupAddress', ph: 'Street address, highway and exit, or landmark' }), input('Notes for the driver (optional)', c.pickupNotes, v => { c.pickupNotes = v; }, { name: 'pickupNotes', ph: 'Northbound shoulder past the gas station' }));
    if (s.kind === 'tow') {
      box.append(el('div', { class: 'q-block' }, el('h4', { text: 'Where is it going?' }), el('div', { class: 'chips' }, ...Object.entries(form.destinations).map(([k, label]) => chip(label, c.destination === k, () => { c.destination = k; return render(); })))));
      if (c.destination === 'other') box.append(input('Drop-off address', c.destinationAddress, v => { c.destinationAddress = v; }, { name: 'destinationAddress', ph: 'Dealer, body shop or home address' }));
      box.append(input('Estimated miles with the vehicle on the truck', c.estimatedMiles, v => { c.estimatedMiles = v; }, { name: 'estimatedMiles', ph: '12' }));
    }
    box.append(el('div', { class: 'q-block' }, el('h4', { text: 'Who pays?' }), el('div', { class: 'chips' }, ...form.billTo.map(k => chip(BILL_LABELS[k], c.billTo === k, () => { c.billTo = k; return render(); })))));
    if (c.billTo !== 'customer') box.append(el('div', { class: 'row' }, input(`Name of the ${c.billTo}`, c.billToName, v => { c.billToName = v; }, { name: 'billToName' }), input('Authorization or PO number (optional)', c.authorization, v => { c.authorization = v; }, { name: 'authorization' })));
    box.append(nav(() => { c.step = 2; return render(); }, 'Quote', () => { if (!c.pickupAddress.trim()) { U.say('Enter where the vehicle is'); return; } U.say(''); c.step = 4; return render(); }));
    return box;
  }
  function stepQuote() {
    const s = svc(), box = el('div', {}, el('h2', { text: 'Quote and take the call' }));
    const quoteBox = el('div', { id: 'tow-quote' }), refresh = async () => {
      const r = await w('quoteTow', { service: c.service, estimatedMiles: c.estimatedMiles, afterHours: c.afterHours, answers: c.answers });
      quoteBox.replaceChildren(...(r.need.needs !== 'any' ? [el('div', { class: 'notice warn', text: `Send a ${r.need.needs === 'flatbed' ? 'flatbed' : 'heavy-duty wrecker'}: ${r.need.reasons.join(', ')}.` })] : []),
        r.quote ? el('table', { class: 'tow-quote' }, el('tbody', {}, ...r.quote.lines.map(l => el('tr', {}, el('td', { text: l.description }), el('td', { text: money(l.amountMinor, r.quote.currency) }))), el('tr', { class: 'total' }, el('th', { text: 'Quote to give the caller' }), el('th', { text: money(r.quote.totalMinor, r.quote.currency) })))) : el('div', { class: 'notice warn', text: 'No tow rates are set, so there is no quote. Set them in Admin → Tow trucks.' }));
    };
    const rows = [['Caller', `${c.customer.name}${c.customer.phone ? ' · ' + c.customer.phone : ''}`], ['Vehicle', c.customer.vehicles.find(v => v.id === c.vehicleId)?.name || ''], ['Service', s.label], ['Pickup', c.pickupAddress + (c.pickupNotes ? ' (' + c.pickupNotes + ')' : '')]];
    if (s.kind === 'tow') rows.push(['Drop-off', c.destination === 'other' ? c.destinationAddress : form.destinations[c.destination]]);
    for (const q of [...s.questions, ...form.common]) { const a = c.answers[q.key]; if (a && a.length) rows.push([q.label.replace(/\?$/, ''), Array.isArray(a) ? a.join(', ') : a]); }
    rows.push(['Bill to', c.billTo === 'customer' ? c.customer.name : `${c.billToName} (${c.billTo})${c.authorization ? ' · ' + c.authorization : ''}`]);
    const urgent = c.answers.safety === 'Highway lane, or someone is in danger';
    box.append(...[urgent ? el('div', { class: 'notice warn', text: 'Someone may be in danger. The call is marked Urgent; tell them to stay well away from traffic, and call 911 if anyone is hurt.' }) : null,
      el('dl', { class: 'summary-grid' }, ...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
      el('div', { class: 'chips' }, chip('After-hours call', c.afterHours, () => { c.afterHours = !c.afterHours; return render(); })), quoteBox,
      input('Anything else (optional)', c.notes, v => { c.notes = v; }, { name: 'notes', area: true }),
      nav(() => { c.step = 3; return render(); }, 'Take the call', async () => {
        const n = await w('takeTowCall', { vehicle: c.vehicleId, service: c.service, answers: c.answers, pickupAddress: c.pickupAddress, pickupNotes: c.pickupNotes, destination: c.destination, destinationAddress: c.destinationAddress, estimatedMiles: c.estimatedMiles, billTo: c.billTo, billToName: c.billToName, authorization: c.authorization, afterHours: c.afterHours, notes: c.notes });
        c.result = { key: n['robos:workItemKey'], quoted: n['robos:quotedMinor'], currency: n['robos:rates']?.currency }; U.say(''); await render();
      })].filter(Boolean));
    refresh().catch(fail); return box;
  }
  function doneView() {
    draw(el('div', { class: 'card wizard-card', 'data-step': 'Done' }, el('div', { class: 'notice ok' }, el('b', { text: `${c.result.key} is waiting for a truck.` }), c.result.quoted != null ? ` Quoted ${money(c.result.quoted, c.result.currency)}.` : ''),
      el('div', { class: 'choice-grid' }, choice('Dispatch a truck now', 'Pick a truck and driver', false, () => { view = 'board'; c = freshCall(); return render(); }), choice('Take another call', '', false, () => { c = freshCall(); return render(); }))));
  }
  function startCall() { c = freshCall(); view = 'call'; return render(); }
  async function render() { try { U.say(''); if (view === 'call') await callView(); else await boardView(); } catch (e) { fail(e); } }
  window.towDesk = { startCall: () => { navigate('tow'); return startCall(); }, show: () => { navigate('tow'); view = 'board'; return render(); } };
  document.querySelector('[data-view="tow"]').addEventListener('click', () => { view = 'board'; c = freshCall(); render(); });
})();

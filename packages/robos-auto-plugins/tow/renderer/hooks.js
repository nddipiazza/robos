'use strict';
// The tow plugin's additions to shared screens: the Front desk (dispatch a truck, send our truck for a car that
// cannot be driven), Checkout (tow invoices and yard release) and Admin (trucks, rates and tow questions).
(() => {
  const P = window.autoPlugins, TOWED = 'No, it needs to be towed';
  // ---- Front desk
  P.on('frontDeskChoices', 'tow', () => ({ title: 'Dispatch a tow truck', sub: 'Breakdowns, accidents, jump starts, lockouts and other roadside help', onClick: () => window.towDesk.startCall() }));
  P.on('intakeConfirm', 'tow', (s, { el, chip, input, render }) => {
    if (s.answers.driveable !== TOWED) { delete s.addons.tow; return null; }
    const t = s.addonState.tow ||= { send: false, pickupAddress: '', estimatedMiles: '' };
    const sync = () => { if (t.send) s.addons.tow = { pickupAddress: t.pickupAddress, estimatedMiles: t.estimatedMiles }; else delete s.addons.tow; }; sync();
    const box = el('div', { class: 'q-block', 'data-question': 'send-tow' }, el('h4', { text: 'Send our tow truck?' }), el('div', { class: 'chips' }, chip('Yes, send our truck', t.send, () => { t.send = true; sync(); render(); }), chip('No, they will arrange it', !t.send, () => { t.send = false; sync(); render(); })));
    if (t.send) box.append(el('div', { class: 'row' }, input('Where is the car now?', t.pickupAddress, v => { t.pickupAddress = v; sync(); }, { name: 'towPickup', ph: '88 Oak Ave, in the driveway' }), input('Estimated miles to the shop', t.estimatedMiles, v => { t.estimatedMiles = v; sync(); }, { name: 'towMiles', ph: '8' })), el('p', { class: 'note', text: 'The tow desk picks the truck and driver. The car is checked in when the truck drops it off.' }));
    return { element: box, hidesLocation: t.send };
  });
  P.on('intakeDone', 'tow', result => {
    const tow = result.addons?.tow; if (!tow) return null;
    return { notice: `Tow ${tow['robos:workItemKey']} is waiting for a truck; the car is checked in when it is dropped off.`, choice: { title: 'Dispatch the tow truck', sub: 'Open the tow desk', onClick: () => window.towDesk.show() } };
  });
  P.on('ticketNotices', 'tow', (job, { el, btn }) => { const t = job.links?.tow; return t ? el('div', { class: 'notice', 'data-tow': t.key }, `Coming in on tow ${t.key}: ${t.stageLabel.toLowerCase()}. `, btn('Open the tow desk', () => window.towDesk.show(), 'secondary')) : null; });
  P.on('repairInvoiceNotices', 'tow', (job, ctx) => {
    const t = job.links?.tow; if (!t || t.balance === 0) return null;
    return ctx.el('div', { class: 'notice warn', 'data-tow': t.key }, `This car came in on tow ${t.key}. The tow has its own invoice${t.billed == null ? ', not issued yet' : ' with ' + ctx.money(t.balance, t.currency) + ' still to pay'}. `, ['delivered', 'invoiced'].includes(t.stage) ? ctx.btn('Bill the tow', () => ctx.start('tow', t.id), 'secondary') : null);
  });
  // ---- Checkout: tow invoice, payment (shared) and release
  P.on('checkout', 'tow', {
    id: 'tow', steps: ['Pick a call', 'Tow invoice', 'Payment', 'Release'],
    load: ctx => ctx.w('towBoard'),
    item: (b, id) => b.tows.find(t => t.id === id),
    pick(ctx, b) {
      const bills = b.tows.filter(t => ['delivered', 'invoiced'].includes(t.stage)); if (!bills.length) return null;
      return ctx.el('div', { 'data-section': 'tows' }, ctx.el('h3', { text: 'Tow calls to bill' }), ctx.el('div', { class: 'choice-grid' }, ...bills.map(t => ctx.choice(`${t.key} · ${t.serviceLabel}`, `${t.vehicle} · ${t.billToName || t.customer} · ${t.stage === 'invoiced' ? 'Invoiced, waiting for payment' : 'Done, not invoiced yet'}`, () => ctx.start('tow', t.id)))));
    },
    paymentNotes: t => [t.billTo !== 'customer' ? 'Paid by ' + (t.billToName || t.billTo) : '', t.authorization].filter(Boolean).join(' · '),
    invoice(ctx) {
      const { el, U, st } = ctx, t = ctx.item, s = t.summary, issued = t.stage === 'invoiced', x = st.x; if (x.storageDays === undefined) x.storageDays = t.storageDaysSoFar || '';
      const facts = [['Service', t.serviceLabel], ['Pickup', t.pickup], t.kind === 'tow' ? ['Drop-off', t.destinationLabel] : null, t.loadedMiles != null && t.kind === 'tow' ? ['Loaded miles', t.loadedMiles + ' mi'] : null, t.winchHours ? ['Winching', t.winchHours + ' h'] : null, ['After hours', t.afterHours ? 'Yes' : 'No'], ['Bill to', `${t.billToName || t.customer}${t.billTo !== 'customer' ? ' (' + t.billTo + ')' : ''}${t.authorization ? ' · ' + t.authorization : ''}`], t.condition ? ['Condition at pickup', t.condition] : null].filter(Boolean);
      const body = [ctx.stepper(), el('h2', { text: `Tow invoice for ${t.key}` }), el('p', { class: 'lead', text: `${t.customer || ''} · ${t.vehicle || ''}` }), el('dl', { class: 'summary-grid' }, ...facts.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))];
      if (issued) body.push(el('table', {}, el('tbody', {}, ...s.lines.map(l => el('tr', {}, el('td', { text: l.description }), el('td', { text: U.money(l.amountMinor, s.currency) }))))), el('div', { class: 'notice ok', text: `Invoice issued: ${U.money(s.billed, s.currency)}.` }));
      else {
        if (t.destination === 'yard') body.push(ctx.input('Storage days in the yard', x.storageDays, v => { x.storageDays = v; }, { name: 'storageDays', ph: '0' }));
        body.push(el('div', { class: 'row' }, ctx.input('Extra charge (optional)', x.extra, v => { x.extra = v; }, { name: 'extra', ph: '0.00' }), ctx.input('What it is for', x.extraNote, v => { x.extraNote = v; }, { name: 'extraNote', ph: 'Highway toll' })));
        if (s.quoted != null) body.push(el('p', { class: 'note', text: `Quoted on the call: ${U.money(s.quoted, s.currency)}. The invoice uses the rates quoted and the miles actually driven.` }));
      }
      body.push(ctx.nav(() => ctx.reset(), issued ? 'Continue to payment' : 'Issue tow invoice', async () => { if (!issued) await ctx.w('issueTowInvoice', { tow: t.id, storageDays: x.storageDays, extra: x.extra, extraNote: x.extraNote }); await ctx.go(2); }));
      ctx.draw(el('div', { class: 'card wizard-card', 'data-step': 'Tow invoice' }, ...body));
    },
    finish(ctx) {
      const { el, st } = ctx, t = ctx.item, yard = t.destination === 'yard'; if (st.x.collectedBy === undefined) st.x.collectedBy = t.customer || '';
      ctx.draw(el('div', { class: 'card wizard-card', 'data-step': 'Release' }, ctx.stepper(), el('h2', { text: yard ? 'Release the vehicle from the yard' : 'Close the tow call' }),
        el('p', { class: 'lead', text: yard ? 'Check the ID of the person collecting it, then hand over the keys.' : t.destination === 'shop' ? 'The car stays at the shop for its repair.' : 'The vehicle was dropped where the customer asked.' }),
        yard ? ctx.input('Collected by', st.x.collectedBy, v => { st.x.collectedBy = v; }, { name: 'collectedBy' }) : null,
        ctx.nav(() => ctx.go(2), yard ? 'Release vehicle and close call' : 'Close tow call', async () => { await ctx.w('closeTow', { tow: t.id, releasedTo: st.x.collectedBy }); await ctx.done({ key: t.key, text: `${t.vehicle}${yard ? ' released to ' + st.x.collectedBy : ''}.`, paid: t.summary.paid, currency: t.summary.currency }); })));
    },
  });
  // ---- Admin: trucks, the rate card every tow quote and invoice uses, and the tow call questions
  P.on('adminTabs', 'tow', { id: 'tow', label: 'Tow trucks', async render(ctx) {
    const { el, btn, input, read, money, w } = ctx;
    const [b, f] = await Promise.all([w('towBoard'), w('towForm')]), r = b.rates || {};
    const rows = b.trucks.map(t => el('div', { class: 'row-card', 'data-truck': t.name }, el('div', {}, el('b', { text: t.name }), t.active ? null : el('span', { class: 'badge', text: 'Out of service' }), el('div', { class: 'note', text: [t.typeLabel, t.plate, t.onCall ? 'out on ' + t.onCall : ''].filter(Boolean).join(' · ') })),
      btn(t.active ? 'Take out of service' : 'Back in service', async () => { await w('saveTowTruck', { id: t.id, active: !t.active }); await ctx.render(); }, 'secondary')));
    const type = el('select', { name: 'truckType' }, ...Object.entries(b.truckTypes).map(([v, t]) => el('option', { value: v, text: t })));
    const add = el('form', { id: 'admin-truck-form' }, el('h3', { text: 'Add a truck' }), input('Truck name', '', 'name', { ph: 'Truck 1' }), el('label', {}, 'Type', type), input('Plate (optional)', '', 'plate'),
      el('p', { class: 'note', text: 'Flatbeds carry all-wheel-drive, electric, damaged and lowered cars. A wheel-lift lifts two wheels and tows the car on the other two. A heavy-duty wrecker handles anything, including trailers.' }),
      btn('Add truck', async () => { await w('saveTowTruck', read(add)); await ctx.render(); ctx.say('Truck added.'); }, 'big-btn'));
    const cur = el('select', { name: 'currency' }, ...['USD', 'CAD', 'EUR', 'GBP'].map(c => el('option', { value: c, text: c }))); cur.value = r.currency || ctx.board.settings.currency;
    const rates = el('form', { id: 'admin-tow-rates-form' }, el('h3', { text: 'Tow rates' }), el('p', { class: 'note', text: 'Quotes on the call and tow invoices use these rates. A call keeps the rates it was quoted with, even if you change them later.' }),
      el('div', { class: 'row' }, input('Hook-up fee', money(r.hookup), 'hookup', { ph: '95.00' }), input('Per loaded mile', money(r.perMile), 'perMile', { ph: '4.50' }), input('Miles included in hook-up', r.includedMiles ?? '', 'includedMiles', { ph: '5' })),
      el('div', { class: 'row' }, input('Roadside service (jump, lockout, tire, fuel)', money(r.roadside), 'roadside', { ph: '75.00' }), input('Winching per hour', money(r.winchPerHour), 'winchPerHour', { ph: '120.00' })),
      el('div', { class: 'row' }, input('After-hours surcharge', money(r.afterHours), 'afterHours', { ph: '50.00' }), input('Yard storage per day', money(r.storagePerDay), 'storagePerDay', { ph: '40.00' }), el('label', {}, 'Currency', cur)),
      btn('Save tow rates', async () => { await w('saveTowRates', read(rates)); await ctx.render(); ctx.say('Tow rates saved.'); }, 'big-btn'));
    const questions = el('details', { class: 'card' }, el('summary', { text: `Tow call questions (${f.services.length} services)` }), el('p', { class: 'note', text: 'The Tow desk asks these questions, taken from the shop knowledge graph (data/tow-form.jsonld). Copy it to your shop data folder as tow-form.jsonld to change them.' }),
      ...f.services.map(s => el('div', {}, el('b', { text: s.label }), el('ul', {}, ...s.questions.map(q => el('li', { text: `${q.label} — ${q.options.join(', ')}` }))))), el('b', { text: 'Asked on every call' }), el('ul', {}, ...f.common.map(q => el('li', { text: `${q.label} — ${q.options.join(', ')}` }))));
    return el('div', {}, el('h3', { text: `Trucks (${b.trucks.filter(t => t.active).length} in service)` }), ...(rows.length ? rows : [el('p', { class: 'note', text: 'No trucks yet.' })]), add, rates, questions,
      el('p', { class: 'note', text: 'Tow drivers are team members. Add them on the Team tab with a role such as "Tow driver".' }));
  } });
})();

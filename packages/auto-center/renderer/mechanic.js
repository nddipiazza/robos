'use strict';
// Mechanic bench: pick who you are, see your tickets, then request parts, log work and time, flag extra work and finish.
(() => {
  const U = window.workshopUI, el = U.el, root = document.getElementById('mechanic');
  const w = (action, input) => window.auto.workshop({ action, input });
  const fail = e => U.say(U.clean(e.message));
  const STAGE = { received: 'Waiting for diagnosis', diagnosing: 'Being diagnosed', 'awaiting-approval': 'Waiting for customer approval', 'in-progress': 'Repair in progress', ready: 'Invoiced', closed: 'Closed' };
  let me = null, ticketId = null, panel = null, board = null, tick = 0, prefillCodes = '';
  // OBD adapter state lives outside render() so the connection, last read and live data survive re-draws.
  const obd = { status: null, adapters: null, scan: null, live: null, liveOn: false, busy: '', confirmClear: false, gen: 0 };
  const o = (action, input) => window.auto.obd({ action, input });
  try { me = localStorage.getItem('auto.mechanic'); } catch {}
  const btn = (label, onClick, cls = '') => { const b = el('button', { type: 'button', class: cls, text: label }); b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const choice = (title, sub, onClick, extra) => { const b = el('button', { type: 'button', class: 'choice' }, el('b', { text: title }), sub ? el('small', { text: sub }) : null, extra || null); b.onclick = () => Promise.resolve(onClick()).catch(fail); return b; };
  const chip = (label, pressed, onClick) => { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!pressed), text: label }); b.onclick = onClick; return b; };
  function input(label, value, onInput, o = {}) { const c = o.area ? el('textarea', { rows: '3' }) : el('input', { type: o.type || 'text', placeholder: o.ph || '' }); c.value = value || ''; if (o.name) c.name = o.name; c.addEventListener('input', () => onInput(c.value)); const l = el('label', {}, label, c); if (o.ta) window.typeahead.attach(c, o.ta); return l; }
  const mm = ms => { const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return [h, m, s].map(n => String(n).padStart(2, '0')).join(':'); };
  const draw = (...k) => { clearInterval(tick); root.replaceChildren(...k); };
  const teammate = () => board.teammates.find(t => t.id === me && t.active);
  async function render() {
    try { U.say(''); board = await w('board'); if (!teammate()) { me = null; return pickMe(); } if (ticketId) return detail(); return list(); } catch (e) { fail(e); }
  }
  function pickMe() {
    const people = board.teammates.filter(t => t.active);
    draw(el('div', { class: 'card wizard-card' }, el('h2', { text: 'Who is at the bench?' }), el('p', { class: 'lead', text: 'Pick your name. Your hours and notes are saved under it.' }),
      people.length ? el('div', { class: 'choice-grid' }, ...people.map(t => choice(t.name, t.role, () => { me = t.id; try { localStorage.setItem('auto.mechanic', me); } catch {} return render(); }))) : el('div', { class: 'notice warn', text: 'There is no one on the team yet. Ask the owner to add team members in Admin.' })));
  }
  const ticketCard = j => {
    const waiting = j.partRequests.filter(r => ['requested', 'ordered'].includes(r.status)).length;
    return choice(`${j.key} · ${j.vehicle || ''}`, j.title, () => { ticketId = j.id; panel = null; return render(); }, el('span', { class: 'note' }, STAGE[j.stage] || j.stage, j.priority === 'urgent' ? el('span', { class: 'badge urgent', text: 'Urgent' }) : null, waiting ? el('span', { class: 'badge', text: `${waiting} part(s) on order` }) : null, j.timers.length ? el('span', { class: 'badge', text: 'Timer running' }) : null));
  };
  function list() {
    const t = teammate(), open = board.jobs.filter(j => j.stage !== 'closed' && j.stage !== 'ready'), byUrgent = (a, b) => (b.priority === 'urgent') - (a.priority === 'urgent');
    const mine = open.filter(j => j.technician === t.name).sort(byUrgent), free = open.filter(j => !j.technician).sort(byUrgent), others = open.filter(j => j.technician && j.technician !== t.name);
    const section = (title, jobs, empty) => el('div', { class: 'card' }, el('h3', { text: `${title} (${jobs.length})` }), jobs.length ? el('div', { class: 'choice-grid' }, ...jobs.map(ticketCard)) : el('p', { class: 'note', text: empty }));
    draw(el('div', { class: 'card wizard-card' }, el('h2', { text: `Hi ${t.name.split(' ')[0]}` }), el('p', { class: 'lead', text: 'Pick a ticket to see what the customer told us, request parts and log your work.' }), btn('Not you? Switch', () => { me = null; try { localStorage.removeItem('auto.mechanic'); } catch {} return render(); }, 'secondary')),
      section('My tickets', mine, 'You have no tickets yet. Take one from the list below.'), section('Open tickets nobody has taken', free, 'Everything open has someone on it.'), others.length ? section('With other mechanics', others, '') : null);
  }
  function detail() {
    const j = board.jobs.find(x => x.id === ticketId); if (!j) { ticketId = null; return list(); }
    const t = teammate(), mineTimer = j.timers.find(x => x.teammate === t.name), anyTimer = t.activeTimer;
    const canWork = ['diagnosing', 'in-progress'].includes(j.stage), open = ['received', 'diagnosing', 'awaiting-approval', 'in-progress'].includes(j.stage);
    const kids = [el('div', { class: 'card wizard-card' }, btn('Back to my tickets', () => { ticketId = null; return render(); }, 'secondary'), el('h2', { text: `${j.key} · ${j.vehicle || ''}` }),
      el('p', { class: 'lead', text: `${j.customer || ''} · ${STAGE[j.stage] || j.stage}${j.technician ? ' · ' + j.technician : ' · not taken yet'}` }), j.priority === 'urgent' ? el('div', { class: 'notice warn', text: 'Urgent: the customer reported this as unsafe or undriveable.' }) : null, intakePanel(j))];
    const actions = el('div', { class: 'bench-actions' });
    if (!j.technician && open) actions.append(btn('Take this ticket', async () => { await w('claimTicket', { job: j.id, teammate: me }); await render(); }, 'big-btn'));
    if (['received', 'diagnosing'].includes(j.stage)) actions.append(btn('Record diagnosis', () => setPanel('diagnosis')));
    if (canWork) actions.append(mineTimer ? btn('Stop timer', async () => { const r = await w('stopTimer', { job: j.id, teammate: me }); U.say(`Logged ${r.minutes} minute(s).`); await render(); U.say(`Logged ${r.minutes} minute(s).`); }, 'big-btn') : btn('Start timer', async () => { await w('startTimer', { job: j.id, teammate: me }); await render(); }, 'big-btn'), btn('Log hours', () => setPanel('hours')));
    if (open) actions.append(btn('Read the car (OBD)', () => setPanel('obd')), btn('Add a note', () => setPanel('note')), btn('Request a part', () => setPanel('part')), btn('Found more work', () => setPanel('recommend')));
    if (j.stage === 'in-progress') actions.append(btn('Finish the job', () => setPanel('finish'), 'big-btn'));
    if (mineTimer) kids[0].append(el('div', { class: 'notice ok' }, 'Timer running: ', el('span', { class: 'timer-run', id: 'timer-clock', text: mm(Date.now() - Date.parse(mineTimer.startedAt)) })));
    else if (anyTimer && canWork) kids[0].append(el('div', { class: 'notice warn', text: 'You have a timer running on another ticket. Stop it before starting this one.' }));
    kids[0].append(actions, panelView(j));
    kids.push(partsCard(j), el('div', { class: 'card' }, el('h3', { text: 'Work so far' }), el('p', { class: 'note', text: Object.entries(j.summary.hoursByTeammate).map(([n, h]) => `${n}: ${h} h`).join(' · ') || 'No hours logged yet.' }), j.completionNote ? el('div', { class: 'notice ok', text: 'Finished: ' + j.completionNote }) : null, el('details', {}, el('summary', { text: 'Ticket history' }), el('ol', { class: 'timeline' }, ...j.workItem.slice().reverse().map(ev => el('li', {}, el('b', { text: ev.kind }), ' ', el('span', { text: ev.detail })))))));
    draw(...kids);
    if (panel === 'obd' && obd.liveOn) pollLive(++obd.gen);
    if (mineTimer) tick = setInterval(() => { const c = document.getElementById('timer-clock'); if (c) c.textContent = mm(Date.now() - Date.parse(mineTimer.startedAt)); }, 1000);
  }
  const setPanel = p => { panel = panel === p ? null : p; return render(); };
  function intakePanel(j) {
    if (!j.intake) return el('p', { class: 'note', text: j.title });
    const rows = [['Concern', j.title], ['Contacted by', j.intake.channel], ...j.intake.answers.map(a => [a.question.replace(/\?$/, ''), Array.isArray(a.answer) ? a.answer.join(', ') : a.answer])]; if (j.intake.notes) rows.push(['Customer says', j.intake.notes]); if (j.odometerIn != null) rows.push(['Odometer in', String(j.odometerIn)]);
    return el('details', { open: '' }, el('summary', { text: 'What the customer told us' }), el('dl', { class: 'summary-grid' }, ...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])));
  }
  function panelView(j) {
    if (!panel) return el('span');
    const box = el('div', { class: 'card bench-panel', 'data-panel': panel }), done = async () => { panel = null; await render(); };
    const st = {};
    if (panel === 'diagnosis') box.append(el('h3', { text: 'Diagnosis' }), input('What did you find?', '', v => { st.findings = v; }, { area: true, name: 'findings' }), input('Trouble codes', (st.codes = prefillCodes), v => { st.codes = v; }, { name: 'codes', ph: 'P0300', ta: { multi: true, source: window.typeahead.remote('dtc') } }), btn('Save diagnosis', async () => { await w('diagnose', { job: j.id, findings: st.findings, codes: st.codes }); prefillCodes = ''; await done(); }));
    if (panel === 'obd') box.append(...obdPanel(j));
    if (panel === 'hours') box.append(el('h3', { text: 'Log hours' }), input('Hours', '', v => { st.hours = v; }, { name: 'hours', ph: '1.5' }), input('What did you do? (optional)', '', v => { st.note = v; }, { name: 'note' }), btn('Save hours', async () => { await w('logHours', { job: j.id, teammate: me, hours: st.hours, note: st.note }); await done(); }));
    if (panel === 'note') { st.kind = 'work done'; const chips = el('div', { class: 'chips' }); const dc = () => chips.replaceChildren(...['work done', 'finding'].map(k => chip(k === 'finding' ? 'Something I found' : 'Work I did', st.kind === k, () => { st.kind = k; dc(); }))); dc(); box.append(el('h3', { text: 'Add a note' }), chips, input('Note', '', v => { st.text = v; }, { area: true, name: 'text' }), btn('Save note', async () => { await w('addWorkNote', { job: j.id, teammate: me, kind: st.kind, text: st.text }); await done(); })); }
    if (panel === 'recommend') box.append(el('h3', { text: 'Found more work' }), el('p', { class: 'note', text: 'Tell the front desk what else the car needs. They will contact the customer for approval.' }), input('What else does it need?', '', v => { st.text = v; }, { area: true, name: 'text' }), btn('Send to front desk', async () => { await w('addWorkNote', { job: j.id, teammate: me, kind: 'recommendation', text: st.text }); await done(); }));
    if (panel === 'part') { st.urgency = 'normal'; st.quantity = '1'; const chips = el('div', { class: 'chips' }); const dc = () => chips.replaceChildren(...['normal', 'urgent', 'car is waiting'].map(u => chip(u, st.urgency === u, () => { st.urgency = u; dc(); }))); dc();
      box.append(el('h3', { text: 'Request a part' }), input('Part', '', v => { st.name = v; }, { name: 'name', ph: 'Start typing, such as brake pads', ta: { source: q => window.auto.catalog({ kind: 'part', query: q, ctx: { make: '', model: '' } }), onPick: it => { st.partNumber = it.partNumber || ''; } } }), input('Quantity', '1', v => { st.quantity = v; }, { name: 'quantity' }), el('div', { class: 'q-block' }, el('h4', { text: 'How soon?' }), chips), input('Notes for the parts desk (optional)', '', v => { st.note = v; }, { name: 'note' }), btn('Send request', async () => { await w('requestPart', { job: j.id, teammate: me, name: st.name, quantity: st.quantity, urgency: st.urgency, partNumber: st.partNumber, note: st.note }); await done(); })); }
    if (panel === 'finish') box.append(el('h3', { text: 'Finish the job' }), el('p', { class: 'note', text: 'Make sure your hours are logged and every part has arrived. The front desk sees this ticket at Checkout.' }), input('What was done?', '', v => { st.summary = v; }, { area: true, name: 'summary' }), btn('Mark work complete', async () => { await w('completeWork', { job: j.id, teammate: me, summary: st.summary }); await done(); }, 'big-btn'));
    return box;
  }
  // Read the car: find the Bluetooth adapter, read trouble codes and the VIN, watch live data, save or clear.
  async function busy(label, fn) { obd.busy = label; await render(); try { await fn(); } catch (e) { obd.busy = ''; await render(); throw e; } obd.busy = ''; await render(); }
  async function connect(a) { await busy(`Connecting to ${a.name}…`, async () => { obd.status = await o('connect', a); obd.scan = null; obd.live = null; try { localStorage.setItem('auto.obdAdapter', JSON.stringify({ name: a.name, address: a.address, protocol: obd.status.vehicle?.protocol || a.protocol })); } catch {} }); }
  const codeList = (title, codes, hint) => codes.length ? el('div', { class: 'q-block', 'data-codes': title }, el('h4', { text: title }), hint ? el('p', { class: 'note', text: hint }) : null, el('ul', {}, ...codes.map(c => el('li', {}, el('b', { text: c.code }), ' ', el('span', { text: c.description || 'No description on file' }), c.module !== 'Engine' ? el('span', { class: 'badge', text: c.module }) : null)))) : null;
  function obdPanel(j) {
    const s = obd.status, head = el('h3', { text: 'Read the car (OBD-II)' });
    if (!s) { o('status').then(r => { obd.status = r; return render(); }).catch(fail); return [head, el('p', { class: 'note', text: 'Checking the adapter…' })]; }
    if (obd.busy) return [head, el('p', { class: 'note', id: 'obd-busy', text: obd.busy })];
    if (!s.connected) {
      let saved = null; try { saved = JSON.parse(localStorage.getItem('auto.obdAdapter') || 'null'); } catch {}
      const found = obd.adapters;
      return [head, el('p', { class: 'note', text: 'Plug the adapter into the OBD port under the dash and turn the key to ON. Close any phone app that uses it.' }),
        el('div', { class: 'bench-actions' }, saved ? btn(`Connect to ${saved.name}`, () => connect(saved), 'big-btn') : null, btn('Find adapters', () => busy('Looking for Bluetooth OBD adapters… this takes about 20 seconds.', async () => { obd.adapters = await o('scan'); }), saved ? 'secondary' : 'big-btn')),
        found ? found.length ? el('div', { class: 'choice-grid', id: 'obd-adapters' }, ...found.map(a => choice(a.name, a.address, () => connect(a)))) : el('div', { class: 'notice warn', text: 'No OBD adapter found. Check that its light is on, the laptop is near the car and no phone is connected to it. Some adapters only show up for a minute or two after they are plugged in, so try unplugging it and plugging it back in.' }) : null];
    }
    const a = s.adapter, v = s.vehicle, out = [head, el('div', { class: 'notice ok', id: 'obd-connected', text: `Connected to ${s.name} · ${a.version}${a.voltage ? ` · battery ${a.voltage} V` : ''}` })];
    const disconnect = btn('Disconnect', async () => { obd.liveOn = false; obd.status = await o('disconnect'); obd.scan = null; obd.live = null; await render(); }, 'secondary');
    if (!v.connected) return [...out, el('div', { class: 'notice warn', text: `The adapter is on, but the car is not answering (${v.error}). Turn the key to ON or start the engine, then try again.` }), el('div', { class: 'bench-actions' }, btn('Try the car again', () => busy('Asking the car… up to 20 seconds.', async () => { obd.status = await o('retry'); }), 'big-btn'), disconnect)];
    out.push(el('p', { class: 'note', text: `The car is answering on ${v.protocolName}.` }),
      el('div', { class: 'bench-actions' }, btn('Read codes', () => busy('Reading trouble codes and the VIN…', async () => { obd.scan = await o('readCodes'); obd.confirmClear = false; }), 'big-btn'),
        btn(obd.liveOn ? 'Stop live data' : 'Show live data', async () => { obd.liveOn = !obd.liveOn; await render(); }), disconnect));
    if (obd.scan) out.push(scanCard(j, obd.scan));
    if (obd.liveOn || obd.live) out.push(liveCard());
    return out;
  }
  function scanCard(j, r) {
    const onFile = j.vehicleInfo.vin, box = el('div', { class: 'card', id: 'obd-scan' });
    if (r.vin) box.append(el('p', {}, el('b', { text: 'VIN ' }), el('span', { class: 'mono', text: r.vin }), r.modelYear ? ` · model year ${r.modelYear}` : '', ' · ', el('span', { id: 'obd-vin-match', text: !onFile ? 'not on file yet; saving the scan adds it to the vehicle' : onFile === r.vin ? 'matches this ticket' : '' })));
    if (r.vin && onFile && onFile !== r.vin) box.append(el('div', { class: 'notice warn', text: `This is not the car on the ticket. The car says ${r.vin}; the ticket has ${onFile}.` }));
    box.append(r.mil ? el('div', { class: 'notice warn', id: 'obd-mil', text: `Check-engine light is ON · ${r.reportedCount} code(s) reported` }) : el('div', { class: 'notice ok', id: 'obd-mil', text: 'Check-engine light is off' }));
    const lists = [codeList('Stored codes', r.stored), codeList('Pending codes', r.pending, 'Seen once; the car has not confirmed them yet.'), codeList('Permanent codes', r.permanent, 'Only the car clears these, after it confirms the repair worked.')].filter(Boolean);
    box.append(...(lists.length ? lists : [el('p', { class: 'note', text: 'No trouble codes stored or pending.' })]));
    const codes = [...r.stored, ...r.pending].map(c => c.code), acts = el('div', { class: 'bench-actions' });
    acts.append(btn('Save scan to ticket', async () => { const res = await w('saveScan', { job: j.id, teammate: me }); await render(); U.say(res.vinSaved ? 'Scan saved. The VIN was added to the vehicle.' : 'Scan saved to the ticket.'); }));
    if (codes.length && ['received', 'diagnosing'].includes(j.stage)) acts.append(btn('Use codes in diagnosis', () => { prefillCodes = codes.join(', '); panel = 'diagnosis'; return render(); }));
    if (codes.length || r.mil) acts.append(btn('Clear codes…', () => { obd.confirmClear = true; return render(); }, 'secondary'));
    box.append(acts);
    if (obd.confirmClear) box.append(el('div', { class: 'notice warn', id: 'obd-clear-confirm' }, el('p', { text: 'Clearing turns off the check-engine light and resets the emissions readiness checks. The car will fail an inspection until it has been driven enough for them to finish, and the codes come back if the fault is still there. Clear only after the repair, with the key ON and the engine off.' }),
      btn('Yes, clear the codes', async () => { await busy('Clearing codes…', async () => { obd.scan = await o('clearCodes', { confirm: true }); obd.confirmClear = false; }); U.say('Codes cleared.'); }, 'big-btn'), btn('Cancel', () => { obd.confirmClear = false; return render(); }, 'secondary')));
    return box;
  }
  function liveCard() {
    const box = el('div', { class: 'card', id: 'obd-live' }, el('h4', { text: obd.liveOn ? 'Live data · updating' : 'Live data · stopped' }));
    if (!obd.live) box.append(el('p', { class: 'note', text: 'Waiting for the first reading…' }));
    else box.append(el('dl', { class: 'summary-grid' }, ...obd.live.readings.flatMap(x => [el('dt', { text: x.label }), el('dd', { 'data-reading': x.id, text: x.display })])));
    return box;
  }
  // One request at a time, about once a second, until live data is stopped or the panel closes.
  async function pollLive(gen) {
    if (gen !== obd.gen || !obd.liveOn || panel !== 'obd' || !ticketId) return;
    try { obd.live = await o('live'); } catch (e) { obd.liveOn = false; fail(e); return render(); }
    if (gen !== obd.gen || !obd.liveOn || panel !== 'obd') return;
    const card = document.getElementById('obd-live'); if (card) card.replaceWith(liveCard());
    setTimeout(() => pollLive(gen), 1000);
  }
  function partsCard(j) {
    const box = el('div', { class: 'card', id: 'parts-card' }, el('h3', { text: 'Parts requested' }));
    if (!j.partRequests.length) box.append(el('p', { class: 'note', text: 'No parts requested yet.' }));
    for (const r of j.partRequests) {
      const row = el('div', { class: 'row-card', 'data-part': r.name }, el('div', {}, el('b', { text: `${r.quantity} × ${r.name}` }), el('span', { class: 'badge', text: r.status }), r.urgency !== 'normal' ? el('span', { class: 'badge urgent', text: r.urgency }) : null, el('div', { class: 'note', text: `Requested by ${r.by}${r.note ? ' · ' + r.note : ''}` })));
      const act = el('div', {}); const st = {};
      if (r.status === 'requested') act.append(input('Supplier', '', v => { st.supplier = v; }, { name: 'supplier' }), btn('Mark ordered', async () => { await w('updatePartRequest', { id: r.id, status: 'ordered', supplier: st.supplier }); await render(); }), btn('Cancel', async () => { await w('updatePartRequest', { id: r.id, status: 'cancelled' }); await render(); }, 'secondary'));
      if (r.status === 'ordered') act.append(input('Cost each (USD)', '', v => { st.cost = v; }, { name: 'cost', ph: '28.50' }), btn('Mark received', async () => { await w('updatePartRequest', { id: r.id, status: 'received', unitCost: st.cost }); await render(); }), btn('Cancel', async () => { await w('updatePartRequest', { id: r.id, status: 'cancelled' }); await render(); }, 'secondary'));
      row.append(act); box.append(row);
    }
    return box;
  }
  document.querySelector('[data-view="mechanic"]').addEventListener('click', () => { ticketId = null; panel = null; render(); });
  window.addEventListener('auto-workshop-changed', () => { if (!root.hidden && teammate) render(); });
})();

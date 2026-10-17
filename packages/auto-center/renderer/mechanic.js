'use strict';
// Mechanic bench: pick who you are, see your tickets, then request parts, log work and time, flag extra work and finish.
(() => {
  const U = window.workshopUI, el = U.el, root = document.getElementById('mechanic');
  const w = (action, input) => window.auto.workshop({ action, input });
  const fail = e => U.say(U.clean(e.message));
  const STAGE = { received: 'Waiting for diagnosis', diagnosing: 'Being diagnosed', 'awaiting-approval': 'Waiting for customer approval', 'in-progress': 'Repair in progress', ready: 'Invoiced', closed: 'Closed' };
  let me = null, ticketId = null, panel = null, board = null, tick = 0;
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
    if (open) actions.append(btn('Add a note', () => setPanel('note')), btn('Request a part', () => setPanel('part')), btn('Found more work', () => setPanel('recommend')));
    if (j.stage === 'in-progress') actions.append(btn('Finish the job', () => setPanel('finish'), 'big-btn'));
    if (mineTimer) kids[0].append(el('div', { class: 'notice ok' }, 'Timer running: ', el('span', { class: 'timer-run', id: 'timer-clock', text: mm(Date.now() - Date.parse(mineTimer.startedAt)) })));
    else if (anyTimer && canWork) kids[0].append(el('div', { class: 'notice warn', text: 'You have a timer running on another ticket. Stop it before starting this one.' }));
    kids[0].append(actions, panelView(j));
    kids.push(partsCard(j), el('div', { class: 'card' }, el('h3', { text: 'Work so far' }), el('p', { class: 'note', text: Object.entries(j.summary.hoursByTeammate).map(([n, h]) => `${n}: ${h} h`).join(' · ') || 'No hours logged yet.' }), j.completionNote ? el('div', { class: 'notice ok', text: 'Finished: ' + j.completionNote }) : null, el('details', {}, el('summary', { text: 'Ticket history' }), el('ol', { class: 'timeline' }, ...j.workItem.slice().reverse().map(ev => el('li', {}, el('b', { text: ev.kind }), ' ', el('span', { text: ev.detail })))))));
    draw(...kids);
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
    if (panel === 'diagnosis') box.append(el('h3', { text: 'Diagnosis' }), input('What did you find?', '', v => { st.findings = v; }, { area: true, name: 'findings' }), input('Trouble codes', '', v => { st.codes = v; }, { name: 'codes', ph: 'P0300', ta: { multi: true, source: window.typeahead.remote('dtc') } }), btn('Save diagnosis', async () => { await w('diagnose', { job: j.id, findings: st.findings, codes: st.codes }); await done(); }));
    if (panel === 'hours') box.append(el('h3', { text: 'Log hours' }), input('Hours', '', v => { st.hours = v; }, { name: 'hours', ph: '1.5' }), input('What did you do? (optional)', '', v => { st.note = v; }, { name: 'note' }), btn('Save hours', async () => { await w('logHours', { job: j.id, teammate: me, hours: st.hours, note: st.note }); await done(); }));
    if (panel === 'note') { st.kind = 'work done'; const chips = el('div', { class: 'chips' }); const dc = () => chips.replaceChildren(...['work done', 'finding'].map(k => chip(k === 'finding' ? 'Something I found' : 'Work I did', st.kind === k, () => { st.kind = k; dc(); }))); dc(); box.append(el('h3', { text: 'Add a note' }), chips, input('Note', '', v => { st.text = v; }, { area: true, name: 'text' }), btn('Save note', async () => { await w('addWorkNote', { job: j.id, teammate: me, kind: st.kind, text: st.text }); await done(); })); }
    if (panel === 'recommend') box.append(el('h3', { text: 'Found more work' }), el('p', { class: 'note', text: 'Tell the front desk what else the car needs. They will contact the customer for approval.' }), input('What else does it need?', '', v => { st.text = v; }, { area: true, name: 'text' }), btn('Send to front desk', async () => { await w('addWorkNote', { job: j.id, teammate: me, kind: 'recommendation', text: st.text }); await done(); }));
    if (panel === 'part') { st.urgency = 'normal'; st.quantity = '1'; const chips = el('div', { class: 'chips' }); const dc = () => chips.replaceChildren(...['normal', 'urgent', 'car is waiting'].map(u => chip(u, st.urgency === u, () => { st.urgency = u; dc(); }))); dc();
      box.append(el('h3', { text: 'Request a part' }), input('Part', '', v => { st.name = v; }, { name: 'name', ph: 'Start typing, such as brake pads', ta: { source: q => window.auto.catalog({ kind: 'part', query: q, ctx: { make: '', model: '' } }), onPick: it => { st.partNumber = it.partNumber || ''; } } }), input('Quantity', '1', v => { st.quantity = v; }, { name: 'quantity' }), el('div', { class: 'q-block' }, el('h4', { text: 'How soon?' }), chips), input('Notes for the parts desk (optional)', '', v => { st.note = v; }, { name: 'note' }), btn('Send request', async () => { await w('requestPart', { job: j.id, teammate: me, name: st.name, quantity: st.quantity, urgency: st.urgency, partNumber: st.partNumber, note: st.note }); await done(); })); }
    if (panel === 'finish') box.append(el('h3', { text: 'Finish the job' }), el('p', { class: 'note', text: 'Make sure your hours are logged and every part has arrived. The front desk sees this ticket at Checkout.' }), input('What was done?', '', v => { st.summary = v; }, { area: true, name: 'summary' }), btn('Mark work complete', async () => { await w('completeWork', { job: j.id, teammate: me, summary: st.summary }); await done(); }, 'big-btn'));
    return box;
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

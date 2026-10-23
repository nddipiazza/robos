'use strict';
// Front desk: log the customer's issue from the KGraph-defined intake form (data/intake-form.jsonld, or an edited
// copy in the shop's data folder) and open the repair ticket. Other enabled plugins add their own intake
// categories (tires, body work…) and intake add-ons (sending our tow truck). Finding and registering customers is
// shared shop work in the core (workshop.js).
const fs = require('node:fs'), path = require('node:path');
module.exports = core => {
const w = core.workshop, { shop } = core.shop;
const CHANNELS = ['phone call', 'text message', 'email', 'walk-in', 'website', 'other'];
function formDocument(service) {
  const custom = path.join(service.dataRoot, 'intake-form.jsonld');
  return JSON.parse(fs.readFileSync(fs.existsSync(custom) ? custom : path.join(__dirname, '../data/intake-form.jsonld'), 'utf8'));
}
function intakeForm(service) {
  shop(service);
  const graph = [...formDocument(service)['@graph'], ...core.host.intakeFragments(service).flatMap(f => f.graph)], byOrder = (a, b) => a['robos:order'] - b['robos:order'];
  const question = n => ({ key: n['robos:questionKey'], label: n['schema:name'], type: n['robos:questionType'], options: n['robos:options'] || [] });
  const cats = graph.filter(n => n['@type'] === 'robos:IntakeCategory').sort(byOrder);
  const all = graph.filter(n => n['@type'] === 'robos:IntakeQuestion');
  return { channels: CHANNELS, categories: cats.map(c => ({ id: c['@id'].split(':').pop(), label: c['schema:name'], description: c['schema:description'] || '', questions: all.filter(q => q['robos:category']?.['@id'] === c['@id']).sort(byOrder).map(question) })), common: all.filter(q => q['robos:appliesToAll']).sort(byOrder).map(question) };
}
function summarize(form, category, answers, notes) {
  const parts = [];
  for (const q of category.questions) { const a = answers[q.key]; const v = Array.isArray(a) ? a.join(', ') : a; if (v) parts.push(q.label.replace(/\?$/, '') + ': ' + v); }
  const text = [category.label + (parts.length ? ' — ' + parts.join('; ') : ''), notes ? 'Customer says: ' + notes : ''].filter(Boolean).join('. ');
  return text.length > 480 ? text.slice(0, 477) + '…' : text;
}
function intakeRepair(service, input) {
  shop(service); const form = intakeForm(service);
  if (!CHANNELS.includes(input.channel)) throw new Error('Choose how the customer contacted us');
  const category = form.categories.find(c => c.id === input.category); if (!category) throw new Error('Choose what the problem is about');
  const answers = input.answers && typeof input.answers === 'object' ? input.answers : {}, clean = {}, labels = [];
  for (const q of [...category.questions, ...form.common]) {
    const raw = answers[q.key]; if (raw === undefined || raw === '' || (Array.isArray(raw) && !raw.length)) continue;
    const list = Array.isArray(raw) ? raw : [raw];
    if (q.type === 'single' && list.length > 1) throw new Error('Choose one answer for "' + q.label + '"');
    for (const v of list) { if (typeof v !== 'string' || v.length > 500) throw new Error('Invalid answer for "' + q.label + '"'); if (q.options.length && !q.options.includes(v)) throw new Error('"' + v + '" is not a choice for "' + q.label + '"'); }
    clean[q.key] = q.type === 'multi' ? list : list[0]; labels.push({ question: q.label, answer: clean[q.key] });
  }
  const notes = String(input.notes ?? '').trim(); if (notes.length > 2000) throw new Error('Notes are too long');
  const concern = summarize(form, category, Object.fromEntries(category.questions.map(q => [q.key, clean[q.key]])), notes);
  const urgent = clean.urgency === 'Emergency or unsafe' || clean.driveable === 'No, it needs to be towed';
  const intake = { channel: input.channel, category: category.label, categoryId: category.id, answers: labels, notes, urgent, warningLights: clean.warning || [], driveable: clean.driveable || '', urgency: clean.urgency || '', dropOff: clean.dropoff || '', takenAt: service.clock().toISOString() };
  // Enabled plugins can add to the intake, such as the tow plugin sending our own truck for a car that cannot be driven.
  const addons = Object.entries(input.addons && typeof input.addons === 'object' ? input.addons : {}).filter(([, v]) => v)
    .map(([key, value]) => ({ key, ...core.host.intakeAddon(service, key)(service, { input: value, vehicle: input.vehicle, answers: clean, urgent, concern }) }));
  return w.openRepair(service, { vehicle: input.vehicle, concern, odometer: input.odometer, location: input.location, intake, addons });
}
function logContact(service, input) {
  shop(service); const records = w.nodes(service), job = w.find(service, 'RepairOrder', input.job, 'Select a repair');
  if (!CHANNELS.includes(input.channel)) throw new Error('Choose how you reached the customer');
  const note = w.text(input.note, 1000, 'What was said'), dir = input.direction === 'incoming' ? 'Customer contacted us' : 'We contacted the customer';
  const wi = w.workItemFor(records, job['@id']); if (!wi) throw new Error('This repair has no ticket');
  const ev = w.event(service, 'contact', `${dir} by ${input.channel}: ${note}`);
  core.shop.commit(service, [{ op: 'update', id: wi['@id'], set: { 'robos:events': [...(wi['robos:events'] || []), ev] } }], w.key(job) + ': ' + input.channel + ' logged');
  return ev;
}
return { CHANNELS, intakeForm, intakeRepair, logContact };
};

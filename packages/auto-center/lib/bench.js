'use strict';
// Mechanic bench: claim a ticket, request parts, log work and time, flag extra work, finish the job.
const crypto = require('node:crypto');
const w = require('./workshop');
const { node, ref } = require('./importer');
const { shop, commit } = require('./shop-operations');
const { amountMinor } = require('./reports');
const mate = (service, id) => { const t = w.find(service, 'Teammate', id, 'Choose who you are'); if (t['robos:active'] === false) throw new Error('This teammate is no longer active'); return t; };
const addEvent = (service, records, job, kind, detail) => { const wi = w.workItemFor(records, job['@id']); return wi ? [{ op: 'update', id: wi['@id'], set: { 'robos:events': [...(wi['robos:events'] || []), w.event(service, kind, detail)] } }] : []; };
function activeJob(service, id, allowed = ['received', 'diagnosing', 'awaiting-approval', 'in-progress']) {
  const job = w.find(service, 'RepairOrder', id, 'Select a work ticket');
  if (!allowed.includes(job['robos:jobStatus'])) throw new Error('This ticket is not open for work right now');
  return job;
}
function claimTicket(service, input) {
  shop(service); const records = w.nodes(service), t = mate(service, input.teammate), job = activeJob(service, input.job);
  commit(service, [{ op: 'update', id: job['@id'], set: { 'robos:technician': t['schema:name'] } }, ...addEvent(service, records, job, 'claimed', t['schema:name'] + ' took this ticket')], w.key(job) + ': claimed by ' + t['schema:name']); return { technician: t['schema:name'] };
}
function requestPart(service, input) {
  shop(service); const records = w.nodes(service), t = mate(service, input.teammate), job = activeJob(service, input.job);
  const name = w.text(input.name, 200, 'Part name'), quantity = Number(input.quantity || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error('Quantity must be a whole number of at least 1');
  const urgency = ['normal', 'urgent', 'car is waiting'].includes(input.urgency) ? input.urgency : 'normal';
  const r = node('PartRequest', crypto.randomUUID(), name, { 'robos:job': ref(job['@id']), 'schema:name': name, 'robos:quantity': quantity, 'robos:requestStatus': 'requested', 'robos:urgency': urgency, 'robos:requestedBy': t['schema:name'], 'robos:partNumber': String(input.partNumber || ''), 'robos:note': String(input.note || '').slice(0, 500), 'schema:dateCreated': service.clock().toISOString() });
  commit(service, [{ op: 'add', node: r }, ...addEvent(service, records, job, 'part requested', `${t['schema:name']} asked for ${quantity} × ${name}${urgency !== 'normal' ? ' (' + urgency + ')' : ''}`)], w.key(job) + ': part requested ' + name); return r;
}
function updatePartRequest(service, input) {
  shop(service); const records = w.nodes(service), r = w.find(service, 'PartRequest', input.id, 'Select a part request'), job = records.find(n => n['@id'] === w.linked(r, 'robos:job'));
  const status = input.status, from = r['robos:requestStatus'];
  const allowed = { requested: ['ordered', 'received', 'cancelled'], ordered: ['received', 'cancelled'], received: [], cancelled: [] };
  if (!(allowed[from] || []).includes(status)) throw new Error(`A ${from} part request cannot become ${status}`);
  const set = { 'robos:requestStatus': status }, edits = [];
  if (status === 'ordered') { set['robos:supplier'] = String(input.supplier || '').slice(0, 200); set['robos:eta'] = String(input.eta || '').slice(0, 50); }
  if (status === 'received') {
    const cost = amountMinor(String(input.unitCost ?? ''));
    const p = node('PartUsage', crypto.randomUUID(), r['schema:name'], { 'robos:job': ref(job['@id']), 'schema:name': r['schema:name'], 'robos:partNumber': r['robos:partNumber'] || '', 'robos:quantity': r['robos:quantity'], 'robos:unitCostMinor': cost, 'robos:currency': w.approvedEstimate(records, job)?.['robos:currency'] || 'USD', 'robos:supplier': String(input.supplier || r['robos:supplier'] || ''), 'schema:dateCreated': service.clock().toISOString() });
    edits.push({ op: 'add', node: p });
  }
  commit(service, [{ op: 'update', id: r['@id'], set }, ...edits, ...addEvent(service, records, job, 'part ' + status, `${r['robos:quantity']} × ${r['schema:name']} ${status}`)], w.key(job) + ': part ' + status); return { status };
}
function addWorkNote(service, input) {
  shop(service); const records = w.nodes(service), t = mate(service, input.teammate), job = activeJob(service, input.job);
  const kind = ['finding', 'work done', 'recommendation'].includes(input.kind) ? input.kind : null; if (!kind) throw new Error('Choose finding, work done or recommendation');
  const text = w.text(input.text, 2000, 'Note');
  const edits = addEvent(service, records, job, kind, `${t['schema:name']}: ${text}`);
  if (kind === 'recommendation') edits.push({ op: 'update', id: job['@id'], set: { 'robos:needsApproval': text } });
  commit(service, edits, w.key(job) + ': ' + kind); return { kind };
}
function startTimer(service, input) {
  shop(service); const records = w.nodes(service), t = mate(service, input.teammate), job = activeJob(service, input.job, ['diagnosing', 'in-progress']);
  if (t['robos:activeTimer']) throw new Error('You already have a timer running; stop it first');
  commit(service, [{ op: 'update', id: t['@id'], set: { 'robos:activeTimer': { job: job['@id'], startedAt: service.clock().toISOString() } } }, ...addEvent(service, records, job, 'timer started', t['schema:name'] + ' started work')], w.key(job) + ': timer started'); return { startedAt: service.clock().toISOString() };
}
function stopTimer(service, input) {
  shop(service); const records = w.nodes(service), t = mate(service, input.teammate), timer = t['robos:activeTimer'];
  if (!timer) throw new Error('No timer is running');
  const job = records.find(n => n['@id'] === timer.job), minutes = Math.max(1, Math.round((service.clock().getTime() - Date.parse(timer.startedAt)) / 60000));
  const e = node('LaborEntry', crypto.randomUUID(), t['schema:name'] + ' on ' + w.key(job), { 'robos:job': ref(job['@id']), 'robos:teammate': ref(t['@id']), 'robos:hoursMinutes': minutes, 'schema:startDate': service.clock().toISOString().slice(0, 10), 'schema:description': String(input.note || 'Timed work'), 'robos:timed': true });
  commit(service, [{ op: 'add', node: e }, { op: 'update', id: t['@id'], set: { 'robos:activeTimer': null } }, ...addEvent(service, records, job, 'labor', `${t['schema:name']} ${(minutes / 60).toFixed(2)}h (timed)`)], w.key(job) + ': ' + minutes + ' min logged'); return { minutes };
}
function completeWork(service, input) {
  shop(service); const records = w.nodes(service), t = mate(service, input.teammate), job = activeJob(service, input.job, ['in-progress']);
  if (records.some(n => n['@type'] === 'robos:Teammate' && n['robos:activeTimer']?.job === job['@id'])) throw new Error('Stop the running timer before finishing the job');
  if (records.some(n => n['@type'] === 'robos:PartRequest' && w.linked(n, 'robos:job') === job['@id'] && ['requested', 'ordered'].includes(n['robos:requestStatus']))) throw new Error('Parts are still on order for this ticket');
  if (!records.some(n => n['@type'] === 'robos:LaborEntry' && w.linked(n, 'robos:job') === job['@id'])) throw new Error('Log your hours before finishing the job');
  const summary = w.text(input.summary, 2000, 'Summary of the work done');
  commit(service, [{ op: 'update', id: job['@id'], set: { 'robos:workComplete': true, 'robos:completionNote': summary, 'robos:needsApproval': '' } }, ...addEvent(service, records, job, 'work complete', `${t['schema:name']}: ${summary}`)], w.key(job) + ': work complete'); return { complete: true };
}
// Save the last OBD code read on the ticket. A VIN read from the car fills in a vehicle that has none, and a
// different VIN stops the save so one car's codes never land on another car's ticket.
function saveScan(service, input) {
  shop(service); const records = w.nodes(service), t = mate(service, input.teammate), job = activeJob(service, input.job), scan = service.lastObdScan;
  if (!scan) throw new Error('Read the codes from the car first');
  const vehicle = records.find(n => n['@id'] === w.linked(job, 'robos:vehicle')), onFile = vehicle?.['schema:vehicleIdentificationNumber'] || '', edits = [];
  if (scan.vin && onFile && scan.vin !== onFile) throw new Error(`This car's VIN (${scan.vin}) does not match the vehicle on this ticket (${onFile})`);
  let vinSaved = false;
  if (scan.vin && vehicle && !onFile && !records.some(n => n['@type'] === 'robos:OwnedVehicle' && n['schema:vehicleIdentificationNumber'] === scan.vin)) { edits.push({ op: 'update', id: vehicle['@id'], set: { 'schema:vehicleIdentificationNumber': scan.vin } }); vinSaved = true; }
  const list = codes => codes.map(c => c.code + (c.description ? ` (${c.description})` : '')).join(', ');
  const parts = [scan.mil == null ? null : scan.mil ? 'check-engine light ON' : 'check-engine light off', scan.stored.length ? 'stored ' + list(scan.stored) : 'no stored codes', scan.pending.length ? 'pending ' + list(scan.pending) : null, scan.permanent.length ? 'permanent ' + list(scan.permanent) : null, scan.voltage ? scan.voltage + ' V' : null, vinSaved ? 'VIN ' + scan.vin + ' saved to the vehicle' : null].filter(Boolean);
  commit(service, [...edits, ...addEvent(service, records, job, 'OBD scan', `${t['schema:name']}: ${parts.join('; ')}`)], w.key(job) + ': OBD scan'); return { vinSaved, summary: parts.join('; ') };
}
module.exports = { claimTicket, requestPart, updatePartRequest, addWorkNote, startTimer, stopTimer, completeWork, saveScan };

'use strict';
// Workshop lifecycle: teammates, customers (RobOS People/Groups), vehicles, estimates, approval,
// parts, labor hours per teammate, invoice, payment and offboarding. Every repair is a DevOps-style
// work item whose stage changes become private-Git commits ("RO-0001: awaiting-approval").
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { node, ref } = require('./importer');
const { shop, commit } = require('./shop-operations');
const { amountMinor, validInstant, CURRENCIES } = require('./reports');
const STAGES = ['received', 'diagnosing', 'awaiting-approval', 'in-progress', 'ready', 'closed'];
const STAGE_LABELS = { received: 'Intake', diagnosing: 'Diagnosis', 'awaiting-approval': 'Estimate awaiting approval', 'in-progress': 'Repair in progress', ready: 'Invoiced, ready for collection', closed: 'Paid and offboarded' };
const linked = (n, p) => n[p]?.['@id'];
const dir = (env, rel) => process.env[env] || path.join(os.homedir(), '.config/robos', rel);
function readJson(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter(f => f.endsWith('.json')).flatMap(f => { try { return [JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'))]; } catch { return []; } });
}
const text = (v, max, label, required = true) => {
  const s = String(v ?? '').trim();
  if (required && !s) throw new Error(label + ' is required');
  if (s.length > max) throw new Error(label + ' is too long');
  return s;
};
function nodes(service) { return service.workspace.read()['robos:nodes']; }
function find(service, type, id, message) {
  const n = nodes(service).find(n => n['@id'] === id && n['@type'] === 'robos:' + type);
  if (!n) throw new Error(message); return n;
}
function directory() {
  return { people: readJson(dir('ROBOS_PEOPLE_DIR', 'people')).map(p => ({ id: p.uid, name: p.displayName, email: p.email || '' })),
    groups: readJson(dir('ROBOS_GROUPS_DIR', 'groups')).map(g => ({ id: g.id, name: g.name, members: g.members || [] })) };
}
function addTeammate(service, input) {
  shop(service);
  const name = text(input.name, 200, 'Teammate name'), role = text(input.role, 100, 'Role');
  const rate = input.hourlyCost === undefined || input.hourlyCost === '' ? 0 : amountMinor(input.hourlyCost);
  let personId = '';
  if (input.personId) {
    const person = directory().people.find(p => p.id === input.personId);
    if (!person) throw new Error('Select a person from RobOS People');
    personId = person.id;
  }
  if (nodes(service).some(n => n['@type'] === 'robos:Teammate' && (n['schema:name'].toLowerCase() === name.toLowerCase() || (personId && n['robos:personId'] === personId)))) throw new Error('This teammate already exists');
  const n = node('Teammate', crypto.randomUUID(), name, { 'schema:name': name, 'robos:role': role, 'robos:personId': personId,
    'robos:hourlyCostMinor': rate, 'robos:currency': input.currency || 'USD', 'robos:active': true });
  commit(service, [{ op: 'add', node: n }], 'auto: add teammate'); return n;
}
function addCustomer(service, input) {
  shop(service);
  const name = text(input.name, 200, 'Customer name'), phone = text(input.phone, 50, 'Phone', false), email = text(input.email, 200, 'Email', false);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address');
  const dirs = directory(); let userId = '', groupId = '';
  if (input.userId) { if (!dirs.people.some(p => p.id === input.userId)) throw new Error('Select a person from RobOS People'); userId = input.userId; }
  if (input.groupId) { if (!dirs.groups.some(g => g.id === input.groupId)) throw new Error('Select a group from RobOS Groups'); groupId = input.groupId; }
  if (nodes(service).some(n => n['@type'] === 'robos:Customer' && ((userId && n['robos:userId'] === userId) || (email && n['schema:email'] === email.toLowerCase())))) throw new Error('This customer already exists');
  const n = node('Customer', crypto.randomUUID(), name, { 'schema:name': name, 'schema:telephone': phone, 'schema:email': email.toLowerCase(), 'robos:userId': userId, 'robos:groupId': groupId, 'robos:customerNotes': text(input.notes, 2000, 'Notes', false) });
  commit(service, [{ op: 'add', node: n }], 'auto: add customer'); return n;
}
function addCustomerVehicle(service, input) {
  shop(service); const customer = find(service, 'Customer', input.customer, 'Select a customer');
  const name = text(input.name, 200, 'Vehicle name');
  if (input.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(input.vin)) throw new Error('Invalid VIN');
  if (input.year && !/^\d{4}$/.test(String(input.year))) throw new Error('Invalid model year');
  if (input.vin && nodes(service).some(n => n['@type'] === 'robos:OwnedVehicle' && n['schema:vehicleIdentificationNumber'] === input.vin.toUpperCase())) throw new Error('A vehicle with this VIN is already on file');
  const n = node('OwnedVehicle', crypto.randomUUID(), name, { 'schema:name': name, 'schema:vehicleIdentificationNumber': String(input.vin || '').toUpperCase(),
    'schema:modelDate': String(input.year || ''), 'schema:brand': String(input.make || ''), 'schema:model': String(input.model || ''), 'robos:licensePlate': String(input.plate || ''),
    'robos:ownerNotes': customer['dcterms:title'], 'robos:customer': ref(customer['@id']) });
  commit(service, [{ op: 'add', node: n }], 'auto: add customer vehicle'); return n;
}
function workItemFor(records, jobId) { return records.find(n => n['@type'] === 'robos:RepairTicket' && linked(n, 'robos:job') === jobId); }
function event(service, kind, detail) { return { at: service.clock().toISOString(), kind, detail }; }
function openRepair(service, input) {
  shop(service); const records = nodes(service);
  const vehicle = records.find(n => n['@id'] === input.vehicle && n['@type'] === 'robos:OwnedVehicle'); if (!vehicle) throw new Error('Select a customer vehicle');
  const concern = text(input.concern, 500, 'Customer concern');
  const open = records.find(n => n['@type'] === 'robos:RepairOrder' && linked(n, 'robos:vehicle') === vehicle['@id'] && n['robos:jobStatus'] !== 'closed');
  if (open) throw new Error('This vehicle already has an open repair; finish it or add work to it');
  const seq = records.filter(n => n['@type'] === 'robos:RepairTicket').length + 1, key = 'RO-' + String(seq).padStart(4, '0');
  const job = node('RepairOrder', crypto.randomUUID(), concern, { 'robos:vehicle': ref(vehicle['@id']), 'robos:jobStatus': 'received', 'robos:repairNotes': '', 'robos:technician': '', 'schema:orderDate': service.clock().toISOString(), 'robos:workItemKey': key, 'robos:odometerIn': input.odometer === '' || input.odometer === undefined ? null : Number(input.odometer) });
  const wi = node('RepairTicket', key, key + ' · ' + concern, { 'robos:job': ref(job['@id']), 'robos:workItemKey': key, 'robos:workItemStatus': 'received', 'robos:events': [event(service, 'created', 'Customer concern: ' + concern)] });
  const edits = [{ op: 'add', node: job }, { op: 'add', node: wi }];
  if (!records.some(s => s['@type'] === 'robos:VehicleStay' && linked(s, 'robos:vehicle') === vehicle['@id'] && !s['schema:endDate'])) edits.push({ op: 'add', node: require('./shop-operations').checkInNode(service, { vehicle: vehicle['@id'], location: input.location }, records) });
  commit(service, edits, key + ': vehicle received'); return { job, workItem: wi };
}
function stageEdit(service, records, job, status, detail) {
  const wi = workItemFor(records, job['@id']); const set = { 'robos:jobStatus': status };
  if (status === 'closed') set['robos:closedAt'] = service.clock().toISOString();
  const edits = [{ op: 'update', id: job['@id'], set }];
  if (wi) edits.push({ op: 'update', id: wi['@id'], set: { 'robos:workItemStatus': status, 'robos:events': [...(wi['robos:events'] || []), event(service, status, detail)] } });
  return edits;
}
const key = job => job['robos:workItemKey'] || 'job';
function diagnose(service, input) {
  shop(service); const records = nodes(service), job = find(service, 'RepairOrder', input.job, 'Select a repair');
  if (job['robos:jobStatus'] !== 'received' && job['robos:jobStatus'] !== 'diagnosing') throw new Error('Diagnosis can only be recorded before the estimate is sent');
  const findings = text(input.findings, 5000, 'Diagnosis findings');
  const edits = stageEdit(service, records, job, 'diagnosing', 'Diagnosis: ' + findings);
  edits[0].set['robos:repairNotes'] = findings; if (input.codes) edits[0].set['robos:diagnosticCodes'] = text(input.codes, 500, 'Codes', false);
  commit(service, edits, key(job) + ': diagnosis recorded'); return findings;
}
function lineTotals(lines) {
  const parts = lines.filter(l => l.type === 'part').reduce((s, l) => s + l.quantity * l.unitMinor, 0);
  const labor = lines.filter(l => l.type === 'labor').reduce((s, l) => s + Math.round(l.hours * l.unitMinor), 0);
  return { parts, labor, total: parts + labor };
}
function normalizeLines(raw, currency) {
  if (!Array.isArray(raw) || !raw.length) throw new Error('Add at least one estimate line');
  if (raw.length > 100) throw new Error('Too many estimate lines');
  return raw.map(l => {
    const description = text(l.description, 300, 'Line description');
    if (l.type === 'part') {
      const quantity = Number(l.quantity); if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Part quantity must be a whole number of at least 1');
      return { type: 'part', description, quantity, unitMinor: amountMinor(l.unitPrice), partNumber: String(l.partNumber || '').slice(0, 100) };
    }
    if (l.type === 'labor') {
      const hours = Number(l.hours); if (!Number.isFinite(hours) || hours <= 0 || hours > 200) throw new Error('Labor hours must be between 0 and 200');
      return { type: 'labor', description, hours, unitMinor: amountMinor(l.rate) };
    }
    throw new Error('Estimate lines are parts or labor');
  }).concat([]).map(l => ({ ...l, currency }));
}
function createEstimate(service, input) {
  shop(service); const records = nodes(service), job = find(service, 'RepairOrder', input.job, 'Select a repair');
  if (!['received', 'diagnosing', 'awaiting-approval'].includes(job['robos:jobStatus'])) throw new Error('An estimate can only be prepared before the repair is approved');
  const currency = input.currency || 'USD'; if (!CURRENCIES.includes(currency)) throw new Error('Choose a currency');
  const lines = normalizeLines(input.lines, currency), totals = lineTotals(lines);
  const prior = records.filter(n => n['@type'] === 'robos:Estimate' && linked(n, 'robos:job') === job['@id']);
  const est = node('Estimate', crypto.randomUUID(), key(job) + ' estimate v' + (prior.length + 1), { 'robos:vehicle': job['robos:vehicle'], 'robos:job': ref(job['@id']), 'robos:version': prior.length + 1,
    'robos:estimateStatus': 'sent', 'robos:lines': lines, 'robos:partsMinor': totals.parts, 'robos:laborMinor': totals.labor, 'robos:totalMinor': totals.total, 'robos:currency': currency, 'schema:dateCreated': service.clock().toISOString() });
  const edits = [{ op: 'add', node: est }, ...prior.filter(p => p['robos:estimateStatus'] === 'sent').map(p => ({ op: 'update', id: p['@id'], set: { 'robos:estimateStatus': 'superseded' } })),
    ...stageEdit(service, records, job, 'awaiting-approval', 'Estimate v' + est['robos:version'] + ' sent: ' + totals.total / 100 + ' ' + currency)];
  commit(service, edits, key(job) + ': estimate v' + est['robos:version'] + ' sent'); return est;
}
function decideEstimate(service, input) {
  shop(service); const records = nodes(service), est = find(service, 'Estimate', input.estimate, 'Select an estimate');
  const job = records.find(n => n['@id'] === linked(est, 'robos:job'));
  if (est['robos:estimateStatus'] !== 'sent') throw new Error('Only the current estimate can be approved or declined');
  const decision = input.decision; if (!['approved', 'declined'].includes(decision)) throw new Error('Choose approve or decline');
  const by = text(input.approvedBy, 200, 'Name of the person who decided'), via = ['in person', 'phone', 'email', 'text message'].includes(input.channel) ? input.channel : null;
  if (!via) throw new Error('Choose how the customer responded');
  const set = { 'robos:estimateStatus': decision, 'robos:decidedBy': by, 'robos:decisionChannel': via, 'robos:decidedAt': service.clock().toISOString() };
  const edits = [{ op: 'update', id: est['@id'], set }];
  edits.push(...stageEdit(service, records, job, decision === 'approved' ? 'in-progress' : 'diagnosing', 'Estimate v' + est['robos:version'] + ' ' + decision + ' by ' + by + ' (' + via + ')'));
  commit(service, edits, key(job) + ': estimate ' + decision); return est;
}
function approvedEstimate(records, job) { return records.find(n => n['@type'] === 'robos:Estimate' && linked(n, 'robos:job') === job['@id'] && n['robos:estimateStatus'] === 'approved'); }
function usePart(service, input) {
  shop(service); const records = nodes(service), job = find(service, 'RepairOrder', input.job, 'Select a repair');
  if (job['robos:jobStatus'] !== 'in-progress') throw new Error('Parts are recorded while the repair is in progress');
  const quantity = Number(input.quantity); if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Part quantity must be a whole number of at least 1');
  const p = node('PartUsage', crypto.randomUUID(), text(input.name, 200, 'Part name'), { 'robos:job': ref(job['@id']), 'schema:name': input.name.trim(), 'robos:partNumber': String(input.partNumber || ''), 'robos:quantity': quantity,
    'robos:unitCostMinor': amountMinor(input.unitCost), 'robos:currency': approvedEstimate(records, job)?.['robos:currency'] || 'USD', 'robos:supplier': String(input.supplier || ''), 'schema:dateCreated': service.clock().toISOString() });
  commit(service, [{ op: 'add', node: p }, ...(workItemFor(records, job['@id']) ? [{ op: 'update', id: workItemFor(records, job['@id'])['@id'], set: { 'robos:events': [...(workItemFor(records, job['@id'])['robos:events'] || []), event(service, 'part', quantity + ' × ' + p['schema:name'])] } }] : [])], key(job) + ': part ' + p['schema:name']); return p;
}
function logHours(service, input) {
  shop(service); const records = nodes(service), job = find(service, 'RepairOrder', input.job, 'Select a repair'), mate = find(service, 'Teammate', input.teammate, 'Select a teammate');
  if (!['diagnosing', 'in-progress'].includes(job['robos:jobStatus'])) throw new Error('Hours are logged during diagnosis or repair');
  const hours = Number(input.hours); if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error('Hours must be more than 0 and at most 24 per entry');
  const minutes = Math.round(hours * 60), on = input.date || service.clock().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || on > service.clock().toISOString().slice(0, 10)) throw new Error('Work date must be valid and not in the future');
  const total = records.filter(n => n['@type'] === 'robos:LaborEntry' && linked(n, 'robos:teammate') === mate['@id'] && n['schema:startDate'] === on).reduce((s, n) => s + n['robos:hoursMinutes'], 0);
  if (total + minutes > 24 * 60) throw new Error('This teammate would have more than 24 hours logged on that day');
  const e = node('LaborEntry', crypto.randomUUID(), mate['schema:name'] + ' on ' + key(job), { 'robos:job': ref(job['@id']), 'robos:teammate': ref(mate['@id']), 'robos:hoursMinutes': minutes, 'schema:startDate': on, 'schema:description': String(input.note || '') });
  const edits = [{ op: 'add', node: e }];
  if (!job['robos:technician']) edits.push({ op: 'update', id: job['@id'], set: { 'robos:technician': mate['schema:name'] } });
  const wi = workItemFor(records, job['@id']); if (wi) edits.push({ op: 'update', id: wi['@id'], set: { 'robos:events': [...(wi['robos:events'] || []), event(service, 'labor', mate['schema:name'] + ' ' + hours + 'h')] } });
  commit(service, edits, key(job) + ': ' + hours + 'h by ' + mate['schema:name']); return e;
}
function jobSummary(records, job) {
  const est = approvedEstimate(records, job), cur = est?.['robos:currency'] || 'USD';
  const parts = records.filter(n => n['@type'] === 'robos:PartUsage' && linked(n, 'robos:job') === job['@id']);
  const labor = records.filter(n => n['@type'] === 'robos:LaborEntry' && linked(n, 'robos:job') === job['@id']);
  const byMate = {}; for (const l of labor) { const m = records.find(n => n['@id'] === linked(l, 'robos:teammate')); const k = m['schema:name']; byMate[k] = (byMate[k] || 0) + l['robos:hoursMinutes']; }
  const payments = records.filter(n => n['@type'] === 'robos:ShopPayment' && linked(n, 'robos:job') === job['@id']);
  const paid = payments.reduce((s, p) => s + (p['robos:paymentDirection'] === 'refund' ? -1 : 1) * p['robos:amountMinor'], 0);
  const invoice = records.find(n => n['@type'] === 'robos:Invoice' && linked(n, 'robos:job') === job['@id'] && n['robos:issued']);
  return { currency: cur, estimateTotal: est?.['robos:totalMinor'] ?? null, partsCost: parts.reduce((s, p) => s + p['robos:quantity'] * p['robos:unitCostMinor'], 0), laborMinutes: labor.reduce((s, l) => s + l['robos:hoursMinutes'], 0),
    hoursByTeammate: Object.fromEntries(Object.entries(byMate).map(([k, v]) => [k, v / 60])), billed: invoice?.['robos:totalMinor'] ?? null, paid, balance: invoice ? invoice['robos:totalMinor'] - paid : null, invoice: invoice?.['@id'] || null };
}
function issueInvoice(service, input) {
  shop(service); const records = nodes(service), job = find(service, 'RepairOrder', input.job, 'Select a repair');
  if (job['robos:jobStatus'] !== 'in-progress') throw new Error('Invoice a repair when its work is complete');
  const est = approvedEstimate(records, job); if (!est) throw new Error('The customer must approve an estimate before invoicing');
  if (!records.some(n => n['@type'] === 'robos:LaborEntry' && linked(n, 'robos:job') === job['@id'])) throw new Error('Log the hours worked before invoicing');
  const extra = input.extra ? amountMinor(input.extra) : 0;
  if (extra > Math.round(est['robos:totalMinor'] * 0.1) && !input.overrideApproved) throw new Error('Charges more than 10% over the approved estimate need a new customer approval');
  const total = est['robos:totalMinor'] + extra;
  const inv = node('Invoice', crypto.randomUUID(), key(job) + ' invoice', { 'robos:vehicle': job['robos:vehicle'], 'robos:job': ref(job['@id']), 'robos:estimate': ref(est['@id']), 'robos:issued': true, 'robos:totalMinor': total, 'robos:currency': est['robos:currency'], 'schema:dateCreated': service.clock().toISOString(), 'robos:reviewedByUser': true });
  commit(service, [{ op: 'add', node: inv }, { op: 'update', id: job['@id'], set: { 'robos:billedMinor': total, 'robos:billingCurrency': est['robos:currency'] } }, ...stageEdit(service, records, job, 'ready', 'Invoice issued: ' + total / 100 + ' ' + est['robos:currency'])], key(job) + ': invoice issued'); return inv;
}
function offboard(service, input) {
  shop(service); const records = nodes(service), job = find(service, 'RepairOrder', input.job, 'Select a repair');
  if (job['robos:jobStatus'] !== 'ready') throw new Error('Issue the invoice before returning the vehicle');
  const s = jobSummary(records, job); if (s.balance > 0) throw new Error('The invoice still has a balance of ' + (s.balance / 100).toFixed(2) + ' ' + s.currency);
  const stay = records.find(n => n['@type'] === 'robos:VehicleStay' && linked(n, 'robos:vehicle') === linked(job, 'robos:vehicle') && !n['schema:endDate']);
  const out = input.collectedAt || service.clock().toISOString(); if (!validInstant(out)) throw new Error('Invalid collection time');
  const edits = [...stageEdit(service, records, job, 'closed', 'Vehicle collected by ' + text(input.collectedBy, 200, 'Name of the person collecting'))];
  if (stay) edits.push({ op: 'update', id: stay['@id'], set: { 'schema:endDate': new Date(out).toISOString() } });
  commit(service, edits, key(job) + ': vehicle returned, repair closed'); return { job: job['@id'], closed: true };
}
function board(service) {
  shop(service); const records = nodes(service);
  const jobs = records.filter(n => n['@type'] === 'robos:RepairOrder').map(job => {
    const vehicle = records.find(n => n['@id'] === linked(job, 'robos:vehicle')), customer = records.find(n => n['@id'] === linked(vehicle || {}, 'robos:customer'));
    return { id: job['@id'], key: job['robos:workItemKey'] || '', title: job['dcterms:title'], stage: job['robos:jobStatus'], vehicle: vehicle?.['dcterms:title'], customer: customer?.['dcterms:title'],
      workItem: workItemFor(records, job['@id'])?.['robos:events'] || [], estimates: records.filter(n => n['@type'] === 'robos:Estimate' && linked(n, 'robos:job') === job['@id']).map(e => ({ id: e['@id'], version: e['robos:version'], status: e['robos:estimateStatus'], total: e['robos:totalMinor'], currency: e['robos:currency'], lines: e['robos:lines'] })),
      parts: records.filter(n => n['@type'] === 'robos:PartUsage' && linked(n, 'robos:job') === job['@id']).map(p => ({ name: p['schema:name'], quantity: p['robos:quantity'], unitCost: p['robos:unitCostMinor'] })), summary: jobSummary(records, job) };
  });
  return { stages: STAGES.map(s => ({ id: s, label: STAGE_LABELS[s] })), jobs, teammates: records.filter(n => n['@type'] === 'robos:Teammate').map(t => ({ id: t['@id'], name: t['schema:name'], role: t['robos:role'], personId: t['robos:personId'] })),
    customers: records.filter(n => n['@type'] === 'robos:Customer').map(c => ({ id: c['@id'], name: c['schema:name'], userId: c['robos:userId'], groupId: c['robos:groupId'], phone: c['schema:telephone'], email: c['schema:email'] })),
    vehicles: records.filter(n => n['@type'] === 'robos:OwnedVehicle').map(v => ({ id: v['@id'], name: v['dcterms:title'], customer: linked(v, 'robos:customer') })), directory: directory() };
}
module.exports = { STAGES, STAGE_LABELS, directory, addTeammate, addCustomer, addCustomerVehicle, openRepair, diagnose, createEstimate, decideEstimate, usePart, logHours, issueInvoice, offboard, board, jobSummary };

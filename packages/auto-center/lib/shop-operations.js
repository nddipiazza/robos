'use strict';
const crypto = require('node:crypto');
const { node, ref } = require('./importer');
const { PrivateGit } = require('./private-git');
const { validDate, validInstant, dayAt, amountMinor, CURRENCIES } = require('./reports');
const linked = (n, property) => n[property]?.['@id'];
function shop(service) { if (service.mode !== 'shop') throw new Error('Shop operations require maintenance center mode'); }
function commit(service, edits, message) {
  const proposal = service.workspace.propose({ mode: 'refine', edits, prompt: message });
  service.workspace.apply(proposal, { expectedProposalId: proposal.id });
  try { new PrivateGit(service.dataRoot).commit(message); }
  catch (error) { throw new Error('Saved locally, but Git snapshot failed: ' + error.message); }
}
function checkInNode(service, input, records) {
  const vehicle = records.find(n => n['@type'] === 'robos:OwnedVehicle' && n['@id'] === input.vehicle);
  if (!vehicle) throw new Error('Select a saved customer vehicle');
  const start = input.checkedInAt || service.clock().toISOString();
  if (!validInstant(start) || Date.parse(start) > service.clock().getTime()) throw new Error('Check-in time must be valid and not in the future');
  const stays = records.filter(n => n['@type'] === 'robos:VehicleStay' && linked(n, 'robos:vehicle') === input.vehicle);
  if (stays.some(n => !n['schema:endDate'])) throw new Error('This vehicle is already checked in');
  if (stays.some(n => Date.parse(n['schema:endDate']) > Date.parse(start))) throw new Error('Check-in overlaps a previous stay');
  if (input.expectedReadyOn && !validDate(input.expectedReadyOn)) throw new Error('Invalid expected ready date');
  if (typeof (input.location || '') !== 'string' || (input.location || '').length > 200) throw new Error('Location must be under 200 characters');
  return node('VehicleStay', crypto.randomUUID(), vehicle['dcterms:title'] + ' · center stay', {
    'robos:vehicle': ref(input.vehicle), 'schema:startDate': new Date(start).toISOString(),
    'robos:parkingLocation': input.location || '', 'robos:expectedReadyOn': input.expectedReadyOn || '',
  });
}
function checkIn(service, input) {
  shop(service); const n = checkInNode(service, input, service.workspace.read()['robos:nodes']);
  commit(service, [{ op: 'add', node: n }], 'auto: check vehicle into center'); return n;
}
function checkOut(service, { id, checkedOutAt }) {
  shop(service); const n = service.workspace.read()['robos:nodes'].find(n => n['@id'] === id && n['@type'] === 'robos:VehicleStay');
  if (!n || n['schema:endDate']) throw new Error('Select a currently checked-in vehicle');
  const end = checkedOutAt || service.clock().toISOString();
  if (!validInstant(end) || Date.parse(end) > service.clock().getTime() || Date.parse(end) < Date.parse(n['schema:startDate'])) throw new Error('Collection time must be after check-in and not in the future');
  commit(service, [{ op: 'update', id, set: { 'schema:endDate': new Date(end).toISOString() } }], 'auto: record vehicle collection');
  return { id, checkedOutAt: new Date(end).toISOString() };
}
function recordPayment(service, input) {
  shop(service);
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId || '')) throw new Error('Payment needs a valid submission identifier');
  const records = service.workspace.read()['robos:nodes'];
  const job = records.find(n => n['@id'] === input.job && n['@type'] === 'robos:RepairOrder');
  if (!job) throw new Error('Select a repair job');
  const amount = amountMinor(input.amount, { positive: true });
  const currency = input.currency, direction = input.direction;
  if (!CURRENCIES.includes(currency) || !['received', 'refund'].includes(direction)) throw new Error('Invalid payment currency or direction');
  if (!validDate(input.paidOn) || input.paidOn > dayAt(service.clock(), service.reportTimeZone)) throw new Error('Payment date must be valid and not in the future');
  if (!['cash', 'card', 'bank', 'check', 'other'].includes(input.method)) throw new Error('Choose a payment method');
  if (typeof (input.notes || '') !== 'string' || (input.notes || '').length > 2000) throw new Error('Payment note is too long');
  const comparable = { 'robos:job': ref(input.job), 'robos:amountMinor': amount, 'robos:currency': currency,
    'robos:paidOn': input.paidOn, 'robos:paymentDirection': direction, 'robos:paymentMethod': input.method,
    'robos:paymentNotes': input.notes || '', ...(direction === 'refund' ? { 'robos:refundOf': ref(input.refundOf) } : {}) };
  const prior = records.find(n => n['@type'] === 'robos:ShopPayment' && n['robos:transactionKey'] === input.requestId);
  if (prior) {
    if (Object.entries(comparable).some(([key, value]) => JSON.stringify(prior[key]) !== JSON.stringify(value))) throw new Error('Submission identifier was already used for different payment details');
    try { new PrivateGit(service.dataRoot).commit('auto: snapshot recorded transaction'); } catch(error) { throw new Error('Transaction is saved locally, but Git snapshot failed: '+error.message); }
    return prior;
  }
  const ledger = records.filter(n => n['@type'] === 'robos:ShopPayment' && linked(n, 'robos:job') === input.job);
  if (job['robos:billingCurrency'] && job['robos:billingCurrency'] !== currency || records.some(p => ['robos:ShopFinanceEntry', 'robos:ShopPayment'].includes(p['@type']) && linked(p, 'robos:job') === input.job && p['robos:currency'] !== currency)) throw new Error('Use the repair job currency; currencies are not converted');
  if (direction === 'refund') {
    const original = ledger.find(p => p['@id'] === input.refundOf && p['robos:paymentDirection'] === 'received');
    if (!original || original['robos:currency'] !== currency) throw new Error('Select the original received payment');
    const alreadyRefunded = ledger.filter(p => linked(p, 'robos:refundOf') === original['@id']).reduce((sum, p) => sum + p['robos:amountMinor'], 0);
    if (amount > original['robos:amountMinor'] - alreadyRefunded) throw new Error('Refund exceeds the remaining received amount');
    if (input.paidOn < original['robos:paidOn']) throw new Error('Refund date cannot precede the original payment');
    if (!input.notes?.trim()) throw new Error('Provide a refund reason');
  }
  const n = node('ShopPayment', crypto.randomUUID(), direction === 'refund' ? 'Recorded customer refund' : 'Recorded customer payment', {
    ...comparable, 'robos:transactionKey': input.requestId, 'robos:recordedAt': service.clock().toISOString(),
  });
  commit(service, [{ op: 'add', node: n }], 'auto: record customer ' + (direction === 'refund' ? 'refund' : 'payment'));
  return n;
}
module.exports = { shop, commit, checkInNode, checkIn, checkOut, recordPayment };

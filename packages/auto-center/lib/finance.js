'use strict';
const crypto = require('node:crypto');
const { node, ref } = require('./importer');
const { shop, commit } = require('./shop-operations');
const { PrivateGit } = require('./private-git');
const { CURRENCIES, COST_CATEGORIES: CATEGORIES, amountMinor, validDate, dayAt } = require('./reports');
const linked = n => n['robos:job']?.['@id'];
function recordFinance(service, input) {
  shop(service);
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId || '')) throw new Error('Entry needs a valid submission identifier');
  const records = service.workspace.read()['robos:nodes'];
  const job = input.job ? records.find(n => n['@type'] === 'robos:RepairOrder' && n['@id'] === input.job) : null;
  if (input.job && !job) throw new Error('Select a saved repair job');
  if (!['expense', 'sale'].includes(input.kind) || !['charge', 'credit'].includes(input.direction)) throw new Error('Choose an entry type and direction');
  if (input.kind === 'sale' && !job) throw new Error('Earned sales require a repair job');
  if (!CURRENCIES.includes(input.currency)) throw new Error('Invalid currency');
  if (job?.['robos:billingCurrency'] && job['robos:billingCurrency'] !== input.currency) throw new Error('Use the repair job currency; currencies are not converted');
  if (!validDate(input.date) || input.date > dayAt(service.clock(), service.reportTimeZone)) throw new Error('Entry date must be valid and not in the future');
  if (input.kind === 'expense' && !CATEGORIES.includes(input.category)) throw new Error('Select an expense category');
  if (typeof input.description !== 'string' || !input.description.trim() || input.description.length > 2000) throw new Error('Enter a description or correction reason, up to 2000 characters');
  if (typeof (input.reference || '') !== 'string' || (input.reference || '').length > 500) throw new Error('Reference is too long');
  const props = { 'robos:entryKind': input.kind, 'robos:entryDirection': input.direction,
    'robos:amountMinor': amountMinor(input.amount, { positive: true }), 'robos:currency': input.currency,
    'robos:effectiveOn': input.date, 'robos:costCategory': input.kind === 'expense' ? input.category : 'sales',
    'schema:description': input.description.trim(), 'robos:documentReference': input.reference || '',
    ...(job ? { 'robos:job': ref(job['@id']) } : {}),
    ...(input.direction === 'credit' ? { 'robos:creditOf': ref(input.creditOf) } : {}) };
  const ledger = records.filter(n => n['@type'] === 'robos:ShopFinanceEntry');
  const prior = ledger.find(n => n['robos:transactionKey'] === input.requestId);
  if (prior) {
    if ([...new Set([...Object.keys(props), 'robos:job', 'robos:creditOf'])].some(key => JSON.stringify(prior[key]) !== JSON.stringify(props[key]))) throw new Error('Submission identifier was already used for different details');
    new PrivateGit(service.dataRoot).commit('auto: snapshot financial entry'); return prior;
  }
  if (job && records.some(n => ['robos:ShopFinanceEntry', 'robos:ShopPayment'].includes(n['@type']) && linked(n) === job['@id'] && n['robos:currency'] !== input.currency)) throw new Error('Use the repair job currency; currencies are not converted');
  if (input.direction === 'credit') {
    const original = ledger.find(n => n['@id'] === input.creditOf && n['robos:entryDirection'] === 'charge');
    if (!original || ['robos:entryKind', 'robos:currency', 'robos:costCategory'].some(key => original[key] !== props[key]) || linked(original) !== linked(props)) throw new Error('Credit must match the original entry, job, category and currency');
    if (input.date < original['robos:effectiveOn']) throw new Error('Credit cannot precede the original entry');
    const credited = ledger.filter(n => n['robos:creditOf']?.['@id'] === original['@id']).reduce((sum, n) => sum + BigInt(n['robos:amountMinor']), 0n);
    if (credited + BigInt(props['robos:amountMinor']) > BigInt(original['robos:amountMinor'])) throw new Error('Credit exceeds the remaining original amount');
  }
  const entry = node('ShopFinanceEntry', crypto.randomUUID(), input.kind === 'expense' ? 'Actual shop expense' : 'Earned repair sale', {
    ...props, 'robos:transactionKey': input.requestId, 'robos:recordedAt': service.clock().toISOString(),
  });
  commit(service, [{ op: 'add', node: entry }], 'auto: record ' + input.kind + ' ' + input.direction); return entry;
}
module.exports = { recordFinance, CATEGORIES };

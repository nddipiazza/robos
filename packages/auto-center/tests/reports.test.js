'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { buildReports, amountMinor } = require('../lib/reports');
const { AutoCenter } = require('../lib/service');
const ref = id => ({ '@id': id });
function n(type, id, props = {}) { return { '@id': id, '@type': 'robos:' + type, 'dcterms:title': id, ...props }; }
function payment(id, amount, date, currency = 'USD', direction = 'received') {
  return n('ShopPayment', id, { 'robos:job': ref(currency === 'USD' ? 'job' : 'job-eur'), ...(direction === 'refund' ? {'robos:refundOf':ref('a')} : {}), 'robos:amountMinor': amount, 'robos:paidOn': date, 'robos:currency': currency, 'robos:paymentDirection': direction });
}
test('reports use calendar periods, integer cents and distinct currencies; invoice scans are not revenue', () => {
  const records = [n('OwnedVehicle', 'car'), n('RepairOrder', 'job', { 'robos:vehicle': ref('car'), 'robos:jobStatus': 'received', 'robos:billedMinor': 10000, 'robos:billingCurrency': 'USD' }),
    n('RepairOrder', 'job-eur', {'robos:jobStatus':'received'}), payment('old', 10000, '2026-12-31'), payment('a', 10, '2027-01-01'), payment('b', 20, '2027-01-02'), payment('refund', 10, '2027-01-02', 'USD', 'refund'), payment('eur', 5000, '2027-01-02', 'EUR'),
    n('Invoice', 'scanned-expense', { 'schema:totalPaymentDue': { 'schema:value': '99999.00', 'schema:currency': 'USD' } })];
  const r = buildReports(records, { now: new Date('2027-01-03T02:00:00Z'), timeZone: 'America/Los_Angeles' });
  assert.equal(r.today, '2027-01-02'); assert.equal(r.periods.week, '2026-12-28'); assert.equal(r.periods.month, '2027-01-01');
  assert.equal(r.revenue.day.netMinor, '10'); assert.equal(r.revenue.week.netMinor, '10020'); assert.equal(r.revenue.month.netMinor, '20');
  assert.equal(r.money.EUR.day.netMinor, '5000'); assert.equal(r.revenue.month.averageReceiptMinor, '15');
  assert.equal(r.balance.outstandingMinor, '0'); assert.equal(r.balance.creditMinor, '20');
  assert.equal(amountMinor('0.10') + amountMinor('0.20'), 30); assert.throws(() => amountMinor('1.001')); assert.throws(() => amountMinor('-10.00'));
  assert.throws(() => buildReports(records, { now: new Date('2027-01-02T12:00:00Z'), timeZone: 'UTC', asOf: '2027-01-03' }), /report date/);
});
test('custody remains separate from jobs, and recorded turnaround handles DST and undated legacy closures', () => {
  const records = [n('OwnedVehicle', 'car'), n('VehicleStay', 'stay', { 'robos:vehicle': ref('car'), 'schema:startDate': '2026-03-08T07:30:00Z', 'robos:expectedReadyOn': '2026-03-08' }),
    n('RepairOrder', 'job', { 'robos:vehicle': ref('car'), 'robos:jobStatus': 'closed', 'schema:orderDate': '2026-03-08T07:30:00Z', 'robos:closedAt': '2026-03-08T08:30:00Z' }),
    n('RepairOrder', 'legacy', { 'robos:vehicle': ref('car'), 'robos:jobStatus': 'closed' }),
    n('MaintenanceSchedule', 'due', { 'robos:scheduleStatus': 'planned', 'schema:startDate': '2026-03-08' })];
  const r = buildReports(records, { now: new Date('2026-03-09T17:00:00Z'), timeZone: 'America/Chicago' });
  assert.equal(r.heldCount, 1); assert.equal(r.held[0].daysHeld, 1); assert.equal(r.openJobs, 0); assert.equal(r.readyForPickup, 0);
  assert.equal(r.completions.month, 1); assert.equal(r.cycleHours, 1); assert.equal(r.invalid.closedJobsWithoutTimestamp, 1); assert.equal(r.overdueMaintenance, 1); assert.equal(r.pastExpected, 1);
  const historical = buildReports(records, { now: new Date('2026-03-09T17:00:00Z'), timeZone: 'America/Chicago', asOf: '2026-03-08' });
  assert.equal(historical.heldCount, 1); assert.equal(historical.completions.day, 1); assert.equal(historical.periods.week, '2026-03-02');
});
function service() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-auto-report-')); let now = new Date('2026-10-15T17:00:00Z');
  const s = new AutoCenter({ root: path.join(root, 'public'), privateRoot: path.join(root, 'private'), clock: () => new Date(now) });
  s.reportTimeZone = 'America/Chicago'; return { s, advance: value => { now = new Date(value); } };
}
test('shop check-in/out, job billing, payments and refunds are persisted in private Git history', () => {
  const { s, advance } = service(); assert.throws(() => s.reports(), /maintenance center/); s.setMode('shop');
  const car = s.save({ kind: 'vehicle', name: 'Test customer car' });
  const job = s.save({ kind: 'job', name: 'Test repair', vehicle: car['@id'], technician: 'Alex' });
  assert.equal(s.reports().heldCount, 0);
  const stay = s.checkIn({ vehicle: car['@id'], checkedInAt: '2026-10-13T17:00:00Z', location: 'Bay 2', expectedReadyOn: '2026-10-14' });
  assert.throws(() => s.checkIn({ vehicle: car['@id'] }), /already checked in/); assert.equal(s.reports().held[0].daysHeld, 2);
  s.updateJob({ id: job['@id'], status: 'ready', notes: 'Test work completed', billedTotal: '150.00', currency: 'USD' });
  assert.equal(s.reports().readyForPickup, 1); assert.equal(s.reports().balance.outstandingMinor, '15000');
  const input = { job: job['@id'], requestId: crypto.randomUUID(), amount: '125.25', paidOn: '2026-10-15', currency: 'USD', direction: 'received', method: 'card', notes: 'Test receipt' };
  const receipt = s.recordPayment(input); assert.equal(s.recordPayment(input)['@id'], receipt['@id']);
  assert.throws(() => s.recordPayment({ ...input, amount: '1.00' }), /different payment details/);
  assert.throws(() => s.recordPayment({ ...input, requestId: crypto.randomUUID(), currency: 'CAD' }), /currency/);
  assert.throws(() => s.recordPayment({ ...input, requestId: crypto.randomUUID(), paidOn: '2026-10-16' }), /future/);
  s.recordPayment({ ...input, requestId: crypto.randomUUID(), amount: '25.25', direction: 'refund', refundOf: receipt['@id'], notes: 'Test partial refund' });
  assert.throws(() => s.recordPayment({ ...input, requestId: crypto.randomUUID(), amount: '100.01', direction: 'refund', refundOf: receipt['@id'], notes: 'Excess refund' }), /exceeds/);
  assert.equal(s.reports().revenue.day.netMinor, '10000'); assert.equal(s.reports().balance.outstandingMinor, '5000');
  advance('2026-10-15T19:00:00Z'); s.updateJob({ id: job['@id'], status: 'closed', notes: 'Closed test job' });
  assert.equal(s.reports().heldCount, 1); assert.equal(s.reports().completions.day, 1);
  advance('2026-10-15T20:00:00Z'); s.updateJob({ id: job['@id'], status: 'closed', notes: 'Notes corrected' });
  assert.equal(s.workspace.read()['robos:nodes'].find(n => n['@id'] === job['@id'])['robos:closedAt'], '2026-10-15T19:00:00.000Z');
  assert.throws(() => s.checkOut({ id: stay['@id'], checkedOutAt: '2026-10-12T12:00:00Z' }), /after check-in/);
  s.checkOut({ id: stay['@id'] }); assert.equal(s.reports().heldCount, 0); assert.equal(s.reports().custody.day.departures, 1);
  assert.throws(() => s.checkIn({ vehicle: car['@id'], checkedInAt: '2026-10-14T12:00:00Z' }), /overlaps/);
  s.updateJob({ id: job['@id'], status: 'in-progress', notes: 'Reopened test job' }); assert.equal(s.reports().completions.day, 0);
  const reload = new AutoCenter({ root: s.root, privateRoot: s.privateRoot, clock: () => new Date('2026-10-15T20:00:00Z') });
  assert.equal(reload.reports().revenue.day.netMinor, '10000'); assert.ok(reload.status().gitops.commits.some(c => c.includes('update repair job')));
  reload.setMode('owner'); assert.equal(reload.status().records.length, 0); assert.throws(() => reload.recordPayment(input), /maintenance center/);
});
test('explicit intake checkbox can atomically check a vehicle in without duplicate custody records', () => {
  const { s } = service(); s.setMode('shop'); const car = s.save({ kind: 'vehicle', name: 'Intake test car' });
  s.save({ kind: 'job', name: 'First job', vehicle: car['@id'], checkIn: 'on' });
  s.save({ kind: 'job', name: 'Second job', vehicle: car['@id'], checkIn: 'on' });
  assert.equal(s.reports().heldCount, 1); assert.equal(s.reports().held[0].jobs.length, 2);
});
test('invalid refunds are surfaced without changing receipts, and large totals retain exact cents', () => {
  const job = n('RepairOrder', 'job', { 'robos:jobStatus': 'received' });
  const received = payment('a', Number.MAX_SAFE_INTEGER, '2026-10-15');
  const second = payment('second', Number.MAX_SAFE_INTEGER, '2026-10-15');
  const badRefund = payment('bad-refund', 1, '2026-10-15', 'USD', 'refund'); badRefund['robos:refundOf'] = ref('missing');
  const r = buildReports([job, received, second, badRefund], { now: new Date('2026-10-15T20:00:00Z'), timeZone: 'UTC' });
  assert.equal(r.revenue.day.netMinor, String(2n * BigInt(Number.MAX_SAFE_INTEGER)));
  assert.equal(r.invalid.payments, 1); assert.equal(r.revenue.day.refundedMinor, '0');
});

test('actual costs and earned sales give profit independent of collections, with dated credits and overhead', () => {
  const { s, advance } = service(); s.setMode('shop');
  const car = s.save({ kind: 'vehicle', name: 'Profit test car' });
  const job = s.save({ kind: 'job', name: 'Brake job', vehicle: car['@id'] });
  const input = { job: job['@id'], kind: 'sale', direction: 'charge', amount: '500.00', currency: 'USD', date: '2026-10-14', description: 'Earned sale excluding sales tax', requestId: crypto.randomUUID() };
  const sale = s.recordFinance(input); assert.equal(s.recordFinance(input)['@id'], sale['@id']);
  assert.throws(() => s.recordFinance({ ...input, job: '' }), /require a repair job/);
  assert.throws(() => s.recordFinance({ ...input, amount: '600' }), /different details/);
  const add = changes => s.recordFinance({ ...input, ...changes, requestId: crypto.randomUUID() });
  const parts = add({ kind: 'expense', category: 'parts', amount: '100.10', date: '2026-10-14', reference: 'Supplier invoice P123 — unpaid' });
  add({ kind: 'expense', category: 'labor', amount: '80.20', date: '2026-10-15' });
  add({ kind: 'expense', category: 'supplies', amount: '5.00', date: '2026-10-15' });
  const overhead = add({ job: '', kind: 'expense', category: 'rent', amount: '30.00', date: '2026-10-15' });
  assert.throws(() => s.recordFinance({ ...input, requestId: overhead['robos:transactionKey'], kind: 'expense', category: 'rent', amount: '30.00', date: '2026-10-15' }), /different details/);
  const credit = add({ kind: 'expense', category: 'parts', direction: 'credit', creditOf: parts['@id'], amount: '10.10', date: '2026-10-15', description: 'Supplier credit' });
  assert.throws(() => add({ kind: 'expense', category: 'parts', direction: 'credit', creditOf: parts['@id'], amount: '100.00' }), /exceeds/);
  assert.throws(() => add({ kind: 'expense', category: 'labor', direction: 'credit', creditOf: parts['@id'], amount: '1' }), /match/);
  assert.throws(() => add({ kind: 'expense', category: 'parts', direction: 'credit', creditOf: parts['@id'], amount: '1', date: '2026-10-13' }), /precede/);
  assert.throws(() => add({ kind: 'expense', category: 'parts', amount: '-1' }), /amount/);
  assert.throws(() => add({ kind: 'expense', category: 'parts', date: '2026-10-16' }), /future/);
  assert.throws(() => add({ kind: 'expense', category: 'parts', currency: 'CAD' }), /currency/);
  assert.throws(() => s.updateJob({ id: job['@id'], status: 'closed', notes: '', billedTotal: '500', currency: 'CAD' }), /currency/);
  let r = s.reports(); assert.equal(r.revenue.month.netMinor, '0');
  assert.equal(r.profit.periods.day.profitMinor, '-10510');
  assert.equal(r.profit.periods.week.profitMinor, '29480'); assert.equal(r.profit.periods.month.profitMinor, '29480');
  assert.equal(r.profit.periods.month.overheadMinor, '3000'); assert.equal(r.profit.periods.month.categories.parts, '9000');
  assert.equal(r.profit.jobs[0].profitMinor, '32480'); assert.equal(r.profit.jobs[0].marginPercent, 64.96);
  const past = s.reports({ asOf: '2026-10-14' }); assert.equal(past.profit.periods.day.profitMinor, '39990');
  assert.equal(past.profit.jobs[0].costsMinor, '10010');
  s.recordPayment({ job: job['@id'], requestId: crypto.randomUUID(), amount: '600', currency: 'USD', paidOn: '2026-10-15', direction: 'received', method: 'card' });
  assert.equal(s.reports().profit.periods.month.profitMinor, '29480');
  add({ direction: 'credit', creditOf: sale['@id'], amount: '25.00', description: 'Price concession' });
  s.updateJob({ id: job['@id'], status: 'closed', notes: '', billedTotal: '900', currency: 'USD' });
  s.updateJob({ id: job['@id'], status: 'in-progress', notes: '', billedTotal: '950', currency: 'USD' });
  assert.equal(s.reports().profit.periods.month.salesMinor, '47500');
  assert.equal(s.reports().profit.periods.month.profitMinor, '26980');
  advance('2026-11-02T18:00:00Z'); assert.equal(s.reports().profit.periods.month.profitMinor, '0');
  const reloaded = new AutoCenter({ root: s.root, privateRoot: s.privateRoot });
  assert.equal(reloaded.reports({ asOf: '2026-10-15' }).profit.jobs[0].profitMinor, '29980');
  assert.ok(reloaded.status().gitops.commits[0].includes('update repair job'));
  s.setMode('owner'); assert.throws(() => s.recordFinance(input), /maintenance center/);
  assert.equal(s.workspace.read()['robos:nodes'].filter(n => n['@type'] === 'robos:ShopFinanceEntry').length, 0);
});

test('profit excludes invalid credits and future expenses, keeps currencies separate and surfaces missing job coverage', () => {
  const entry = (id, kind, amount, extra = {}) => n('ShopFinanceEntry', id, {
    'robos:entryKind': kind, 'robos:entryDirection': 'charge', 'robos:job': ref('j'),
    'robos:amountMinor': amount, 'robos:currency': 'USD', 'robos:effectiveOn': '2026-10-01',
    'robos:costCategory': kind === 'sale' ? 'sales' : 'parts', ...extra,
  });
  const records = [n('RepairOrder', 'j', { 'robos:billingCurrency': 'USD' }),
    n('RepairOrder', 'unknown', { 'robos:jobStatus': 'closed' }),
    n('RepairOrder', 'cad', { 'robos:billingCurrency': 'CAD' }),
    entry('sale', 'sale', 10000), entry('cost', 'expense', 5000),
    entry('credit', 'expense', 1000, { 'robos:entryDirection': 'credit', 'robos:creditOf': ref('cost') }),
    entry('over-credit', 'expense', 4500, { 'robos:entryDirection': 'credit', 'robos:creditOf': ref('cost') }),
    entry('future', 'expense', 90000, { 'robos:effectiveOn': '2026-10-16' }),
    entry('missing-job', 'sale', 90000, { 'robos:job': ref('not-found') }),
    entry('cad-sale', 'sale', 30000, { 'robos:job': ref('cad'), 'robos:currency': 'CAD' })];
  const options = { now: new Date('2026-10-15T17:00:00Z'), timeZone: 'America/Chicago' };
  const r = buildReports(records, options); assert.equal(r.profit.periods.month.profitMinor, '6000');
  assert.equal(r.profit.periods.day.profitMinor, '0'); assert.equal(r.profit.invalidEntries, 3);
  assert.equal(r.profit.unrecognizedJobs, 1); assert.equal(r.profit.jobsWithoutCosts, 1);
  assert.equal(buildReports(records, { ...options, currency: 'CAD' }).profit.periods.month.profitMinor, '30000');
});

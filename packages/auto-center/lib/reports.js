'use strict';

const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP'];
const JOB_STATES = ['received', 'diagnosing', 'awaiting-approval', 'in-progress', 'ready', 'closed'];
const linked = (node, property) => node[property]?.['@id'];
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function dayAt(instant, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function shiftDay(date, days) {
  const value = new Date(date + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function amountMinor(value, { positive = false } = {}) {
  if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount with up to two decimals');
  const [whole, decimals = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount < (positive ? 1 : 0)) throw new Error(positive ? 'Amount must be greater than zero' : 'Invalid amount');
  return amount;
}
function validInstant(value) {
  return typeof value === 'string' && validDate(value.slice(0, 10)) &&
    /T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function buildReports(nodes, { now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, asOf, currency = 'USD' } = {}) {
  if (!CURRENCIES.includes(currency)) throw new Error('Unsupported report currency');
  const today = dayAt(now, timeZone); asOf ||= today;
  if (!validDate(asOf) || asOf > today) throw new Error('Choose a valid report date up to today');
  const weekday = new Date(asOf + 'T12:00:00Z').getUTCDay();
  const periods = { day: asOf, week: shiftDay(asOf, -(weekday + 6) % 7), month: asOf.slice(0, 7) + '-01' };
  const ofType = type => nodes.filter(n => n['@type'] === 'robos:' + type);
  const vehicles = new Map(ofType('OwnedVehicle').map(n => [n['@id'], n]));
  const jobs = ofType('RepairOrder'), jobIndex = new Map(jobs.map(n => [n['@id'], n]));
  const invalid = { payments: 0, closedJobsWithoutTimestamp: 0, stays: 0 };
  const candidatePayments = ofType('ShopPayment').filter(p => {
    const valid = jobIndex.has(linked(p, 'robos:job')) && Number.isSafeInteger(p['robos:amountMinor']) &&
      p['robos:amountMinor'] > 0 && (!jobIndex.get(linked(p,'robos:job'))?.['robos:billingCurrency'] || jobIndex.get(linked(p,'robos:job'))['robos:billingCurrency'] === p['robos:currency']) && CURRENCIES.includes(p['robos:currency']) && validDate(p['robos:paidOn']) && p['robos:paidOn'] <= today &&
      ['received', 'refund'].includes(p['robos:paymentDirection']);
    if (!valid) invalid.payments++; return valid;
  });
  const receiptsById = new Map(candidatePayments.filter(p => p['robos:paymentDirection'] === 'received').map(p => [p['@id'], p]));
  const refundedById = new Map();
  const payments = [...candidatePayments].sort((a, b) => a['robos:paidOn'].localeCompare(b['robos:paidOn']) || String(a['robos:recordedAt'] || '').localeCompare(String(b['robos:recordedAt'] || ''))).filter(p => {
    if (p['robos:paymentDirection'] === 'received') return true;
    const receipt = receiptsById.get(linked(p, 'robos:refundOf'));
    const previous = refundedById.get(receipt?.['@id']) || 0n;
    if (!receipt || receipt['robos:currency'] !== p['robos:currency'] || linked(receipt,'robos:job') !== linked(p,'robos:job') ||
      p['robos:paidOn'] < receipt['robos:paidOn'] || previous + BigInt(p['robos:amountMinor']) > BigInt(receipt['robos:amountMinor'])) { invalid.payments++; return false; }
    refundedById.set(receipt['@id'], previous + BigInt(p['robos:amountMinor'])); return true;
  });
  const sums = list => {
    let received = 0n, refunded = 0n, receipts = 0;
    for (const p of list) {
      if (p['robos:paymentDirection'] === 'received') { received += BigInt(p['robos:amountMinor']); receipts++; }
      else refunded += BigInt(p['robos:amountMinor']);
    }
    return { receivedMinor: String(received), refundedMinor: String(refunded), netMinor: String(received - refunded), receipts,
      averageReceiptMinor: receipts ? String((received + BigInt(Math.floor(receipts / 2))) / BigInt(receipts)) : null };
  };
  const inPeriod = (day, start) => day >= start && day <= asOf;
  const money = Object.fromEntries(CURRENCIES.map(code => [code, Object.fromEntries(Object.entries(periods).map(([key, start]) =>
    [key, sums(payments.filter(p => p['robos:currency'] === code && inPeriod(p['robos:paidOn'], start))) ]))]));
  const statuses = Object.fromEntries(JOB_STATES.map(s => [s, jobs.filter(j => j['robos:jobStatus'] === s).length]));
  const openJobs = jobs.filter(j => j['robos:jobStatus'] !== 'closed');
  const completed = jobs.filter(j => j['robos:jobStatus'] === 'closed' && validInstant(j['robos:closedAt']) && Date.parse(j['robos:closedAt']) <= now.getTime());
  invalid.closedJobsWithoutTimestamp = jobs.filter(j => j['robos:jobStatus'] === 'closed' && !validInstant(j['robos:closedAt'])).length;
  const completions = Object.fromEntries(Object.entries(periods).map(([key, start]) => [key,
    completed.filter(j => inPeriod(dayAt(j['robos:closedAt'], timeZone), start)).length]));
  const cycleHours = completed.filter(j => inPeriod(dayAt(j['robos:closedAt'], timeZone), periods.month) &&
    validInstant(j['schema:orderDate']) && Date.parse(j['robos:closedAt']) >= Date.parse(j['schema:orderDate']))
    .map(j => (Date.parse(j['robos:closedAt']) - Date.parse(j['schema:orderDate'])) / 3600000);
  const stays = ofType('VehicleStay').filter(stay => {
    const valid = vehicles.has(linked(stay, 'robos:vehicle')) && validInstant(stay['schema:startDate']) &&
      (!stay['schema:endDate'] || validInstant(stay['schema:endDate']) && Date.parse(stay['schema:endDate']) >= Date.parse(stay['schema:startDate']));
    if (!valid) invalid.stays++; return valid;
  });
  const held = stays.filter(s => !s['schema:endDate'] && Date.parse(s['schema:startDate']) <= now.getTime()).map(s => {
    const vehicle = vehicles.get(linked(s, 'robos:vehicle'));
    const activeJobs = openJobs.filter(j => linked(j, 'robos:vehicle') === vehicle['@id']);
    return { stay: s, vehicle, jobs: activeJobs,
      daysHeld: Math.max(0, Math.round((Date.parse(today) - Date.parse(dayAt(s['schema:startDate'], timeZone))) / 86400000)),
      readyForPickup: activeJobs.length > 0 && activeJobs.every(j => j['robos:jobStatus'] === 'ready'),
      pastExpectedDate: validDate(s['robos:expectedReadyOn']) && s['robos:expectedReadyOn'] < today };
  }).sort((a, b) => Date.parse(a.stay['schema:startDate']) - Date.parse(b.stay['schema:startDate']));
  const custody = Object.fromEntries(Object.entries(periods).map(([key, start]) => [key, {
    arrivals: stays.filter(s => inPeriod(dayAt(s['schema:startDate'], timeZone), start)).length,
    departures: stays.filter(s => s['schema:endDate'] && inPeriod(dayAt(s['schema:endDate'], timeZone), start)).length,
  }]));
  const balances = Object.fromEntries(CURRENCIES.map(code => {
    let outstanding = 0n, credit = 0n; let billedJobs = 0;
    for (const job of jobs) {
      if (job['robos:billingCurrency'] !== code || !Number.isSafeInteger(job['robos:billedMinor']) || job['robos:billedMinor'] < 0) continue;
      billedJobs++;
      const net = BigInt(sums(payments.filter(p => linked(p, 'robos:job') === job['@id'] && p['robos:currency'] === code && p['robos:paidOn'] <= today)).netMinor);
      const balance = BigInt(job['robos:billedMinor']) - net;
      if (balance > 0n) outstanding += balance; else credit -= balance;
    }
    return [code, { outstandingMinor: String(outstanding), creditMinor: String(credit), billedJobs }];
  }));
  const technicians = new Map();
  for (const job of openJobs) { const name = job['robos:technician']?.trim() || 'Unassigned'; technicians.set(name, (technicians.get(name) || 0) + 1); }
  const plans = ofType('MaintenanceSchedule').filter(s => s['robos:scheduleStatus'] !== 'completed');
  return { asOf, today, timeZone, currency, periods, money, revenue: money[currency], balances,
    balance: balances[currency], held, heldCount: held.length, readyForPickup: held.filter(h => h.readyForPickup).length,
    pastExpected: held.filter(h => h.pastExpectedDate).length, statuses, openJobs: openJobs.length, completions, custody,
    cycleHours: cycleHours.length ? Math.round(cycleHours.reduce((a, b) => a + b, 0) / cycleHours.length * 10) / 10 : null,
    cycleSamples: cycleHours.length, technicians: [...technicians].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    unbilledJobs: jobs.filter(j => !Number.isSafeInteger(j['robos:billedMinor'])).length,
    overdueMaintenance: plans.filter(s => validDate(s['schema:startDate']) && s['schema:startDate'] < today).length,
    maintenanceDueSoon: plans.filter(s => validDate(s['schema:startDate']) && s['schema:startDate'] >= today && s['schema:startDate'] <= shiftDay(today, 7)).length,
    mileageOnlyPlans: plans.filter(s => !validDate(s['schema:startDate']) && Number.isFinite(s['robos:dueOdometer']) && s['robos:dueOdometer'] >= 0).length,
    daily: Array.from({ length: 7 }, (_, i) => { const date = shiftDay(asOf, i - 6); return { date, ...sums(payments.filter(p => p['robos:currency'] === currency && p['robos:paidOn'] === date)) }; }),
    recentPayments: [...payments].sort((a, b) => b['robos:paidOn'].localeCompare(a['robos:paidOn']) || String(b['robos:recordedAt']).localeCompare(String(a['robos:recordedAt']))).slice(0, 20), invalid };
}
module.exports = { CURRENCIES, JOB_STATES, validDate, validInstant, dayAt, shiftDay, amountMinor, buildReports };

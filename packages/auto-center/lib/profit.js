'use strict';
// Recognition dates, not payment dates. All sums remain exact integer cents.
function buildProfit(nodes, { jobs, today, asOf, periods, currency, validDate, currencies, categories }) {
  const linked = n => n['robos:job']?.['@id'];
  const jobIndex = new Map(jobs.map(j => [j['@id'], j]));
  let invalidEntries = 0;
  const candidates = nodes.filter(n => n['@type'] === 'robos:ShopFinanceEntry').filter(n => {
    const job = linked(n), kind = n['robos:entryKind'];
    const valid = ['sale', 'expense'].includes(kind) && ['charge', 'credit'].includes(n['robos:entryDirection']) &&
      Number.isSafeInteger(n['robos:amountMinor']) && n['robos:amountMinor'] > 0 && currencies.includes(n['robos:currency']) &&
      validDate(n['robos:effectiveOn']) && n['robos:effectiveOn'] <= today && (!job || jobIndex.has(job)) &&
      (kind === 'sale' ? !!job && n['robos:costCategory'] === 'sales' : categories.includes(n['robos:costCategory'])) &&
      (!jobIndex.get(job)?.['robos:billingCurrency'] || jobIndex.get(job)['robos:billingCurrency'] === n['robos:currency']);
    if (!valid) invalidEntries++; return valid;
  });
  const originals = new Map(candidates.filter(n => n['robos:entryDirection'] === 'charge').map(n => [n['@id'], n]));
  const credited = new Map();
  const entries = candidates.sort((a, b) => a['robos:effectiveOn'].localeCompare(b['robos:effectiveOn']) || String(a['robos:recordedAt'] || '').localeCompare(String(b['robos:recordedAt'] || ''))).filter(n => {
    if (n['robos:entryDirection'] === 'charge') return true;
    const original = originals.get(n['robos:creditOf']?.['@id']), amount = BigInt(n['robos:amountMinor']);
    const previous = credited.get(original?.['@id']) || 0n;
    if (!original || linked(original) !== linked(n) || ['robos:entryKind', 'robos:currency', 'robos:costCategory'].some(k => original[k] !== n[k]) ||
      n['robos:effectiveOn'] < original['robos:effectiveOn'] || previous + amount > BigInt(original['robos:amountMinor'])) { invalidEntries++; return false; }
    credited.set(original['@id'], previous + amount); return true;
  }).filter(n => n['robos:effectiveOn'] <= asOf);
  function sum(list) {
    let sales = 0n, costs = 0n, direct = 0n, overhead = 0n;
    const breakdown = Object.fromEntries(categories.map(c => [c, 0n]));
    for (const n of list) {
      const amount = BigInt(n['robos:amountMinor']) * (n['robos:entryDirection'] === 'credit' ? -1n : 1n);
      if (n['robos:entryKind'] === 'sale') sales += amount;
      else { costs += amount; breakdown[n['robos:costCategory']] += amount; if (linked(n)) direct += amount; else overhead += amount; }
    }
    const profit = sales - costs;
    return { salesMinor: String(sales), costsMinor: String(costs), profitMinor: String(profit), directMinor: String(direct), overheadMinor: String(overhead),
      marginPercent: sales > 0n ? Number(profit * 10000n / sales) / 100 : null,
      categories: Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [key, String(value)])) };
  }
  const selected = entries.filter(n => n['robos:currency'] === currency);
  const byPeriod = Object.fromEntries(Object.entries(periods).map(([period, start]) => [period, sum(selected.filter(n => n['robos:effectiveOn'] >= start))]));
  const byJob = jobs.filter(j => j['robos:billingCurrency'] === currency || selected.some(n => linked(n) === j['@id']) || (!j['robos:billingCurrency'] && !entries.some(n => linked(n) === j['@id']))).map(job => {
    const ledger = selected.filter(n => linked(n) === job['@id']);
    return { job, ...sum(ledger), salesEntries: ledger.filter(n => n['robos:entryKind'] === 'sale').length,
      expenseEntries: ledger.filter(n => n['robos:entryKind'] === 'expense').length };
  });
  return { periods: byPeriod, jobs: byJob, categories: byPeriod.month.categories, invalidEntries,
    unrecognizedJobs: byJob.filter(j => j.job['robos:jobStatus'] === 'closed' && !j.salesEntries).length,
    jobsWithoutCosts: byJob.filter(j => !j.expenseEntries).length,
    recentEntries: [...entries].reverse().filter(n => n['robos:currency'] === currency).slice(0, 30) };
}
module.exports = { buildProfit };

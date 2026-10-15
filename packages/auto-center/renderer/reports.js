'use strict';
let reportState, paymentRequestId = window.crypto.randomUUID();
function decimalAmount(minor) { const amount = BigInt(minor); return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`; }
function money(minor, currency) {
  const value = BigInt(minor), amount = value < 0n ? -value : value;
  const symbol = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(0).find(p => p.type === 'currency').value;
  return `${value < 0n ? '−' : ''}${symbol}${(amount / 100n).toLocaleString('en-US')}.${String(amount % 100n).padStart(2, '0')}`;
}
function metric(label, value, note = '') { const c = text('article', '', 'metric'); c.append(text('span', label), text('strong', value), text('small', note)); return c; }
function tableRow(values) { const row = text('tr', ''); values.forEach(v => row.append(text('td', String(v)))); return row; }
function refill(select, nodes, label, value = n => n['@id']) {
  const previous = select.value; select.replaceChildren(...nodes.map(n => { const option = text('option', label(n)); option.value = value(n); return option; }));
  if (nodes.some(n => value(n) === previous)) select.value = previous;
}
async function refreshReports() {
  if (state.mode !== 'shop') { reportState = null; return; }
  const r = await window.auto.reports({ asOf: $('report-date').value || undefined, currency: $('report-currency').value }); reportState = r;
  $('report-date').value = r.asOf; $('report-date').max = r.today;
  $('report-context').textContent = `${r.timeZone} · Monday-start weeks · Week begins ${r.periods.week}; month begins ${r.periods.month}. Live operations are current; payment periods end ${r.asOf}.`;
  $('revenue-cards').replaceChildren(...[['day', 'Payments received this day'], ['week', 'Payments received this week'], ['month', 'Payments received this month']].map(([period, label]) => {
    const m = r.revenue[period]; return metric(label, money(m.netMinor, r.currency), `${money(m.receivedMinor, r.currency)} received · ${money(m.refundedMinor, r.currency)} refunded`);
  }));
  const operationMetrics = [
    metric('Vehicles at the center', r.heldCount, `${r.readyForPickup} ready for pickup · ${r.pastExpected} past expected date`),
    metric('Open repair jobs', r.openJobs, `${r.statuses['awaiting-approval']} awaiting approval · ${r.statuses['in-progress']} in progress`),
    metric('Outstanding billed balance', money(r.balance.outstandingMinor, r.currency), `${r.unbilledJobs} jobs have no charge total recorded`),
    metric('Customer credit', money(r.balance.creditMinor, r.currency), 'Received beyond recorded charge totals'),
    metric('Jobs closed this month', r.completions.month, 'Currently closed jobs with recorded closing times'),
    metric('Average closing turnaround', r.cycleHours === null ? '—' : `${r.cycleHours} h`, `${r.cycleSamples} jobs closed in this month`),
    metric('Average payment this month', r.revenue.month.averageReceiptMinor === null ? '—' : money(r.revenue.month.averageReceiptMinor, r.currency), `${r.revenue.month.receipts} received payments; excludes refunds`),
    metric('Maintenance overdue by date', r.overdueMaintenance, `${r.maintenanceDueSoon} due within seven days`),
  ];
  $('operation-cards').replaceChildren(...operationMetrics.slice(0,4));$('extra-operation-cards').replaceChildren(...operationMetrics.slice(4));
  $('held-cars').replaceChildren(...r.held.map(h => {
    const v = h.vehicle, s = h.stay, c = text('article', '', 'held-car'); c.dataset.vehicle = v['@id'];
    const icon = document.createElement('img'); icon.src = '../icon.svg'; icon.alt = ''; c.append(icon, text('h3', v['dcterms:title']), text('p', [v['schema:modelDate'], v['schema:brand'], v['schema:model']].filter(Boolean).join(' ')));
    c.append(text('p', `Plate: ${v['robos:licensePlate'] || 'Not recorded'} ${v['robos:registrationJurisdiction'] || ''}`), text('p', v['robos:ownerNotes'] || 'No customer notes'),
      text('p', `Checked in ${new Date(s['schema:startDate']).toLocaleString()} · ${h.daysHeld} calendar days`), text('p', `Location: ${s['robos:parkingLocation'] || 'Not recorded'}`));
    if (s['robos:expectedReadyOn']) c.append(text('p', `Expected ready: ${s['robos:expectedReadyOn']}${h.pastExpectedDate ? ' · Past expected date' : ''}`, h.pastExpectedDate ? 'failed' : 'muted'));
    c.append(text('p', h.readyForPickup ? 'Ready for pickup' : h.jobs.length ? `${h.jobs.length} open repair jobs` : 'No open repair jobs', 'status'));
    h.jobs.forEach(j => c.append(text('p', `${j['dcterms:title']} · ${j['robos:jobStatus']} · ${j['robos:technician'] || 'Unassigned'}`, 'muted')));
    if (h.jobs.length) c.append(button('Open repairs', () => { navigate('shop'); [...$('job-list').children].find(el => el.dataset.vehicle === v['@id'])?.scrollIntoView({ block: 'center' }); }));
    const label = text('label', 'Collected at (local; blank means now)'), collected = document.createElement('input'); collected.type = 'datetime-local'; collected.setAttribute('aria-label', 'Collection time'); label.append(collected); c.append(label);
    c.append(button('Record vehicle collected', async () => { const checkedOutAt = collected.value ? new Date(collected.value).toISOString() : undefined; await window.auto.checkOut({ id: s['@id'], checkedOutAt }); await refresh(); message('Vehicle checked out and committed to private shop history.'); })); return c;
  }));
  if (!r.held.length) $('held-cars').append(text('p', 'No vehicles are currently checked in. Register a customer vehicle, then use check-in below or check it in during job intake.', 'empty-state'));
  const totalJobs = Object.values(r.statuses).reduce((a, b) => a + b, 0);
  $('status-report').replaceChildren(...Object.entries(r.statuses).map(([name, count]) => { const row = text('div', '', 'status-bar'); row.append(text('span', name), text('b', count)); const progress = document.createElement('progress'); progress.max = Math.max(1, totalJobs); progress.value = count; progress.setAttribute('aria-label', `${name}: ${count} jobs`); row.append(progress); return row; }));
  $('technician-report').replaceChildren(...r.technicians.map(t => text('p', `${t.name} · ${t.count} open jobs`)));
  if (!r.technicians.length) $('technician-report').append(text('p', 'No open jobs.'));
  $('flow-report').replaceChildren(...Object.entries(r.custody).map(([key, value]) => tableRow([key, value.arrivals, value.departures, r.completions[key]])));
  $('maintenance-report').replaceChildren(text('p', `${r.overdueMaintenance} overdue plans by date · ${r.maintenanceDueSoon} due within seven days. ${r.mileageOnlyPlans} mileage-only plans need an odometer check.`));
  const issues=[];if(r.invalid.closedJobsWithoutTimestamp)issues.push(`${r.invalid.closedJobsWithoutTimestamp} closed jobs lack a closing time and are excluded from period/turnaround counts.`);if(r.invalid.payments||r.invalid.stays)issues.push(`${r.invalid.payments} invalid payment records and ${r.invalid.stays} invalid stays excluded; review the shop records.`);$('report-quality').textContent=issues.join(' ');$('report-quality').hidden=!issues.length;
  $('daily-revenue').replaceChildren(...r.daily.map(d => tableRow([d.date, money(d.receivedMinor, r.currency), money(d.refundedMinor, r.currency), money(d.netMinor, r.currency)])));
  const jobs = state.records.filter(n => n['@type'] === 'robos:RepairOrder'), vehicles = new Map(state.records.filter(n => n['@type'] === 'robos:OwnedVehicle').map(n => [n['@id'], n]));
  const jobLabel = j => `${j['dcterms:title']} · ${vehicles.get(j['robos:vehicle']?.['@id'])?.['dcterms:title'] || 'Vehicle not found'}`;
  refill($('payment-job'), jobs, jobLabel);
  const receipts = state.records.filter(n => n['@type'] === 'robos:ShopPayment' && n['robos:paymentDirection'] === 'received');
  refill($('refund-original'), receipts, p => `${p['robos:paidOn']} · ${money(p['robos:amountMinor'], p['robos:currency'])} · ${jobs.find(j => j['@id'] === p['robos:job']?.['@id'])?.['dcterms:title'] || ''}`);
  selectPaymentJob();
  if (!$('payment-date').value) $('payment-date').value = r.today; $('payment-date').max = r.today;
  $('recent-payments').replaceChildren(...r.recentPayments.map(p => tableRow([p['robos:paidOn'], jobs.find(j => j['@id'] === p['robos:job']?.['@id'])?.['dcterms:title'] || '', p['robos:paymentDirection'], `${p['robos:currency']} ${money(p['robos:amountMinor'], p['robos:currency'])}`, p['robos:paymentMethod']])));
}
$('report-filters').onsubmit = e => { e.preventDefault(); safely(refreshReports); };
$('check-in-form').onsubmit = e => { e.preventDefault(); safely(async () => { const data = Object.fromEntries(new FormData(e.target)); if (data.checkedInAt) data.checkedInAt = new Date(data.checkedInAt).toISOString(); await window.auto.checkIn(data); e.target.reset(); await refresh(); message('Vehicle checked in and committed to private shop history.'); }); };
function selectRefund() {
  const refund = $('payment-direction').value === 'refund'; $('refund-picker').hidden = !refund;
  if (refund) { const original = state.records.find(n => n['@id'] === $('refund-original').value); if (original) { $('payment-job').value = original['robos:job']['@id']; $('payment-form').elements.currency.value = original['robos:currency']; } }
}
function selectPaymentJob(){if($('payment-direction').value!=='received')return;const job=state.records.find(n=>n['@id']===$('payment-job').value);const previous=state.records.find(p=>p['@type']==='robos:ShopPayment'&&p['robos:job']?.['@id']===job?.['@id']);$('payment-form').elements.currency.value=job?.['robos:billingCurrency']||previous?.['robos:currency']||$('report-currency').value;}
$('payment-job').onchange=selectPaymentJob;
$('payment-direction').onchange = selectRefund; $('refund-original').onchange = selectRefund;
$('payment-form').onsubmit = e => {
  e.preventDefault(); const submit = e.target.querySelector('button'); if (submit.disabled) return; submit.disabled = true;
  safely(async () => { try { await window.auto.recordPayment({ ...Object.fromEntries(new FormData(e.target)), requestId: paymentRequestId }); paymentRequestId = window.crypto.randomUUID(); e.target.reset(); $('refund-picker').hidden = true; await refresh(); message('Transaction recorded and committed to private shop history.'); } finally { submit.disabled = false; } });
};

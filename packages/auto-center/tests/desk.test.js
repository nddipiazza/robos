'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { AutoCenter } = require('../lib/service');
function shop() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-desk-')); const s = new AutoCenter({ root: path.join(dir, 'c'), privateRoot: path.join(dir, 'p') }); s.setMode('shop');
  const W = (a, i) => s.workshop(a, i); return { s, W };
}
function ticket(W, extra = {}) {
  const c = W('registerCustomer', { name: 'Sam Rivera', phone: '(555) 010-0100', email: 'sam@example.com' });
  const v = W('addCustomerVehicle', { customer: c['@id'], name: '2015 Toyota Camry', year: '2015', make: 'Toyota', model: 'Camry' });
  const t = W('addTeammate', { name: 'Maria Lopez', role: 'Technician' });
  const { job } = W('intakeRepair', { vehicle: v['@id'], channel: 'phone call', category: 'brakes', answers: { symptom: ['Grinding'], when: 'Every time I brake' }, ...extra });
  return { c, v, t, job: job['@id'] };
}
test('customers are found by phone digits, email and name; contact details are required', () => {
  const { W } = shop(); const { c } = ticket(W);
  assert.equal(W('findCustomers', { query: '5550100' })[0].name, 'Sam Rivera');
  assert.equal(W('findCustomers', { query: '(555) 010' }).length, 1);
  assert.equal(W('findCustomers', { query: 'sam@ex' }).length, 1);
  assert.equal(W('findCustomers', { query: 'sam riv' })[0].vehicles.length, 1);
  assert.equal(W('findCustomers', { query: 'zzz' }).length, 0);
  assert.throws(() => W('registerCustomer', { name: 'No Contact' }), /phone number or an email/);
  assert.throws(() => W('registerCustomer', { name: 'Dup', phone: '555-010-0100' }), /already belongs to Sam Rivera/);
  assert.throws(() => W('registerCustomer', { name: 'Short', phone: '123' }), /area code/);
});
test('intake validates the channel, category and answers against the KGraph form', () => {
  const { W } = shop(); const { v } = ticket(W);
  const base = { vehicle: v['@id'] };
  assert.throws(() => W('intakeRepair', { ...base, channel: 'carrier pigeon', category: 'brakes' }), /how the customer contacted/);
  assert.throws(() => W('intakeRepair', { ...base, channel: 'email', category: 'nope' }), /what the problem is about/);
  assert.throws(() => W('intakeRepair', { ...base, channel: 'email', category: 'brakes', answers: { symptom: ['Made up'] } }), /not a choice/);
  assert.throws(() => W('intakeRepair', { ...base, channel: 'email', category: 'brakes', answers: { when: ['Only cold', 'Only at low speed'] } }), /Choose one answer/);
  assert.throws(() => W('intakeRepair', { ...base, channel: 'email', category: 'brakes' }), /already has an open repair/);
});
test('unsafe answers mark the ticket urgent and keep the intake answers', () => {
  const { W } = shop(); const c = W('registerCustomer', { name: 'A B', email: 'a@b.co' });
  const v = W('addCustomerVehicle', { customer: c['@id'], name: 'Car', year: '2015', make: 'Honda', model: 'Civic' });
  W('intakeRepair', { vehicle: v['@id'], channel: 'text message', category: 'brakes', answers: { urgency: 'Emergency or unsafe', warning: ['ABS'] } });
  const j = W('board').jobs[0]; assert.equal(j.priority, 'urgent'); assert.equal(j.channel, 'text message'); assert.ok(j.intake.answers.some(a => a.question.includes('warning lights')));
});
test('bench: part requests, timers and finishing are guarded', () => {
  const { s, W } = shop(); const { t, job } = ticket(W);
  W('claimTicket', { job, teammate: t['@id'] });
  const r = W('requestPart', { job, teammate: t['@id'], name: 'Front brake pads', quantity: 1 });
  const spare = W('requestPart', { job, teammate: t['@id'], name: 'Spare', quantity: 1 }); W('updatePartRequest', { id: spare['@id'], status: 'cancelled' });
  assert.throws(() => W('updatePartRequest', { id: spare['@id'], status: 'ordered' }), /cancelled part request cannot become ordered/);
  assert.throws(() => W('startTimer', { job, teammate: t['@id'] }), /not open for work/);
  const e = W('createEstimate', { job, lines: [{ type: 'part', description: 'Pads', quantity: 1, unitPrice: '60.00' }, { type: 'labor', description: 'Fit', hours: 1, rate: '100.00' }] });
  W('decideEstimate', { estimate: e['@id'], decision: 'approved', approvedBy: 'Sam', channel: 'phone' });
  W('startTimer', { job, teammate: t['@id'] });
  assert.throws(() => W('startTimer', { job, teammate: t['@id'] }), /already have a timer/);
  assert.throws(() => W('completeWork', { job, teammate: t['@id'], summary: 'done' }), /running timer/);
  s.clock = () => new Date(Date.now() + 5 * 60000); assert.equal(W('stopTimer', { job, teammate: t['@id'] }).minutes, 5);
  s.clock = () => new Date();
  assert.throws(() => W('completeWork', { job, teammate: t['@id'], summary: 'done' }), /still on order/);
  W('updatePartRequest', { id: r['@id'], status: 'ordered', supplier: 'NAPA' }); W('updatePartRequest', { id: r['@id'], status: 'received', unitCost: '30.00' });
  W('addWorkNote', { job, teammate: t['@id'], kind: 'recommendation', text: 'Rotors worn' }); assert.equal(W('board').jobs[0].needsApproval, 'Rotors worn');
  W('completeWork', { job, teammate: t['@id'], summary: 'Replaced pads' });
  const j = W('board').jobs[0]; assert.equal(j.workComplete, true); assert.equal(j.needsApproval, ''); assert.equal(j.summary.partsCost, 3000);
});
test('admin: teammates can be edited and only deactivated when free; settings save', () => {
  const { W } = shop(); const { t, job } = ticket(W);
  W('updateTeammate', { id: t['@id'], role: 'Master technician', hourlyCost: '31.50' });
  assert.equal(W('board').teammates[0].hourlyCost, 3150);
  W('claimTicket', { job, teammate: t['@id'] });
  assert.throws(() => W('updateTeammate', { id: t['@id'], active: false }), /assigned to 1 open ticket/);
  assert.throws(() => W('updateTeammate', { id: t['@id'] }), /Nothing to change/);
  W('saveSettings', { name: 'Lopez Auto', phone: '555', currency: 'USD', defaultRate: '110.00' });
  W('saveSettings', { name: 'Lopez Auto Repair', currency: 'USD' });
  assert.equal(W('board').settings.name, 'Lopez Auto Repair');
  assert.throws(() => W('saveSettings', { name: '' }), /Shop name is required/);
});
test('contacts are logged on the ticket', () => {
  const { W } = shop(); const { job } = ticket(W);
  W('logContact', { job, channel: 'text message', direction: 'outgoing', note: 'Sent estimate' });
  assert.ok(W('board').jobs[0].workItem.some(e => e.detail.includes('We contacted the customer by text message: Sent estimate')));
  assert.throws(() => W('logContact', { job, channel: 'fax', note: 'x' }), /how you reached/);
});

'use strict';
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function addTeammate(w, name, role, person, cost) {
  await w.drawer('ws-teammate-drawer');
  await w.fill('#teammate-form', { name, role, ...(person ? { personId: person } : {}), ...(cost ? { hourlyCost: cost } : {}) });
  await w.submit('#teammate-form');
}
async function addCustomer(w, name, extra = {}) { await w.drawer('ws-customer-drawer'); await w.fill('#customer-form', { name, ...extra }); await w.submit('#customer-form'); }
async function addVehicle(w, name, customer, v = {}) { await w.drawer('ws-vehicle-drawer'); await w.fill('#wvehicle-form', { customer, name, ...v }); await w.submit('#wvehicle-form'); }
async function takeIn(w, vehicle, concern, extra = {}) {
  await w.drawer('ws-intake-drawer'); await w.fill('#intake-form', { vehicle, concern, ...extra }); await w.submit('#intake-form');
  const t = w.page.locator('article.ticket', { hasText: concern }).first();
  if (!w.lastMessage) { await t.waitFor({ timeout: 8000 }); w.ticket = await t.getAttribute('data-key'); w.focus = `article.ticket[data-key="${w.ticket}"]`; }
}
const T = w => w.ticketEl();
// ---- team and customers
Given('the shop team has {string} as {string}', async function (name, role) { await addTeammate(this, name, role); assert.equal(this.lastMessage, ''); });
Given('the shop team has {string} as {string} linked to the RobOS person {string}', async function (name, role, p) { await addTeammate(this, name, role, p); assert.equal(this.lastMessage, ''); });
When('I add the teammate {string} as {string}', async function (n, r) { await addTeammate(this, n, r); });
When('I add the teammate {string} as {string} linked to the RobOS person {string}', async function (n, r, p) { await addTeammate(this, n, r, p); });
When('I add the teammate {string} as {string} with an hourly cost of {string}', async function (n, r, c) { await addTeammate(this, n, r, null, c); });
Given('the customer {string} is on file', async function (name) { await addCustomer(this, name); assert.equal(this.lastMessage, ''); });
When('I add the customer {string}', async function (name) { await addCustomer(this, name); });
When('I add the customer {string} with phone {string} and email {string}', async function (n, phone, email) { await addCustomer(this, n, { phone, email }); });
When('I add the customer {string} linked to the RobOS user {string} and the group {string}', async function (n, user, group) { await addCustomer(this, n, { userId: user, groupId: group }); });
When('I add the customer {string} with the email {string}', async function (n, email) { await addCustomer(this, n, { email }); });
Given('{string} has the vehicle {string}', async function (customer, name) { await addVehicle(this, name, customer, { year: '2015', make: 'Toyota', model: 'Camry' }); assert.equal(this.lastMessage, ''); });
When('I add the vehicle {string} for {string} — a {int} {word} {word}', async function (name, customer, year, make, model) { await addVehicle(this, name, customer, { year: String(year), make, model }); });
When('I add the vehicle {string} for {string} with the VIN {string}', async function (name, customer, vin) { await addVehicle(this, name, customer, { vin }); });
Then('I am told {string}', async function (text) { await this.page.waitForFunction(t => document.querySelector('#message').textContent.includes(t), text, { timeout: 8000 }).catch(async () => assert.fail(`Expected message containing "${text}" but saw "${await this.page.locator('#message').innerText()}"`)); this.focus = '#message'; });
Then('the team roster lists {string}', async function (text) { await this.page.locator('#ws-team').filter({ hasText: text }).waitFor({ timeout: 8000 }); this.focus = '#ws-team'; });
Then('the team roster does not list {string} twice', async function (name) { const rows = await this.page.locator('#ws-team .roster-row').allInnerTexts(); assert.equal(rows.filter(r => r.startsWith(name)).length, 1); this.focus = '#ws-team'; });
Then('the customer list shows {string}', async function (text) { await this.page.locator('#ws-customers').filter({ hasText: text }).waitFor({ timeout: 8000 }); this.focus = '#ws-customers'; });
Then('the customer list does not show {string}', async function (text) { assert.ok(!(await this.page.locator('#ws-customers').innerText()).includes(text)); this.focus = '#ws-customers'; });
// ---- intake
When('I take in {string} with the concern {string}', async function (v, c) { await takeIn(this, v, c); });
When('I take in {string} with the concern {string}, odometer {string} and parking bay {string}', async function (v, c, odo, bay) { await takeIn(this, v, c, { odometer: odo, location: bay }); });
Given('{string} is taken in with the concern {string}', async function (v, c) { await takeIn(this, v, c); assert.equal(this.lastMessage, ''); assert.ok(this.ticket); });
Then('a repair ticket {string} is open at {string}', async function (key, stage) { const t = this.ticketEl(key); await t.waitFor({ timeout: 8000 }); assert.equal((await t.locator('.stage-bar li.current').innerText()).trim(), stage); this.ticket = key; this.focus = `article.ticket[data-key="${key}"]`; });
Then('the ticket is at {string}', async function (stage) { await T(this).locator('.stage-bar li.current', { hasText: stage }).waitFor({ timeout: 8000 }); this.focus = `article.ticket[data-key="${this.ticket}"]`; });
Then('the pipeline shows {int} at {string}', async function (n, stage) { const step = this.page.locator('#ws-pipeline .pipe-step', { hasText: stage }); assert.equal((await step.locator('b').innerText()).trim(), String(n)); this.focus = '#ws-pipeline'; });
Then('{string} is on the shop floor', async function (vehicle) { await this.page.locator('[data-view="reports"]').click(); await this.page.locator('[aria-label="Refresh reports"]').click(); await this.page.locator('#held-cars').filter({ hasText: vehicle }).waitFor({ timeout: 8000 }); this.focus = '#held-cars'; this.afterShot = async () => { await this.page.locator('[data-view="workshop"]').click(); }; });
// ---- diagnosis and estimate
When('I record the diagnosis {string}', async function (findings) { this.focus = `#diag-${this.ticket}`; await this.page.locator(`#diag-${this.ticket} [name="findings"]`).fill(findings); await this.page.locator(`#diag-${this.ticket} button`).click(); await wait(500); });
When('I record the diagnosis {string} with the trouble code {string}', async function (findings, code) { await this.page.locator(`#diag-${this.ticket} [name="codes"]`).fill(code); await this.page.locator(`#diag-${this.ticket} [name="findings"]`).fill(findings); await this.page.locator(`#diag-${this.ticket} button`).click(); await wait(500); });
Given('the diagnosis {string} is recorded', async function (f) { await this.page.locator(`#diag-${this.ticket} [name="findings"]`).fill(f); await this.page.locator(`#diag-${this.ticket} button`).click(); await T(this).locator('.stage-bar li.current', { hasText: 'Diagnosis' }).waitFor(); });
async function sendEstimate(w, rows) {
  const form = T(w).locator('form.estimate-form'); w.focus = `article.ticket[data-key="${w.ticket}"] form.estimate-form`;
  const used = { part: 0, labor: 0 };
  for (const r of rows) {
    const type = r.type; let lines = form.locator(`.est-line[data-type="${type}"]`);
    if (used[type] >= await lines.count()) { await form.locator(`[data-add="${type}"]`).click(); lines = form.locator(`.est-line[data-type="${type}"]`); }
    const line = lines.nth(used[type]++);
    await line.locator('[name="description"]').fill(r.description);
    await line.locator(type === 'part' ? '[name="quantity"]' : '[name="hours"]').fill(r.amount);
    await line.locator('[name="price"]').fill(r.price);
  }
  await form.locator('button').last().click(); await wait(600); w.lastMessage = (await w.page.locator('#message').innerText()).trim();
}
const rowsOf = t => t.hashes().map(h => ({ type: h.type, description: h.description, amount: h.quantity_or_hours, price: h.price }));
When('I send an estimate with:', async function (table) { await sendEstimate(this, rowsOf(table)); });
Given('an estimate with:', async function (table) { await sendEstimate(this, rowsOf(table)); assert.equal(this.lastMessage, ''); });
When('I send an estimate with a blank line description', async function () { await sendEstimate(this, [{ type: 'part', description: '', amount: '1', price: '10.00' }, { type: 'labor', description: 'Labor', amount: '1', price: '100.00' }]); });
async function decide(w, how, channel) { const f = T(w).locator('form.decision'); w.focus = `article.ticket[data-key="${w.ticket}"] [data-panel="estimate"]`; await f.locator('[name="channel"]').selectOption({ label: channel }); await f.locator(`[data-decision="${how}"]`).click(); await wait(600); }
When('the customer approves the estimate by {word}', async function (c) { await decide(this, 'approved', c === 'phone' ? 'Phone' : c === 'email' ? 'Email' : c === 'text' ? 'Text message' : 'In person'); });
When('the customer declines the estimate by {word}', async function (c) { await decide(this, 'declined', c === 'phone' ? 'Phone' : c === 'email' ? 'Email' : c === 'text' ? 'Text message' : 'In person'); });
Given('the customer approved the estimate by {word}', async function (c) { await decide(this, 'approved', c === 'phone' ? 'Phone' : c === 'email' ? 'Email' : 'In person'); await T(this).locator('.stage-bar li.current', { hasText: 'Repair in progress' }).waitFor(); });
Then('the estimate shows {string}', async function (text) { await T(this).locator('[data-panel="estimate"]').filter({ hasText: text }).waitFor({ timeout: 8000 }); this.focus = `article.ticket[data-key="${this.ticket}"] [data-panel="estimate"]`; });
// ---- repair work
When('I record {int} x {string} costing {string} each', async function (qty, name, cost) { const f = `#part-${this.ticket}`; this.focus = `article.ticket[data-key="${this.ticket}"] [data-panel="parts"]`; await this.page.locator(`${f} [name="name"]`).fill(name); await this.page.locator(`${f} [name="quantity"]`).fill(String(qty)); await this.page.locator(`${f} [name="unitCost"]`).fill(cost); await this.page.locator(`${f} button`).click(); await wait(600); });
When('{string} logs {string} hours', async function (mate, hours) { const f = `#hours-${this.ticket}`; this.focus = `article.ticket[data-key="${this.ticket}"] [data-panel="hours"]`; await this.pick(this.page.locator(`${f} [name="teammate"]`), mate); await this.page.locator(`${f} [name="hours"]`).fill(hours); await this.page.locator(`${f} button`).click(); await wait(600); this.lastMessage = (await this.page.locator('#message').innerText()).trim(); });
Then('the ticket shows {string}', async function (text) { await T(this).locator('.job-summary').filter({ hasText: text }).waitFor({ timeout: 8000 }); this.focus = `article.ticket[data-key="${this.ticket}"] .job-summary`; });
// ---- billing
When('I issue the invoice', async function () { this.focus = `article.ticket[data-key="${this.ticket}"] [data-panel="invoice"]`; await this.page.locator(`#invoice-${this.ticket} button`).click(); await wait(700); this.lastMessage = (await this.page.locator('#message').innerText()).trim(); });
When('the customer pays {string} by {word}', async function (amount, method) { const f = `#pay-${this.ticket}`; this.focus = `article.ticket[data-key="${this.ticket}"] [data-panel="payment"]`; await this.page.locator(`${f} [name="amount"]`).fill(amount); await this.page.locator(`${f} [name="method"]`).selectOption(method); await this.page.locator(`${f} button`).click(); await wait(700); });
When('the customer pays the remaining balance by {word}', async function (method) { const f = `#pay-${this.ticket}`; this.focus = `article.ticket[data-key="${this.ticket}"] [data-panel="payment"]`; await this.page.locator(`${f} [name="method"]`).selectOption(method); await this.page.locator(`${f} button`).click(); await wait(700); });
When('I return the vehicle to {string}', async function (name) { const f = `#return-${this.ticket}`; this.focus = `article.ticket[data-key="${this.ticket}"] [data-panel="payment"]`; await this.page.locator(`${f} [name="collectedBy"]`).fill(name); await this.page.locator(`${f} button`).click(); await wait(800); this.lastMessage = (await this.page.locator('#message').innerText()).trim(); });
Then('the payment panel shows {string}', async function (text) { await T(this).locator('[data-panel="payment"]').filter({ hasText: text }).waitFor({ timeout: 8000 }); this.focus = `article.ticket[data-key="${this.ticket}"] [data-panel="payment"]`; });
// ---- ticket history and backups
Then('the ticket history includes {string}', async function (text) { const d = T(this).locator('details', { hasText: 'Ticket history' }); if (!(await d.getAttribute('open') === '')) await d.locator('summary').click(); await d.locator('.timeline').filter({ hasText: text }).waitFor({ timeout: 8000 }); this.focus = `article.ticket[data-key="${this.ticket}"] .timeline`; });
Then('the backup history contains {string}', async function (text) { const log = this.gitLog(); assert.ok(log.includes(text), `Backup history lacks "${text}":\n${log}`); });
When('I reload the app', async function () { await this.page.reload(); await this.page.waitForFunction(() => document.querySelector('#count')?.textContent.includes('graph entries')); await this.page.locator('[data-view="workshop"]').click(); await this.page.locator('#ws-pipeline .pipe-step').first().waitFor(); });

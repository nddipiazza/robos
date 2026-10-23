'use strict';
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const wait = ms => new Promise(r => setTimeout(r, ms));
const TW = '#tow', AD = '#admin', CO = '#checkout', FD = '#frontdesk';
async function go(w, view, sel) { await w.page.locator(`[data-view="${view}"]`).click(); await w.page.locator(`${sel} h2, ${sel} .notice`).first().waitFor({ timeout: 8000 }); w.area = sel; w.focus = sel; }
const press = async (w, label, scope) => { await w.page.locator(`${scope} button`, { hasText: label }).last().click(); await wait(700); w.lastMessage = (await w.page.locator('#message').innerText()).trim(); };
const choose = async (w, text, scope = TW) => { await w.page.locator(`${scope} .choice`, { hasText: text }).first().click(); await wait(350); };
const chip = async (w, text, scope = TW) => { await w.page.locator(`${scope} .chip`, { hasText: text }).first().click(); await wait(300); };
const fill = async (w, name, value, scope = TW) => { await w.page.locator(`${scope} [name="${name}"]`).first().fill(value); };
const next = async w => { await w.page.locator(`${TW} .wizard-nav .big-btn`).last().click(); await wait(800); w.lastMessage = (await w.page.locator('#message').innerText()).trim(); };
const card = (w, key = w.towKey || 'TW-0001') => w.page.locator(`${TW} article.tow-card[data-key="${key}"]`);
async function adminTowTab(w) { await go(w, 'admin', AD); await w.page.locator(`${AD} .tabs button`, { hasText: 'Tow trucks' }).click(); await w.page.locator('#admin-truck-form').waitFor(); }
async function pickOption(select, label) { const opts = await select.locator('option').allInnerTexts(); const hit = opts.find(o => o.startsWith(label)); if (!hit) throw new Error(`No option "${label}" in [${opts.join(' | ')}]`); await select.selectOption({ label: hit }); }
// ---- setup
// "We do towing" and friends: tick the service in Admin → Services.
Given('the shop offers {string}', async function (offer) {
  await go(this, 'admin', AD); await this.page.locator(`${AD} .tabs button`, { hasText: 'Services' }).click();
  const box = this.page.locator(`${AD} input[data-service][aria-label="${offer}"]`); await box.waitFor({ timeout: 6000 });
  if (!(await box.isChecked())) { await box.check(); await this.page.waitForFunction(o => document.querySelector('#message').textContent.includes(o + ': turned on'), offer, { timeout: 8000 }); }
  // Back to where setup steps add the team and customers.
  await this.page.locator('[data-view="workshop"]').click(); await this.page.locator('#ws-pipeline .pipe-step').first().waitFor();
});
Given('the tow desk has the truck {string} as a {string}', async function (name, type) {
  await adminTowTab(this); await fill(this, 'name', name, '#admin-truck-form'); await pickOption(this.page.locator('#admin-truck-form [name="truckType"]'), type);
  await press(this, 'Add truck', AD); assert.equal(this.lastMessage, 'Truck added.');
});
Given('the tow rates are hook-up {string}, per mile {string} after {string} miles, roadside {string}', async function (hookup, perMile, included, roadside) {
  await adminTowTab(this); for (const [k, v] of Object.entries({ hookup, perMile, includedMiles: included, roadside })) await fill(this, k, v, '#admin-tow-rates-form');
  await press(this, 'Save tow rates', AD); assert.equal(this.lastMessage, 'Tow rates saved.');
});
Then('the tow trucks list {string}', async function (text) { await this.page.locator(`${AD} [data-truck]`, { hasText: text }).first().waitFor({ timeout: 6000 }); this.focus = '#admin-tow-rates-form'; });
// ---- taking a call
Given('I am at the tow desk', async function () { await go(this, 'tow', TW); });
When('I take a tow call', async function () { await choose(this, 'Take a tow or roadside call'); });
When('the caller is the existing customer {string} found by {string}', async function (name, query) {
  await choose(this, 'Existing customer'); await fill(this, 'lookup', query); await wait(600);
  await this.page.locator('#tow-customer-results .choice', { hasText: name }).first().click(); await wait(300); this.focus = '#tow-customer-results';
});
When('I go on at the tow desk', async function () { await next(this); });
When('I choose the vehicle {string} at the tow desk', async function (name) { await choose(this, name); });
When('the caller needs {string}', async function (service) { await choose(this, service); });
When('I answer the tow question {string} with {string}', async function (q, answer) { await this.page.locator(`${TW} .q-block`, { hasText: q }).locator('.chip', { hasText: answer }).first().click(); await wait(250); this.focus = `${TW} .q-block:has-text("${q}")`; });
When('the vehicle is at {string}', async function (where) { await fill(this, 'pickupAddress', where); });
When('it is going to {string} about {string} miles away', async function (dest, miles) { await chip(this, dest); await fill(this, 'estimatedMiles', miles); });
When('the motor club {string} pays with authorization {string}', async function (name, auth) { await chip(this, 'Motor club'); await fill(this, 'billToName', name); await fill(this, 'authorization', auth); });
When('it is not an after-hours call', async function () { const c = this.page.locator(`${TW} .chip`, { hasText: 'After-hours call' }); if ((await c.getAttribute('aria-pressed')) === 'true') { await c.click(); await wait(500); } });
Then('the quote is {string}', async function (total) { await this.page.locator('#tow-quote .total', { hasText: total }).waitFor({ timeout: 6000 }); this.focus = '#tow-quote'; });
Then('the tow desk warns {string}', async function (text) { await this.page.locator(`${TW} .notice.warn`, { hasText: text }).first().waitFor({ timeout: 6000 }); this.focus = `${TW} .notice.warn`; });
When('I take the call', async function () { await press(this, 'Take the call', TW); });
Then('the tow desk says {string}', async function (text) { await this.page.locator(TW).filter({ hasText: text }).first().waitFor({ timeout: 8000 }); this.focus = `${TW} .notice`; });
// The whole call in one step, for scenarios about what happens after it.
async function quickCall(w, vehicle, where, answers) {
  const customer = vehicle.split(' — ')[1];
  await go(w, 'tow', TW); await choose(w, 'Take a tow or roadside call'); await choose(w, 'Existing customer'); await fill(w, 'lookup', customer.split(' ')[0]); await wait(600);
  await w.page.locator('#tow-customer-results .choice', { hasText: customer }).first().click(); await next(w); await choose(w, vehicle); await next(w);
  await choose(w, 'Tow'); for (const [q, a] of answers) await w.page.locator(`${TW} .q-block`, { hasText: q }).locator('.chip', { hasText: a }).first().click();
  await next(w); await fill(w, 'pickupAddress', where); await fill(w, 'estimatedMiles', '12'); await next(w); await press(w, 'Take the call', TW);
  await w.page.locator(TW).filter({ hasText: 'is waiting for a truck' }).waitFor({ timeout: 8000 });
  await go(w, 'tow', TW); w.towKey = 'TW-0001';
}
Given('a tow call for {string} is taken at {string}', async function (vehicle, where) { await quickCall(this, vehicle, where, [['Why does it need a tow', 'Broke down'], ['Do all four wheels', 'Yes'], ['all-wheel', 'No, two-wheel drive']]); });
Given('a tow call for the all-wheel-drive {string} is taken at {string}', async function (vehicle, where) { await quickCall(this, vehicle, where, [['Why does it need a tow', 'Broke down'], ['all-wheel', 'Yes, AWD or 4x4']]); });
// ---- dispatch board
When('I dispatch {string} with {string} arriving in {string} minutes', async function (truck, driver, eta) {
  const c = card(this); await pickOption(c.locator('[name="truck"]'), truck); await pickOption(c.locator('[name="driver"]'), driver); await c.locator('[name="eta"]').fill(eta);
  this.focus = `${TW} article.tow-card[data-key="${this.towKey}"]`; await c.locator('button', { hasText: 'Dispatch' }).click(); await wait(800); this.lastMessage = (await this.page.locator('#message').innerText()).trim();
});
const onCard = async (w, label) => { w.focus = `${TW} article.tow-card[data-key="${w.towKey}"]`; await card(w).locator('button', { hasText: label }).click(); await wait(800); w.lastMessage = (await w.page.locator('#message').innerText()).trim(); };
When('the driver is at the vehicle', async function () { await onCard(this, 'Driver is at the vehicle'); });
When('the driver notes {string} and loads the vehicle', async function (condition) { await card(this).locator('[name="condition"]').fill(condition); await onCard(this, 'Vehicle is on the truck'); });
When('the vehicle is dropped off after {string} miles at {string}', async function (miles, spot) { await card(this).locator('[name="miles"]').fill(miles); await card(this).locator('[name="location"]').fill(spot); await onCard(this, 'Dropped off'); });
When('the roadside service is done', async function () { await onCard(this, 'Service done'); });
Then('tow {string} is under {string}', async function (key, section) { await this.page.locator(`${TW} [data-section="${section}"] article.tow-card[data-key="${key}"]`).waitFor({ timeout: 8000 }); this.focus = `${TW} article.tow-card[data-key="${key}"]`; });
Then('the truck {string} shows {string}', async function (truck, text) { await this.page.locator(`${TW} .tow-truck[data-truck="${truck}"]`, { hasText: text }).waitFor({ timeout: 6000 }); this.focus = `${TW} .tow-fleet`; });
// ---- billing
When('I invoice the tow at checkout', async function () { await card(this).locator('button', { hasText: 'Invoice at Checkout' }).click(); await this.page.locator(`${CO} [data-step="Tow invoice"]`).waitFor({ timeout: 8000 }); this.focus = CO; });
When('I issue the tow invoice', async function () { await press(this, 'Issue tow invoice', CO); this.focus = CO; });
When('I close the tow call', async function () { await press(this, 'Close tow call', CO); this.focus = CO; });
// ---- front desk
When('I send our tow truck from {string}', async function (where) { await chip(this, 'Yes, send our truck', FD); await fill(this, 'towPickup', where, FD); await fill(this, 'towMiles', '8', FD); this.focus = `${FD} [data-question="send-tow"]`; });
When('I dispatch the tow truck from the front desk', async function () { await choose(this, 'Dispatch the tow truck', FD); await this.page.locator(`${TW} h2`).first().waitFor({ timeout: 8000 }); this.towKey = 'TW-0001'; this.focus = TW; });

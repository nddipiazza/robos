'use strict';
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const wait = ms => new Promise(r => setTimeout(r, ms));
const OR = '#orders';
const msg = async w => { await wait(700); w.lastMessage = (await w.page.locator('#message').innerText()).trim(); };
async function go(w) { await w.page.locator('[data-view="orders"]').click(); await w.page.locator(`${OR} .ro-tabs`).waitFor({ timeout: 8000 }); w.area = OR; w.focus = OR; }
async function tab(w, name) { await w.page.locator(`${OR} [data-ro-tab]`, { hasText: name }).first().click(); await wait(500); w.focus = OR; }
const order = (w, number) => w.page.locator(`${OR} article.ro-order[data-order="${number}"]`);
async function fillForm(form, values) { for (const [k, v] of Object.entries(values)) { const c = form.locator(`[name="${k}"]`).first(); if ((await c.evaluate(e => e.tagName)) === 'SELECT') await c.selectOption({ label: v }); else await c.fill(v); } }
async function addItem(w, name, { sku = '', onHand, reorder, qty, cost = '', supplier }) {
  await tab(w, 'Stock'); const d = w.page.locator(`${OR} .ro-drawer`).last(); if ((await d.getAttribute('open')) === null) await d.locator('summary').click();
  const f = w.page.locator(`${OR} [data-ro="add-item"]`); await fillForm(f, { name, sku, onHand, reorderPoint: reorder, reorderQty: qty, unitCost: cost, supplier });
  w.focus = `${OR} [data-ro="add-item"]`; await f.locator('button', { hasText: 'Add stock item' }).click(); await msg(w);
}
Given('I am at orders', async function () { await go(this); });
When('I open the {string} orders tab', async function (name) { await tab(this, name); });
Given('the supplier {string} is on file', async function (name) {
  await go(this); await tab(this, 'Suppliers'); const f = this.page.locator(`${OR} [data-ro="add-supplier"]`); await f.locator('[name="name"]').fill(name);
  await f.locator('button', { hasText: 'Add supplier' }).click(); await msg(this); assert.equal(this.lastMessage, `${name} added.`);
});
Then('the suppliers list {string}', async function (name) { await this.page.locator(`${OR} [data-supplier="${name}"]`).waitFor({ timeout: 6000 }); });
When('I add the stock item {string} with SKU {string}, {int} on hand, reorder at {int}, ordering {int} at {string} from {string}', async function (name, sku, onHand, reorder, qty, cost, supplier) {
  await addItem(this, name, { sku, onHand: String(onHand), reorder: String(reorder), qty: String(qty), cost, supplier }); assert.equal(this.lastMessage, `${name} added.`);
});
Given('the stock item {string} has {int} on hand, reorder at {int}, ordering {int} from {string}', async function (name, onHand, reorder, qty, supplier) {
  await go(this); await addItem(this, name, { onHand: String(onHand), reorder: String(reorder), qty: String(qty), cost: '30.00', supplier }); assert.equal(this.lastMessage, `${name} added.`);
});
Then('the stock item {string} is marked low', async function (name) { await this.page.locator(`${OR} article.ro-item[data-item="${name}"] .badge`, { hasText: 'Low' }).waitFor({ timeout: 6000 }); this.focus = `${OR} article.ro-item[data-item="${name}"]`; });
Then('the stock item {string} shows {string}', async function (name, text) { await this.page.locator(`${OR} article.ro-item[data-item="${name}"]`, { hasText: text }).waitFor({ timeout: 6000 }); this.focus = `${OR} article.ro-item[data-item="${name}"]`; });
Then('the mechanics asked for {string}', async function (name) { await this.page.locator(`${OR} [data-request="${name}"]`).waitFor({ timeout: 6000 }); this.focus = `${OR} [data-ro="part-requests"]`; });
When('I order {string} from {string} at {string}', async function (name, supplier, cost) {
  const row = this.page.locator(`${OR} [data-request="${name}"]`); await row.locator('input[type="checkbox"]').check(); await row.locator('input[inputmode="decimal"]').fill(cost);
  const box = this.page.locator(`${OR} [data-ro="part-requests"]`); await box.locator('[name="supplier"]').selectOption({ label: supplier });
  this.focus = `${OR} [data-ro="part-requests"]`; await box.locator('button', { hasText: 'Add ticked parts to an order' }).click(); await msg(this);
});
When('I take {string} from stock', async function (name) { const row = this.page.locator(`${OR} [data-request="${name}"]`); this.focus = `${OR} [data-ro="part-requests"]`; await row.locator('button', { hasText: 'Take from stock' }).click(); await msg(this); });
When('I place order {string} by {string} with supplier reference {string}', async function (number, via, ref) {
  const o = order(this, number), f = o.locator('form.ro-place'); await f.locator('[name="via"]').selectOption({ label: via }); await f.locator('[name="reference"]').fill(ref);
  this.focus = `${OR} article.ro-order[data-order="${number}"]`; await o.locator('button', { hasText: 'Place order' }).click(); await msg(this);
});
When('I receive order {string} in full', async function (number) { const o = order(this, number); await o.locator('[name="by"]').fill('Dan Okafor'); this.focus = `${OR} article.ro-order[data-order="${number}"]`; await o.locator('button', { hasText: 'Receive delivery' }).click(); await msg(this); });
Then('order {string} is {string}', async function (number, label) { const h = this.page.locator(`${OR} details.ro-history`); if (['Received', 'Closed short', 'Cancelled'].includes(label) && (await h.count()) && (await h.getAttribute('open')) === null) await h.locator(':scope > summary').click(); await order(this, number).locator('.badge', { hasText: label }).first().waitFor({ timeout: 6000 }); this.focus = `${OR} article.ro-order[data-order="${number}"]`; });
Then('the orders page shows {string}', async function (text) { await this.page.locator(OR).filter({ hasText: text }).first().waitFor({ timeout: 6000 }); this.focus = `${OR} [data-ro="reorder"]`; });
When('I add the low stock to draft orders', async function () { this.focus = `${OR} [data-ro="reorder"]`; await this.page.locator(`${OR} [data-ro="reorder"] button`, { hasText: 'Add to draft orders' }).click(); await msg(this); });

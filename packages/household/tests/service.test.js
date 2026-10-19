'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Household} = require('../lib/household');
const {fixtures} = require('../lib/fixtures');

test('a complete synthetic year reconciles without counting transfers as expenses', async () => {
  const files = await fixtures(); const h = new Household(files);
  h.importFile('family.json', files['family.json']);
  for (const name of Object.keys(files).filter(n => n.endsWith('.csv'))) h.importFile(name, files[name]);
  const result = h.snapshot();
  assert.equal(result.accounts.length, 6);
  assert.equal(result.transactions.length, 318);
  assert.equal(result.summary.expenses, 4790500);
  assert.equal(result.summary.income, 9268800);
  assert.equal(result.summary.netWorth, 7148300);
  assert.equal(result.summary.donations, 120000);
  assert.equal(result.summary.unreviewed, 12);
  assert.equal(result.accounts.find(a => a.id === 'loan').balance, -1200000);
  assert.equal(result.accounts.find(a => a.id === 'visa').balance, -52500);
  const repeated = h.importFile('checking.csv', files['checking.csv']);
  assert.equal(repeated.added, 0);
  assert.equal(h.snapshot().summary.netWorth, 7148300);
});

test('real data and unauthorized uploads are rejected; storage has no disk fallback', async () => {
  const h = new Household(await fixtures());
  assert.throws(() => h.importFile('real.csv', Buffer.from('private data')), /synthetic/i);
  assert.throws(() => h.importFile('family.json', Buffer.from('{}')), /synthetic/i);
  assert.equal(h.snapshot().storage.productionEnabled, false);
});

test('critical field review gates the actual tax engine and changes invalidate its result', async () => {
  const files = await fixtures(); const h = new Household(files);
  h.importFile('family.json', files['family.json']);
  await assert.rejects(() => h.calculate(), /February|documents|review/i);
  h.advance('2026-02-15');
  for (const name of ['maya-w2.pdf', 'jordan-w2.pdf', 'interest.pdf']) await h.importDocument(name, files[name]);
  await assert.rejects(() => h.calculate(), /review/i);
  for (const doc of h.snapshot().documents) {
    const values = Object.fromEntries(doc.fields.map(f => [f.key, f.value]));
    if (doc.id === 'jordan-w2.pdf') values.withholding = '4000.00';
    h.reviewDocument(doc.id, values);
  }
  const tax = await h.calculate();
  assert.equal(tax.inputs.w2_income, 120000);
  assert.equal(tax.inputs.taxable_interest, 288);
  assert.equal(tax.result.federal_adjusted_gross_income, 120288);
  assert.equal(tax.result.federal_taxable_income, 88788);
  assert.equal(tax.result.federal_total_tax, 10176);
  assert.equal(tax.childCredit, 440000);
  assert.equal(tax.federalTax, 577600);
  assert.equal(tax.refund, 822400);
  assert.equal(tax.status, 'estimate');
  h.reviewDocument('maya-w2.pdf', {wages:'72000.00', withholding:'10001.00'});
  assert.equal(h.snapshot().tax, null);
});

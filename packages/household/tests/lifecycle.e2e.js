'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');
const {start} = require('../server');
const {fixtures} = require('../lib/fixtures');
const EVIDENCE = path.resolve(__dirname, '../../../site/assets/family-finances');

test('family year: onboard → import → reconcile → February → review → tax estimate', {timeout:120000}, async t => {
  const server = await start(0); t.after(() => server.close());
  const browser = await chromium.launch({headless:true}); t.after(() => browser.close());
  const context = await browser.newContext({viewport:{width:1440,height:1050}});
  const page = await context.newPage(); const errors=[];
  page.on('pageerror', e => errors.push(e.message));
  const files = await fixtures();
  const clickAction = async selector => {
    await page.locator(selector).click();
    await page.waitForFunction(()=>!document.body.classList.contains('busy'));
  };
  const step = async (name, selector) => {
    await page.locator(selector).scrollIntoViewIfNeeded();
    const output={path:path.join(EVIDENCE, name+'.png')};
    if(['05-field-review','06-tax-estimate'].includes(name))await page.locator(selector).screenshot(output);
    else await page.screenshot({...output,fullPage:true});
  };
  const upload = async (selector,names) => {
    await page.locator(selector).setInputFiles(names.map(name => ({name,mimeType:name.endsWith('.pdf')?'application/pdf':'text/plain',buffer:files[name]})));
    await page.waitForFunction(() => !document.body.classList.contains('busy'));
    assert.equal(await page.locator('#message.error').count(),0,await page.locator('#message').innerText());
  };
  fs.mkdirSync(EVIDENCE,{recursive:true});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#family-import').waitFor();
  await upload('#family-import',['family.json']);
  assert.equal(await page.locator('.member-card').count(),4);
  assert.match(await page.locator('#family').innerText(),/365 nights/);
  await step('01-family','#family');

  await page.locator('[data-view="accounts"]').click();
  await upload('#accounts-import',Object.keys(files).filter(n=>n.endsWith('.csv')));
  assert.equal(await page.locator('.account-card').count(),6);
  assert.match(await page.locator('#net-worth').innerText(),/71,483/);
  await step('02-accounts','#accounts');

  await page.locator('[data-view="spending"]').click();
  assert.match(await page.locator('#annual-expenses').innerText(),/47,905/);
  assert.match(await page.locator('#transfer-note').innerText(),/excluded/);
  await step('03-year','#spending');
  await page.locator('#transaction-search').fill('LOCAL MARKET');
  await page.locator('[data-categorize]').first().selectOption('Household');
  await page.waitForFunction(()=>document.querySelector('#review-count').textContent.includes('11'));
  await page.locator('#transaction-search').fill('ELECTRONICS');
  await page.locator('[data-split]').click();
  await page.locator('#split-household').fill('200.00');
  await page.locator('#split-education').fill('100.00');
  await page.locator('#save-split').click();
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Purchase split saved'));
  await page.locator('#transaction-search').fill('ELECTRONICS');
  assert.match(await page.locator('#transactions').innerText(),/Education/);
  await step('04-transactions','#transaction-panel');
  await page.locator('[data-view="accounts"]').click();
  await upload('#accounts-import',['checking.csv']);
  assert.match(await page.locator('#message').innerText(),/0 new/);
  assert.match(await page.locator('#net-worth').innerText(),/71,483/);

  await page.locator('[data-view="taxes"]').click();
  await clickAction('#advance-february');
  assert.match(await page.locator('#simulated-date').innerText(),/February 15, 2026/);
  await upload('#tax-import',['maya-w2.pdf','jordan-w2.pdf','interest.pdf']);
  await clickAction('#calculate-tax');
  assert.match(await page.locator('#message').innerText(),/review/i);
  await page.locator('[data-document="jordan-w2.pdf"]').click();
  await page.waitForFunction(()=>document.querySelector('#document-review').dataset.loaded==='jordan-w2.pdf');
  await page.locator('[data-field="withholding"]').focus();
  await page.locator('#pdf-canvas').waitFor({state:'visible'});
  await page.locator('[data-field="withholding"]').fill('4000.00');
  await step('05-field-review','#document-review');
  await clickAction('#approve-document');
  for(const id of ['maya-w2.pdf','interest.pdf']) {
    await page.locator(`[data-document="${id}"]`).click();
    await page.waitForFunction(id=>document.querySelector('#document-review').dataset.loaded===id,id);
    await clickAction('#approve-document');
  }
  await page.locator('#confirm-scenario').check();
  await clickAction('#calculate-tax');
  await page.locator('#tax-result').waitFor();
  assert.match(await page.locator('#tax-result').innerText(),/120,288/);
  assert.match(await page.locator('#tax-result').innerText(),/88,788/);
  assert.match(await page.locator('#tax-result').innerText(),/TenForty/);
  assert.match(await page.locator('#tax-result').innerText(),/8,224/);
  await step('06-tax-estimate','#tax-result');
  // These are recurring workspaces; returning to one must retain the current records.
  await page.locator('[data-view="spending"]').click();
  assert.match(await page.locator('#annual-expenses').innerText(),/47,905/);
  await page.locator('[data-view="accounts"]').click();
  assert.match(await page.locator('#net-worth').innerText(),/71,483/);
  await page.locator('[data-view="taxes"]').click();
  assert.match(await page.locator('#tax-result').innerText(),/8,224/);
  assert.equal(await page.locator('#submit-irs').isEnabled(),false);
  await page.locator('#prepare-checklist').click();
  await step('07-filing-boundary','#filing-checklist');
  assert.match(await page.locator('#filing-checklist').innerText(),/not filed/i);

  await page.locator('[data-document="maya-w2.pdf"]').click();
  await page.waitForFunction(()=>document.querySelector('#document-review').dataset.loaded==='maya-w2.pdf');
  await page.locator('[data-field="withholding"]').fill('10001.00');
  await clickAction('#approve-document');
  assert.equal(await page.locator('#tax-result').count(),0,'A document correction must invalidate the estimate');

  await page.locator('[data-view="privacy"]').click();
  await page.locator('#real-import').setInputFiles({name:'private.csv',mimeType:'text/csv',buffer:Buffer.from('not a synthetic fixture')});
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('synthetic'));
  await step('08-privacy','#privacy');
  assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
  const other = await browser.newContext(); const res = await other.request.get(`http://127.0.0.1:${server.address().port}/api/state`);
  assert.equal(res.status(),401);
  const second=await other.newPage();await second.goto(`http://127.0.0.1:${server.address().port}`);
  const isolated=await other.request.get(`http://127.0.0.1:${server.address().port}/api/state`);
  assert.equal((await isolated.json()).family,null);
  const hidden=await other.request.get(`http://127.0.0.1:${server.address().port}/api/pdf/maya-w2.pdf`);
  assert.equal(hidden.status(),404);
  await other.close();
  assert.deepEqual(errors,[]);
});

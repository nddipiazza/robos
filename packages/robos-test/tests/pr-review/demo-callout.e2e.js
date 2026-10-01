 'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE || 'playwright-core');
const {showDemoCallout}=require('../../../pr-review/lib/demo-callout');
test('one translucent callout replaces legacy guidance and respects dismissal',async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();await page.setContent('<aside id="robos-callout">old</aside><div id="filter-demo-caption">older</div>');
  await page.evaluate(showDemoCallout,{id:'one',title:'First',summary:'Try removing a filter.'});
  assert.equal(await page.locator('#robos-callout, #filter-demo-caption').count(),0);
  await page.evaluate(showDemoCallout,{id:'two',summary:'<img src=x onerror=alert(1)> Try the next control.'});
  const overlay=page.locator('[data-robos-demo-callout]');assert.equal(await overlay.count(),1);
  assert.equal(await overlay.getAttribute('data-robos-demo-callout'),'two');assert.equal(await overlay.locator('img').count(),0);
  assert.equal(await overlay.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(15, 23, 34, 0.82)');
  assert.equal(await overlay.evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  await page.getByRole('button',{name:'Hide demo guidance'}).click();assert.equal(await overlay.count(),0);
  assert.deepEqual(await page.evaluate(showDemoCallout,{id:'two',summary:'Updated'}),{visible:false,dismissed:true});
  await page.evaluate(showDemoCallout,{id:'three',summary:'A new checkpoint.'});assert.equal(await overlay.count(),1);
 } finally {await browser.close();}
});
test('checkpoint card shows agent guidance and comparison controls instead of BDD labels',async()=>{
 const path=require('node:path');const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();await page.setContent('<section id="stage-6"></section>');
  await page.evaluate(()=>{window.api={onDemoState:fn=>window.updateDemo=fn,getDemoState:async()=>({mode:'before',status:'paused',index:0,total:2,messages:[],baseline:{ref:'origin/main',revision:'1234567890'},guidance:'Try the original filters, then choose Next checkpoint.',checkpoint:{title:'Original filters',given:'PRIVATE GIVEN',when:'PRIVATE WHEN',then:'PRIVATE THEN'},process:{before:{}}})};});
  await page.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/demo-ui.js')});await page.evaluate(()=>window.mountWalkthrough());
  assert.match(await page.locator('.walkthrough-checkpoint').textContent(),/Try the original filters/);
  assert.doesNotMatch(await page.locator('.walkthrough-checkpoint').textContent(),/PRIVATE/);
  assert.match(await page.locator('.walkthrough-checkpoint').textContent(),/origin\/main · 12345678/);
  assert.equal(await page.getByRole('button',{name:'Show the change',exact:true}).count(),0);
  await page.getByText('More',{exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Show the change',exact:true}).isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'How it used to work',exact:true}).count(),0);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.walkthrough-more').getAttribute('open'),null);
  await page.getByText('More',{exact:true}).click(); await page.locator('.walkthrough-checkpoint').click();
  assert.equal(await page.locator('.walkthrough-more').getAttribute('open'),null);
 } finally {await browser.close();}
});

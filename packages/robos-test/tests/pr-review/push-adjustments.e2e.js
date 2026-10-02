'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('header push appears for commits, disables immediately, hides after push and returns for new commits',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<header><div class="theater-actions"></div></header><section>Walkthrough</section>');
  await page.addStyleTag({path:path.resolve(__dirname,'../../../pr-review/renderer/style.css')});
  await page.evaluate(()=>{
   window.state={ok:true,eligible:true,ahead:0,behind:0,dirty:false};window.calls=0;
   window.api={reviewAdjustmentStatus:async()=>({...window.state}),onDemoState:cb=>window.demoChanged=cb,
    pushReviewAdjustments:()=>{window.calls++;return new Promise(resolve=>window.finishPush=resolve);}};
  });
  await page.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/push-adjustments.js')});
  const button=page.locator('header button');assert.equal(await button.isVisible(),false);
  await page.evaluate(async()=>{state.ahead=2;await refreshAdjustmentCommand();});assert.equal(await button.isEnabled(),true);
  await button.click();assert.equal(await button.isDisabled(),true);assert.equal(await button.innerText(),'Pushing…');
  await page.evaluate(()=>{state.ahead=0;finishPush({ok:true});});await button.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>calls),1);
  await page.evaluate(async()=>{state.ahead=1;await refreshAdjustmentCommand();});await button.waitFor({state:'visible'});
  await button.click();await page.evaluate(()=>finishPush({ok:false,error:'Network unavailable'}));await page.getByRole('status').filter({hasText:'Network unavailable'}).waitFor();assert.equal(await button.isEnabled(),true);
  for(const field of ['dirty','busy','behind']){await page.evaluate(async field=>{state[field]=1;await refreshAdjustmentCommand();},field);assert.equal(await button.isDisabled(),true);await page.evaluate(field=>state[field]=0,field);}
  await page.evaluate(async()=>{state.eligible=false;await refreshAdjustmentCommand();});assert.equal(await button.isVisible(),false);
 }finally{await browser.close();}
});

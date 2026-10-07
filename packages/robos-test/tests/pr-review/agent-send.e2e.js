'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

test('accepted prompts clear immediately and completing a send preserves the next draft',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'});
 try{
  const p=await browser.newPage();
  await p.route('http://review.test/',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));
  await p.goto('http://review.test/');
  await p.evaluate(()=>{window.api={demoAction:input=>new Promise(resolve=>{window.sent=input;window.finishSend=resolve;})};});
  await require('./agent-pane-test-helper')(p);
  await p.evaluate(()=>window.reviewAgent.open('changes'));
  const input=p.locator('robos-agent-discussion .robos-ai-inner');
  await input.fill('Show old versus new clearly');
  await p.locator('robos-agent-discussion .robos-submit-btn').click();
  assert.equal(await input.textContent(),'');
  assert.equal(await p.evaluate(()=>window.reviewAgent.busy()),true);
  assert.equal(await p.evaluate(()=>window.sent.text),'Show old versus new clearly');
  assert.ok((await p.locator('robos-agent-discussion').textContent()).includes('Show old versus new clearly'));
  await input.fill('Also explain the changed response');
  // A second send while the first is running must not discard the unsent draft.
  await p.evaluate(()=>window.reviewAgent.send('changes','Also explain the changed response'));
  assert.equal(await input.textContent(),'Also explain the changed response');
  await p.evaluate(()=>window.finishSend({ok:true}));
  await p.waitForFunction(()=>!window.reviewAgent.busy());
  assert.equal(await input.textContent(),'Also explain the changed response');
  await p.locator('robos-agent-discussion .robos-submit-btn').click();
  assert.equal(await input.textContent(),'');
  await p.evaluate(()=>window.finishSend({ok:false,error:'Agent failed to start'}));
  await p.waitForFunction(()=>!window.reviewAgent.busy());
  assert.ok((await p.locator('robos-agent-discussion').textContent()).includes('Agent failed to start'));
  assert.ok((await p.locator('robos-agent-discussion').textContent()).includes('Also explain the changed response'));
 }finally{await browser.close();}
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('live Hermetiq Buildkite connection loads build 1130 failure in CI Monitor',{skip:!process.env.ROBOS_BUILDKITE_CDP},async()=>{
 const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
 const browser=await chromium.connectOverCDP(process.env.ROBOS_BUILDKITE_CDP);
 try{
 const page=browser.contexts()[0].pages()[0];await page.reload();await page.locator('.run-card').first().waitFor();
 assert.equal(await page.getByLabel('CI provider').inputValue(),'buildkite');
 // Read-only live fixture: the known failed build, even after it leaves the latest 30 runs.
 await page.evaluate(()=>showDetail({provider:'buildkite',repo:'hermetiq/cloud-native',id:1130,name:'Build #1130',workflowName:'cloud-native',branch:'codex/compact-filters-integrated',status:'completed',conclusion:'failure',url:'https://buildkite.com/hermetiq/cloud-native/builds/1130'}));
 await page.getByRole('button',{name:'Failed Log',exact:true}).click();
 const text=await page.locator('#log-output').textContent();assert.match(text,/element\(s\) not found/);assert.match(text,/Clear the zoomed time window/);
 assert.equal(await page.getByRole('button',{name:'Re-run',exact:true}).isVisible(),false);
 await page.getByRole('button',{name:'Show full log'}).click();assert.ok((await page.locator('#log-output').textContent()).length>text.length);
 await page.getByRole('button',{name:'Connection',exact:true}).click();assert.equal(await page.locator('[name=passPath]').inputValue(),'buildkite-api-access-token');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 }finally{await browser.close();}
});

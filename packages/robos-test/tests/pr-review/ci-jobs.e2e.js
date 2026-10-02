'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('CI panel tails jobs without an agent and drops late results after job/revision changes',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.setContent('<div class="theater-topbar"></div>');
 await page.evaluate(()=>{window.calls=[];window.pending=[];window.api={reviewCILogTail:input=>{calls.push(input);return new Promise(resolve=>pending.push(resolve));}};window.snapshot={head:'abc',checkedAt:new Date().toISOString(),checks:[{provider:'buildkite',name:'Buildkite',buildNumber:3,detailsUrl:'https://buildkite.com/org/pipeline/builds/3',jobs:[{id:'a',name:'Browser',status:'in_progress'},{id:'b',name:'Unit',conclusion:'success'}]}]};});
 await page.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/ci-jobs.js')});await page.evaluate(()=>{updateCIJobs(snapshot);openCIJobs();});
 await page.getByRole('button',{name:'Browser Running'}).click();await page.getByRole('button',{name:'Unit Passed'}).click();
 await page.evaluate(()=>pending.shift()({ok:true,content:'old job',checkedAt:new Date().toISOString()}));await page.waitForFunction(()=>calls.length===2);
 await page.evaluate(()=>pending.shift()({ok:true,content:'unit output <script>bad()</script>',checkedAt:new Date().toISOString()}));await page.waitForFunction(()=>document.querySelector('.ci-tail-output').textContent.includes('unit output'));
 assert.equal(await page.locator('.ci-tail-output script').count(),0);assert.ok(!(await page.locator('.ci-tail-output').textContent()).includes('old job'));
 await page.getByLabel('Live',{exact:true}).uncheck();await page.getByLabel('Follow',{exact:true}).uncheck();
 await page.evaluate(()=>updateCIJobs({...snapshot,head:'new'}));assert.equal(await page.locator('.ci-tail-output').textContent(),'');
 await page.getByRole('button',{name:'Browser Running'}).click();await page.evaluate(()=>pending.shift()({ok:false,error:'Token expired'}));await page.getByRole('status').filter({hasText:'Token expired'}).waitFor();
 await page.getByRole('button',{name:'Close CI jobs'}).click();assert.equal(await page.getByRole('region',{name:'CI jobs and live log'}).isVisible(),false);
 }finally{await browser.close();}
});
test('status refresh updates jobs independently and exposes failure recovery only when needed',async()=>{
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.setContent('<div class="theater-topbar"></div><div class="theater-actions"></div>');await page.evaluate(()=>{window.openCIRecovery=()=>{throw Error('Must not start an agent to monitor CI');};window.value={state:'pending',head:'abc',checks:[{provider:'buildkite',jobs:[{status:'in_progress'}]}]};window.updates=[];window.updateCIJobs=r=>updates.push(r);window.openCIJobs=()=>window.opened=true;window.api={reviewCIStatus:async()=>value};});await page.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/ci-status.js')});await page.getByText('CI checks are running',{exact:true}).waitFor();assert.equal(await page.locator('.review-live-ci>span').innerText(),'1 running');await page.getByRole('button',{name:'Jobs & live logs'}).click();assert.equal(await page.evaluate(()=>opened),true);
 await page.evaluate(async()=>{value={state:'passed',head:'abc',checks:[{provider:'buildkite',jobs:[{status:'completed',conclusion:'success'}]}]};await refreshReviewCI();});await page.getByText('CI checks passed',{exact:true}).waitFor();assert.equal(await page.locator('.review-live-ci>span').innerText(),'');assert.equal(await page.getByRole('button',{name:'Get CI back to green'}).count(),0);assert.equal(await page.evaluate(()=>updates.length),2);
 }finally{await browser.close();}
});

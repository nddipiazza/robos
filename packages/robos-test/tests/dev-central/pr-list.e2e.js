'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('passing drafts lead the list; ready and review target the selected PR',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROBOS_CHROMIUM_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),root=path.resolve(__dirname,'../../../dev-central/renderer');
  await page.setContent(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));
  await page.addStyleTag({path:path.join(root,'style.css')});
  await page.evaluate(()=>{window.robos={onDataUpdated:()=>{},onSwitchTab:()=>{},onTrafficNotification:()=>{},openReview:async url=>{window.opened=url;return {ok:true};},readyPR:async(url,head)=>{window.sent={url,head};return {ok:false,error:'CI has not passed.'};}};});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/^init\(\);/m,'')});
  await page.evaluate(()=>{
   appState.allPRs=[{number:8,title:'Pending change',url:'https://github.com/a/b/pull/8',state:'OPEN',isDraft:true,statusCheckRollup:[],updatedAt:'2026-10-02'},
    {number:9,title:'Improve the pull request list',url:'https://github.com/a/b/pull/9',repo:'a/b',headRefOid:'abc',state:'OPEN',isDraft:true,statusCheckRollup:[{state:'SUCCESS'}],updatedAt:'2026-10-01'}];
   renderPRs(appState.allPRs);applyViewTab('prs');
  });
  assert.match(await page.locator('.pr-row').first().innerText(),/Improve the pull request list/);
  await page.getByRole('button',{name:'Open code review',exact:true}).first().click();assert.equal(await page.evaluate(()=>window.opened),'https://github.com/a/b/pull/9');
  await page.getByRole('button',{name:'Move from draft to ready'}).click();await page.getByText('CI has not passed.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.sent),{url:'https://github.com/a/b/pull/9',head:'abc'});
  await page.getByLabel('Passing CI only').check();assert.equal(await page.locator('.pr-row').count(),1);
  await page.screenshot({path:'/tmp/dev-central-pr-list.png',fullPage:true});
  await page.evaluate(()=>window.robos.readyPR=async()=>({ok:true,pr:{isDraft:false}}));
  await page.getByRole('button',{name:'Move from draft to ready'}).click();await page.getByText(/In review/).waitFor();assert.equal(await page.getByRole('button',{name:'Move from draft to ready'}).count(),0);
  await page.setViewportSize({width:900,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 }finally{await browser.close();}
});

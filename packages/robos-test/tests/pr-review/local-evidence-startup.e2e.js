'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
test('local review startup survives replacement of the old evidence video controls',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROBOS_CHROMIUM_PATH||'/usr/bin/google-chrome'});
 try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const dir=path.resolve(__dirname,'../../../pr-review/renderer');
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<meta\b[^>]*http-equiv[^>]*>/gi,'');
  await page.setContent(html);
  await page.evaluate(()=>{
   const pr={local:true,title:'Local evidence startup',repo:'example/repo',headBranch:'codex/test',baseBranch:'main',author:'test',body:'Refs #999',workItems:[{key:'#144',title:'Requested project',url:'https://github.com/Hermetiq/task-and-issue-tracking/issues/144'}]};
   window.api={getLocalReview:async()=>({ok:true,pr}),fetchPRTheaterContext:async()=>({ok:true,local:true,initialStage:5,pr,fileDiffs:[],validationGates:{},showTheFix:{fixType:'frontend'}}),taskEvidenceBundle:async()=>({ok:true,bundle:null})};
  });
  for(const script of ['startup.js','task-evidence.js','app.js'])await page.addScriptTag({path:path.join(dir,script)});
  await page.waitForFunction(()=>document.getElementById('startup-screen').hidden||document.getElementById('startup-screen').getAttribute('role')==='alert');
  assert.equal(await page.locator('#startup-screen').evaluate(e=>e.hidden),true,await page.locator('#startup-message').textContent());
  assert.equal(await page.locator('#btn-canvas-desktop').count(),0);
  assert.equal(await page.locator('.work-item-chip').getAttribute('data-theater-arg'),'https://github.com/Hermetiq/task-and-issue-tracking/issues/144');
  assert.equal(await page.locator('.work-item-chip').count(),1);
  assert.equal(await page.locator('#stage-5').evaluate(e=>e.classList.contains('active')),true);
  assert.match(await page.locator('#stage-5').innerText(),/No evidence bundle is linked/);
  await page.evaluate(()=>window.openPRReviewTheater({local:true,title:'Reopen',repo:'example/repo'}));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

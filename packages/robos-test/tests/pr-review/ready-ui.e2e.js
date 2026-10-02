'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('draft action opens reviewer dialog; promotion updates state and errors remain actionable',async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.ROBOS_CHROMIUM_PATH});
 try{
  const p=await b.newPage();
  const renderer=path.resolve(__dirname,'../../../pr-review/renderer');
  await p.setContent('<button id="step-btn-8"><span class="step-label"></span></button><section id="stage-8"></section>');
  await p.evaluate(html=>{const source=new DOMParser().parseFromString(html,'text/html');document.body.prepend(source.getElementById('theater-pr-header'));},fs.readFileSync(path.join(renderer,'index.html'),'utf8'));
  await p.addStyleTag({path:path.join(renderer,'style.css')});
  await require('./editor-test-helper')(p);
  await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/publish-ui.js')});
  await p.evaluate(()=>{window.pr={local:true,published:true,isAuthor:true,state:'OPEN',isDraft:true,ciPassing:true,headRefOid:'abc',repo:'org/repo',headBranch:'feature',baseBranch:'main',title:'Fix',body:'Details'};window.calls=0;window.api={reviewGitHubReviewers:async()=>({ok:true,reviewers:['alice'],source:'RobOS · Code Reviewers'}),readyReviewPR:async head=>{window.calls++;window.head=head;return {ok:true,pr:{...window.pr,isDraft:false}};}};});
  for(const overrides of [{isDraft:false},{state:'MERGED'},{stateError:'offline'},{}]){
   await p.evaluate(o=>window.configureReviewPublish({...window.pr,...o}),overrides);
   assert.equal(await p.locator('#pr-ready-button').isVisible(),Object.keys(overrides).length===0);
  }
  assert.equal(await p.evaluate(()=>window.calls),0);
  for(const width of [1024,1440]){
   await p.setViewportSize({width,height:900});
   const bounds=await p.locator('#pr-ready-button').boundingBox();
   assert.ok(bounds.height>=32 && bounds.width>=140,'ready action should fit the requested compact size');
   assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width,'ready action must fit the header');
  }
  await p.locator('#pr-ready-button').click();
  for(const width of [375,1024]){
   await p.setViewportSize({width,height:800});const dialog=p.getByRole('dialog',{name:'Ready for review',exact:true});const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
   assert.equal(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth),true);
   const cancel=await dialog.getByRole('button',{name:'Cancel',exact:true}).boundingBox(),confirm=await dialog.getByRole('button',{name:'Move PR to Ready',exact:true}).boundingBox();assert.ok(cancel.x+cancel.width<confirm.x,'actions must have a visible gap');
   assert.equal(await dialog.getByLabel('GitHub reviewers',{exact:true}).isVisible(),true);
  }
  await p.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await p.evaluate(()=>window.calls),0);
  await p.locator('#pr-ready-button').click();
  await p.getByRole('dialog').getByRole('button',{name:'Move PR to Ready',exact:true}).click();
  await p.locator('#pr-ready-status').filter({hasText:'PR is ready for review.'}).waitFor();
  await p.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await p.locator('#pr-ready-button').isVisible(),false);assert.equal(await p.evaluate(()=>window.head),'abc');
  await p.evaluate(()=>{window.api.readyReviewPR=async()=>({ok:false,error:'CI checks must finish successfully.'});window.configureReviewPublish(window.pr);});
  await p.locator('#pr-ready-button').click();
  await p.getByRole('dialog').getByRole('button',{name:'Move PR to Ready',exact:true}).click();
  await p.getByRole('dialog').getByRole('status').filter({hasText:'CI checks must finish successfully.'}).waitFor();
  assert.equal(await p.locator('#pr-ready-button').isEnabled(),true);
 }finally{await b.close();}
});
test('configured reviewers are prefilled, editable for one PR, and explicit opt-out assigns none',async()=>{
 const b=await chromium.launch({headless:true});try{const p=await b.newPage();await p.setContent('<button id="ready">Ready</button><p id="notice"></p>');await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/publish-ui.js')});
 await p.evaluate(()=>{window.received=[];window.api={reviewGitHubReviewers:async()=>({ok:true,source:'RobOS · Code Reviewers',reviewers:['alice','bob']}),readyReviewPR:async(h,u,reviewers)=>{received.push(reviewers);return {ok:true,pr:{isDraft:false}};}};window.openPRReviewTheater=async()=>{};window.openDialog=()=>offerReadyNotification({title:'Example',body:'',headRefOid:'abc',url:'https://github.com/org/repo/pull/1'},document.getElementById('ready'),document.getElementById('notice'));openDialog();});
 await p.waitForFunction(()=>document.getElementById('pr-ready-reviewers').value==='alice, bob');assert.equal(await p.getByLabel('Request GitHub reviews').isChecked(),true);await p.getByLabel('GitHub reviewers',{exact:true}).fill('alice, bob, one-off');await p.getByRole('button',{name:'Move PR to Ready',exact:true}).click();await p.getByRole('dialog').waitFor({state:'hidden'});assert.deepEqual(await p.evaluate(()=>received[0]),['alice','bob','one-off']);
 await p.evaluate(()=>openDialog());await p.waitForFunction(()=>document.getElementById('pr-ready-reviewers').value==='alice, bob');await p.getByLabel('Request GitHub reviews').uncheck();assert.equal(await p.getByLabel('GitHub reviewers',{exact:true}).isDisabled(),true);await p.getByRole('button',{name:'Move PR to Ready',exact:true}).click();assert.deepEqual(await p.evaluate(()=>received[1]),[]);
 }finally{await b.close();}
});

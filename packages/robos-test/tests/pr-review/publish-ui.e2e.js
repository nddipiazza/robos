'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('Create PR stage retains drafts across navigation and reload; publishes only explicitly',async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.ROBOS_CHROMIUM_PATH});try{const p=await b.newPage();let calls=0;
 await p.route('http://review.test/',r=>r.fulfill({contentType:'text/html',body:'<h2 id="theater-pr-title"></h2><span id="theater-target-app"></span><button id="step-btn-8"><span class="step-label">Create PR</span></button><section id="stage-8"></section>'}));
 await p.exposeFunction('create',async data=>{calls++;assert.equal(data.title,'Reviewed title');assert.equal(data.body,'My saved description');return {ok:true,pr:{published:true,number:42,title:data.title,url:'https://github.com/org/repo/pull/42',repo:'org/repo',headBranch:'codex/filters'}};});
 const mount=async()=>{await require('./editor-test-helper')(p);await p.evaluate(()=>window.api={createReviewPR:window.create,refreshReviewPR:async()=>({ok:true,pr:{local:true,published:true,isAuthor:true,state:'OPEN',isDraft:false,number:42,title:'Reviewed title',body:'My saved description',url:'https://github.com/org/repo/pull/42',repo:'org/repo',headBranch:'codex/filters'}}),openUrl:()=>{}});await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/publish-ui.js')});await p.evaluate(()=>window.configureReviewPublish({local:true,title:'Filters',repo:'org/repo',headBranch:'codex/filters',baseBranch:'main'}));};
 await p.goto('http://review.test/');await mount();
 assert.equal(await p.getByRole('dialog').count(),0);assert.equal(await p.getByRole('button',{name:'Cancel',exact:true}).count(),0);
 await p.getByLabel('Title',{exact:true}).fill('Reviewed title');await p.getByLabel('Description',{exact:true}).fill('My saved description');
 await p.locator('#stage-8').evaluate(el=>el.hidden=true);await p.locator('#stage-8').evaluate(el=>el.hidden=false);
 assert.equal(await p.getByLabel('Title',{exact:true}).inputValue(),'Reviewed title');
 await p.reload();await mount();assert.equal(await p.locator('review-markdown-editor').evaluate(el=>el.value),'My saved description');assert.equal(calls,0);
 await p.locator('#stage-8').getByRole('button',{name:'Create PR',exact:true}).click();await p.getByRole('heading',{name:'Code review · Author mode'}).waitFor();assert.equal(calls,1);assert.equal(await p.locator('#step-btn-8 .step-label').innerText(),'Pull Request (In Review)');
 await p.evaluate(()=>{window.opened=[];window.api.openUrl=async url=>{opened.push(url);return {ok:false,error:'Browser unavailable'};};});
 await p.getByRole('button',{name:'Open pull request',exact:true}).click();await p.getByRole('alert').filter({hasText:'Browser unavailable'}).waitFor();assert.deepEqual(await p.evaluate(()=>opened),['https://github.com/org/repo/pull/42']);assert.equal(await p.getByRole('button',{name:'Open pull request',exact:true}).isEnabled(),true);
 }finally{await b.close();}
});

test('Create PR immediately acknowledges pending preparation and reports preparation errors',async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.ROBOS_CHROMIUM_PATH});try{const p=await b.newPage();
 await p.setContent('<h2 id="theater-pr-title"></h2><span id="theater-target-app"></span><button id="step-btn-8"><span class="step-label">PR</span></button><section id="stage-8"></section>');
 await require('./editor-test-helper')(p);
 await p.evaluate(()=>{window.mountAIDescription=()=>({ensureReady:()=>new Promise((resolve,reject)=>{window.finish=resolve;window.fail=reject;})});window.api={createReviewPR:()=>{throw Error('Must not publish while preparing');}};});
 await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/publish-ui.js')});
 await p.evaluate(()=>window.configureReviewPublish({local:true,title:'Filters',repo:'org/repo',headBranch:'codex/filters',baseBranch:'main'}));
 assert.equal(await p.locator('#step-btn-8 .step-label').innerText(),'Pull Request (Not Created)');
 await p.getByRole('button',{name:'Create PR',exact:true}).click();assert.equal(await p.getByRole('button',{name:'Preparing PR…',exact:true}).isDisabled(),true);
 await p.evaluate(()=>window.finish(false));await p.getByRole('alert').filter({hasText:'description needs your review'}).waitFor();
 await p.getByRole('button',{name:'Create PR',exact:true}).click();await p.evaluate(()=>window.fail(Error('Description service unavailable')));await p.getByRole('alert').filter({hasText:'Description service unavailable'}).waitFor();assert.equal(await p.getByRole('button',{name:'Create PR',exact:true}).isEnabled(),true);
 }finally{await b.close();}
});
test('all lifecycle labels render and only the open PR author can update the description',async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.ROBOS_CHROMIUM_PATH});try{const p=await b.newPage();await p.setContent('<button id="step-btn-8"><span class="step-label"></span></button><section id="stage-8"></section>');await require('./editor-test-helper')(p);await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/publish-ui.js')});
 for(const [state,isDraft,label] of [['OPEN',true,'In Draft'],['OPEN',false,'In Review'],['MERGED',false,'Merged'],['CLOSED',false,'Closed']]){
  await p.evaluate(({state,isDraft})=>{window.pr={local:true,published:true,isAuthor:true,state,isDraft,title:'Filters',body:'Original',number:484,repo:'org/repo',url:'https://github.com/org/repo/pull/484',headBranch:'codex/filters',baseBranch:'main'};window.api={updateReviewPR:async input=>{window.updateInput=input;return {ok:true,pr:{...window.pr,title:input.title,body:input.body}};}};window.configureReviewPublish(window.pr);},{state,isDraft});
  assert.equal(await p.locator('.step-label').innerText(),'Pull Request ('+label+')');assert.equal(await p.getByRole('button',{name:'Update PR',exact:true}).isVisible(),state==='OPEN');
 }
 await p.evaluate(()=>window.configureReviewPublish({...window.pr,state:'OPEN',isAuthor:false}));assert.equal(await p.getByRole('button',{name:'Update PR',exact:true}).isVisible(),false);
 await p.evaluate(()=>window.configureReviewPublish({...window.pr,state:'OPEN',isAuthor:true}));await p.getByLabel('Description',{exact:true}).fill('Fresh screenshots');await p.getByRole('button',{name:'Update PR',exact:true}).click();await p.getByRole('alert').filter({hasText:'PR description updated on GitHub.'}).waitFor();assert.equal((await p.evaluate(()=>window.updateInput)).expectedBody,'Original');
 }finally{await b.close();}
});

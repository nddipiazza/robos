'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('Slack notification is opt-in, previews escaped text and requires a destination',async()=>{
 const b=await chromium.launch({headless:true,...(process.env.ROBOS_CHROMIUM_PATH?{executablePath:process.env.ROBOS_CHROMIUM_PATH}:{})});try{const p=await b.newPage();await p.setContent('<div id="host"></div><input id="title" value="Filter changes"><textarea id="body"></textarea>');
 await p.evaluate(()=>{window.sent=[];window.api={reviewMessageOptions:async()=>({ok:true,appName:'Slack',settings:{prTemplate:'Changes: {{description}}',messageTemplate:'Review {{title}}\n{{url}}',serverId:'slack',channel:'',reviewers:[{serverId:'slack',userId:'U2',name:'Tim Potter'}]},servers:[{id:'slack',name:'Hermetiq Slack'}]}),reviewMessageMembers:async()=>({ok:true,members:[{serverId:'slack',userId:'U2',name:'Tim Potter'}]}),reviewMessageChannels:async()=>({ok:true,channels:[{id:'C1',name:'pr-review'}]}),sendReviewMessage:async input=>{window.sent.push(input);return {ok:true};}};});
 await p.addScriptTag({path:path.resolve(__dirname,'../../../robos-ui/reviewer-picker.js')});
 await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/message-options.js')});await p.evaluate(async()=>{window.msg=window.mountReviewMessageOptions(document.getElementById('host'),{repo:'org/repo',headBranch:'branch',body:'Tested'},document.getElementById('title'),document.getElementById('body'),{});await window.msg.ready;await window.msg.send();});
 assert.deepEqual(await p.evaluate(()=>window.sent),[]);assert.equal(await p.getByLabel('Send PR review notification to Slack').isChecked(),false);
 await p.getByLabel('Send PR review notification to Slack').check();assert.match(await p.getByLabel('Notification preview').innerText(),/PR link after creation/);
 assert.match(await p.evaluate(()=>{try{window.msg.validate();}catch(e){return e.message;}}),/Choose/);
 await p.getByLabel('@Tim Potter (U2)',{exact:true}).uncheck();assert.match(await p.evaluate(()=>{try{window.msg.validate();}catch(e){return e.message;}}),/Choose/);await p.getByLabel('Search reviewers').fill('@tim');await p.getByLabel('@Tim Potter (U2)',{exact:true}).check();assert.match(await p.getByLabel('Notification preview').innerText(),/@Tim Potter/);
 await p.getByLabel('Notification channel').selectOption('C1');await p.locator('#title').fill('<img src=x>');assert.equal(await p.locator('#host img').count(),0);
 await p.evaluate(async()=>{window.msg.validate();await window.msg.send();});assert.deepEqual(await p.evaluate(()=>window.sent),[{serverId:'slack',channel:'C1',reviewers:[{serverId:'slack',userId:'U2',name:'Tim Potter'}]}]);
 }finally{await b.close();}
});
test('notification follows successful PR creation and never a failed creation',async()=>{
 const b=await chromium.launch({headless:true,...(process.env.ROBOS_CHROMIUM_PATH?{executablePath:process.env.ROBOS_CHROMIUM_PATH}:{})});try{const p=await b.newPage();await p.route('http://review.test/',r=>r.fulfill({contentType:'text/html',body:'<h2 id="theater-pr-title"></h2><span id="theater-target-app"></span><button id="step-btn-8"><span class="step-label">Create PR</span></button><section id="stage-8"></section>'}));await p.goto('http://review.test/');
 await p.evaluate(()=>{window.events=[];window.fail=true;window.api={openUrl:()=>{},reviewMessageOptions:async()=>({ok:true,appName:'Slack',settings:{prTemplate:'{{description}}',messageTemplate:'{{title}} {{url}}',serverId:'slack',channel:'C1',reviewers:[{serverId:'slack',userId:'U2',name:'Tim Potter'}]},servers:[{id:'slack',name:'Hermetiq Slack'}]}),reviewMessageMembers:async()=>({ok:true,members:[{serverId:'slack',userId:'U2',name:'Tim Potter'}]}),reviewMessageChannels:async()=>({ok:true,channels:[{id:'C1',name:'pr-review'}]}),createReviewPR:async()=>{window.events.push('create');return window.fail?{ok:false,error:'Push your branch first'}:{ok:true,pr:{published:true,number:42,title:'Filters',url:'https://github.com/org/repo/pull/42',repo:'org/repo',headBranch:'codex/filters'}};},sendReviewMessage:async()=>{window.events.push('send');return {ok:true};},refreshReviewPR:async()=>({ok:true,pr:{local:true,published:true,isAuthor:true,state:'OPEN',number:42,title:'Filters',body:'Description',repo:'org/repo',headBranch:'codex/filters',url:'https://github.com/org/repo/pull/42'}})};});
 await p.addScriptTag({path:path.resolve(__dirname,'../../../robos-ui/reviewer-picker.js')});
 await require('./editor-test-helper')(p);
 for(const name of ['message-options','publish-ui'])await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/'+name+'.js')});await p.evaluate(()=>window.configureReviewPublish({local:true,title:'Filters',body:'Description',repo:'org/repo',headBranch:'codex/filters',baseBranch:'main'}));
 await p.getByLabel('Send PR review notification to Slack').check();await p.locator('#stage-8').getByRole('button',{name:'Create PR',exact:true}).click();await p.getByRole('alert').filter({hasText:'Push your branch first'}).waitFor();assert.deepEqual(await p.evaluate(()=>window.events),['create']);
 await p.evaluate(()=>window.fail=false);await p.locator('#stage-8').getByRole('button',{name:'Create PR',exact:true}).click();await p.getByRole('heading',{name:'Code review · Author mode'}).waitFor();assert.deepEqual(await p.evaluate(()=>window.events),['create','create','send']);
 }finally{await b.close();}
});
test('reviewer picker ignores a late workspace response and exposes directory failures',async()=>{
 const b=await chromium.launch({headless:true,...(process.env.ROBOS_CHROMIUM_PATH?{executablePath:process.env.ROBOS_CHROMIUM_PATH}:{})});try{
 const p=await b.newPage();await p.setContent('<div id="host"></div>');await p.addScriptTag({path:path.resolve(__dirname,'../../../robos-ui/reviewer-picker.js')});
 await p.evaluate(async()=>{
   window.picker=window.mountReviewerPicker(document.getElementById('host'),id=>id==='old'?new Promise(r=>window.old=r):Promise.resolve(id==='broken'?{ok:false,error:'Directory unavailable'}:{ok:true,members:[{serverId:id,userId:'U3',name:'New workspace member'}]}));
   window.loadingOld=window.picker.load('old');await window.picker.load('new');window.old({ok:true,members:[{serverId:'old',userId:'U2',name:'Old member'}]});await window.loadingOld;
 });
 assert.equal(await p.getByLabel('@Old member (U2)',{exact:true}).count(),0);
 await p.getByLabel('@New workspace member (U3)',{exact:true}).check();assert.equal((await p.evaluate(()=>window.picker.value()))[0].serverId,'new');
 await p.evaluate(()=>window.picker.load('broken'));
 assert.match(await p.getByRole('status').innerText(),/Directory unavailable/);
 assert.equal(await p.evaluate(()=>{try{window.picker.configured();}catch(e){return e.message;}}),'Directory unavailable');
 }finally{await b.close();}
});

test('Create PR preselects both project recipients without sending a message',async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.ROBOS_CHROMIUM_PATH||'/usr/bin/google-chrome'});
 try{
  const p=await b.newPage();await p.setContent('<div id="host"></div><input id="title"><textarea id="body"></textarea>');
  await p.evaluate(()=>{
   const reviewers=[{serverId:'slack',userId:'U1',name:'Cesar Andres'},{serverId:'slack',userId:'U2',name:'Tim Potter'}];
   window.api={reviewMessageOptions:async()=>({ok:true,appName:'Slack',settings:{prTemplate:'{{description}}',messageTemplate:'Review {{url}}',serverId:'slack',channel:'C1',reviewers},servers:[{id:'slack',name:'Team'}]}),reviewMessageMembers:async()=>({ok:true,members:reviewers}),reviewMessageChannels:async()=>({ok:true,channels:[{id:'C1',name:'pr-review'}]}),sendReviewMessage:async()=>{throw Error('Must not send during setup');}};
  });
  for(const file of ['../../../robos-ui/reviewer-picker.js','../../../pr-review/renderer/message-options.js'])await p.addScriptTag({path:path.resolve(__dirname,file)});
  await p.evaluate(async()=>{window.messageOptions=window.mountReviewMessageOptions(document.getElementById('host'),{repo:'Hermetiq/cloud-native'},document.getElementById('title'),document.getElementById('body'),{});await window.messageOptions.ready;});
  await p.getByLabel('Send PR review notification to Slack').check();
  assert.equal(await p.getByLabel('@Cesar Andres (U1)',{exact:true}).isChecked(),true);
  assert.equal(await p.getByLabel('@Tim Potter (U2)',{exact:true}).isChecked(),true);
  assert.equal((await p.evaluate(()=>window.messageOptions.selection())).reviewers.length,2);
 }finally{await b.close();}
});

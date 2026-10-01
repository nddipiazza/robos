'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('Slack notification is opt-in, previews escaped text and requires a destination',async()=>{
 const b=await chromium.launch({headless:true});try{const p=await b.newPage();await p.setContent('<div id="host"></div><input id="title" value="Filter changes"><textarea id="body"></textarea>');
 await p.evaluate(()=>{window.sent=[];window.api={reviewMessageOptions:async()=>({ok:true,appName:'Slack',settings:{prTemplate:'Changes: {{description}}',messageTemplate:'Review {{title}}\n{{url}}',serverId:'slack',channel:''},servers:[{id:'slack',name:'Hermetiq Slack'}]}),reviewMessageChannels:async()=>({ok:true,channels:[{id:'C1',name:'pr-review'}]}),sendReviewMessage:async input=>{window.sent.push(input);return {ok:true};}};});
 await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/message-options.js')});await p.evaluate(async()=>{window.msg=window.mountReviewMessageOptions(document.getElementById('host'),{repo:'org/repo',headBranch:'branch',body:'Tested'},document.getElementById('title'),document.getElementById('body'),{});await window.msg.ready;await window.msg.send();});
 assert.deepEqual(await p.evaluate(()=>window.sent),[]);assert.equal(await p.getByLabel('Send PR review notification to Slack').isChecked(),false);
 await p.getByLabel('Send PR review notification to Slack').check();assert.match(await p.getByLabel('Notification preview').innerText(),/PR link after creation/);
 assert.match(await p.evaluate(()=>{try{window.msg.validate();}catch(e){return e.message;}}),/Choose/);
 await p.getByLabel('Notification channel').selectOption('C1');await p.locator('#title').fill('<img src=x>');assert.equal(await p.locator('#host img').count(),0);
 await p.evaluate(async()=>{window.msg.validate();await window.msg.send();});assert.deepEqual(await p.evaluate(()=>window.sent),[{serverId:'slack',channel:'C1'}]);
 }finally{await b.close();}
});
test('notification follows successful PR creation and never a failed creation',async()=>{
 const b=await chromium.launch({headless:true});try{const p=await b.newPage();await p.route('http://review.test/',r=>r.fulfill({contentType:'text/html',body:'<h2 id="theater-pr-title"></h2><span id="theater-target-app"></span><button id="step-btn-8"><span class="step-label">Create PR</span></button><section id="stage-8"></section>'}));await p.goto('http://review.test/');
 await p.evaluate(()=>{window.events=[];window.fail=true;window.api={openUrl:()=>{},reviewMessageOptions:async()=>({ok:true,appName:'Slack',settings:{prTemplate:'{{description}}',messageTemplate:'{{title}} {{url}}',serverId:'slack',channel:'C1'},servers:[{id:'slack',name:'Hermetiq Slack'}]}),reviewMessageChannels:async()=>({ok:true,channels:[{id:'C1',name:'pr-review'}]}),createReviewPR:async()=>{window.events.push('create');return window.fail?{ok:false,error:'Push your branch first'}:{ok:true,pr:{published:true,number:42,title:'Filters',url:'https://github.com/org/repo/pull/42',repo:'org/repo',headBranch:'codex/filters'}};},sendReviewMessage:async()=>{window.events.push('send');return {ok:true};}};});
 await require('./editor-test-helper')(p);
 for(const name of ['message-options','publish-ui'])await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/'+name+'.js')});await p.evaluate(()=>window.configureReviewPublish({local:true,title:'Filters',body:'Description',repo:'org/repo',headBranch:'codex/filters',baseBranch:'main'}));
 await p.getByLabel('Send PR review notification to Slack').check();await p.locator('#stage-8').getByRole('button',{name:'Create PR',exact:true}).click();await p.getByRole('alert').filter({hasText:'Push your branch first'}).waitFor();assert.deepEqual(await p.evaluate(()=>window.events),['create']);
 await p.evaluate(()=>window.fail=false);await p.locator('#stage-8').getByRole('button',{name:'Create PR',exact:true}).click();await p.getByRole('status').filter({hasText:'Review notification sent.'}).waitFor();assert.deepEqual(await p.evaluate(()=>window.events),['create','create','send']);
 }finally{await b.close();}
});

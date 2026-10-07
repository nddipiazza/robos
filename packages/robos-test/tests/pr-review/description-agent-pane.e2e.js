'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core');
test('description editing and code suggestions share one resizable conversation pane',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'});
 try{
  const p=await browser.newPage({viewport:{width:1400,height:950}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('http://review.test/',r=>r.fulfill({body:'<html></html>',contentType:'text/html'}));await p.goto('http://review.test/');
  await p.setContent('<div class="theater-actions"></div><button id="step-btn-8"><span class="step-label"></span></button><div class="theater-stage-content"><section id="stage-9"></section><section id="stage-8"></section><section id="stage-3">Code diff remains visible</section></div>');
  await p.evaluate(()=>{window.calls=[];window.api={onDemoState:cb=>{window.demoState=cb;},generatePRDescription:async input=>{window.calls.push(input);return {ok:true,markdown:'Clearer description',warnings:[],selectedEvidence:[]};},updateReviewPR:async input=>{window.calls.push(input);return {ok:true,pr:{title:input.title,body:input.body}};},demoAction:async input=>{window.calls.push(input);return {ok:true};}};});
  for(const file of ['robos-ui/robos-ui.js','robos-ui/agent-discussion.js','pr-review/renderer/review-agent-pane.js'])await p.addScriptTag({path:path.resolve(__dirname,'../../../',file)});
  await require('./editor-test-helper')(p);
  for(const name of ['ai-description','publish-ui'])await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/'+name+'.js')});
  await p.addStyleTag({path:path.resolve(__dirname,'../../../pr-review/renderer/review-agent-pane.css')});
  await p.evaluate(()=>window.configureReviewPublish({local:true,published:true,isAuthor:true,state:'OPEN',number:1,title:'Task',body:'Original description',repo:'org/repo',headBranch:'codex/task',baseBranch:'main'}));
  assert.equal(await p.locator('#stage-9 review-markdown-editor').count(),1);assert.equal(await p.locator('#stage-8 review-markdown-editor').count(),0);
  await p.getByRole('button',{name:'Edit with agent',exact:true}).click();
  await p.locator('robos-agent-discussion .robos-ai-inner').fill('Make this shorter');await p.locator('robos-agent-discussion .robos-submit-btn').click();
  await p.waitForFunction(()=>document.querySelector('review-markdown-editor').value==='Clearer description');
  await p.getByRole('button',{name:'Save description',exact:true}).click();await p.getByRole('status').filter({hasText:'Description saved to GitHub.'}).waitFor();
  assert.equal((await p.evaluate(()=>window.calls))[0].request,'Make this shorter');assert.equal((await p.evaluate(()=>window.calls))[1].expectedBody,'Original description');
  await p.getByRole('button',{name:'Suggest changes',exact:true}).click();await p.locator('robos-agent-discussion .robos-ai-inner').fill('Fix the label');await p.locator('robos-agent-discussion .robos-submit-btn').click();
  await p.waitForFunction(()=>window.calls.some(c=>c.action==='suggest'));
  assert.equal(await p.locator('robos-agent-discussion').count(),1);assert.equal(await p.locator('#stage-3').isVisible(),true);
  const divider=p.getByRole('separator',{name:'Resize agent discussion'});await divider.focus();const before=await p.locator('.review-agent-pane').evaluate(e=>e.getBoundingClientRect().width);await divider.press('ArrowLeft');const after=await p.locator('.review-agent-pane').evaluate(e=>e.getBoundingClientRect().width);assert.ok(after>before);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('Description is the first review tab',()=>{const html=require('node:fs').readFileSync(path.resolve(__dirname,'../../../pr-review/renderer/index.html'),'utf8');const nav=html.slice(html.indexOf('id="theater-stepper"'));assert.equal(nav.match(/id="step-btn-(\d+)"/)[1],'9');});

'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {chromium}=require('playwright-core');
test('dirty Create PR offers recovery and preserves the draft without publishing',async()=>{
 const b=await chromium.launch({headless:true,executablePath:process.env.ROBOS_CHROMIUM_PATH||'/usr/bin/google-chrome'});
 try{
  const p=await b.newPage();await p.route('http://example.test/',route=>route.fulfill({body:'<html></html>',contentType:'text/html'}));await p.goto('http://example.test/');
  await p.setContent('<button id="step-btn-8"><span class="step-label"></span></button><section id="stage-8"></section>');
  await p.evaluate(()=>{window.calls=[];window.setTheaterStage=n=>window.calls.push(n);window.api={createReviewPR:async()=>({ok:false,code:'DIRTY_WORKTREE',error:'Uncommitted changes need review before creating the PR.'}),demoAction:async input=>{window.calls.push(input);return {ok:true};}};});
  await require('./editor-test-helper')(p);
  await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/publish-ui.js')});
  await p.evaluate(()=>window.configureReviewPublish({local:true,repo:'org/repo',headBranch:'codex/task',baseBranch:'main',title:'My task',body:'My draft'}));
  await p.getByRole('button',{name:'Create PR',exact:true}).click();
  await p.getByRole('button',{name:'Resolve uncommitted changes'}).click();
  assert.equal(await p.getByRole('button',{name:'Resolve uncommitted changes',includeHidden:true}).isVisible(),false);
  assert.equal(await p.getByRole('button',{name:'Create PR',exact:true}).isEnabled(),true);
  assert.deepEqual(await p.evaluate(()=>window.calls),[6,{action:'remediate'}]);
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('robos-pr-draft:org/repo:codex/task')).body),'My draft');
 }finally{await b.close();}
});

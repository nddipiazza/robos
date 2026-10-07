'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('follow latest defaults on, pauses without losing the visible message, and resumes immediately',async()=>{
 const b=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'});try{const p=await b.newPage();await p.route('http://review.test/',r=>r.fulfill({contentType:'text/html',body:'<robos-agent-discussion style="height:300px"></robos-agent-discussion><style>.agent-discussion-log{height:200px;overflow:auto}.walkthrough-bubble{height:90px}</style>'}));await p.goto('http://review.test/');
 await p.evaluate(()=>{customElements.define('robos-ai-textarea',class extends HTMLElement{connectedCallback(){this.innerHTML='<button class="robos-submit-btn"></button><div class="robos-ai-inner"></div>';}});window.state={status:'paused',index:0,total:1,process:{checkpoints:[{title:'One'}]},messages:Array.from({length:30},(_,i)=>({id:String(i),role:'assistant',text:'Message '+i}))};window.api={onDemoState:fn=>{window.renderState=fn;},getDemoState:async()=>window.state};});
 await p.addScriptTag({path:path.resolve(__dirname,'../../../robos-ui/agent-discussion.js')});await p.evaluate(()=>{window.renderState=value=>document.querySelector('robos-agent-discussion').value=value;renderState(state);});
 const toggle=p.getByRole('checkbox',{name:'Follow latest',exact:true});const bottom=()=>p.locator('.agent-discussion-log').evaluate(e=>e.scrollHeight-e.scrollTop-e.clientHeight<2);
 assert.equal(await toggle.isChecked(),true);assert.equal(await bottom(),true);
 await toggle.click();await p.locator('.agent-discussion-log').evaluate(e=>e.scrollTop=500);
 const anchor=()=>p.locator('.agent-discussion-log').evaluate(e=>{const n=[...e.children].find(n=>n.getBoundingClientRect().bottom>e.getBoundingClientRect().top);return [n.dataset.messageId,n.getBoundingClientRect().top-e.getBoundingClientRect().top];});const before=await anchor();
 await p.evaluate(()=>{state.messages.shift();state.messages.push({id:'30',role:'assistant',text:'New output'});renderState(state);});assert.deepEqual(await anchor(),before);assert.equal(await bottom(),false);
 await p.evaluate(()=>{window.renderState=value=>document.querySelector('robos-agent-discussion').value=value;renderState(state);});assert.equal(await toggle.isChecked(),false);await toggle.click();assert.equal(await bottom(),true);
 await p.evaluate(()=>{state.messages.push({id:'31',role:'assistant',text:'Latest output'});renderState(state);});assert.equal(await bottom(),true);
 }finally{await b.close();}
});

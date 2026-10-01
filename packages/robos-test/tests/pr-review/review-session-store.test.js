'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ReviewSessionStore}=require('../../../pr-review/lib/review-session-store');
const {DemoSession}=require('../../../pr-review/lib/demo-session');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-storage-'));const processFile=path.join(root,'process.json');fs.writeFileSync(processFile,JSON.stringify({instructions:'Demo',checkpoints:[{title:'One',given:'Ready',when:'Click',then:'Done'},{title:'Two',given:'Ready',when:'Click',then:'Done'}]}));const store=new ReviewSessionStore({repo:'org/repo',number:42,root});return {root,store,options:{workspace:root,processFile,store}};}
test('complete archive survives FIFO trimming and paginates with no gaps or duplicates',()=>{
 const {store,options}=fixture();const s=new DemoSession(options);for(let i=0;i<203;i++)s.addMessage({role:'user',text:`${i}: `+'界'.repeat(1800)});s.publish();assert.ok(s.messages.length<120);
 const seen=[];let cursor;do {const page=store.page(cursor);assert.ok(page.messages.length<=50);seen.push(...page.messages.map(m=>Number(m.text.split(':')[0])));cursor=page.before;}while(cursor);
 assert.equal(seen.length,203);assert.equal(new Set(seen).size,203);assert.ok(seen.includes(0));assert.ok(seen.includes(202));
 assert.equal(fs.statSync(store.transcript).mode & 0o777,0o600);
 const again=new DemoSession(options);assert.ok(again.messages.length>0);assert.ok(again.messages.length<=50);
});
test('paused checkpoint and native thread survive recreation; interrupted runs require explicit resume',async()=>{
 const {store,options}=fixture();const s=new DemoSession(options,async()=>({reply:'Ready',checkpointReached:true}));await s.act('start');s.handleAgentEvent({type:'thread.started',thread_id:'11111111-1111-1111-1111-111111111111'});
 let restored=new DemoSession(options);assert.equal(restored.status,'paused');assert.equal(restored.index,0);assert.equal(restored.agentThreads.feature,'11111111-1111-1111-1111-111111111111');assert.equal(restored.messages.at(-1).text,'Ready');
 s.status='running';s.failedIndex=1;s.publish();restored=new DemoSession(options);assert.equal(restored.status,'error');assert.equal(restored.failedIndex,1);assert.equal(restored.child,null);assert.match(restored.messages.at(-1).text,/closed during/);
 restored.runAgent=async p=>({reply:p.includes('Checkpoint 2/2')?'Resumed second':'wrong',checkpointReached:true});await restored.act('resume');assert.equal(restored.index,1);assert.equal(restored.messages.at(-1).text,'Resumed second');
});
test('clear window preserves archive, and later entries start a new visible conversation',()=>{
 const {store,options}=fixture();const s=new DemoSession(options);s.addMessage({role:'user',text:'Keep on disk'});s.clearChat();assert.equal(store.page().messages.length,0);assert.match(fs.readFileSync(store.transcript,'utf8'),/Keep on disk/);
 s.addMessage({role:'user',text:'New conversation'});s.publish();assert.deepEqual(store.page().messages.map(m=>m.text),['New conversation']);
});
test('review identities isolate PRs and local branches; unsafe cursors are rejected',()=>{
 const {store,root}=fixture();const other=new ReviewSessionStore({repo:'org/repo',number:43,root});assert.notEqual(other.directory,store.directory);
 store.append({text:'test'});assert.throws(()=>store.page(-1),/cursor/);
 const local=new ReviewSessionStore({repo:'org/repo',branch:'../../feature',workspace:'/a',root});assert.ok(local.directory.startsWith(root+path.sep));
});
test('malformed snapshot reports recovery trouble without deleting the archive',()=>{
 const {store,options}=fixture();store.append({text:'Saved history',role:'user'});fs.writeFileSync(store.snapshot,'broken');const s=new DemoSession(options);assert.match(s.state().persistenceError,/Could not restore/);assert.match(fs.readFileSync(store.transcript,'utf8'),/Saved history/);
});
test('a recreated session sends the persisted native thread id to exec resume',async()=>{
 const {root,options}=fixture();const executable=path.join(root,'fake-codex');
 fs.writeFileSync(executable,`#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv;const output=args[args.indexOf('--output-last-message')+1];process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'thread.started',thread_id:'22222222-2222-2222-2222-222222222222'}));fs.writeFileSync(output,JSON.stringify({reply:args.includes('resume') && args.includes('22222222-2222-2222-2222-222222222222')?'native resumed':'first run',checkpointReached:true}));});`,{mode:0o700});
 options.agent={command:executable,args:['exec'],timeoutMs:2000};const first=new DemoSession(options);await first.act('start');assert.equal(first.messages.at(-1).text,'first run');
 const reopened=new DemoSession(options);await reopened.act('resume');assert.equal(reopened.messages.at(-1).text,'native resumed');assert.equal(reopened.index,0);
});
test('short-message page boundary and full public narration are preserved',()=>{
 const {store,options}=fixture();for(let i=0;i<51;i++)store.append({role:'user',text:String(i)});
 const page=store.page();assert.equal(page.messages.length,50);assert.deepEqual(store.page(page.before).messages.map(m=>m.text),['0']);
 const s=new DemoSession(options);s.status='running';const text='Long public update\n'+'x'.repeat(2000);s.reportProgress(text);
 assert.equal(store.page().messages.at(-1).text,text);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {promptFor}=require('./review-lesson');
test('lesson teaches from bounded PR evidence without inventing validation',()=>{
 const prompt=promptFor({pr:{title:'Remove counts',body:'Navigation stays.',files:[{path:'src/Explorer.tsx'}]},diff:'x'.repeat(100001)});
 assert.match(prompt,/short teaching lesson/);assert.match(prompt,/Separate author-reported validation/);assert.match(prompt,/src\/Explorer.tsx/);assert.match(prompt,/\[Diff truncated\]/);assert.ok(prompt.length<103000);
});
test('summary execution uses the explicitly selected provider and model',()=>{
 const {argumentsFor,location}=require('./review-lesson');
 assert.deepEqual(argumentsFor({provider:'codex',model:'chosen-model'},'out','prompt').slice(-3),['-m','chosen-model','-']);
 const agy=argumentsFor({provider:'agy',model:'agy-model'},'out','prompt');assert.ok(agy.includes('--model'));assert.ok(agy.includes('agy-model'));assert.ok(agy.includes('--print=prompt'));
 assert.throws(()=>argumentsFor({},'',''),/Choose/);
 const ctx={pr:{title:'Example'},diff:'diff'};assert.notEqual(location(ctx,{provider:'codex',model:'a'}).file,location(ctx,{provider:'codex',model:'b'}).file);
});

test('refinement retains PR context and has its own cache entry, saved under the same PR',()=>{
 const {refinementPrompt,location}=require('./review-lesson');
 const ctx={pr:{title:'Example PR',files:[{path:'src/example.ts'}]},diff:'actual change'};
 const refinement={markdown:'Existing explanation',instruction:'Explain the key concept with an example'};
 const prompt=refinementPrompt(ctx,refinement);
 for(const text of ['Example PR','actual change','Existing explanation',refinement.instruction,'Preserve useful unrelated content'])assert.ok(prompt.includes(text));
 const selection={provider:'agy',model:'example-model'};
 const initial=location(ctx,selection),revised=location(ctx,selection,refinement);
 assert.notEqual(initial.file,revised.file);assert.equal(initial.latest,revised.latest);
 assert.notEqual(revised.file,location(ctx,selection,{...refinement,instruction:'Shorten it'}).file);
 assert.throws(()=>refinementPrompt(ctx,{markdown:'text',instruction:'  '}),/refinement request/);
 assert.throws(()=>refinementPrompt(ctx,{markdown:'',instruction:'change'}),/refinement request/);
});

test('summary freshness counts newer commits without generating a lesson',async()=>{
 const {freshness}=require('./review-lesson');
 const saved={markdown:'Refined lesson',head:'abc'},pr={url:'https://github.com/example/repo/pull/1',headRefOid:'def'};
 let calls=0;
 const command=async(_cmd,args)=>{calls++;assert.equal(args[1],'repos/example/repo/compare/abc...def');return JSON.stringify({ahead_by:3,status:'ahead'});};
 assert.deepEqual(await freshness(saved,pr,command),{...saved,stale:true,commitsBehind:3,diverged:false});
 await freshness(saved,{...pr,headRefOid:'abc'},command);assert.equal(calls,1);
 const unavailable=await freshness(saved,pr,async()=>{throw Error('offline');});
 assert.equal(unavailable.commitsBehind,null);assert.equal(unavailable.stale,true);
});

test('PR-level saved summary survives a new head and keeps its source commit',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {cached,location}=require('./review-lesson');
 const original=os.homedir,home=fs.mkdtempSync(path.join(os.tmpdir(),'robos-summary-cache-'));
 os.homedir=()=>home;
 try{
  const ctx={pr:{url:'https://github.com/example/repo/pull/7',headRefOid:'new',title:'New change'},diff:'new diff'};
  const loc=location(ctx,{});
  fs.mkdirSync(loc.root,{recursive:true});
  fs.writeFileSync(loc.prLatest,JSON.stringify({markdown:'Refined teaching',head:'old'}));
  assert.deepEqual(cached(ctx),{markdown:'Refined teaching',head:'old'});
  const other={...ctx,pr:{...ctx.pr,url:'https://github.com/example/repo/pull/8'}};
  assert.equal(cached(other),null);
 }finally{os.homedir=original;}
});

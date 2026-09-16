const {test}=require('node:test');const assert=require('node:assert/strict');const {createTheater,parseDiff}=require('./real-theater');
const url='https://github.com/org/repo/pull/1';
const context=async()=>({pr:{url,number:1,title:'Real change',body:'Evidence',headRefOid:'abc',baseRefName:'main',headRefName:'topic',files:[{path:'doc.md',additions:1,deletions:0}],statusCheckRollup:[]},diff:'diff --git a/doc.md b/doc.md\n--- a/doc.md\n+++ b/doc.md\n@@ -0,0 +1 @@\n+Document\n',questions:[{label:'Target?',options:['main','topic'],answer:'main'}]});
const gates={docsReviewed:true,diffsInspected:true,evidenceReviewed:true};
const input=c=>({repo:'org/repo',number:1,reviewId:c.reviewId,action:'approve',gates});
test('diff available before quiz; quiz follows review and wrong answers fail',async()=>{const t=createTheater({context});const c=await t.load({repo:'org/repo',number:1});assert.equal(c.fileDiffs[0].hunks[0].lines[0].text,'Document');assert.throws(()=>t.quiz({courseId:c.reviewId,answers:{q0:0}}),/before taking/);assert(!t.quiz({courseId:c.reviewId,answers:{},gates}).passed);assert(t.quiz({courseId:c.reviewId,answers:{q0:0},gates}).passed);});
test('optional certificate allows merge after review without quiz, but never without evidence',async()=>{let calls=0;const t=createTheater({context,policy:()=>({requireCompletionCertificate:false}),merge:async()=>{calls++;return {state:'MERGED'};}});const c=await t.load({repo:'org/repo',number:1});await assert.rejects(t.submit({...input(c),gates:{}}),/documentation/);await assert.rejects(t.submit({...input(c),number:2}),/Load this PR/);assert.equal(calls,0);assert((await t.submit(input(c))).merged);assert.equal(calls,1);});
test('required certificate enforced server-side and current policy rechecked at merge',async()=>{let required=false,calls=0;const t=createTheater({context,policy:()=>({requireCompletionCertificate:required}),merge:async()=>{calls++;return {state:'MERGED'};}});const c=await t.load({repo:'org/repo',number:1});required=true;await assert.rejects(t.submit(input(c)),/requires a passed knowledge check/);assert.equal(calls,0);t.quiz({courseId:c.reviewId,answers:{q0:0},gates});assert((await t.submit(input(c))).merged);});
test('binary files do not produce invented hunks',()=>assert.deepEqual(parseDiff('Binary files differ',[{path:'a.png',additions:0,deletions:0}])[0].hunks,[]));
test('inline comments use reviewed commit and correct old/new line; stale heads cannot post',async()=>{
 const calls=[];let head='abc';
 const t=createTheater({context,command:async(bin,args)=>{calls.push(args);return JSON.stringify(args.includes('POST')?{id:123,body:'Please fix'}:{state:'open',head:{sha:head,ref:'topic',repo:{full_name:'org/repo'}}});}});
 const c=await t.load({repo:'org/repo',number:1});const target={reviewId:c.reviewId,path:'doc.md',line:1,side:'RIGHT',body:'Please fix'};
 await t.inlineComment(target);const post=calls.find(a=>a.includes('POST'));assert.ok(post.includes('commit_id=abc'));assert.ok(post.includes('line=1'));assert.ok(post.includes('side=RIGHT'));assert.ok(post.includes('path=doc.md'));
 await assert.rejects(t.inlineComment({...target,side:'LEFT'}),/Select a line/);
 await assert.rejects(t.inlineComment({...target,path:'unrelated'}),/Select a line/);
 head='changed';await assert.rejects(t.inlineComment(target),/PR changed/);assert.equal(calls.filter(a=>a.includes('POST')).length,1);
});
test('diff coordinates handle deletions, context, additions and multiple hunks',()=>{
 const diff='diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -8,2 +8,2 @@\n context\n-old\n+new\n@@ -30,0 +31,1 @@\n+later\n';
 const f=parseDiff(diff,[{path:'x'}])[0];assert.deepEqual(f.hunks.flatMap(h=>h.lines).map(r=>[r.oldLine,r.newLine]),[[8,8],[9,null],[null,9],[null,31]]);
});

test('multi-line comments send GitHub range coordinates and AI fixes receive the selected block',async()=>{
 const calls=[];
 const diff='diff --git a/doc.md b/doc.md\n--- a/doc.md\n+++ b/doc.md\n@@ -8,3 +8,3 @@\n context\n-old\n+new\n end\n@@ -30 +30 @@\n later\n';
 const t=createTheater({context:async()=>({...await context(),diff}),command:async(_bin,args)=>{
  calls.push(args);return JSON.stringify(args.includes('POST')?{id:1}:{state:'open',head:{sha:'abc',ref:'topic',repo:{full_name:'org/repo'}}});
 }});
 const c=await t.load({repo:'org/repo',number:1});
 const input={reviewId:c.reviewId,path:'doc.md',startLine:8,line:10,side:'RIGHT',body:'Review this block'};
 const selected=await t.inlineTarget(input);
 assert.equal(selected.text,'context\nnew\nend');
 assert.equal(selected.startLine,8);
 await t.inlineComment(input);
 const post=calls.find(a=>a.includes('POST'));
 for(const value of ['start_line=8','start_side=RIGHT','line=10','side=RIGHT'])assert.ok(post.includes(value));
 assert.equal((await t.inlineTarget({...input,side:'LEFT'})).text,'context\nold\nend');
 await assert.rejects(t.inlineTarget({...input,line:30}),/continuous range/);
 await assert.rejects(t.inlineTarget({...input,startLine:11}),/continuous range/);
 await assert.rejects(t.inlineTarget({...input,startLine:0}),/continuous range/);
});

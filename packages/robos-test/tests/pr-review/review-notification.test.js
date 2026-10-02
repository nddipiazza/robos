'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const reviewers=[{serverId:'slack',userId:'U2',name:'Reviewer'}];
const settings=require('../../../robos-lib/project-review-settings');const {ReviewNotification}=require('../../../pr-review/lib/review-notification');
test('project templates persist by repository across URL formats and keep a PR link',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-settings-'));const initial=settings.read('org/repo',root);assert.ok(initial.messageTemplate.includes('{{url}}'));
 settings.save('https://github.com/Org/Repo.git',{...initial,messageTemplate:'Review {{title}}: {{url}}'},root);
 assert.equal(settings.read('git@github.com:org/repo.git',root).messageTemplate,'Review {{title}}: {{url}}');
 assert.throws(()=>settings.save('org/repo',{...initial,messageTemplate:'No link'},root),/url/);
 assert.equal(settings.format('{{title}} {{url}}',{title:'<untrusted>',url:'https://github.com/org/repo/pull/1'}),'<untrusted> https://github.com/org/repo/pull/1');
});
test('single provider is named Slack; multiple providers use messaging app',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-options-'));
 assert.equal((await settings.options('org/repo',async()=>({servers:[{id:'one',provider:'slack'}]}),root)).appName,'Slack');
 assert.equal((await settings.options('org/repo',async()=>({servers:[{id:'one',provider:'slack'},{id:'two',provider:'teams'}]}),root)).appName,'messaging app');
});
function fixture(fail=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-send-'));const file=path.join(dir,'review.json');fs.writeFileSync(file,'{}');let sends=0;
 const review={repo:'org/repo',pullRequest:{number:1,title:'Feature',url:'https://github.com/org/repo/pull/1'},pr:{headBranch:'codex/feature',body:'Description'}};
 const call=async(op,input)=>{if(op==='servers')return {servers:[{id:'slack',provider:'slack'}]};if(op==='status')return {userId:'U1'};if(op==='members')return {members:[{id:'U1',name:'Sender'},{id:'U2',name:'Reviewer'}]};if(op==='channels')return {channels:[{id:'C1',name:'pr-review'}]};if(op==='send'){sends++;assert.ok(input.text.includes(review.pullRequest.url));assert.match(input.text,/^<@U2>\n/);assert.ok(!input.text.includes('<@U1>'));assert.ok(input.requestId);if(fail)throw Error('Network uncertain');return {sent:true,ts:'123.456',text:input.text};}throw Error(op);};
 return {n:new ReviewNotification(review,file,call),review,file,call,sends:()=>sends};
}
test('notifications require a created PR, verified destination, and deduplicate concurrent/reopened sends',async()=>{
 const f=fixture();await assert.rejects(f.n.send({serverId:'other',channel:'C1',reviewers}),/configured/);assert.equal(f.sends(),0);
 const input={serverId:'slack',channel:'C1',reviewers};await Promise.all([f.n.send(input),f.n.send(input)]);assert.equal(f.sends(),1);
 await new ReviewNotification(f.review,f.file,f.call).send(input);assert.equal(f.sends(),1);
 f.review.pullRequest=null;await assert.rejects(f.n.send(input),/Create the PR/);
});
test('uncertain delivery remains recorded and never automatically resends',async()=>{
 const f=fixture(true);const input={serverId:'slack',channel:'C1',reviewers};await assert.rejects(f.n.send(input),/Network uncertain/);await assert.rejects(new ReviewNotification(f.review,f.file,f.call).send(input),/uncertain/);assert.equal(f.sends(),1);
});

test('reviewers persist as workspace-scoped IDs and resolve to current directory names',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-members-'));
 settings.save('org/repo',{...settings.read('org/repo',root),reviewers},root);
 assert.deepEqual(settings.read('org/repo',root).reviewers,reviewers);
 assert.throws(()=>settings.validateReviewers([{...reviewers[0],userId:'@someone'}]),/directory/);
 assert.throws(()=>settings.validateReviewers([...reviewers,...reviewers]),/Duplicate/);
 const f=fixture();
 assert.deepEqual(await settings.members('slack',f.call),reviewers);
 assert.deepEqual(await settings.resolveReviewers('slack',[{...reviewers[0],name:'Old name'}],f.call),reviewers);
 for(const selected of [[],[{...reviewers[0],userId:'U1'}],[{...reviewers[0],serverId:'other'}],[{...reviewers[0],userId:'U3'}]]) {
  await assert.rejects(f.n.send({serverId:'slack',channel:'C1',reviewers:selected}),/reviewer|Reviewer/);
 }
 assert.equal(f.sends(),0);
});
test('directory follows pagination, deduplicates IDs, and refuses stale results',async()=>{
 const calls=[];
 const call=async(op,args)=>{calls.push([op,args]);if(op==='servers')return {servers:[{id:'slack',provider:'slack'}]};if(op==='status')return {userId:'U1'};return args.cursor?{members:[{id:'U3',name:'Second'}]}:{members:[{id:'U1',name:'Sender'},{id:'U2',name:'First'}],nextCursor:'next'};};
 assert.deepEqual((await settings.members('slack',call)).map(m=>m.userId),['U2','U3']);
 assert.equal(calls.at(-1)[1].cursor,'next');
 await assert.rejects(settings.members('slack',async(op,args)=>op==='members'?{members:[],freshness:{stale:true}}:call(op,args)),/Refresh/);
});

test('a send response without actual mentions remains uncertain',async()=>{
 const f=fixture();const n=new ReviewNotification(f.review,f.file,async(op,input)=>op==='send'?{sent:true,ts:'1.2',text:'Plain text without pings'}:f.call(op,input));
 await assert.rejects(n.send({serverId:'slack',channel:'C1',reviewers}),/mentions was not confirmed/);
 assert.equal(JSON.parse(fs.readFileSync(f.file)).reviewNotification.status,'uncertain');
});

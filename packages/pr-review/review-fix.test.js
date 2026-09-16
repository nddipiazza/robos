'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validate,instructions}=require('./review-fix');
const target={prUrl:'https://github.com/org/repo/pull/3',repo:'org/repo',headRepo:'org/repo',branch:'topic',head:'a'.repeat(40),path:'x',line:2,side:'RIGHT'};
const state={plan:'Implement scoped change',prs:[{url:target.prUrl}]};const config={repositories:['https://github.com/org/repo']};
test('review fix reuses saved plan and existing PR; rejects unrelated/fork/unplanned work',()=>{
 const fix=validate(state,target,'Fix the null access',config);assert.ok(fix.id);assert.match(instructions(fix),/EXISTING PR/);assert.match(instructions(fix),/never force-push/);
 assert.throws(()=>validate({...state,plan:''},target,'fix',config),/Task Planner/);
 assert.throws(()=>validate(state,{...target,headRepo:'other/repo'},'fix',config),/fork/);
 assert.throws(()=>validate({...state,prs:[]},target,'fix',config),/not linked/);
 assert.throws(()=>validate(state,target,'fix',{repositories:[]}),/Include the PR repository/);
 assert.throws(()=>validate(state,target,'',config),/Describe/);
});
test('new fix session launches existing task in runner without creating a ticket',async()=>{
 const calls=[];const services={read:()=>state,startWorker:async(...args)=>{calls.push(args);return {workerPid:123};},launchApp:async(...args)=>calls.push(args)};
 const url='https://github.com/org/tasks/issues/62';const result=await require('./review-fix').start(url,target,'Fix it',config,'electron',services);
 assert.equal(result.workerPid,123);assert.equal(calls[0][0],url);assert.equal(calls[0][2].plan,state.plan);assert.equal(calls[0][2].reviewFix.prUrl,target.prUrl);assert.equal(calls[1][0],'robos-agent-task-runner');assert.equal(calls[1][1],url);
});
test('completion refreshes only the launched session and PR, with failures reported separately',()=>{
 const {completion}=require('./review-fix-state');const watch={id:'one',pr:{url:target.prUrl}},done={reviewFix:{id:'one'},phase:'review'};
 assert.equal(completion(watch,done,target.prUrl,true),'refresh');
 assert.equal(completion(watch,done,'https://github.com/org/repo/pull/4',true),'away');
 assert.equal(completion(watch,done,target.prUrl,false),'away');
 assert.equal(completion(watch,{...done,phase:'implementing'},target.prUrl,true),'running');
 assert.equal(completion(watch,{...done,phase:'failed'},target.prUrl,true),'error');
 assert.equal(completion(watch,{...done,reviewFix:{id:'two'}},target.prUrl,true),'superseded');
});

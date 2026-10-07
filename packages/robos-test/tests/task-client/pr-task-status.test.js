'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {syncPRTaskStatus}=require('../../../robos-task-client/pr-task-status');
const review={repo:'org/code',task:{url:'https://github.com/org/tracker/issues/12'}};
test('draft and ready PRs update the task repository and remove stale state labels',async()=>{
 for(const isDraft of [true,false]){
  const calls=[];let notified=false;const target='state:'+(isDraft?'draft-pr-pipeline-review':'human-review');
  const run=async(args,opts)=>{calls.push(args);assert.equal(opts.repo,'org/tracker');if(args[0]==='issue'&&args[1]==='view')return JSON.stringify({state:'OPEN',labels:[{name:'state:local-evidence-review'},{name:'state:designed'},{name:'bug'}]});if(args[0]==='label')return JSON.stringify([{name:target}]);return '';};
  await syncPRTaskStatus(review,{state:'OPEN',isDraft},{run,notify:()=>notified=true});
  const edit=calls.find(a=>a[1]==='edit');assert.ok(edit.includes(target));assert.ok(edit.includes('state:local-evidence-review'));assert.ok(edit.includes('state:designed'));assert.ok(!edit.includes('bug'));assert.equal(notified,true);
 }
});
test('closed tasks stay closed; failed updates do not notify Dev Central',async()=>{
 let notified=false;
 await syncPRTaskStatus(review,{state:'OPEN',isDraft:true},{run:async()=>JSON.stringify({state:'CLOSED'}),notify:()=>notified=true});assert.equal(notified,false);
 await assert.rejects(syncPRTaskStatus(review,{state:'OPEN',isDraft:true},{run:async()=>{throw Error('Auth failed');},notify:()=>notified=true}),/Auth failed/);assert.equal(notified,false);
});
test('an already correct stage needs no write',async()=>{
 let calls=0;await syncPRTaskStatus(review,{state:'OPEN',isDraft:false},{run:async()=>{calls++;return JSON.stringify({state:'OPEN',labels:[{name:'state:human-review'}]});},notify:()=>{}});assert.equal(calls,1);
});

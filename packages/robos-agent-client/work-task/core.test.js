'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {inspect}=require('./core');const {approveAndMerge,checksReady}=require('./review');
const url='https://github.com/org/tasks/issues/53';
function fixture(state,prs){return async args=>args[0]==='issue'?{url,state,title:'Task'}:{data:{repository:{issue:{timelineItems:{nodes:prs.map(p=>({source:p})),pageInfo:{hasNextPage:false}}}}}};}
test('open issue routes to planner without a PR',async()=>assert.equal((await inspect(url,fixture('OPEN',[]))).route,'task-planner'));
test('linked draft PR routes to review theater even when issue is closed',async()=>{const r=await inspect(url,fixture('CLOSED',[{url:'https://github.com/org/code/pull/7',state:'OPEN',isDraft:true}]));assert.equal(r.route,'pr-review');assert.equal(r.prs[0].isDraft,true);});
test('closed issue without open PRs is complete',async()=>assert.equal((await inspect(url,fixture('CLOSED',[{url:'https://github.com/org/code/pull/7',state:'MERGED'}]))).route,'complete'));
test('GitHub errors do not route to a made-up workflow',async()=>await assert.rejects(inspect(url,async()=>{throw Error('offline');}),/offline/));
test('approval rejects changed heads before any mutation',async()=>await assert.rejects(approveAndMerge('https://github.com/org/code/pull/7','old','',async()=>{throw Error('must not mutate');},async()=>({state:'OPEN',headRefOid:'new'})),/changed/));
test('merge targets reviewed SHA and verifies remote state',async()=>{const calls=[];let reads=0;const result=await approveAndMerge('https://github.com/org/code/pull/7','abc','reviewed',async(bin,args)=>{calls.push(args);return args[0]==='api'?'reviewer':'';},async()=>++reads===1?{state:'OPEN',headRefOid:'abc',author:{login:'author'},isDraft:true,statusCheckRollup:[]}:{state:'MERGED',url:'https://github.com/org/code/pull/7',mergeCommit:{oid:'def'}});assert.equal(result.commit,'def');assert(calls.some(a=>a.includes('--match-head-commit')&&a.includes('abc')));assert(!calls.some(a=>a.includes('--admin')));});
test('no false merged success for queued merge',async()=>{let reads=0;await assert.rejects(approveAndMerge('https://github.com/org/code/pull/7','abc','',async()=> 'author',async()=>++reads===1?{state:'OPEN',headRefOid:'abc',author:{login:'author'},statusCheckRollup:[]}:{state:'OPEN'}),/not merged/);});
test('pending and failed checks block merging',()=>{assert(!checksReady([{status:'IN_PROGRESS'}]));assert(!checksReady([{conclusion:'FAILURE'}]));assert(checksReady([{conclusion:'SUCCESS'}]));});

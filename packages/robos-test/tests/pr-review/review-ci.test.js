'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {summarize,readCI}=require('../../../robos-lib/review-ci');
test('failure takes precedence over pending and success across GitHub status formats',()=>{
 const r=summarize([{context:'Buildkite',state:'FAILURE',targetUrl:'https://example.com/build'},{name:'Tests',conclusion:'SUCCESS'},{name:'Lint',status:'QUEUED'}]);
 assert.equal(r.state,'failed');assert.equal(r.checks[0].detailsUrl,'https://example.com/build');
});
test('empty and unfinished checks never claim a pass',()=>{
 assert.equal(summarize([]).state,'unknown');assert.equal(summarize([{status:'IN_PROGRESS'}]).state,'pending');
 assert.equal(summarize([{conclusion:'SUCCESS'}]).state,'passed');
 for(const conclusion of ['TIMED_OUT','CANCELLED','ACTION_REQUIRED','ERROR'])assert.equal(summarize([{conclusion}]).state,'failed');
});
test('GitHub failure is unavailable, not sample passing checks',async()=>{
 const r=await readCI({repo:'org/repo',pullRequest:{number:123}},{refresh:true,run:async()=>{throw Error('offline');}});
 assert.equal(r.state,'unknown');assert.deepEqual(r.checks,[]);
});
test('reads checks using the review account and returns the current head',async()=>{
 const calls=[];const run=async(cmd,args,opts)=>{calls.push({cmd,args,opts});return {stdout:args[0]==='auth'?'private-token':JSON.stringify({statusCheckRollup:[{context:'buildkite/cloud-native',state:'FAILURE'}],headRefOid:'abc',url:'https://github.com/org/repo/pull/123'})};};
 const r=await readCI({repo:'org/repo',githubAccount:'reviewer',pullRequest:{number:123}},{refresh:true,run});
 assert.equal(r.state,'failed');assert.equal(r.head,'abc');assert.equal(calls[1].opts.env.GH_TOKEN,'private-token');assert.deepEqual(calls[0].args,['auth','token','--user','reviewer']);
});
test('unpublished reviews do not invoke GitHub',async()=>{assert.equal((await readCI({}, {run:()=>{throw Error('unexpected')}})).state,'unpublished');});
test('Buildkite checks include actual failed jobs only for the matching PR revision',async()=>{
 const review={repo:'org/repo',pullRequest:{number:222}};
 const run=async()=>({stdout:JSON.stringify({headRefOid:'abc',statusCheckRollup:[{context:'buildkite/cloud-native',state:'FAILURE',targetUrl:'https://buildkite.com/hermetiq/cloud-native/builds/1130'}]})});
 const buildkiteDetail=async()=>({number:1130,head:'abc',jobs:[{name:'Browser',conclusion:'failure'}]});
 const result=await readCI(review,{refresh:true,run,buildkiteDetail});assert.equal(result.checks[0].jobs[0].name,'Browser');
 const stale=await readCI(review,{refresh:true,run,buildkiteDetail:async()=>({head:'old',jobs:[]})});assert.match(stale.checks[0].providerError,/different commit/);assert.equal(stale.checks[0].jobs,undefined);
 const unavailable=await readCI(review,{refresh:true,run,buildkiteDetail:async()=>{throw Error('Token unavailable');}});assert.equal(unavailable.state,'failed');assert.match(unavailable.checks[0].providerError,/Token unavailable/);
});

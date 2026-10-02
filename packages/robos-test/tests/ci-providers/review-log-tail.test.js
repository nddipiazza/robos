'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readReviewLogTail}=require('../../../robos-lib/ci/review-log-tail');
const {Buildkite}=require('../../../robos-lib/ci/buildkite');
test('job tails are scoped to the current review, job and revision',async()=>{
 const check={provider:'buildkite',detailsUrl:'https://buildkite.com/org/pipeline/builds/3',jobs:[{id:'job'}]};let reads=0;
 const deps={status:async()=>({head:'abc',checks:[check]}),connection:()=>({number:3}),client:()=>({tail:async()=>{reads++;return 'latest output';}})};
 const input={head:'abc',buildUrl:check.detailsUrl,jobId:'job'};
 assert.equal((await readReviewLogTail({},input,deps)).content,'latest output');
 for(const bad of [{...input,head:'old'},{...input,jobId:'other'},{...input,buildUrl:'https://evil.test'}])await assert.rejects(readReviewLogTail({},bad,deps));
 check.providerError='stale';await assert.rejects(readReviewLogTail({},input,deps));assert.equal(reads,1);
});
test('tail requests use a suffix range, retain bounded output and redact the credential',async()=>{
 let range;const client=new Buildkite({org:'org',pipeline:'pipeline'},{run:async()=>({stdout:'private-token'}),fetchImpl:async(_,opts)=>{range=opts.headers.Range;return {ok:true,body:new ReadableStream({start(c){for(let i=0;i<5;i++)c.enqueue(new TextEncoder().encode('x'.repeat(65536)));c.enqueue(new TextEncoder().encode('newest private-token'));c.close();}})};}});
 const content=await client.tail(3,'01a0fd7e-0008-4be4-a149-f3a55d66d8ba');assert.equal(range,'bytes=-65536');assert.ok(content.length<=65536);assert.ok(content.endsWith('newest [REDACTED]'));assert.ok(!content.includes('private-token'));
});

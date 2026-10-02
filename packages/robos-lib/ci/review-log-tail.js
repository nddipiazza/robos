'use strict';
const {readCI}=require('../review-ci');
const connections=require('./connections');
const {Buildkite}=require('./buildkite');
async function readReviewLogTail(review,input,{status=()=>readCI(review),connection=connections.forBuild,client=config=>new Buildkite(config)}={}){
 const ci=await status();
 if(!input||input.head!==ci.head)throw Error('The PR revision changed. Refresh CI before opening this log.');
 const check=ci.checks.find(c=>c.provider==='buildkite'&&c.detailsUrl===input.buildUrl);
 if(!check||check.providerError||!check.jobs?.some(j=>j.id===input.jobId))throw Error('Choose a current job from this review.');
 const config=connection(input.buildUrl);if(!config)throw Error('Buildkite is unavailable for this review.');
 const content=await client(config).tail(config.number,input.jobId);
 return {ok:true,content,head:ci.head,jobId:input.jobId,checkedAt:new Date().toISOString(),limitBytes:65536};
}
module.exports={readReviewLogTail};

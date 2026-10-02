'use strict';
const {execFile}=require('node:child_process'),{promisify}=require('node:util');const exec=promisify(execFile);const cache=new Map();
function summarize(rows=[]){
 const checks=rows.map(c=>{const raw=String(c.conclusion||c.state||c.status||'').toUpperCase();const state=['FAILURE','ERROR','TIMED_OUT','CANCELLED','ACTION_REQUIRED','STARTUP_FAILURE'].includes(raw)?'failure':['SUCCESS','NEUTRAL','SKIPPED'].includes(raw)?'success':'pending';return {name:c.name||c.context||'CI check',state,detailsUrl:c.detailsUrl||c.targetUrl||'',description:raw.replaceAll('_',' ').toLowerCase()};});
 return {state:checks.some(c=>c.state==='failure')?'failed':checks.some(c=>c.state==='pending')?'pending':checks.length?'passed':'unknown',checks};
}
async function readCI(review,{run=exec,refresh=false,buildkiteDetail}={}){
 if(!review.pullRequest?.number)return {state:'unpublished',checks:[]};
 const key=review.repo+':'+review.pullRequest.number+':'+(review.githubAccount||'');if(!refresh&&cache.has(key)&&Date.now()-cache.get(key).at<30000)return cache.get(key).value;
 try{if(!/^[\w.-]+\/[\w.-]+$/.test(review.repo)||!Number.isInteger(review.pullRequest.number))throw Error('Invalid PR identity');const env={...process.env};if(review.githubAccount)env.GH_TOKEN=(await run('gh',['auth','token','--user',review.githubAccount],{encoding:'utf8',timeout:15000})).stdout.trim();const result=await run('gh',['pr','view',String(review.pullRequest.number),'--repo',review.repo,'--json','statusCheckRollup,headRefOid,url'],{env,encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});const data=JSON.parse(result.stdout);const value={...summarize(data.statusCheckRollup),head:data.headRefOid,url:data.url,checkedAt:new Date().toISOString()};for(const check of value.checks){
 const config=require('./ci/connections').forBuild(check.detailsUrl);
 if(!config)continue;
 check.provider='buildkite';
 try{const build=await (buildkiteDetail?buildkiteDetail(config):new (require('./ci/buildkite').Buildkite)(config).build(config.number));
  if(build.head!==value.head){check.providerError='Buildkite is reporting a different commit.';continue;}
  check.jobs=build.jobs;check.buildNumber=build.number;
 }catch(e){check.providerError=e.message;}
 }
 cache.set(key,{at:Date.now(),value});return value;}catch{return {state:'unknown',checks:[],error:'Unable to refresh CI status from GitHub.'};}
}
module.exports={readCI,summarize};

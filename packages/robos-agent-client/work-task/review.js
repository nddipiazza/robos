'use strict';
const {gh,command}=require('./core');
function prIdentity(url){const m=/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)$/.exec(url||'');if(!m)throw Error('Invalid GitHub PR URL');return{repo:m[1],number:Number(m[2])};}
async function context(url){
  prIdentity(url);
  const pr=await gh(['pr','view',url,'--json','number,title,body,url,state,isDraft,headRefOid,headRefName,baseRefName,author,files,statusCheckRollup']);
  const diff=await command('gh',['pr','diff',url]);
  const current=await gh(['pr','view',url,'--json','headRefOid']);
  if(current.headRefOid!==pr.headRefOid)throw Error('The PR changed while loading. Reload its review.');
  const file=pr.files?.[0]?.path||'(no changed files)';
  const questions=[
    {label:'Which task is this review for?',answer:pr.title,options:[pr.title,'A different task']},
    {label:'Which branch receives these changes?',answer:pr.baseRefName,options:[pr.baseRefName,pr.headRefName].filter((v,i,a)=>a.indexOf(v)===i)},
    {label:'Which branch contains the proposed work?',answer:pr.headRefName,options:[pr.baseRefName,pr.headRefName].filter((v,i,a)=>a.indexOf(v)===i)},
    {label:'Which file is included in this PR?',answer:file,options:[file,'No repository changes']},
    {label:'Which commit will approval apply to?',answer:pr.headRefOid,options:[pr.headRefOid,'Any future commit on this branch']},
  ];
  return{pr,diff,questions};
}
function checksReady(checks=[]){return checks.every(c=>['SUCCESS','NEUTRAL','SKIPPED'].includes(c.conclusion||c.state));}
async function approveAndMerge(url,head,notes,run=command,query=gh){
  prIdentity(url);
  const pr=await query(['pr','view',url,'--json','headRefOid,state,isDraft,statusCheckRollup,author']);
  if(pr.state!=='OPEN')throw Error('PR is no longer open. Refresh the review.');
  if(pr.headRefOid!==head)throw Error('PR changed since review. Review the new commit before merging.');
  if(!checksReady(pr.statusCheckRollup))throw Error('PR checks are pending or failing.');
  const login=(await run('gh',['api','user','--jq','.login'])).trim();
  // GitHub forbids authors approving their own PR; local theater approval never bypasses branch rules.
  if(login!==pr.author.login)await run('gh',['pr','review',url,'--approve','--body',notes||'Reviewed and approved in RobOS PR Review Theater.']);
  if(pr.isDraft)await run('gh',['pr','ready',url]);
  await run('gh',['pr','merge',url,'--squash','--match-head-commit',head]);
  const merged=await query(['pr','view',url,'--json','state,mergeCommit,url']);
  if(merged.state!=='MERGED')throw Error('GitHub has not merged the PR. It may be queued or require additional checks/reviews.');
  return{url:merged.url,commit:merged.mergeCommit?.oid,state:'MERGED'};
}
module.exports={prIdentity,context,checksReady,approveAndMerge};

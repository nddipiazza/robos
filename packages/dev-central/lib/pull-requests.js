'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const fields='number,title,state,url,author,isDraft,headRefOid,headRefName,baseRefName,body,statusCheckRollup,reviewDecision,updatedAt,additions,deletions';
const run=args=>require('../../robos-task-client/github-command').runGitHub(args);
function parseURL(url){const m=String(url).match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)$/);if(!m)throw Error('Invalid GitHub PR URL.');return {repo:m[1],number:Number(m[2])};}
function passing(checks){const states=(checks||[]).map(c=>c.status==='COMPLETED'?c.conclusion:c.status||c.state);return states.includes('SUCCESS')&&states.every(s=>['SUCCESS','SKIPPED','NEUTRAL'].includes(s));}
async function list(repos,gh=run){
 const data=[],errors=[];
 await Promise.all([...new Set(repos.map(r=>`${r.org}/${r.repo}`))].map(async repo=>{
  try{const rows=JSON.parse(await gh(['pr','list','--repo',repo,'--author','@me','--state','open','--limit','100','--json',fields]));data.push(...rows.map(pr=>({...pr,repo})));}
  catch(e){errors.push(`${repo}: ${e.message}`);}
 }));
 return {ok:true,data,warning:errors.join('\n')};
}
const pending=new Set();
async function ready(url,head,gh=run,reviewers=[]){
 parseURL(url);if(pending.has(url))throw Error('This PR is already being updated.');pending.add(url);
 try{
  const pr=JSON.parse(await gh(['pr','view',url,'--json',fields]));const login=JSON.parse(await gh(['api','user'])).login;
  if(pr.url!==url||pr.state!=='OPEN'||!pr.isDraft||!login||pr.author?.login?.toLowerCase()!==login.toLowerCase())throw Error('Only your open draft PRs can be marked ready here.');
  const selected=require('../../robos-lib/project-review-settings').validateGitHubReviewers(reviewers).filter(r=>r.toLowerCase()!==pr.author.login.toLowerCase());
  if(!head||pr.headRefOid!==head)throw Error('The PR branch changed. Refresh the list before trying again.');
  if(!passing(pr.statusCheckRollup))throw Error('CI has not passed. Refresh the list to see the latest checks.');
  await gh(['pr','ready',url]);const updated=JSON.parse(await gh(['pr','view',url,'--json',fields]));
  if(updated.isDraft)throw Error('GitHub did not confirm the PR is ready. Refresh before retrying.');
  if(selected.length){try{await gh(['pr','edit',url,'--add-reviewer',selected.join(',')]);}catch(e){updated.reviewerError='PR is ready, but reviewer requests failed: '+e.message;}}
  return {...updated,...parseURL(url),author:updated.author?.login,headBranch:updated.headRefName,baseBranch:updated.baseRefName};
 }finally{pending.delete(url);}
}
function reviewEnvironment(url,root=path.join(os.homedir(),'.robos','local-reviews')){
 parseURL(url);const env={...process.env};delete env.ROBOS_LOCAL_REVIEW;env.ROBOS_REVIEW_URL=url;
 if(fs.existsSync(root))for(const entry of fs.readdirSync(root,{withFileTypes:true})){
  if(!entry.isDirectory())continue;const file=path.join(root,entry.name,'review.json');
  try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.pullRequest?.url===url&&fs.existsSync(saved.workspace)){env.ROBOS_LOCAL_REVIEW=file;break;}}catch{}
 }
 return env;
}
module.exports={list,ready,reviewEnvironment,parseURL,fields,run,passing};

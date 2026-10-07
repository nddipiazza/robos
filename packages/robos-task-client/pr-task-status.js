'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const notificationFile=()=>path.join(os.homedir(),'.config/robos/task-status-changed.json');
async function syncPRTaskStatus(review,pr,{run=require('./github-command').runGitHub,notify=()=>{const file=notificationFile();fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({at:Date.now(),taskUrl:review.task?.url||review.taskUrl,prUrl:pr.url}));}}={}){
 const taskUrl=review.task?.url||review.taskUrl;if(!taskUrl)return null;
 let url;try{url=new URL(taskUrl);}catch{throw Error('The task URL is invalid.');}
 const m=url.pathname.match(/^\/([^/]+\/[^/]+)\/issues\/(\d+)\/?$/);
 if(url.hostname!=='github.com'||!m)throw Error('Automatic PR status updates require a GitHub task URL.');
 if(pr.state!=='OPEN')return null;
 if(typeof pr.isDraft!=='boolean')throw Error('Could not determine whether the PR is a draft.');
 const [,repo,number]=m,options={repo};
 const issue=JSON.parse(await run(['issue','view',number,'--repo',repo,'--json','state,labels'],options));
 if(issue.state==='CLOSED')return null;
 const stage=pr.isDraft?'draft-pr-pipeline-review':'human-review',target='state:'+stage;
 const labels=issue.labels.map(l=>typeof l==='string'?l:l.name);
 const old=labels.filter(l=>l.startsWith('state:')&&l!==target);
 if(!labels.includes(target)||old.length){
  const known=JSON.parse(await run(['label','list','--repo',repo,'--search',target,'--limit','100','--json','name'],options));
  if(!known.some(l=>l.name===target))await run(['label','create',target,'--repo',repo,'--color',pr.isDraft?'db8b54':'58a6ff'],options);
  const args=['issue','edit',number,'--repo',repo,'--add-label',target];for(const label of old)args.push('--remove-label',label);
  await run(args,options);
 }
 notify();return stage;
}
async function syncReviewTask(review,pr){
 try{await syncPRTaskStatus(review,pr);delete review.pr.taskSyncWarning;}
 catch(error){review.pr.taskSyncWarning='PR saved, but the task status could not be updated: '+error.message;}
}
module.exports={syncPRTaskStatus,syncReviewTask,notificationFile};

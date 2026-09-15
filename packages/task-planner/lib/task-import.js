'use strict';
const path=require('path'),{createHash}=require('crypto');
const core=require('../../robos-agent-client/work-task/core');
const {saveProject}=require('./project-store');
function repoFor(server){
 if(!server)throw Error('No task server configured. Open Task Servers to add one.');
 if(server.type!=='github')throw Error('Import currently supports GitHub task servers.');
 const repo=`${server.gh_org||server.repos?.[0]?.org||''}/${server.gh_repo||server.repos?.[0]?.repo||''}`;
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw Error('The task server has no valid GitHub repository.');return repo;
}
function existingIssue(projects,url){return projects.find(p=>p.workTaskUrl===url||p.sourceIssueUrl===url||(p.tasks||[]).some(t=>t.ticketUrl===url));}
async function search(server,{query='',state='open'},projects,gh=core.gh){
 const repo=repoFor(server);if(!['open','closed','all'].includes(state))throw Error('Invalid issue state');
 const args=['issue','list','--repo',repo,'--state',state,'--limit','100','--json','number,title,body,state,url,labels,updatedAt,issueType'];
 const q=query.trim().replace(/^#(?=\d+$)/,'');if(q)args.push('--search',q);
 const issues=await gh(args);return {repo,issues:issues.map(i=>({...i,imported:existingIssue(projects,i.url)?.product?.name|| (existingIssue(projects,i.url)?'Saved in Planner':null)})),limited:issues.length===100};
}
async function importIssues(server,{projectId,numbers},projects,dir,gh=core.gh,saveState=core.save){
 const repo=repoFor(server),target=projects.find(p=>p.id===projectId);
 if(!target?.product)throw Error('Choose a project before importing tasks.');
 if(!Array.isArray(numbers)||!numbers.length||numbers.length>100||numbers.some(n=>!Number.isSafeInteger(n)||n<1))throw Error('Select between 1 and 100 issues.');
 const results=[];
 for(const number of new Set(numbers)){
  try{
   const issue=await gh(['issue','view',String(number),'--repo',repo,'--json','number,title,body,state,url,labels,updatedAt,issueType,assignees']);
   const duplicate=existingIssue(projects,issue.url);if(duplicate){results.push({number,skipped:true,name:duplicate.name});continue;}
   const id='work-task-'+createHash('sha256').update(issue.url.toLowerCase()).digest('hex').slice(0,24);
   const feature=['feature','epic'].includes(issue.issueType?.name?.toLowerCase())||issue.labels.some(l=>/^(feature|epic|type:feature|type:epic)$/i.test(l.name));
   const saved=saveProject(dir,{id,name:issue.title,kind:feature?'epic':'task',product:target.product,workTaskUrl:issue.url,serverId:server.id,prompt:`${issue.url}\n\n${issue.body||''}`,tasks:[{title:issue.title,body:issue.body||'',labels:issue.labels.map(l=>l.name),ticketKey:`#${issue.number}`,ticketUrl:issue.url,ticketStatus:issue.state}],sourceUpdatedAt:issue.updatedAt});
   saveState(issue.url,{issue,plannerProjectId:id});projects.push(saved);results.push({number,id});
  }catch(e){results.push({number,error:e.message});}
 }
 return {results};
}
module.exports={repoFor,search,importIssues,existingIssue};

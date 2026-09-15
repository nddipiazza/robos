'use strict';
const fs=require('node:fs'),{fileFor}=require('./work-item-management');
const pending=new Map();
async function submit({id,markdown},deps){
 if(pending.has(id))throw Error('This task is already being submitted.');
 const run=(async()=>{
  if(typeof markdown!=='string'||!markdown.trim())throw Error('Draft and review the task plan before submitting.');
  const file=fileFor(deps.dir,id),record=JSON.parse(fs.readFileSync(file));
  if(record.kind!=='task')throw Error('Select a task to submit its plan.');
  const login=await deps.login();require('../../robos-agent-client/work-task/required-signoff').assertPlanSigner(record.requiredSignoff,login);
  const server=deps.server();if(server.type!=='github')throw Error('Task implementation currently requires a GitHub task server.');
  const previous=record.tasks?.find(t=>t.ticketUrl===record.workTaskUrl)||record.tasks?.[0]||{};
  const task={...previous,title:record.name,body:markdown,issueType:previous.issueType||'task',labels:previous.labels||[],ticketUrl:record.workTaskUrl||previous.ticketUrl};
  const result=await deps.sync({task,serverInfo:server});if(!result.ok)throw Error(result.error);
  // Persist the issue identity immediately, so a later failure cannot create it twice.
  const next={...record,prompt:markdown,plan:markdown,workTaskUrl:result.url,tasks:[{...task,ticketKey:result.key,ticketUrl:result.url}],updatedAt:Date.now()};
  fs.writeFileSync(file,JSON.stringify(next,null,2));
  const hash=deps.core.planHash(markdown);
  deps.core.save(result.url,{plannerProjectId:id,plan:markdown,approvedPlanHash:hash,planApproval:{source:'task-planner',githubLogin:login,hash,approvedAt:new Date().toISOString()},phase:'plan-approved',autoStart:false});
  return {ok:true,project:next,url:result.url};
 })();pending.set(id,run);try{return await run;}finally{pending.delete(id);}
}
module.exports={submit};

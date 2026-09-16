'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const core=require('./core'),{ticketWorkflow}=require('../../robos-lib/task-workflow');
const cache=new Map();
async function issueMetadata(url){
 const previous=cache.get(url);if(previous&&previous.until>Date.now())return previous.promise;
 const id=core.identity(url),promise=core.gh(['api',`repos/${id.repo}/issues/${id.number}`]);
 cache.set(url,{promise,until:Date.now()+60000});
 try{return await promise;}catch(e){cache.delete(url);throw e;}
}
function view(state,issue,settings){
 const repo=core.identity(state.url).repo.toLowerCase();
 const server=(settings.task_servers||[]).find(s=>s.type==='github'&&(s.repos||[]).some(r=>(typeof r==='string'?r:`${r.org}/${r.repo}`).toLowerCase()===repo));
 const nativeType=issue.type?.name||issue.issueType?.name||issue.issueType;
 let phase=state.phase;
 if(phase==='failed'&&state.executionError?.phase)phase=state.executionError.phase;
 if(['provisioning','failed','stopped','implementation-needs-attention'].includes(phase))phase=(state.executionMode?state.executionMode==='implement':state.approvedPlanHash)?'implementing':state.plan?'plan-review':'planning';
 const workflow=server?ticketWorkflow({...issue,issueType:nativeType,session:{...state,phase}},server):null;
 const definition=workflow&&server.workflows.find(w=>w.type_id===workflow.typeId);
 const type=server?.issue_types?.find(t=>t.id===workflow?.typeId);
 const error=state.error||state.executionError?.text||(['failed','implementation-needs-attention'].includes(state.phase)?'Agent execution needs attention.':null);
 return {error,issueType:require('../../robos-lib/github-epics').logicalType(nativeType,server,issue.labels)==='epic'?'Epic':nativeType||type?.label||'Issue type not set',serverIssueType:nativeType,epicMapping:require('../../robos-lib/github-epics').explanation(nativeType,server,issue.labels),serverName:server?.name||'Task server not configured',workflow,currentStage:workflow?.states.find(s=>s.current)?.label||null,nextStages:(definition?.transitions||[]).filter(t=>t.from===workflow?.states.find(s=>s.current)?.id).map(t=>workflow.states.find(s=>s.id===t.to)?.label).filter(Boolean),executionPhase:state.phase};
}
async function load(state){
 let settings={};try{settings=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/robos/settings.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 try{return view(state,await issueMetadata(state.url),settings);}catch(e){return {...view(state,state.issue||{},settings),warning:'Could not refresh issue type: '+e.message};}
}
module.exports={load,view};

'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {GraphWorkspace,hash}=require('./graph-workspace');
const {PROVIDERS}=require('../../ci-pipeline-servers/lib/servers');
const identities=require('./identity-import');
const mcp=require('../../robos-mcp-router/lib/connections');
const settingsFile=path.join(os.homedir(),'.config/robos/settings.json');
const read=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}};
const types=n=>[].concat(n['@type']||[]);
const ref=x=>typeof x==='string'?x:x?.['@id'];
function endpoint(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Server endpoints must be HTTP(S) URLs without credentials.');return u.href.replace(/\/$/,'');}
function repositories(node){
 const entries=node['robos:repositories'] || (node['robos:projectKey']?[node['robos:projectKey']]:[]);
 const result=[].concat(entries).map(r=>typeof r==='string'?r.replace(/^https:\/\/github.com\//,'').replace(/\/(issues|pulls).*$/,'').replace(/\.git$/,'').replace(/\/$/,''):r.org&&r.repo?`${r.org}/${r.repo}`:'').filter(r=>/^[\w.-]+\/[\w.-]+$/.test(r));
 if(!result.length&&node['robos:serverType']==='github'){const m=/^https:\/\/github.com\/([\w.-]+\/[\w.-]+)/.exec(node['robos:url']||'');if(m)result.push(m[1]);}
 return [...new Set(result)].map(r=>({org:r.split('/')[0],repo:r.split('/')[1]}));
}
function scan(graphRoot,file=settingsFile){
 const workspace=new GraphWorkspace(graphRoot),document=workspace.read(),nodes=document['robos:nodes'],settings=read(file);
 const taskServers=nodes.filter(n=>types(n).includes('robos:TaskServer')).map(n=>({
  id:n['@id'],kgraphId:n['@id'],name:n['dcterms:title']||n['@id'],type:n['robos:serverType'],url:n['robos:url']||'',repos:repositories(n),use_gh_cli:true,
  issue_types:n['robos:issueTypes']||nodes.filter(t=>types(t).includes('robos:IssueType')&&ref(t['robos:taskServer'])===n['@id']).map(t=>({id:t['robos:typeId']||t['@id'].split(':').pop(),label:t['dcterms:title']})),
  workflows:n['robos:workflows']||nodes.filter(w=>types(w).includes('robos:Workflow')&&ref(w['robos:taskServer'])===n['@id']).map(w=>({id:w['@id'],name:w['dcterms:title'],type_id:w['robos:typeId'],states:w['robos:states']||[],transitions:w['robos:transitions']||[]})),
  evidence:n['robos:evidence']||[],selected:true,
 }));
 const mcpServers=nodes.filter(n=>types(n).some(t=>['robos:MCPServer','robos:MCPGateway','robos:MCPConnection'].includes(t))).map(n=>mcp.fromNode(n)).filter(Boolean).map(s=>({...s,selected:true}));
 const pipelineServers=nodes.filter(n=>types(n).includes('robos:CIPipelineServer')).map(n=>({id:n['@id'],kgraphId:n['@id'],name:n['dcterms:title']||n['@id'],provider:n['robos:provider'],url:n['robos:url']||'',credentialRef:n['robos:credentialRef']||'',graphRoot:workspace.root,evidence:n['robos:evidence']||[],pipelines:nodes.filter(p=>ref(p['robos:ciServer'])===n['@id']).map(p=>({id:p['@id'],name:p['dcterms:title'],file:p['robos:workflowFile']||p['robos:sourcePath']})),selected:true}));
 return {graphRoot:workspace.root,graphRevision:hash(document),settingsRevision:hash(settings),people:[],groupPrompt:"",taskServers,pipelineServers,mcpServers};
}
const gh=args=>new Promise((resolve,reject)=>execFile('gh',args,{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024},(e,out)=>e?reject(Error('GitHub discovery failed. Check gh authentication and repository access.')):resolve(JSON.parse(out))));
async function discover(server,run=gh){
 if(server.type!=='github')return {issueTypes:[],labels:[],warnings:['Automatic issue-type discovery currently supports GitHub. Import the other provider’s definitions from the graph.']};
 if(!server.repos.length)throw Error('This task server has no repositories in the graph.');
 const labels=[],issueTypes=[],warnings=[];
 for(const org of new Set(server.repos.map(r=>r.org))){
  try {const native=await run(['api',`orgs/${org}/issue-types`]);for(const t of native)issueTypes.push({id:t.name.toLowerCase().replace(/\s+/g,'-'),label:t.name,githubTypeId:t.id,description:t.description||'',source:`https://api.github.com/orgs/${org}/issue-types`});}
  catch {warnings.push(`${org}: native issue types unavailable; label discovery is still available.`);}
 }
 for(const r of server.repos){
  const repo=`${r.org}/${r.repo}`;if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw Error('Invalid repository');
  const pages=await run(['api',`repos/${repo}/labels`,'--paginate','--slurp']);
  for(const l of pages.flat()){labels.push({name:l.name,description:l.description||'',repository:repo});const match=/^(?:type:)?(feature|feature-request|task|bug|story|epic|chore|idea)$/i.exec(l.name);if(match&&!issueTypes.some(t=>t.id===match[1].toLowerCase()))issueTypes.push({id:match[1].toLowerCase(),label:match[1],color:'#'+l.color,source:`https://github.com/${repo}/labels`});}
 }
 return {issueTypes,labels,warnings:[...warnings,'Labels identify ticket types and states; they do not define allowed transitions. Review or define each workflow in the next step.']};
}
function validateWorkflow(w,issueTypes){
 if(!issueTypes.some(t=>t.id===w.type_id))throw Error(`Workflow ${w.name||w.id} references an unknown issue type.`);
 if(!Array.isArray(w.states)||!w.states.length)throw Error('A workflow needs states.');
 const ids=w.states.map(s=>s.id);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw Error('Workflow state IDs must be nonempty and unique.');
 if(w.states.filter(s=>s.is_initial).length!==1)throw Error('Choose exactly one initial workflow state.');
 for(const t of w.transitions||[])if(!ids.includes(t.from)||!ids.includes(t.to))throw Error('Workflow transition references an unknown state.');
 const transitions=w.transitions||[],visited=new Set(),queue=[w.states.find(s=>s.is_initial).id];
 while(queue.length){const id=queue.shift();if(visited.has(id))continue;visited.add(id);queue.push(...transitions.filter(t=>t.from===id).map(t=>t.to));}
 if(ids.some(id=>!visited.has(id)))throw Error('Every workflow state must be reachable from its initial state.');
 const finals=w.states.filter(s=>s.is_final).map(s=>s.id);
 if(finals.length){for(const start of ids){const seen=new Set(),pending=[start];while(pending.length){const id=pending.shift();if(seen.has(id))continue;seen.add(id);pending.push(...transitions.filter(t=>t.from===id).map(t=>t.to));}if(!finals.some(id=>seen.has(id)))throw Error('Every workflow state needs a path to completion.');}}

}
function merge(existing,incoming,key){const result=structuredClone(existing||[]);for(const row of incoming){const i=result.findIndex(old=>key(old)===key(row));if(i<0)result.push(row);else result[i]={...result[i],...row,id:result[i].id};}return result;}
function plan(input,file=settingsFile){
 const current=scan(input.graphRoot,file);if(current.graphRevision!==input.graphRevision||current.settingsRevision!==input.settingsRevision)throw Error('The graph or app settings changed. Start discovery again to review the latest data.');
 const settings=read(file),edits=[],warnings=[];
 const selectedTasks=input.taskServers.filter(s=>s.selected);
 const taskServers=selectedTasks.map(s=>{
  const source=current.taskServers.find(n=>n.kgraphId===s.kgraphId);if(!source)throw Error('Task server is no longer in the graph.');
  endpoint(s.url);if(!['github','jira','gitea','gitlab','linear','azure'].includes(s.type))throw Error('Unsupported task server type');
  if(!Array.isArray(s.issue_types)||!Array.isArray(s.workflows))throw Error('Issue types and workflows must be arrays.');
  if(new Set(s.issue_types.map(t=>t.id)).size!==s.issue_types.length||s.issue_types.some(t=>!t.id||!t.label))throw Error('Issue types need unique IDs and labels.');
  if(new Set(s.workflows.map(w=>w.type_id)).size!==s.workflows.length)throw Error('Each issue type can have only one workflow.');
  s.workflows.forEach(w=>validateWorkflow(w,s.issue_types));
  const existing=(settings.task_servers||[]).find(t=>t.kgraphId===s.kgraphId||t.type===s.type&&(s.type==='github'?JSON.stringify((t.repos||[]).map(r=>typeof r==='string'?r:`${r.org}/${r.repo}`).sort())===JSON.stringify(s.repos.map(r=>`${r.org}/${r.repo}`).sort()):t.url&&endpoint(t.url)===endpoint(s.url)));
  const mergedTypes=merge(existing?.issue_types,s.issue_types,t=>t.id),mergedWorkflows=merge(existing?.workflows,s.workflows,w=>w.type_id);
  if(!mergedWorkflows.length)warnings.push(`${s.name}: no workflows defined; Workflow Studio will need configuration.`);
  const row={...existing,id:existing?.id||s.id,kgraphId:s.kgraphId,name:existing?.name||s.name,type:s.type,url:s.url,repos:s.repos,use_gh_cli:existing?.use_gh_cli??true,issue_types:mergedTypes,workflows:mergedWorkflows};
  if(hash(source.issue_types)!==hash(mergedTypes)||hash(source.workflows)!==hash(mergedWorkflows))edits.push({op:'update',id:s.kgraphId,set:{'robos:issueTypes':mergedTypes,'robos:workflows':mergedWorkflows}});
  return row;
 });
 const pipelines=input.pipelineServers.filter(s=>s.selected).map(s=>{const source=current.pipelineServers.find(n=>n.kgraphId===s.kgraphId);if(!source||!PROVIDERS[s.provider])throw Error('Unknown pipeline server or provider');endpoint(s.url);const existing=(settings.ci_pipeline_servers||[]).find(t=>t.kgraphId===s.kgraphId||t.provider===s.provider&&endpoint(t.url)===endpoint(s.url));return {...existing,id:existing?.id||s.id,kgraphId:s.kgraphId,name:existing?.name||s.name,provider:s.provider,url:s.url,credentialRef:existing?.credentialRef||s.credentialRef,graphRoot:input.graphRoot};});
 const mcpServers=(input.mcpServers||[]).filter(s=>s.selected).map(s=>{const original=current.mcpServers.find(n=>n.id===s.id);if(!original)throw Error('MCP server is no longer in the graph.');if(!['oauth','none'].includes(original.authType))throw Error('Remote MCP authentication must be oauth or none.');return original;});
 const next={...settings,mcp_servers:merge(settings.mcp_servers,mcpServers,s=>s.id),task_servers:merge(settings.task_servers,taskServers,s=>s.id),ci_pipeline_servers:merge(settings.ci_pipeline_servers,pipelines,s=>s.id)};
 if(!next.active_task_server&&taskServers.length)next.active_task_server=taskServers[0].id;
 const workspace=new GraphWorkspace(input.graphRoot);
 const identityPlan=identities.prepare(input,workspace.read()["robos:nodes"],path.dirname(file));edits.push(...identityPlan.edits);
 const proposal=edits.length?workspace.propose({mode:'refine',edits,prompt:'User-reviewed issue types and workflows for imported task servers',requireEvidence:true}):null;
 if(proposal&&!proposal.validation.conforms)throw Error('The graph rejected these workflow definitions. Review the schema and source evidence.');
 return {id:crypto.randomUUID(),input,settingsRevision:current.settingsRevision,next,proposal,identityWrites:identityPlan.writes,warnings,summary:{...identityPlan.summary,mcpServers,taskServers:taskServers.map(s=>({name:s.name,issueTypes:s.issue_types.length,workflows:s.workflows.length,workflowDefinitions:s.workflows,repositories:s.repos.length})),pipelineServers:pipelines.map(s=>({name:s.name,provider:s.provider})),apps:['Task Servers','Workflow Studio','Dev Central','Task Planner','Task Runner','PR Review Theater','CI Pipeline Servers','CI Monitor']}};
}
function apply(prepared,file=settingsFile){
 if(hash(read(file))!==prepared.settingsRevision)throw Error('App settings changed after preview. Preview again.');
 const workspace=new GraphWorkspace(prepared.input.graphRoot);if(hash(workspace.read())!==prepared.input.graphRevision)throw Error('Graph changed after preview. Preview again.');
 for(const w of prepared.identityWrites||[]){const current=fs.existsSync(w.file)?fs.readFileSync(w.file,'utf8'):null;if(current!==w.before)throw Error('People or groups changed after preview. Preview again.');}
 const writes=[{file,data:prepared.next},...(prepared.identityWrites||[])],staged=[];
 const receipt=path.join(path.dirname(file),'import-receipts',prepared.id+'.json');
 try{
  for(const w of writes){fs.mkdirSync(path.dirname(w.file),{recursive:true});const temp=w.file+'.import-'+prepared.id;fs.writeFileSync(temp,JSON.stringify(w.data,null,2),{mode:0o600});staged.push({...w,temp});}
  fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify({status:'staged',files:staged.map(w=>({file:w.file,temp:w.temp})),summary:prepared.summary},null,2),{mode:0o600});
  if(prepared.proposal)workspace.apply(prepared.proposal,{expectedProposalId:prepared.proposal.id});
  for(const w of staged)fs.renameSync(w.temp,w.file);
  fs.writeFileSync(receipt,JSON.stringify({status:'complete',summary:prepared.summary},null,2),{mode:0o600});
 }catch(error){throw Error(error.message+' Import recovery details: '+receipt+'. Preview again to reconcile any partially applied files.');}

 return {ok:true,summary:prepared.summary};
}
module.exports={scan,discover,plan,apply,validateWorkflow};

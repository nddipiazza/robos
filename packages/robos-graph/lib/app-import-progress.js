'use strict';
const type=(n,t)=>[].concat(n['@type']||[]).includes(t);
const normalized=value=>String(value||'').replace(/\/$/,'').toLowerCase();
function taskMatch(server,existing){return existing.find(s=>s.kgraphId===server.kgraphId||s.type===server.type&&(server.type==='github'?JSON.stringify((s.repos||[]).map(r=>typeof r==='string'?r:`${r.org}/${r.repo}`).map(normalized).sort())===JSON.stringify(server.repos.map(r=>normalized(`${r.org}/${r.repo}`)).sort()):normalized(s.url)===normalized(server.url)));}
function stage(entries){const configured=entries.filter(e=>e.configured).length,total=entries.length;return {total,configured,state:!total?'empty':configured===total?'configured':configured?'partial':'defined',label:!total?'Not defined':configured===total?'Already in apps':configured?'Partly populated':'Defined in graph',entries};}
function progress(model,nodes,settings,people,groups){
 const tasks=model.taskServers.map(s=>({...s,existing:taskMatch(s,settings.task_servers||[])}));
 const personNodes=nodes.filter(n=>['oslc:Person','robos:Person','schema:Person'].some(t=>type(n,t))&&n['robos:email']);
 const groupNodes=nodes.filter(n=>type(n,'robos:Team'));
 const entry=(name,configured,detail)=>({name,configured:!!configured,detail});
 return [
 stage(tasks.map(s=>entry(s.name,s.existing,s.url))),
 stage(tasks.flatMap(s=>s.issue_types.map(t=>entry(s.name+' · '+t.label,s.existing?.issue_types?.some(x=>x.id===t.id),'Issue type')))),
 stage(tasks.flatMap(s=>s.workflows.map(w=>entry(s.name+' · '+w.name,s.existing?.workflows?.some(x=>x.type_id===w.type_id),(w.states||[]).map(x=>x.label||x.id).join(' → '))))),
 stage(model.pipelineServers.map(s=>entry(s.name,(settings.ci_pipeline_servers||[]).some(x=>x.kgraphId===s.kgraphId||x.provider===s.provider&&normalized(x.url)===normalized(s.url)),s.url))),
 stage(model.mcpServers.map(s=>entry(s.name,(settings.mcp_servers||[]).some(x=>x.id===s.id&&x.endpoint===s.endpoint),s.endpoint))),
 stage(personNodes.map(n=>entry(n['dcterms:title']||n['robos:email'],people.some(p=>normalized(p.email)===normalized(n['robos:email'])),n['robos:email']))),
 stage(groupNodes.map(n=>entry(n['dcterms:title']||n['@id'],groups.some(g=>g.kgraphId===n['@id']||normalized(g.name)===normalized(n['dcterms:title'])),[].concat(n['robos:hasMember']||[]).length+' graph members'))),
 ];
}
module.exports={progress,taskMatch};

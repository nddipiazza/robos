'use strict';
const fs=require('node:fs'),path=require('node:path');
const {GraphWorkspace}=require('../../robos-graph/lib/graph-workspace'),hierarchy=require('./work-hierarchy');
function sync(dir){
 const workspace=new GraphWorkspace(path.dirname(dir));const existing=workspace.read();
 const records=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>hierarchy.normalize(JSON.parse(fs.readFileSync(path.join(dir,f)))));
 const nodes=new Map(records.map(record=>{const node=hierarchy.node(record);return [node['@id'],node];}));
 for(const record of records){if(record.product?.id){const parent=hierarchy.node({id:record.product.id,kind:'project',name:record.product.name});if(!nodes.has(parent['@id']))nodes.set(parent['@id'],parent);}}
 const old=new Map(existing['robos:nodes'].map(n=>[n['@id'],n]));
 const edits=[...nodes.values()].map(node=>old.has(node['@id'])?{op:'update',id:node['@id'],set:Object.fromEntries(Object.entries(node).filter(([k])=>k!=='@id')),unset:['robos:inProject','robos:parentWorkItem'].filter(k=>!(k in node))}:{op:'add',node});
 const proposal=workspace.propose({mode:'refine',edits,prompt:'Synchronize Task Planner Projects, Features, Epics and Tasks with their explicit nesting and related-feature links.'});workspace.apply(proposal,{expectedProposalId:proposal.id});return workspace.root;
}
module.exports={sync};

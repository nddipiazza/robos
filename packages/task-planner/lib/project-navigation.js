'use strict';
const path=require('path');
const core=require('../../robos-agent-client/work-task/core');
function navigation(project) {
  project=require('./work-hierarchy').normalize(project);
  let state={};
  if(project.workTaskUrl){try{state=core.read(project.workTaskUrl);}catch{}}
  const workspace=state.sourceWorkspace||state.workspace||project.workspace;
  const name=workspace?path.basename(workspace):null;
  const kind=project.kind||(!project.workTaskUrl&&!project.product&&!workspace?'project':'feature');
  const product=kind==='project'?{id:project.id,name:project.name}:(Object.hasOwn(project,'product') ? project.product : (name ? {id:workspace,name:name==='MVP'?'MVP':name.split(/[-_]/).map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(' ')} : null));
  return {...project,kind,product,workflowStatus:state.phase||null,modifiedAt:state.updatedAt||project.updatedAt||project.createdAt||null};
}
module.exports={navigation};

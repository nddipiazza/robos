'use strict';
function selectedPlannerRecord(){return projectsList.find(p=>p.id===currentProjectId);}
async function createPlannerWork(kind){
 const record=selectedPlannerRecord();const group=plannerProducts(projectsList).find(p=>p.families.some(f=>f.project.id===currentProjectId||f.children.some(c=>c.id===currentProjectId)));
 if(!group||group.name==='(No Project)'){showGenerateStatus('Choose a project in Project details first.',true);setPlannerView('details');return;}
 const name=await showInputModal(`Add ${kind} to ${group.name}`,kind==='feature'?'Feature name, e.g. Configuration validation':'Task name, e.g. Validate storage settings','');
 if(!name?.trim())return;
 try{
  const result=await window.robos.saveProject({name:name.trim(),kind,product:{id:group.id,name:group.name},parentPlanId:kind==='task'&&record?.kind==='feature'?record.id:null,prompt:'',tasks:[]});
  if(!result.ok)throw Error(result.error);plannerSelectedTask=null;
  await loadProjectsList();await openProject(result.project.id);setPlannerView('plan');setPlannerEditing(true);
  if(kind==='task')document.querySelector('#task-plan-composer robos-ai-textarea')?.focus();
  showGenerateStatus(`${kind==='feature'?'Feature':'Task'} created in ${group.name}. Describe its scope and acceptance criteria.`);
 }catch(e){showGenerateStatus(e.message,true);}
}
function renderProjectContents(){
 const panel=document.getElementById('planner-panel-tasks');if(!panel)return;
 let work=document.getElementById('planner-project-work');if(!work){work=document.createElement('div');work.id='planner-project-work';panel.prepend(work);}
 const record=selectedPlannerRecord(),isProject=record?.kind==='project';work.hidden=!isProject;
 document.getElementById('preview-section').hidden=isProject;document.getElementById('results-section').hidden=isProject;
 if(!isProject){work.replaceChildren();return;}
 const product=plannerProducts(projectsList).find(p=>p.name===record.product.name);
 const count=product?.families.reduce((n,f)=>n+(f.project.id===record.id?0:1)+f.children.length+(f.project.tasks||[]).filter(t=>t.ticketUrl!==f.project.workTaskUrl).length,0)||0;
 document.getElementById('planner-tab-tasks').textContent=`Work (${count})`;
 work.replaceChildren();
 if(!count){work.textContent='No work yet. Add a feature or task using the buttons above.';return;}
 const folder=[...document.querySelectorAll('#project-list [data-product]')].find(e=>e.dataset.product===record.product.name);
 if(!folder)return;
 work.append(document.querySelector('.planner-tree-heading').cloneNode(true));
 const tree=folder.cloneNode(true);tree.querySelectorAll(`[data-id="${CSS.escape(record.id)}"]`).forEach(e=>e.remove());work.append(tree);
 work.onclick=async event=>{const row=event.target.closest('button[data-id]');if(!row)return;const original=[...document.querySelectorAll('#project-list button[data-id]')].find(b=>b.dataset.id===row.dataset.id&&b.dataset.taskIndex===row.dataset.taskIndex);if(original)await original.onclick();};
}

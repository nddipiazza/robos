'use strict';
// Organize the existing planner controls; keep its editor, projects and task APIs.
let plannerView='plan', plannerEditing=false, plannerSession=null;
function plannerMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text || '',{gfm:true}),{USE_PROFILES:{html:true},FORBID_TAGS:['style','form','button','iframe'],FORBID_ATTR:['style']});
}
function setPlannerView(view) {
  plannerView=view;document.body.dataset.plannerView=view;
  document.querySelectorAll('[data-planner-panel]').forEach(e=>e.hidden=e.dataset.plannerPanel!==view);
  document.querySelectorAll('[data-planner-tab]').forEach(e=>{const active=e.dataset.plannerTab===view;e.setAttribute('aria-selected',String(active));e.classList.toggle('selected',active);});
}
function setPlannerEditing(editing) {
  plannerEditing=editing;
  document.getElementById('prompt-input').hidden=!editing;
  document.getElementById('plan-reading-view').hidden=editing;
  document.getElementById('planner-edit').textContent=editing?'Preview':'Edit plan';
  document.getElementById('planner-save').hidden=!editing;
  if(!editing)renderPlannerReading();
  if(editing)document.getElementById('prompt-input').focus();
}
function renderPlannerReading() {
  const view=document.getElementById('plan-reading-view');if(!view)return;
  const text=getPromptValue();
  const record=selectedPlannerRecord();
  if(['project','feature'].includes(record?.kind)&&record.description&&!text){view.innerHTML=plannerMarkdown(record.description);return;}
  if(selectedPlannerRecord()?.kind==='project'&&!text){view.innerHTML='<h2>Project overview</h2><p>Keep related features, epics, and tasks in this project.</p><p>Use <strong>Import from task server</strong> to bring in existing tickets, <strong>Add feature</strong> for a part of this project, or <strong>Add task</strong> for a specific piece of work. You can also edit this overview to describe the project.</p>';return;}
  view.innerHTML=text?plannerMarkdown(text):'<p class="planner-empty">Describe what you want to build, or choose a template to get started.</p>';
}
window.refreshPlannerUX=function(session) {
  if(!document.getElementById('planner-context'))return;
  if(arguments.length)plannerSession=session;
  const title=document.getElementById('project-meta-name')?.textContent.replace(/^📁\s*/,'') || currentProjectName || 'New plan';
  document.getElementById('planner-title').textContent=title;
  document.getElementById('planner-context-line').textContent=plannerSession?`#${plannerSession.issue.number} · ${plannerSession.phase.replaceAll('-',' ')} · ${plannerSession.backend || 'codex'}`:'Plan your work, then review the tasks.';
  document.getElementById('planner-tab-tasks').textContent=`Tasks (${tasks.length})`;
  const primary=document.getElementById('planner-primary');
  const phase=plannerSession?.phase;
  primary.disabled=!!plannerSession?.workerPid;
  primary.textContent=plannerSession?.prs?.length?'Open PR review':plannerSession?.planReady?'Implement Task':plannerSession?.plan?'Approve plan':plannerSession?'Generate plan':'Generate tasks';
  if(plannerSession?.workerPid)primary.textContent='Agent is working…';
  const record=selectedPlannerRecord();
  if(!plannerSession && record?.kind==='project')primary.textContent='Add feature';
  if(record?.kind==='feature')primary.textContent='Add epic';
  if(!plannerSession && record?.kind==='task')primary.textContent='Save task';
  document.getElementById('planner-add-task').hidden=!!plannerSession||!record;
  document.getElementById('planner-import').hidden=record?.kind!=='project';
  const isProject=record?.kind==='project';
  document.querySelector('.planner-product-field').hidden=isProject;
  const group=plannerProducts(projectsList).find(p=>p.families.some(f=>f.project.id===currentProjectId||f.children.some(c=>c.id===currentProjectId)));
  document.getElementById('planner-choose-project').textContent=(group?.name||'(No Project)')+' · Change…';
  if(isProject)document.getElementById('planner-context-line').textContent='Project overview';
  document.getElementById('planner-templates').hidden=isProject;
  document.querySelector('[data-planner-tab=plan]').textContent=record?.kind==='project'?'Overview':'Plan';
  document.getElementById('planner-secondary').hidden=!plannerSession;
  document.querySelectorAll('#planner-more-actions [id^=work-task-]').forEach(b=>b.hidden=!plannerSession);
  document.getElementById('planner-edit').textContent=plannerEditing?'Preview':isProject?'Edit overview':plannerSession && !plannerSession.plan?'Edit requirements':'Edit plan';
  document.querySelector('.prompt-header-row h2').textContent=record?.kind==='project'?'Overview':plannerSession && !plannerSession.plan?'Requirements':'Plan';
  if(!plannerEditing)renderPlannerReading();
  renderProjectContents();
};
document.addEventListener('DOMContentLoaded',()=>{
  document.body.classList.add('planner-focused');
  const main=document.getElementById('main-content');
  const context=document.createElement('div');context.id='planner-context';
  context.innerHTML='<div><nav id="planner-breadcrumb" aria-label="Project and task"></nav><p id="planner-context-line"></p><h2 id="planner-title">New plan</h2></div><div class="planner-context-actions"><button id="planner-import" class="btn btn-outline" hidden>Import from task server</button><button id="planner-add-task" class="btn btn-outline" hidden>Add task</button><button id="planner-secondary" class="btn btn-outline" hidden>Agent session</button><button id="planner-primary" class="btn btn-accent">Generate plan</button></div>';
  const tabs=document.createElement('nav');tabs.id='planner-navigation';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Planner views');
  tabs.innerHTML='<button data-planner-tab="plan" role="tab">Plan</button><button id="planner-tab-tasks" data-planner-tab="tasks" role="tab">Tasks</button><button data-planner-tab="details" role="tab">Project details</button><button id="planner-templates" class="btn btn-outline">Templates</button>';
  main.prepend(context,tabs);
  for(const [view,selectors] of [['plan',['.prompt-section']],['tasks',['#preview-section','#results-section']],['details',['#project-metadata-card','#epic-parent-section']]]){
    const panel=document.createElement('div');panel.dataset.plannerPanel=view;panel.id='planner-panel-'+view;panel.setAttribute('role','tabpanel');
    for(const selector of selectors)panel.append(document.querySelector(selector));main.append(panel);
  }
  const productField=document.createElement('div');productField.className='planner-product-field';
  productField.innerHTML='<label>Project</label><button id="planner-choose-project" class="btn btn-outline">Choose or change project…</button>';
  document.getElementById('planner-context').prepend(productField);
  document.getElementById('planner-choose-project').onclick=()=>openProjectManager(true);
  const catalog=document.getElementById('templates-banner');catalog.hidden=true;
  const prompt=document.querySelector('.prompt-section');
  const toolbar=document.createElement('div');toolbar.className='planner-plan-tools';
  toolbar.innerHTML='<button id="planner-edit" class="btn btn-outline">Edit plan</button><button id="planner-save" class="btn btn-outline">Save</button><details id="planner-more"><summary>More options</summary><div id="planner-more-actions"></div></details>';
  prompt.querySelector('.prompt-header-row').append(toolbar);
  const preview=document.createElement('article');preview.id='plan-reading-view';preview.className='planner-markdown';
  document.querySelector('.prompt-row').prepend(preview);
  // Put existing workflow controls in one secondary menu instead of lining them up.
  const actionArea=document.querySelector('.prompt-actions');
  const moveActions=()=>{for(const b of [...actionArea.querySelectorAll('button')])document.getElementById('planner-more-actions').append(b);};
  new MutationObserver(moveActions).observe(actionArea,{childList:true});moveActions();
  document.getElementById('generate-status').setAttribute('role','status');
  document.getElementById('planner-edit').onclick=()=>setPlannerEditing(!plannerEditing);
  document.getElementById('planner-save').onclick=async()=>{
    try {if(plannerSession&&(plannerSession.plan||window.plannerDraftPlanId===currentProjectId)){if(!getPromptValue().trim())throw Error('Write an implementation plan before saving.');const saved=await taskCall('save',{plan:getPromptValue(),workspace:plannerSession.workspace});routedTask=saved;window.plannerDraftPlanId=null;window.refreshPlannerUX(await taskCall('state'));showGenerateStatus('Plan saved.');}else {await saveToProject();showGenerateStatus('Requirements saved.');}document.getElementById('prompt-input').dirty=false;setPlannerEditing(false);}catch(e){showGenerateStatus(e.message,true);}
  };
  document.getElementById('planner-import').onclick=()=>openTaskImport();
  document.getElementById('planner-add-task').onclick=()=>createPlannerWork('task');
  document.getElementById('planner-primary').onclick=async()=>{
    try {
      if(selectedPlannerRecord()?.kind==='feature'){await createPlannerWork('epic');return;}
      if(!plannerSession && selectedPlannerRecord()?.kind==='project'){await createPlannerWork('feature');return;}
      if(!plannerSession && selectedPlannerRecord()?.kind==='task'){await saveToProject();setPlannerEditing(false);return;}
      if(!plannerSession){await handleGenerate();setPlannerView('tasks');return;}
      if(plannerSession.prs?.length){await taskCall('route');return;}
      if(plannerSession.workerPid)return;
      const edited=getPromptValue();
      if(plannerSession.plan && edited!==plannerSession.plan){showGenerateStatus('The plan has changed. Save these changes before implementation; obtain signoff if this task requires it.',true);return;}
      if(plannerSession.planReady){await taskCall('open-runner');return;}
      const id=plannerSession.plan?'work-task-approve':'btn-generate';
      if(id==='btn-generate')await handleGenerate();else document.getElementById(id).click();
    }catch(e){showGenerateStatus(e.message,true);}
  };
  document.getElementById('planner-secondary').onclick=()=>taskCall('open-implementer').catch(e=>showGenerateStatus(e.message,true));
  document.getElementById('planner-templates').onclick=()=>document.getElementById('btn-browse-templates').click();
  tabs.querySelectorAll('[data-planner-tab]').forEach(b=>b.onclick=()=>setPlannerView(b.dataset.plannerTab));
  document.getElementById('prompt-input').addEventListener('input',()=>{if(!plannerEditing)setPlannerEditing(true);});
  document.addEventListener('click',e=>{const a=e.target.closest('#plan-reading-view a');if(a){e.preventDefault();if(/^https?:\/\//.test(a.href))window.robos.openUrl?.(a.href);}});
  const search=document.createElement('input');search.id='planner-project-search';search.placeholder='Find a project or task…';search.setAttribute('aria-label','Find a project or task');document.getElementById('project-list').before(search);
  search.oninput=()=>renderProjectsSidebar();
  document.querySelector('.sidebar-title').textContent='Projects';
  document.getElementById('btn-workspace-plans').textContent='Manage projects';
  document.getElementById('project-status-badge').hidden=true;
  document.getElementById('btn-new-project').textContent='+ New project';
  document.getElementById('project-features-tabs').hidden=true;
  document.getElementById('project-tech-stack').placeholder='Languages, frameworks, and architecture notes';
  document.getElementById('repo-tag-input').placeholder='+ Repository';
  document.getElementById('prompt-input').setAttribute('placeholder','Describe the outcome, scope, and acceptance criteria.');
  new MutationObserver(()=>window.refreshPlannerUX()).observe(document.getElementById('project-meta-name'),{childList:true,subtree:true});
  setPlannerView('plan');setPlannerEditing(false);window.refreshPlannerUX(plannerSession);renderProjectsSidebar();
});

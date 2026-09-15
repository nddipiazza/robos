'use strict';
// Reuse Task Planner's projects, task cards, prompt editor, and status area.
let routedTask = null;
let lastWorkTaskPlan = null;
async function taskCall(name, input) {
  const result = await window.workTask[name](input);
  if (!result.ok) throw Error(result.error);
  return result.data;
}
window.resumeWorkTask = async function () {
  routedTask = await taskCall('state');
  if (!routedTask) return;
  await loadProjectsList();
  if (routedTask.plannerProjectId) await openProject(routedTask.plannerProjectId);
  const buttons = document.querySelector('.prompt-actions');
  for (const [id, text, fn] of [
    ['work-task-source', 'Source workspace', async () => { const dir = await taskCall('folder'); if (dir) { routedTask.workspace = dir; await taskCall('save', { plan: routedTask.plan || '', workspace: dir }); showGenerateStatus(`Workspace: ${dir}`); } }],
    ['work-task-approve', 'Approve plan', async () => { const plan = getPromptValue(); await taskCall('approve-plan', { plan, workspace: routedTask.workspace }); showGenerateStatus('Plan approved. Ready for background implementation.'); }],
    ['work-task-implement', 'Implement in background', async () => { await openTaskRunnerLaunch({mode:'implement',plan:getPromptValue(),call:taskCall,afterLaunch:async()=>{await taskCall('open-runner');showGenerateStatus('RobOS Agent is implementing the saved plan in Task Runner.');}}); }],
  ]) {
    if (document.getElementById(id)) continue;
    const button = document.createElement('button'); button.id = id; button.className = 'btn btn-outline'; button.textContent = text;
    button.onclick = () => fn().catch(e => showGenerateStatus(e.message, true)); buttons.append(button);
  }
  if (routedTask.plan) document.getElementById('prompt-input').value = routedTask.plan;
  lastWorkTaskPlan = routedTask.plan;
  window.refreshPlannerUX?.(routedTask);
  showGenerateStatus(routedTask.error || `Loaded existing GitHub issue #${routedTask.issue.number}. Review and refine it here.`, !!routedTask.error);
};
window.generateWorkTaskPlan = async function () {
  if (!routedTask) return false;
  try {
    await openTaskRunnerLaunch({mode:'plan',plan:routedTask.plan||'',refinement:getPromptValue(),call:taskCall,afterLaunch:()=>showGenerateStatus('Planning agent is running. The plan will appear here for review.')});
  } catch (e) { showGenerateStatus(e.message, true); }
  return true;
};
setInterval(async () => {
  if (!routedTask) return;
  try {
    const latest = await taskCall('state');
    if (latest.url !== routedTask.url) { await window.resumeWorkTask(); return; }
    if (latest.plan && latest.plan !== lastWorkTaskPlan && latest.phase === 'plan-review') {
      // Do not overwrite text the user edited while the agent was running.
      const editor = document.getElementById('prompt-input');
      if (!editor.dirty && !plannerEditing) editor.value = latest.plan;
      showGenerateStatus('Agent plan ready for review. Refine it in the existing planner editor.');
      lastWorkTaskPlan = latest.plan;
    }
    if (latest.error) showGenerateStatus(latest.error, true);
    routedTask = latest;
    window.refreshPlannerUX?.(latest);
  } catch (e) { showGenerateStatus(e.message, true); }
}, 3000);

window.projectOpenedForWorkflow=async function(project) {
  if(!project.workTaskUrl){routedTask=null;showGenerateStatus('');window.refreshPlannerUX?.(null);return;}
  if(routedTask?.url===project.workTaskUrl){
    if(routedTask.plan)document.getElementById('prompt-input').value=routedTask.plan;
    window.refreshPlannerUX?.(routedTask);
    return;
  }
  await taskCall('select',{issueUrl:project.workTaskUrl});
  await window.resumeWorkTask();
};

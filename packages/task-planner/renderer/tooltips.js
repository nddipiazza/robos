'use strict';
// Native tooltips keep help close to both persistent and dynamically created controls.
const plannerTooltips={
 'btn-workspace-plans':'Create projects, edit their names and descriptions, or open an existing project.',
 'planner-project-search':'Filter the project tree by project, feature, or task title. This does not search GitHub.',
 'planner-edit':()=>plannerEditing?'Show the rendered Markdown. Unsaved edits stay in the editor.': 'Edit this document as Markdown in Monaco. Changes are saved only when you click Save.',
 'planner-save':()=>plannerSession?.plan?'Save the edited implementation plan locally and clear its previous approval. New approval is needed only if this task explicitly requires plan signoff.':'Save this document to the local RobOS project. This does not change the GitHub issue.',
 'planner-ai-revise':'Describe a change to this Markdown. Codex proposes a revision; review it and apply it to the editor before saving.',
 'planner-primary':()=>{if(plannerSession?.workerPid)return 'An agent is already working on this ticket. Open Agent session to follow its progress.';if(plannerSession?.prs?.length)return 'Open PR Review Theater to inspect the agent’s pull request and review its work.';if(plannerSession?.planReady)return 'Start the RobOS Agent implementing the saved plan in the background and open Task Implementer.';if(plannerSession?.plan)return 'Approve the current implementation plan. This makes it ready for implementation; it does not start coding.';if(plannerSession)return 'Review provider, model, memory, and repository settings, then draft an implementation plan in an ephemeral sandbox. This does not start implementation.';if(selectedPlannerRecord()?.kind==='project')return 'Create a feature inside this project and describe its requirements.';if(selectedPlannerRecord()?.kind==='task')return 'Save this task to the local RobOS project.';return 'Ask AI to draft tasks from these requirements. Review the results before creating tickets on the task server.';},
 'planner-import':'Find existing tickets on the configured task server and import them into this project. Existing imports are not duplicated.',
 'planner-add-task':'Create a new local task in this project or feature. It is not published to GitHub yet.',
 'planner-secondary':'Open Task Implementer to follow the agent’s discussion, milestones, and progress.',
 'planner-templates':'Browse reusable templates to help structure requirements and task plans.',
 'planner-choose-project':'Choose the project for this feature and its child tasks, or move them to (No Project). Developer assignments are unchanged.',
 'work-task-source':'Select the local source repository the agent should inspect or implement changes in.',
 'work-task-approve':'Approve the current implementation plan so it can be implemented. This does not start the agent.',
 'work-task-implement':'Run the approved implementation plan in the background and open Task Implementer.',
 'refresh-feature-tasks':'Reload this feature’s child tasks, statuses, and assignees from GitHub.',
 'pm-close':'Close project management.',
 'pm-search':'Filter saved projects by name or description.',
 'pm-name':'Name of the product or project. Renaming it keeps its linked features and tasks together.',
 'pm-description':'Describe the project’s purpose and scope. This is saved locally with the project.',
 'pm-new':'Start a new project form. Any unsaved changes in this form are replaced.',
 'btn-project-confirm':'Create this project locally. Add or import features and tasks afterward.',
 'btn-project-cancel':'Close the new-project form without creating a project.',
 'btn-save-project':'Save the current draft tasks and requirements to the local project.',
 'btn-create':'Create or synchronize the displayed draft tasks on the configured task server. Review them first.',
 'btn-add-task':'Add a local draft task to this list.',
 'btn-add-epic':'Add a local draft epic to group related tasks.',
};
function refreshPlannerTooltips(){
 for(const [id,help] of Object.entries(plannerTooltips)){const element=document.getElementById(id);if(element){const value=typeof help==='function'?help():help;if(element.title!==value)element.title=value;}}
 const titles=[
 ['#planner-more > summary','Show additional actions for this project or feature. Press Escape or click outside to close.'],
 ['[data-planner-tab="plan"]','Read or edit this feature’s requirements and implementation plan.'],
 ['[data-planner-tab="tasks"]','View the tasks belonging to this feature, including their status and assignees.'],
 ['[data-planner-tab="details"]','See which project this feature belongs to and change its project membership.'],
 ['.planner-ai-dialog [data-close]','Close without applying the proposed revision to your document.'],
 ['.planner-ai-dialog [data-propose]','Ask Codex for revised Markdown using your instructions. Your document stays unchanged until you apply the result.'],
 ['.planner-ai-dialog [data-apply]','Replace the editor contents with this proposed revision. Review it and click Save to persist it.'],
 ['#pm-form .btn-accent','Save this project’s name and description locally, preserving its existing features and tasks.'],
 ];
 for(const [selector,title] of titles)for(const element of document.querySelectorAll(selector))if(element.title!==title)element.title=title;
 for(const button of document.querySelectorAll('#pm-list button')){const label=button.textContent.trim();button.title=label==='Edit'?'Load this project’s name and description into the edit form.':label==='Open'?'Open this project in Task Planner.':label==='Select'?'Move this feature and its child tasks into this project. This does not change their assignees.':'Remove project membership from this feature and its child tasks. Developer assignments are unchanged.';}
}
document.addEventListener('DOMContentLoaded',()=>{
 refreshPlannerTooltips();
 // Observe content changes, not title attributes, to avoid a tooltip update loop.
 new MutationObserver(refreshPlannerTooltips).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('pointerover',refreshPlannerTooltips);
 document.addEventListener('focusin',refreshPlannerTooltips);
});

'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const panel=document.createElement('section');panel.id='linked-feature-tasks';panel.hidden=true;
 document.getElementById('planner-panel-tasks').prepend(panel);
 let currentUrl=null,loaded=null,generation=0;
 const refresh=window.refreshPlannerUX;
 window.refreshPlannerUX=function(...args){refresh(...args);const record=selectedPlannerRecord();const linked=!!record?.workTaskUrl;
 panel.hidden=!linked;if(!linked){currentUrl=null;loaded=null;generation++;return;}
 document.getElementById('preview-section').hidden=true;document.getElementById('results-section').hidden=true;
 if(currentUrl===record.workTaskUrl){if(loaded)document.getElementById('planner-tab-tasks').textContent=`Tasks (${loaded.length})`;return;}
 currentUrl=record.workTaskUrl;loaded=null;load(currentUrl);
 };
 async function load(url){const ticket=++generation;panel.innerHTML='<header><h2>Tasks in this epic</h2><button class="btn btn-outline" id="refresh-feature-tasks">Refresh</button></header><p role="status">Loading tasks from the task server…</p><robos-list-sort for="linked-feature-task-rows" original="Epic order" label="feature tasks"></robos-list-sort><div class="feature-task-rows"></div>';
 panel.querySelector('button').onclick=()=>load(url);document.getElementById('planner-tab-tasks').textContent='Tasks (…)';
 try{const result=await window.robos.featureTasks(url);if(ticket!==generation||currentUrl!==url)return;if(!result.ok)throw Error(result.error);loaded=result.tasks;document.getElementById('planner-tab-tasks').textContent=`Tasks (${loaded.length})`;panel.querySelector('[role=status]').textContent=loaded.length?'Linked tasks from GitHub, in their epic order.':'No child tasks are linked to this ticket on the task server.';
 const table=document.createElement('table');table.innerHTML='<thead><tr><th>Task</th><th>Status</th><th>Assigned to</th><th>Updated</th></tr></thead><tbody id="linked-feature-task-rows"></tbody>';
 for(const task of loaded){const row=document.createElement('tr'),title=document.createElement('td'),status=document.createElement('td'),assignees=document.createElement('td');const link=document.createElement('button');link.className='feature-task-link';link.textContent=`#${task.number} ${task.title}`;link.title=task.body;link.onclick=async()=>{link.disabled=true;try{await taskCall('select',{issueUrl:task.url});await window.resumeWorkTask();setPlannerView('plan');}catch(e){panel.querySelector('[role=status]').textContent=e.message;}finally{link.disabled=false;}};title.append(link);status.textContent=task.status;assignees.textContent=task.assignees.join(', ')||'Not assigned';const updated=document.createElement('td');updated.innerHTML=window.robosList.time(task.updatedAt);row.dataset.listTitle=task.title;row.dataset.listUpdated=task.updatedAt||'';row.append(title,status,assignees,updated);table.querySelector('tbody').append(row);}
 panel.querySelector('.feature-task-rows').append(table);const sort=panel.querySelector('robos-list-sort');sort.replaceWith(sort.cloneNode(true));
 }catch(e){if(ticket===generation){panel.querySelector('[role=status]').textContent='Could not load child tasks: '+e.message;document.getElementById('planner-tab-tasks').textContent='Tasks';}}
 }
 window.refreshPlannerUX(plannerSession);
});

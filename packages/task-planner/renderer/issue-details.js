'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const nav=document.getElementById('planner-navigation'),tab=document.createElement('button');tab.dataset.plannerTab='issue';tab.setAttribute('role','tab');tab.textContent='Ticket details';tab.title='Task-server metadata and associated Git repositories.';tab.onclick=()=>setPlannerView('issue');nav.append(tab);
 const panel=document.createElement('section');panel.id='planner-issue-details';panel.dataset.plannerPanel='issue';panel.hidden=true;document.getElementById('main-content').append(panel);
 const badge=document.createElement('strong');badge.id='planner-kind';document.getElementById('planner-title').before(badge);
 let recordId=null;
 const refresh=window.refreshPlannerUX;
 window.refreshPlannerUX=function(...args){refresh(...args);const record=selectedPlannerRecord(),meta=record?.issueMetadata;const kind=meta?.type||record?.kind||'Plan';const number=meta?.number||plannerSession?.issue?.number;
 const parts=[kind.charAt(0).toUpperCase()+kind.slice(1).toLowerCase()+(number?' #'+number:'')];
 if(plannerSession?.phase)parts.push(plannerSession.phase.replaceAll('-',' '));
 if(plannerSession?.backend)parts.push(plannerSession.backend.charAt(0).toUpperCase()+plannerSession.backend.slice(1));
 badge.textContent=parts.join(' · ');badge.dataset.kind=kind.toLowerCase();
 document.getElementById('planner-context-line').hidden=true;tab.hidden=!record||record.kind==='project';
 const isTask=record?.kind==='task';document.querySelector('[data-planner-tab=tasks]').hidden=isTask;if(isTask&&plannerView==='tasks')setPlannerView('plan');
 if(recordId!==record?.id){recordId=record?.id;render(record);} };
 function render(record){panel.replaceChildren();if(!record)return;const meta=record.issueMetadata;
 const h=document.createElement('h2');h.textContent='Task server';panel.append(h);
 if(window.plannerMetadataError){const p=document.createElement('p');p.textContent='Could not refresh metadata: '+window.plannerMetadataError;panel.append(p);}
 if(meta){const dl=document.createElement('dl');for(const [label,value] of Object.entries({Type:meta.type||'Not specified',Status:meta.state,Assignees:meta.assignees.join(', ')||'Not assigned',Labels:meta.labels.join(', ')||'None',Milestone:meta.milestone?.title||'None','Milestone due':meta.milestone?.dueOn||'Not set',Author:meta.author,Created:meta.createdAt,Updated:meta.updatedAt,Closed:meta.closedAt})){if(!value)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd);}panel.append(dl);
 for(const [label,url] of [['View ticket on task server',meta.url],['Parent feature',meta.parentUrl],...meta.dependencies.map(url=>['Dependency',url])])if(url){const b=document.createElement('button');b.className='btn btn-outline';b.textContent=label;b.title=url;b.onclick=()=>window.robos.openUrl(url);panel.append(b);}}
 const title=document.createElement('h2');title.textContent='Git repositories';const note=document.createElement('p');note.textContent='Code repositories associated with this '+(record.kind==='task'?'task':'feature')+'. Changes are saved in RobOS; the task-server issue is unchanged.';panel.append(title,note);
 const list=document.createElement('div');list.id='issue-repositories';panel.append(list);let repos=[...(record.repos||[])];
 const status=document.createElement('p');status.setAttribute('role','status');const form=document.createElement('form');form.innerHTML='<label for="issue-repository-url">Repository URL</label><div><input id="issue-repository-url" placeholder="https://github.com/organization/repository" required><button class="btn btn-outline">Add repository</button></div>';panel.append(form,status);let editing=-1;
 const save=async next=>{const result=await window.robos.saveTaskRepositories({id:record.id,repos:next});if(!result.ok)throw Error(result.error);repos=result.repos;record.repos=repos;projectRepos=repos;draw();status.textContent='Repository associations saved.';};
 function draw(){list.replaceChildren();if(!repos.length)list.textContent='No Git repositories associated yet.';repos.forEach((url,index)=>{const row=document.createElement('div');row.className='issue-repository-row';const name=document.createElement('span');name.textContent=url;row.append(name);for(const [label,fn] of [['Open',()=>window.robos.openUrl(url)],['Edit',()=>{editing=index;form.querySelector('input').value=url;form.querySelector('button').textContent='Save repository';form.querySelector('input').focus();}],['Remove',async()=>{try{await save(repos.filter((_,i)=>i!==index));}catch(e){status.textContent=e.message;}}]]){const b=document.createElement('button');b.className='btn btn-outline';b.textContent=label;b.title=label==='Remove'?'Remove this association from RobOS. The Git repository is not deleted.':label==='Open'?'Open this Git repository in your browser.':'Change this repository association.';b.onclick=fn;row.append(b);}list.append(row);});}
 form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{const next=[...repos];if(editing<0)next.push(form.querySelector('input').value);else next[editing]=form.querySelector('input').value;await save(next);editing=-1;form.reset();button.textContent='Add repository';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};draw();
 }
 window.refreshPlannerUX(plannerSession);
});

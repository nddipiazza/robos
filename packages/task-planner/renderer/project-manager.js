'use strict';
async function openProjectManager(associate=false){
 document.getElementById('project-manager')?.remove();
 const dialog=document.createElement('dialog');dialog.id='project-manager';
 dialog.innerHTML='<header><h2></h2><button class="btn" id="pm-close" aria-label="Close">Close</button></header><p id="pm-help"></p><input id="pm-search" placeholder="Find a project…" aria-label="Find a project"><div id="pm-list"></div><form id="pm-form"><h3 id="pm-form-title">New project</h3><label for="pm-name">Name</label><input id="pm-name" required maxlength="160"><label for="pm-description">Description</label><textarea id="pm-description" rows="4" placeholder="Purpose, scope, and who this project is for"></textarea><footer><button type="button" class="btn" id="pm-new">New project</button><button class="btn btn-accent">Save project</button></footer></form><p id="pm-status" role="status"></p>';
 document.body.append(dialog);let editing=null;
 const el=id=>dialog.querySelector('#'+id);
 dialog.querySelector('h2').textContent=associate?'Choose project':'Manage projects';
 el('pm-help').textContent=associate?'Move this feature and its tasks into a project. This does not change developer assignments.':'Edit project names and descriptions, or open a project to manage its features and tasks.';
 el('pm-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
 const edit=p=>{editing=p;el('pm-form-title').textContent=p?'Edit project':'New project';el('pm-name').value=p?.name||'';el('pm-description').value=p?.description||'';el('pm-name').focus();};
 const choose=async p=>{try{const family=plannerProjectTree(projectsList).find(f=>f.project.id===currentProjectId||f.children.some(c=>c.id===currentProjectId));const result=await window.robos.setProjectProduct({id:family?.project.id||currentProjectId,projectId:p?.id||null});if(!result.ok)throw Error(result.error);await loadProjectsList();window.refreshPlannerUX();dialog.close();showGenerateStatus(p?'Moved to '+p.name: 'Moved to (No Project).');}catch(e){el('pm-status').textContent=e.message;}};
 const render=()=>{el('pm-list').replaceChildren();const query=el('pm-search').value.toLowerCase();const records=projectsList.filter(p=>p.kind==='project'&&(p.name+' '+(p.description||'')).toLowerCase().includes(query));
 const button=(label,fn)=>{const b=document.createElement('button');b.className='btn btn-outline';b.textContent=label;b.onclick=fn;return b;};
 if(associate)el('pm-list').append(button('(No Project)',()=>choose(null)));
 for(const p of records){const row=document.createElement('div');row.className='pm-row';const info=document.createElement('div');const name=document.createElement('strong');name.textContent=p.name;const desc=document.createElement('p');desc.textContent=p.description||'No description yet';const date=document.createElement('small');date.textContent='Updated '+plannerDate(p.updatedAt||p.modifiedAt).short;info.append(name,desc,date);row.append(info,button(associate?'Select':'Open',async()=>{if(associate)return choose(p);await openProject(p.id);setPlannerView('plan');dialog.close();}),button('Edit',()=>edit(p)));el('pm-list').append(row);}
 if(!records.length){const p=document.createElement('p');p.textContent=query?'No matching projects.':'No projects yet. Create one below.';el('pm-list').append(p);}};
 el('pm-search').oninput=render;el('pm-new').onclick=()=>edit(null);
 el('pm-form').onsubmit=async event=>{event.preventDefault();const submit=el('pm-form').querySelector('[type=submit]')||el('pm-form').querySelector('.btn-accent');submit.disabled=true;try{const result=await window.robos.saveProject({...(editing?{id:editing.id}:{}),kind:'project',name:el('pm-name').value.trim(),description:el('pm-description').value.trim()});if(!result.ok)throw Error(result.error);editing=result.project;await loadProjectsList();render();if(currentProjectId===editing.id)await openProject(editing.id);el('pm-status').textContent='Project saved.';}catch(e){el('pm-status').textContent=e.message;}finally{submit.disabled=false;}};
 render();dialog.showModal();el('pm-search').focus();
}

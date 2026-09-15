'use strict';
async function openTaskImport(){
 const destination=selectedPlannerRecord();if(!destination?.product)return;
 document.getElementById('task-import-dialog')?.remove();
 const dialog=document.createElement('dialog');dialog.id='task-import-dialog';
 dialog.innerHTML='<h2>Import from task server</h2><p id="import-destination"></p><form id="import-search"><input id="import-query" aria-label="Search issues" placeholder="Search titles or issue number"><select id="import-state" aria-label="Issue state"><option value="open">Open</option><option value="all">All states</option><option value="closed">Closed</option></select><button class="btn btn-outline">Search</button></form><p id="import-status" role="status"></p><div class="import-scroll"><table><thead><tr><th><input type="checkbox" id="import-all" aria-label="Select all available issues"></th><th>Issue</th><th>Status</th><th>Updated</th></tr></thead><tbody id="import-rows"></tbody></table></div><footer><button id="import-cancel" class="btn btn-outline">Cancel</button><button id="import-submit" class="btn btn-accent" disabled>Import selected (0)</button></footer>';
 document.body.append(dialog);dialog.querySelector('#import-destination').textContent=`Into ${destination.product.name} · ${serverInfo?.name||'Configured task server'}`;
 let busy=false;const selected=new Set();
 const status=dialog.querySelector('#import-status'),submit=dialog.querySelector('#import-submit');
 function count(){submit.disabled=busy||!selected.size;submit.textContent=`Import selected (${selected.size})`;}
 dialog.querySelector('#import-cancel').onclick=()=>{if(!busy){dialog.close();dialog.remove();}};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 async function search(){
  busy=true;selected.clear();count();status.textContent='Loading issues…';dialog.querySelector('#import-rows').replaceChildren();dialog.querySelector('#import-all').checked=false;
  try{
   const result=await window.robos.searchImportTasks({query:dialog.querySelector('#import-query').value,state:dialog.querySelector('#import-state').value});if(!result.ok)throw Error(result.error);
   for(const issue of result.issues){
    const tr=document.createElement('tr'),choice=document.createElement('td'),box=document.createElement('input');box.type='checkbox';box.disabled=!!issue.imported;box.setAttribute('aria-label',`Import #${issue.number}`);box.dataset.number=issue.number;
    box.onchange=()=>{if(box.checked)selected.add(issue.number);else selected.delete(issue.number);count();};choice.append(box);
    const name=document.createElement('td');name.textContent=`#${issue.number} ${issue.title}`;name.title=issue.body||issue.title;if(issue.imported){const note=document.createElement('small');note.textContent=`Already imported · ${issue.imported}`;name.append(note);}
    const state=document.createElement('td');state.textContent=issue.state.toLowerCase();const updated=document.createElement('td');const date=plannerDate(issue.updatedAt);updated.textContent=date.short;updated.title=date.full;
    tr.append(choice,name,state,updated);dialog.querySelector('#import-rows').append(tr);
   }
   status.textContent=result.issues.length?`${result.repo} · ${result.issues.length} issues${result.limited?' · First 100 results; narrow your search for more.':''}`:'No matching issues. Try another search or All states.';
  }catch(e){status.textContent=e.message;}finally{busy=false;count();}
 }
 dialog.querySelector('#import-search').onsubmit=e=>{e.preventDefault();if(!busy)search();};
 dialog.querySelector('#import-all').onchange=e=>{if(busy)return;dialog.querySelectorAll('#import-rows input:not(:disabled)').forEach(box=>{box.checked=e.target.checked;box.onchange();});};
 submit.onclick=async()=>{
  busy=true;count();status.textContent='Importing selected issues…';
  try{
   const result=await window.robos.importTasks({projectId:destination.id,numbers:[...selected]});if(!result.ok)throw Error(result.error);
   const imported=result.results.filter(r=>r.id).length,errors=result.results.filter(r=>r.error),skipped=result.results.filter(r=>r.skipped).length;
   await loadProjectsList();await openProject(destination.id);setPlannerView('tasks');
   if(errors.length){status.textContent=`Imported ${imported}; ${skipped} already saved. `+errors.map(r=>`#${r.number}: ${r.error}`).join(' ');selected.clear();}
   else{dialog.close();dialog.remove();showGenerateStatus(`Imported ${imported} issue${imported===1?'':'s'} into ${destination.product.name}.${skipped?` ${skipped} already saved.`:''}`);}
  }catch(e){status.textContent=e.message;}finally{busy=false;count();}
 };
 dialog.showModal();await search();
}

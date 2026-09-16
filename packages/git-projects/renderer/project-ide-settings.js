'use strict';
async function renderProjectIDE(project) {
 const options=await gp.ideOptions();if(selectedId!==project.id)return;
 let panel=document.getElementById('project-ide-settings');
 if(!panel){panel=document.createElement('section');panel.id='project-ide-settings';document.getElementById('detail-notes-row').after(panel);}
 panel.innerHTML=`<header><h3>IDE &amp; workspaces</h3><span>Repository-relative project roots work across checkouts and agent sessions.</span></header>
 <div class="project-ide-fields"><label>Checkout<select data-checkout></select></label><button class="btn btn-ghost" data-attach>Add checkout…</button><label>Default IDE for this repository<select data-ide></select></label><button class="btn btn-primary" data-open>Open workspace</button></div>
 <details data-roots><summary>Project roots</summary><div class="project-root-scroll"><table><thead><tr><th>Project root</th><th>Type</th><th>IDE</th></tr></thead><tbody></tbody></table></div></details>
 <details data-dependencies><summary>Repository dependencies <span>· merge before this repository</span></summary><div class="project-dependency-list"></div></details>
 <footer><button class="btn btn-ghost" data-discover>Discover project roots</button><button class="btn btn-primary" data-save>Save associations</button><span role="status"></span></footer>`;
 const status=panel.querySelector('[role=status]'),checkout=panel.querySelector('[data-checkout]'),ide=panel.querySelector('[data-ide]'),rootDetails=panel.querySelector('[data-roots]');
 const option=(value,label)=>{const node=document.createElement('option');node.value=value;node.textContent=label;return node;};
 checkout.append(option('','GitHub repository — discovery only'));
 for(const root of [...new Set([project.localPath,...project.workspaces||[]].filter(Boolean))])checkout.append(option(root,root));checkout.value=project.workspaces?.[0]||project.localPath||'';
 function fillIDEs(select){select.append(option('','Choose an IDE'));for(const item of options.ides)select.append(option(item.id,item.name+(item.available?'':' — not installed')));}
 fillIDEs(ide);ide.value=project.ideId||options.defaultIde||'';
 let roots=structuredClone(project.projectRoots||[]);
 function renderRoots(){const body=panel.querySelector('tbody');body.replaceChildren();rootDetails.querySelector('summary').textContent=`Project roots · ${roots.length}`;
  for(const root of roots){const row=document.createElement('tr'),name=document.createElement('td'),type=document.createElement('td'),cell=document.createElement('td'),picker=document.createElement('select');name.textContent=root.relativePath;name.title=root.relativePath;type.textContent=(root.types||[]).join(', ');fillIDEs(picker);picker.value=root.ideId;picker.setAttribute('aria-label','IDE for '+root.relativePath);picker.onchange=()=>root.ideId=picker.value;cell.append(picker);row.append(name,type,cell);body.append(row);}
  if(!roots.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=3;cell.textContent='No roots discovered yet. Discovery inspects build manifests without running repository code.';row.append(cell);body.append(row);}
 }renderRoots();
 const dependencies=panel.querySelector('.project-dependency-list');
 for(const other of data.projects.filter(p=>p.id!==project.id)){const row=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=other.url;box.checked=(project.dependsOn||[]).includes(other.url);row.append(box,' '+(other.label||other.name||other.repo));dependencies.append(row);}
 const open=panel.querySelector('[data-open]');const availability=()=>{open.disabled=!checkout.value||!ide.value;open.title=checkout.value?'Open this checkout with its configured project roots':'Add a local checkout to open it in an IDE';};checkout.onchange=availability;ide.onchange=availability;availability();
 const action=(selector,handler)=>{const button=panel.querySelector(selector);button.onclick=async()=>{button.disabled=true;status.textContent='Working…';try{await handler();}catch(e){status.textContent=e.message;}finally{button.disabled=false;availability();}};};
 action('[data-attach]',async()=>{const result=await gp.attachWorkspace(project.id);if(!result.ok)throw Error(result.error);if(result.project){Object.assign(project,result.project);await renderProjectIDE(project);}else status.textContent='';});
 action('[data-discover]',async()=>{const result=await gp.discoverRoots({id:project.id,workspace:checkout.value});if(!result.ok)throw Error(result.error);roots=result.roots.map(r=>({...r,ideId:roots.find(x=>x.relativePath===r.relativePath)?.ideId||r.ideId}));renderRoots();rootDetails.open=true;status.textContent=result.truncated?'Scan limit reached. Review these roots before saving.':'Discovered roots. Review the IDEs, then save.';});
 action('[data-save]',async()=>{const result=await gp.associateIDE({id:project.id,ideId:ide.value,projectRoots:roots,dependsOn:[...dependencies.querySelectorAll('input:checked')].map(x=>x.value)});if(!result.ok)throw Error(result.error);Object.assign(project,result.project);status.textContent='Associations saved.';});
 action('[data-open]',async()=>{const result=await gp.openWorkspace({id:project.id,workspace:checkout.value,ideId:ide.value});if(!result.ok)throw Error(result.error);status.textContent='Opened '+result.ide;});
}

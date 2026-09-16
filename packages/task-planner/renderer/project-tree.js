'use strict';
// Derive navigation from saved relationships; do not rewrite plans or issue data.
function plannerProjectTree(projects) {
  const byUrl=new Map(projects.filter(p=>p.workTaskUrl).map(p=>[p.workTaskUrl,p]));
  function parent(p) {
    if(p.parentPlanId)return projects.find(x=>x.id===p.parentPlanId);
    const body=[p.prompt,...(p.tasks||[]).map(t=>t.body)].join('\n');
    const url=body.match(/Parent (?:Feature|Epic):\s*(https:\/\/github\.com\/[^\s)]+\/issues\/\d+)/i)?.[1];
    // A separately opened ticket still belongs under the epic that contains it.
    const containers=p.workTaskUrl?projects.filter(x=>x.id!==p.id&&['epic','feature'].includes(x.kind)&&(x.tasks||[]).some(t=>t.ticketUrl===p.workTaskUrl)):[];
    const owner=byUrl.get(url)||(containers.length===1?containers[0]:undefined);
    if(owner?.product&&p.product&&owner.product.name.toLowerCase()!==p.product.name.toLowerCase())return undefined;
    return owner;
  }
  function root(p) {
    const seen=new Set([p.id]);let next;
    while((next=parent(p)) && !seen.has(next.id)){seen.add(next.id);p=next;}
    // Cyclic imported data stays accessible as separate folders.
    return next?projects.find(x=>x.id===[...seen][0]):p;
  }
  const groups=new Map();
  for(const p of projects){const owner=root(p);if(!groups.has(owner.id))groups.set(owner.id,{project:owner,children:[]});if(p!==owner)groups.get(owner.id).children.push(p);}
  return [...groups.values()];
}

function plannerModified(value) {return typeof value==='number'?value:Date.parse(value)||0;}
function plannerProducts(projects) {
  const products=new Map();
  for(const family of plannerProjectTree(projects)){
    const product=family.project.product||family.children.find(p=>p.product)?.product||{id:'unassigned',name:'(No Project)'};
    const key=product.name.toLowerCase();
    if(!products.has(key))products.set(key,{...product,families:[],modifiedAt:null});
    const group=products.get(key);group.families.push(family);
    const dates=[family.project,...family.children].map(p=>plannerModified(p.modifiedAt));
    group.modifiedAt=Math.max(group.modifiedAt||0,...dates);
  }
  for(const product of products.values())product.families.sort((a,b)=>Math.max(...[b.project,...b.children].map(p=>plannerModified(p.modifiedAt)))-Math.max(...[a.project,...a.children].map(p=>plannerModified(p.modifiedAt))));
  return [...products.values()].sort((a,b)=>b.modifiedAt-a.modifiedAt||a.name.localeCompare(b.name));
}
function plannerDate(value) {
  const date=new Date(value);if(!value||Number.isNaN(date.getTime()))return {short:'—',full:'Updated time unavailable'};
  return {short:date.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' '+date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}),full:date.toLocaleString()};
}
if(typeof module!=='undefined')module.exports={plannerProjectTree,plannerProducts,plannerDate};
let plannerSelectedTask=null;
const plannerClosedFolders=new Set();
function renderPlannerTree(projects) {
  const list=document.getElementById('project-list');const products=plannerProducts(projects);
  let sort=document.getElementById('planner-tree-sort');if(!sort){sort=document.createElement('robos-list-sort');sort.id='planner-tree-sort';sort.setAttribute('label','projects and tasks');list.before(sort);sort.addEventListener('sort-change',()=>renderPlannerTree(window.plannerSortProjects));}window.plannerSortProjects=projects;const order=sort.value;
  const compare=(a,b)=>window.robosList.compare(a,b,order);products.sort(compare);for(const p of products)p.families.sort((a,b)=>compare({...a.project,modifiedAt:Math.max(...[a.project,...a.children].map(p=>plannerModified(p.modifiedAt)))},{...b.project,modifiedAt:Math.max(...[b.project,...b.children].map(p=>plannerModified(p.modifiedAt)))}));
  const query=(document.getElementById('planner-project-search')?.value||'').toLowerCase();
  list.innerHTML='';
  function columns(element,label,status,modified){
    const title=document.createElement('span');title.className='planner-row-name';title.textContent=label;
    const state=document.createElement('span');state.className='planner-row-status';state.textContent=(status||'—').replaceAll('-',' ');
    const time=document.createElement('time');time.className='planner-row-time';const date=plannerDate(modified);time.textContent=date.short;time.title=date.full;if(modified&&date.short!=='—')time.dateTime=new Date(modified).toISOString();
    element.append(title,state,time);
  }
  function row(label,project,index,kind){
    const b=document.createElement('div');b.setAttribute('role','button');b.tabIndex=0;b.onkeydown=e=>{if(e.target===b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();b.click();}};b.className='project-item planner-tree-item planner-tree-row';b.type='button';b.dataset.id=project.id;
    if(index!==null)b.dataset.taskIndex=index;
    const selected=project.id===currentProjectId && (index===null?plannerSelectedTask===null:plannerSelectedTask===index);
    b.classList.toggle('active',selected);if(selected)b.setAttribute('aria-current','page');
    columns(b,label,project.workflowStatus||project.tasks?.[index??0]?.ticketStatus,project.modifiedAt);
    b.title=label+'\n'+((index===null?project.prompt:project.tasks[index].body)||'');
    b.onclick=async()=>{plannerSelectedTask=index;await openProject(project.id);setPlannerEditing(false);setPlannerView(index===null?'plan':'tasks');if(index!==null){const card=document.querySelectorAll('#task-list .task-card')[index];if(card){card.querySelector('details').open=true;card.scrollIntoView({block:'nearest'});}}};return b;
  }
  function folder(key,label,status,modified,className){
    const el=document.createElement('details');el.className=className;el.open=!!query||!plannerClosedFolders.has(key);
    el.addEventListener('toggle',()=>{if(!query){if(el.open)plannerClosedFolders.delete(key);else plannerClosedFolders.add(key);}});
    const summary=document.createElement('summary');summary.className='planner-tree-row';summary.title=label;columns(summary,label,status,modified);el.append(summary);return el;
  }
  const header=document.createElement('div');header.className='planner-tree-row planner-tree-heading';columns(header,'Project / feature / epic / task','Status',null);header.lastChild.textContent=order==='title'?'Updated':order==='updated-asc'?'Updated ↑':'Updated ↓';list.append(header);
  for(const product of products){
    const productMatch=product.name.toLowerCase().includes(query);
    const root=folder('product:'+product.id,product.name,'',product.modifiedAt,'planner-product-folder');root.dataset.product=product.name;
    for(const family of product.families){
      const records=[family.project,...family.children],byId=new Map(records.map(p=>[p.id,p]));
      const label=p=>{const ticket=p.workTaskUrl&&(p.tasks||[]).find(t=>t.ticketUrl===p.workTaskUrl)?.ticketKey;return `${p.kind[0].toUpperCase()+p.kind.slice(1)}${ticket?' '+ticket:''} · ${p.name}`;};
      function branch(p,seen=new Set()){
        if(seen.has(p.id))return null;seen=new Set([...seen,p.id]);
        const descendants=records.filter(c=>c.parentPlanId===p.id||(!c.parentPlanId&&c!==p&&p===family.project));
        const nested=descendants.map(c=>branch(c,seen)).filter(Boolean);
        const inline=(p.tasks||[]).map((t,index)=>({t,index})).filter(({t})=>t.ticketUrl!==p.workTaskUrl&&!records.some(c=>c.workTaskUrl&&c.workTaskUrl===t.ticketUrl));
        const ownMatch=productMatch||p.name.toLowerCase().includes(query);
        const tasks=inline.filter(({t})=>ownMatch||(t.title||'').toLowerCase().includes(query));
        if(query&&!ownMatch&&!nested.length&&!tasks.length)return null;
        if(!nested.length&&!tasks.length)return row(label(p),p,null,p.kind);
        const container=folder(p.id,label(p),p.workflowStatus,p.modifiedAt,'planner-project-folder');container.dataset.projectId=p.id;
        const name=container.querySelector('.planner-row-name');name.setAttribute('role','button');name.tabIndex=0;name.title='Open '+p.kind;
        const open=async e=>{e.preventDefault();e.stopPropagation();plannerSelectedTask=null;await openProject(p.id);setPlannerView(p.kind==='feature'?'details':'plan');};name.onclick=open;name.onkeydown=e=>{if(e.key==='Enter')open(e);};
        for(const child of nested)container.append(child);
        for(const {t,index} of tasks)container.append(row(`${t.isEpic?'Epic':'Task'} ${t.ticketKey||''} · ${t.title}`,p,index,'task'));
        return container;
      }
      if(family.project.kind==='project'){
        const p=family.project;root.dataset.projectRecord=p.id;const name=root.querySelector('.planner-row-name');name.setAttribute('role','button');name.tabIndex=0;name.title='Open project details';
        name.onclick=async e=>{e.preventDefault();e.stopPropagation();plannerSelectedTask=null;await openProject(p.id);setPlannerView('details');};
        for(const child of records.filter(c=>c.parentPlanId===p.id||(!c.parentPlanId&&c!==p))){const entry=branch(child);if(entry)root.append(entry);}
      }else {const entry=branch(family.project);if(entry)root.append(entry);}
    }

    if(root.children.length>1||root.dataset.projectRecord)list.append(root);
  }
  if(list.children.length===1){const empty=document.createElement('p');empty.className='project-empty';empty.textContent=query?'No matching projects or tasks.':'No plans yet. Click + to start one.';list.append(empty);}
  const product=products.find(g=>g.families.some(f=>f.project.id===currentProjectId||f.children.some(p=>p.id===currentProjectId)));
  const family=product?.families.find(f=>f.project.id===currentProjectId||f.children.some(p=>p.id===currentProjectId));
  const breadcrumb=document.getElementById('planner-breadcrumb');
  if(breadcrumb){
    breadcrumb.replaceChildren();
    if(family){
      const selected=projects.find(item=>item.id===currentProjectId);
      // The current item already has a heading; breadcrumbs contain ancestors only.
      if(selected?.kind!=='project'){
        const projectLink=document.createElement('button');projectLink.textContent=product.name;
        projectLink.title='Manage this project';projectLink.onclick=()=>openProjectManager();breadcrumb.append(projectLink);
        const ancestors=[],seen=new Set([selected?.id]);let cursor=selected;
        while(cursor?.parentPlanId){const parent=projects.find(p=>p.id===cursor.parentPlanId);if(!parent||seen.has(parent.id))break;seen.add(parent.id);ancestors.unshift(parent);cursor=parent;}
        if(!ancestors.length&&family.project.id!==currentProjectId)ancestors.push(family.project);
        for(const ancestor of ancestors){if(ancestor.kind==='project')continue;breadcrumb.append(document.createTextNode(' / '));const link=document.createElement('button');link.textContent=ancestor.name;link.title='Open '+ancestor.kind;link.onclick=async()=>{plannerSelectedTask=null;await openProject(ancestor.id);setPlannerView('plan');};breadcrumb.append(link);}

      }
    }
    breadcrumb.hidden=!breadcrumb.childNodes.length;
  }
  const assignment=document.getElementById('planner-product-name');if(assignment&&document.activeElement!==assignment)assignment.value=product?.name==='(No Project)'?'':product?.name||'';
  const options=document.getElementById('planner-product-options');if(options){options.replaceChildren();for(const p of products.filter(p=>p.name!=='(No Project)')){const o=document.createElement('option');o.value=p.name;options.append(o);}}
  if(typeof renderProjectContents==='function')renderProjectContents();
}

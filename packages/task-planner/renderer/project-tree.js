'use strict';
// Derive navigation from saved relationships; do not rewrite plans or issue data.
function plannerProjectTree(projects) {
  const byUrl=new Map(projects.filter(p=>p.workTaskUrl).map(p=>[p.workTaskUrl,p]));
  function parent(p) {
    if(p.parentPlanId)return projects.find(x=>x.id===p.parentPlanId);
    const body=[p.prompt,...(p.tasks||[]).map(t=>t.body)].join('\n');
    const url=body.match(/Parent Feature:\s*(https:\/\/github\.com\/[^\s)]+\/issues\/\d+)/i)?.[1];
    const owner=byUrl.get(url);
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
    const product=family.project.product||family.children.find(p=>p.product)?.product||{id:'unassigned',name:'Unassigned'};
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
  const query=(document.getElementById('planner-project-search')?.value||'').toLowerCase();
  list.innerHTML='';
  function columns(element,label,status,modified){
    const title=document.createElement('span');title.className='planner-row-name';title.textContent=label;
    const state=document.createElement('span');state.className='planner-row-status';state.textContent=(status||'—').replaceAll('-',' ');
    const time=document.createElement('time');time.className='planner-row-time';const date=plannerDate(modified);time.textContent=date.short;time.title=date.full;if(modified&&date.short!=='—')time.dateTime=new Date(modified).toISOString();
    element.append(title,state,time);
  }
  function row(label,project,index,kind){
    const b=document.createElement('button');b.className='project-item planner-tree-item planner-tree-row';b.type='button';b.dataset.id=project.id;
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
  const header=document.createElement('div');header.className='planner-tree-row planner-tree-heading';columns(header,'Project / feature / task','Status',null);header.lastChild.textContent='Updated ↓';list.append(header);
  for(const product of products){
    const productMatch=product.name.toLowerCase().includes(query);
    const root=folder('product:'+product.id,product.name,'',product.modifiedAt,'planner-product-folder');root.dataset.product=product.name;
    for(const family of product.families){
      const p=family.project,entries=[];
      for(const child of family.children)entries.push({p:child,index:null,label:`${child.tasks?.[0]?.ticketKey||'Task'} ${child.name}`});
      for(const [index,t] of (p.tasks||[]).entries()){
        if(t.ticketUrl===p.workTaskUrl || family.children.some(c=>c.workTaskUrl===t.ticketUrl))continue;
        entries.push({p,index,label:`${t.ticketKey||'Task'} ${t.title}`});
      }
      entries.sort((a,b)=>plannerModified(b.p.modifiedAt)-plannerModified(a.p.modifiedAt));
      const wholeMatch=productMatch||p.name.toLowerCase().includes(query);
      const matches=entries.filter(e=>wholeMatch||e.label.toLowerCase().includes(query));
      if(query&&!wholeMatch&&!matches.length)continue;
      if(p.kind==='project'){root.append(row('Overview',p,null,'plan'));for(const e of matches)root.append(row(e.label,e.p,e.index,'task'));continue;}
      if(!entries.length){root.append(row(`${p.tasks?.[0]?.ticketKey|| (p.kind==='task'?'Task':'Feature')} ${p.name}`,p,null,'plan'));continue;}
      const feature=folder(p.id,`${p.tasks?.[0]?.ticketKey||'Feature'} ${p.name}`,p.workflowStatus,p.modifiedAt,'planner-project-folder');feature.dataset.projectId=p.id;
      feature.append(row(p.workTaskUrl?'Feature plan':'Plan',p,null,'plan'));
      for(const e of matches)feature.append(row(e.label,e.p,e.index,'task'));
      root.append(feature);
    }
    if(root.children.length>1)list.append(root);
  }
  if(list.children.length===1){const empty=document.createElement('p');empty.className='project-empty';empty.textContent=query?'No matching projects or tasks.':'No plans yet. Click + to start one.';list.append(empty);}
  const product=products.find(g=>g.families.some(f=>f.project.id===currentProjectId||f.children.some(p=>p.id===currentProjectId)));
  const family=product?.families.find(f=>f.project.id===currentProjectId||f.children.some(p=>p.id===currentProjectId));
  const breadcrumb=document.getElementById('planner-breadcrumb');
  if(breadcrumb){breadcrumb.replaceChildren();if(family){const p=family.project;const b=document.createElement('button');b.textContent=p.kind==='project'?product.name:product.name+' / '+p.name;b.onclick=async()=>{plannerSelectedTask=null;await openProject(p.id);setPlannerView('plan');};breadcrumb.append(b,document.createTextNode(' / '+(plannerSelectedTask!==null?(projects.find(p=>p.id===currentProjectId)?.tasks?.[plannerSelectedTask]?.title||'Task'):p.id===currentProjectId?(p.kind==='project'?'Overview':'Plan'):currentProjectName)));}}
  const assignment=document.getElementById('planner-product-name');if(assignment&&document.activeElement!==assignment)assignment.value=product?.name==='Unassigned'?'':product?.name||'';
  const options=document.getElementById('planner-product-options');if(options){options.replaceChildren();for(const p of products.filter(p=>p.name!=='Unassigned')){const o=document.createElement('option');o.value=p.name;options.append(o);}}
  if(typeof renderProjectContents==='function')renderProjectContents();
}

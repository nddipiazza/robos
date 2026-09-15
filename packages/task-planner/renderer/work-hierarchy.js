'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const more=document.getElementById('planner-more-actions');
 for(const kind of ['feature','epic']){const button=document.createElement('button');button.className='btn btn-outline';button.id='planner-add-'+kind;button.textContent='Add '+kind;button.title=kind==='feature'?'Create a lasting part of this project.':'Create a delivery goal containing tasks or sub-epics.';button.onclick=()=>{document.getElementById('planner-more').open=false;createPlannerWork(kind);};more.append(button);}
 const panel=document.createElement('section');panel.id='work-hierarchy-settings';panel.className='work-hierarchy-settings';document.getElementById('planner-panel-details').append(panel);let active=null;
 const refresh=window.refreshPlannerUX;window.refreshPlannerUX=function(...args){refresh(...args);const record=selectedPlannerRecord();if(!record){panel.hidden=true;active=null;return;}panel.hidden=false;
 document.getElementById('planner-add-epic').textContent=record.kind==='epic'?'Add sub-epic':'Add epic';
 if(record.kind==='feature'){document.getElementById('planner-primary').textContent='Add epic';document.getElementById('planner-primary').onclick=()=>createPlannerWork('epic');document.getElementById('planner-action-help').textContent='A feature describes part of this project. Create epics for delivery goals and link related features in Details.';document.getElementById('planner-ai-revise').hidden=true;document.querySelector('[data-planner-tab=plan]').textContent='Overview';}
 document.querySelector('[data-planner-tab=details]').textContent='Details';
 if(active===record.id)return;active=record.id;render(record);
 };
 function render(record){
 panel.replaceChildren();const heading=document.createElement('h3');heading.textContent=record.kind[0].toUpperCase()+record.kind.slice(1)+' details';panel.append(heading);
 const form=document.createElement('form');form.className='hierarchy-form';panel.append(form);
 function field(label,tag,value){const wrapper=document.createElement('label'),caption=document.createElement('span'),input=document.createElement(tag);caption.textContent=label;input.value=value||'';wrapper.append(caption,input);form.append(wrapper);return input;}
 const name=field('Name','input',record.name);name.required=true;
 const desc=field('Description','textarea',record.description);desc.rows=3;desc.placeholder='Purpose and scope';
 const parent=field('Parent','select');parent.append(new Option(record.product?.name?'Directly in '+record.product.name:'(No Project)',''));
 const allowed={project:[],feature:[],epic:['feature','epic'],task:['feature','epic']};
 for(const p of projectsList.filter(p=>p.id!==record.id&&p.product?.id===record.product?.id&&allowed[record.kind].includes(p.kind)))parent.append(new Option(p.kind+' · '+p.name,p.id));parent.value=record.parentPlanId||'';parent.parentElement.hidden=['project','feature'].includes(record.kind);
 let resources=null,related=null;
 if(record.kind==='project'){resources=field('Web resources — one URL per line','textarea',(record.resources||[]).join('\n'));resources.rows=3;resources.placeholder='https://app.example.com\nhttps://docs.example.com';}
 if(record.kind==='feature'){
  const caption=document.createElement('p');caption.textContent='Related features — links between peers, not nested features.';form.append(caption);
  const search=field('Find related features','input');search.placeholder='Search features…';const list=document.createElement('div');list.className='hierarchy-relations';form.append(list);related=new Set(record.relatedFeatureIds||[]);
  const draw=()=>{list.replaceChildren();for(const f of projectsList.filter(p=>p.kind==='feature'&&p.id!==record.id&&p.name.toLowerCase().includes(search.value.toLowerCase()))){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=related.has(f.id);box.onchange=()=>box.checked?related.add(f.id):related.delete(f.id);label.append(box,document.createTextNode(f.name+' · '+(f.product?.name||'No Project')));list.append(label);}if(!list.childNodes.length)list.textContent='No matching features.';};search.oninput=draw;draw();
 }
 const save=document.createElement('button');save.className='btn btn-accent';save.textContent='Save details';const status=document.createElement('p');status.setAttribute('role','status');form.append(save,status);
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const result=await window.robos.saveProject({id:record.id,kind:record.kind,hierarchyVersion:2,name:name.value.trim(),description:desc.value.trim(),parentPlanId:parent.value||null,...(resources?{resources:resources.value.split('\n').map(s=>s.trim()).filter(Boolean)}:{}),...(related?{relatedFeatureIds:[...related]}:{})});if(!result.ok)throw Error(result.error);await loadProjectsList();await openProject(record.id);setPlannerView('details');status.textContent='Details saved.';}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
 }
 window.refreshPlannerUX(plannerSession);
});

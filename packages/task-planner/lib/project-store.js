'use strict';
const fs=require('fs'),path=require('path'),{randomUUID}=require('crypto');
function saveProject(dir,input){
 fs.mkdirSync(dir,{recursive:true});require('./work-hierarchy').migrate(dir);
 if(input.id&&!/^[a-zA-Z0-9_-]+$/.test(input.id))throw Error('Invalid project ID');
 const id=input.id||randomUUID(),file=path.join(dir,id+'.json');
 const existing=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const kind=input.kind||existing?.kind||(existing?.workTaskUrl?'epic':existing?.product?'epic':'project');
 const name=(input.name||existing?.name||'').trim();if(!name)throw Error('Enter a name.');
 if(kind==='project'){
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){let p;try{p=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));}catch{continue;}if(p.id!==id&&(p.kind==='project'||(!p.workTaskUrl&&!p.product))&&p.name?.trim().toLowerCase()===name.toLowerCase())throw Error('A project with this name already exists. Open it from the project list.');}
 }
 const now=Date.now();const saved={...existing,...input,id,name,kind,hierarchyVersion:2,createdAt:existing?.createdAt||now,updatedAt:now};
 if(kind==='project')saved.product={id,name};
 if(kind!=='project'&&!saved.workTaskUrl&&!saved.product)throw Error('Choose a project before creating work.');
 require('./work-hierarchy').validate(saved,fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f)))));
 fs.writeFileSync(file,JSON.stringify(saved,null,2),'utf8');
 if(kind==='project'&&existing){for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){const fp=path.join(dir,f);let child;try{child=JSON.parse(fs.readFileSync(fp,'utf8'));}catch{continue;}
 if(child.id!==id&&child.product&&(child.product.id===id||child.product.name===existing.name)){child.product={...child.product,id,name};fs.writeFileSync(fp,JSON.stringify(child,null,2));}}}
 return saved;
}
function associateProject(dir,{id,projectId}){
 if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid plan ID');
 const file=path.join(dir,id+'.json'),record=JSON.parse(fs.readFileSync(file,'utf8'));
 if(record.kind==='project')throw Error('Choose a feature, epic, or task.');
 let product=null;
 if(projectId){if(!/^[a-zA-Z0-9_-]+$/.test(projectId))throw Error('Invalid project ID');const target=JSON.parse(fs.readFileSync(path.join(dir,projectId+'.json'),'utf8'));if(target.kind!=='project')throw Error('Choose an existing project.');product={id:target.id,name:target.name};}
 const records=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>{try{return {file:path.join(dir,f),data:JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))};}catch{return null;}}).filter(Boolean);
 const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const r of records)if(ids.has(r.data.parentPlanId)&&!ids.has(r.data.id)){ids.add(r.data.id);changed=true;}}
 for(const r of records)if(ids.has(r.data.id)){r.data.product=product;if(r.data.id===id)r.data.parentPlanId=null;r.data.updatedAt=Date.now();fs.writeFileSync(r.file,JSON.stringify(r.data,null,2));}
 return {ok:true};
}
module.exports={saveProject,associateProject};

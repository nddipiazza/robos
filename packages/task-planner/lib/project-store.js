'use strict';
const fs=require('fs'),path=require('path'),{randomUUID}=require('crypto');
function saveProject(dir,input){
 fs.mkdirSync(dir,{recursive:true});
 if(input.id&&!/^[a-zA-Z0-9_-]+$/.test(input.id))throw Error('Invalid project ID');
 const id=input.id||randomUUID(),file=path.join(dir,id+'.json');
 const existing=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const kind=input.kind||existing?.kind||(existing?.workTaskUrl?'feature':existing?.product?'feature':'project');
 const name=(input.name||existing?.name||'').trim();if(!name)throw Error('Enter a name.');
 if(!input.id&&kind==='project'){
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){let p;try{p=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));}catch{continue;}if((p.kind==='project'||(!p.workTaskUrl&&!p.product))&&p.name?.trim().toLowerCase()===name.toLowerCase())throw Error('A project with this name already exists. Open it from the project list.');}
 }
 const now=Date.now();const saved={...existing,...input,id,name,kind,createdAt:existing?.createdAt||now,updatedAt:now};
 if(kind==='project')saved.product={id,name};
 if(kind!=='project'&&!saved.workTaskUrl&&!saved.product)throw Error('Choose a project before creating work.');
 fs.writeFileSync(file,JSON.stringify(saved,null,2),'utf8');return saved;
}
module.exports={saveProject};

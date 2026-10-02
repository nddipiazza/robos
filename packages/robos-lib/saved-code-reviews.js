'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const registry=path.join(os.homedir(),'.robos/code-reviews/index.json');
function entries(){try{return JSON.parse(fs.readFileSync(registry,'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
function register(file){const manifest=fs.realpathSync(file),id=createHash('sha256').update(manifest).digest('hex').slice(0,20);const rows=entries().filter(e=>e.id!==id);rows.unshift({id,manifest});fs.mkdirSync(path.dirname(registry),{recursive:true,mode:0o700});fs.writeFileSync(registry+'.tmp',JSON.stringify(rows,null,2),{mode:0o600});fs.renameSync(registry+'.tmp',registry);return id;}
function get(id){const entry=entries().find(e=>e.id===id);if(!entry)throw Error('Saved review not found.');return {...entry,config:JSON.parse(fs.readFileSync(entry.manifest,'utf8'))};}
function list(){return entries().flatMap(e=>{try{return [get(e.id)];}catch{return [];}});}
module.exports={register,get,list};

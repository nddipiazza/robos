'use strict';
const fs=require('node:fs'),path=require('node:path');
function createCache({file,now=Date.now,ttl=24*60*60*1000,retry=5*60*1000}){
 const pending=new Map(),failures=new Map();let entries={};try{entries=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 async function get(key,discover,{refresh=false}={}){
  const old=entries[key];if(!refresh&&old&&now()-old.updatedAt<ttl)return {...old,cached:true};
  if(pending.has(key))return pending.get(key);
  if(!refresh&&failures.has(key)&&now()-failures.get(key).at<retry)return {...(old||{models:[]}),cached:!!old,stale:true,warning:failures.get(key).message};
  const promise=(async()=>{try{const models=await discover();if(!Array.isArray(models)||!models.length)throw Error('No models were returned.');const entry={models,updatedAt:now()};entries[key]=entry;failures.delete(key);try{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(entries),{mode:0o600});fs.renameSync(temp,file);}catch{}return {...entry,cached:false};}catch(error){failures.set(key,{at:now(),message:error.message});return {...(old||{models:[]}),cached:!!old,stale:true,warning:error.message};}finally{pending.delete(key);}})();pending.set(key,promise);return promise;
 }
 return {get};
}
module.exports={createCache};

'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// A ledger separate from history: clearing/dismissing alerts must not replay them.
function claimNotification(file,event,{now=Date.now(),cooldownMs=5*60*1000}={}){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const lock=file+'.lock';let fd;
 try{fd=fs.openSync(lock,'wx');}catch(e){
  if(e.code!=='EEXIST')throw e;
  // A crashed writer can block notifications only briefly.
  try{if(now-fs.statSync(lock).mtimeMs>60000)fs.unlinkSync(lock);}catch{}
  return false;
 }
 try{
  let ledger={events:{},items:{}};try{ledger=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  const item=hash([event.source||'robos',event.category||'system',event.tier||'info',event.title,event.action||null]);
  const key=hash([item,event.eventKey||null,event.revision||null,event.body||event.message||'']);
  if(Object.hasOwn(ledger.events,key))return false;
  ledger.events[key]=now;
  const allowed=!Object.hasOwn(ledger.items,item)||now-ledger.items[item]>=cooldownMs;
  if(allowed)ledger.items[item]=now;
  for(const section of ['events','items'])ledger[section]=Object.fromEntries(Object.entries(ledger[section]).sort((a,b)=>b[1]-a[1]).slice(0,10000));
  const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(ledger),{mode:0o600});fs.renameSync(temp,file);
  return allowed;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={claimNotification};

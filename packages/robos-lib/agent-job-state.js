'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.join(os.homedir(),'.robos','agent-jobs');
const valid=id=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'');
function processIdentity(pid){try{process.kill(pid,0);return process.platform==='linux'?fs.readFileSync('/proc/'+pid+'/stat','utf8').split(') ').at(-1).split(' ')[19]:String(pid);}catch{return null;}}
function write(value,{directory=root}={}){
 if(!valid(value.sessionId)||value.provider!=='codex')return;
 const record={...value,ownerPid:process.pid,ownerIdentity:processIdentity(process.pid),childIdentity:value.childPid?processIdentity(value.childPid):null,updatedAt:Date.now()};
 fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,value.sessionId+'.json');const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(record),{mode:0o600});fs.renameSync(tmp,file);
}
function read(id,{directory=root,identity=processIdentity}={}){
 if(!valid(id))return null;
 try{const job=JSON.parse(fs.readFileSync(path.join(directory,id+'.json'),'utf8'));if(job.status==='running'&&(!job.ownerIdentity||identity(job.ownerPid)!==job.ownerIdentity||job.childPid&&identity(job.childPid)!==job.childIdentity))return {...job,status:'interrupted',activity:'The agent process has stopped.'};return job;}catch{return null;}
}
module.exports={write,read};

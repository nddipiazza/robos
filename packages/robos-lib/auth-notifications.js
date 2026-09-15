'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const KINDS=new Set(['mcp','slack','agent','github']);
const defaults=()=>path.join(os.homedir(),'.config/robos');
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function write(file,data){const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(tmp,file);}
function key(kind,id){if(!KINDS.has(kind)||typeof id!=='string'||!id)throw Error('Unknown authentication target.');return kind+':'+id;}
function update(config,fn){fs.mkdirSync(config,{recursive:true});const lock=path.join(config,'auth-notifications.lock');let fd;for(let attempt=0;attempt<50;attempt++){try{fd=fs.openSync(lock,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;try{if(Date.now()-fs.statSync(lock).mtimeMs>60000)fs.unlinkSync(lock);}catch{}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}if(fd===undefined)return false;try{return fn(path.join(config,'notifications.json'),path.join(config,'auth-incidents.json'));}finally{fs.closeSync(fd);fs.unlinkSync(lock);}}
function report({kind,id,name},config=defaults()){
 const authKey=key(kind,id);return update(config,(file,ledgerFile)=>{const ledger=read(ledgerFile,{});if(ledger[authKey]?.active)return false;
 const label=kind==='mcp'?'Sign in with Chrome':kind==='slack'?'Reconnect Slack':kind==='github'?'Open GitHub sign-in':'Open '+name+' sign-in';
 const entry={id:crypto.randomUUID(),authKey,authStatus:'login-required',title:name+' needs login',body:kind==='slack'?'The saved Slack login is unavailable or expired. Reauthorize in Team Chat Servers, then check the connection.':kind==='agent'?'Sign in through RobOS Agents, then retry your task. This alert clears after a successful agent request.':'The saved login is missing, expired, or rejected. Reconnect to continue.',category:'agent',tier:'warning',source:'robos-auth',action:{type:'auth-reconcile',kind,serverId:id,label},ts:new Date().toISOString(),read:false};
 write(file,[entry,...read(file,[])].slice(0,500));ledger[authKey]={active:true,notificationId:entry.id};write(ledgerFile,ledger);return entry;
 });
}
function resolve(kind,id,config=defaults()){const authKey=key(kind,id);return update(config,(file,ledgerFile)=>{const ledger=read(ledgerFile,{});if(!ledger[authKey]?.active)return false;const now=new Date().toISOString();write(file,read(file,[]).map(n=>n.authKey===authKey?{...n,authStatus:'resolved',resolvedAt:now,read:true}:n));ledger[authKey]={active:false,resolvedAt:now};write(ledgerFile,ledger);return true;});}
function isLoginError(text){return /(?:token|credentials?|authentication|authorization|session).{0,45}(?:expired|revoked|invalid)|(?:expired|invalid|revoked).{0,25}(?:token|credentials?)|invalid_grant|invalid_auth|not_authed|not authenticated|authentication required|login (?:required|unavailable)|log in (?:again|to)|sign in (?:again|to)|bad credentials|HTTP 401|401 Unauthorized|Unauthorized.{0,10}401|status(?: code)?[: ]+401/i.test(String(text));}
function reportAgent(provider,text){if(!isLoginError(text))return false;let kind='agent',id=provider==='antigravity'?'agy':provider,name=id==='agy'?'AGY':id==='codex'?'Codex':id==='claude'?'Claude':id;
 // Service-specific failures have their own server-scoped reporters.
 if(/\bSlack\b|\bMCP\b/.test(text))return false;
 if(/\bGitHub\b|\bgh auth\b/.test(text)){kind='github';id='github.com';name='GitHub';}
 if(kind==='agent'&&!['codex','agy','claude','copilot'].includes(id))return false;return report({kind,id,name});}
module.exports={report,resolve,isLoginError,reportAgent,read,write,update};

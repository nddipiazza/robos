'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const KINDS=new Set(['mcp','slack','agent','github','cloud-files','google-cloud','ci']);
const defaults=()=>path.join(os.homedir(),'.config/robos');
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function write(file,data){const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(tmp,file);}
function key(kind,id){if(!KINDS.has(kind)||typeof id!=='string'||!id)throw Error('Unknown authentication target.');return kind+':'+id;}
function update(config,fn){fs.mkdirSync(config,{recursive:true});const lock=path.join(config,'auth-notifications.lock');let fd;for(let attempt=0;attempt<50;attempt++){try{fd=fs.openSync(lock,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;try{if(Date.now()-fs.statSync(lock).mtimeMs>60000)fs.unlinkSync(lock);}catch{}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}if(fd===undefined)return false;try{return fn(path.join(config,'notifications.json'),path.join(config,'auth-incidents.json'));}finally{fs.closeSync(fd);fs.unlinkSync(lock);}}
function report({kind,id,name},config=defaults()){
 const authKey=key(kind,id);return update(config,(file,ledgerFile)=>{const ledger=read(ledgerFile,{});if(ledger[authKey]?.active)return false;
 const label=kind==='google-cloud'?'Sign in to Google Cloud':kind==='cloud-files'?'Reconnect cloud storage':kind==='mcp'?'Sign in with Chrome':kind==='slack'?'Reconnect Slack':kind==='github'?'Open GitHub sign-in':'Open '+name+' sign-in';
 const entry={id:crypto.randomUUID(),authKey,authStatus:'login-required',sticky:true,title:name+' needs login',body:kind==='slack'?'The saved Slack login is unavailable or expired. Reauthorize in Team Chat Servers, then check the connection.':kind==='agent'?'Sign in through RobOS Agents, then retry your task. This alert clears after a successful agent request.':'The saved login is missing, expired, or rejected. Reconnect to continue.',category:'agent',tier:'warning',source:'robos-auth',action:{type:'auth-reconcile',kind,serverId:id,label},ts:new Date().toISOString(),read:false};
 write(file,[entry,...read(file,[])].slice(0,500));ledger[authKey]={active:true,kind,id,name,checkedAt:entry.ts,status:'login-required',notificationId:entry.id};write(ledgerFile,ledger);return entry;
 });
}
function resolve(kind,id,config=defaults()){const authKey=key(kind,id);return update(config,(file,ledgerFile)=>{const ledger=read(ledgerFile,{});const wasActive=!!ledger[authKey]?.active;const now=new Date().toISOString();write(file,read(file,[]).map(n=>n.authKey===authKey?{...n,authStatus:'resolved',resolvedAt:now,read:true}:n));ledger[authKey]={...ledger[authKey],kind,id,active:false,status:'connected',checkedAt:now,resolvedAt:now,notificationId:ledger[authKey]?.notificationId};write(ledgerFile,ledger);return wasActive;});}
function isLoginError(text){return /(?:token|credentials?|authentication|authorization|session).{0,45}(?:expired|revoked|invalid)|(?:expired|invalid|revoked).{0,25}(?:token|credentials?)|invalid_grant|invalid_auth|not_authed|not authenticated|authentication required|login (?:required|unavailable|expired)|log in (?:again|to)|sign in (?:again|to)|bad credentials|HTTP 401|401 Unauthorized|Unauthorized.{0,10}401|status(?: code)?[: ]+401/i.test(String(text));}
function reportAgent(provider,text,config=defaults()){if(!isLoginError(text))return false;let kind='agent',id=provider==='antigravity'?'agy':provider,name=id==='agy'?'AGY':id==='codex'?'Codex':id==='claude'?'Claude':id;
 // Service-specific failures have their own server-scoped reporters.
 if(/\bSlack\b|\bMCP\b|\bgcloud\b|Google Cloud|Secret Manager|FONTAWESOME_NPM_AUTH_TOKEN|Google Drive|OneDrive|Azure|AWS|Vercel|Buildkite/i.test(text))return false;
 if(/\bgh auth\b/.test(text)||(/\bGitHub\b/.test(text)&&id!=='copilot')){kind='github';id='github.com';name='GitHub';}
 if(kind==='agent'&&!['codex','agy','claude','copilot'].includes(id))return false;return report({kind,id,name},config);}
module.exports={report,resolve,isLoginError,reportAgent,read,write,update};

function confirm(kind,id,name,config=defaults()){
 const authKey=key(kind,id);const entry=update(config,(file,ledgerFile)=>{const ledger=read(ledgerFile,{}),item=ledger[authKey];if(!item||!item.notificationId||item.active||item.confirmedAt)return null;const ts=new Date().toISOString(),entry={id:crypto.randomUUID(),title:name+' connected',body:'Login and access verified.',category:'system',tier:'info',source:'robos-auth',ts,read:false,eventKey:'auth-connected:'+authKey+':'+(item.notificationId||item.resolvedAt)};write(file,[entry,...read(file,[])].slice(0,500));item.confirmedAt=ts;write(ledgerFile,ledger);return entry;});
 if(!entry)return false;
 if(config===defaults()&&!read(path.join(config,'notification-prefs.json'),{}).dnd){const child=require('node:child_process').spawn('notify-send',['-a','RobOS','-t','6000',entry.title,entry.body],{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref();}
 return true;
}
module.exports.confirm=confirm;

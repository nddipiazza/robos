'use strict';
// Shared inbox for human permission requests. Resolution belongs to the caller
// after the underlying operation succeeds, never merely after opening the UI.
const path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {update,read,write}=require('./auth-notifications');
const configDir=()=>path.join(os.homedir(),'.config/robos');
const routes=new Set(['task-implementer','task-planner','pr-review','robos-agent-task-runner']);
function classify(text){
 const s=String(text);
 if(/sudo:.*(?:password is required|a terminal is required|no tty|authentication)|(?:sudo|administrator|root).{0,40}(?:permission|privileges?|required)|not in the sudoers/i.test(s))return 'administrator';
 if(/permission required for|requires? (?:human |user )?(?:permission|approval)|awaiting (?:human |user )?approval|approval required|tool.{0,30}(?:denied|not allowed)/i.test(s))return 'approval';
 return null;
}
function report({taskUrl,kind,app='task-implementer'},config=configDir()){
 if(!['administrator','approval'].includes(kind)||!routes.has(app))throw Error('Unknown human permission request.');
 if(!/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(taskUrl))throw Error('A task URL is required.');
 const requestKey='human:'+kind+':'+taskUrl;
 return update(config,(file,ledgerFile)=>{const ledger=read(ledgerFile,{});if(ledger[requestKey]?.active)return false;
 const entry={id:crypto.randomUUID(),requestKey,requestStatus:'pending',source:'robos-human-request',category:'agent',tier:'warning',title:kind==='administrator'?'Administrator permission needed':'Agent permission needed',body:`${taskUrl}\n${kind==='administrator'?'The task needs administrator permission. Review the blocked operation in its sandbox session.':'The agent needs your permission to continue. Review the requested operation in its session.'} Review the request before retrying the task.`,action:{type:'human-request',app,taskUrl,label:'Review request'},ts:new Date().toISOString(),read:false};
 write(file,[entry,...read(file,[])].slice(0,500));ledger[requestKey]={active:true,notificationId:entry.id};write(ledgerFile,ledger);return entry;});
}
function reportError(taskUrl,text,config){const kind=classify(text);return kind?report({taskUrl,kind},config):false;}
function resolveTask(taskUrl,config=configDir()){return update(config,(file,ledgerFile)=>{const ledger=read(ledgerFile,{}),now=new Date().toISOString();let changed=false;
 const entries=read(file,[]).map(n=>{if(n.action?.type!=='human-request'||n.action.taskUrl!==taskUrl||n.requestStatus!=='pending')return n;changed=true;return {...n,requestStatus:'resolved',resolvedAt:now,read:true};});
 for(const kind of ['administrator','approval']){const key='human:'+kind+':'+taskUrl;if(ledger[key]?.active){changed=true;ledger[key]={active:false,resolvedAt:now};}}
 if(changed){write(file,entries);write(ledgerFile,ledger);}return changed;});}
module.exports={classify,report,reportError,resolveTask};

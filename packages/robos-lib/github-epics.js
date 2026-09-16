'use strict';
function logicalType(type,server={},labels=[]){const value=String(type?.name||type||'').toLowerCase();return value==='task'&&(!server.type||server.type==='github')&&labels.some(l=>String(l?.name||l).toLowerCase()==='epic')?'epic':value;}
function serverType(type){return String(type).toLowerCase()==='epic'?'Task':type;}
function forIssue(url){const fs=require('node:fs'),path=require('node:path'),os=require('node:os');let settings={};try{settings=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/robos/settings.json')));}catch(e){if(e.code!=='ENOENT')throw e;}const repo=new URL(url).pathname.split('/').slice(1,3).join('/').toLowerCase();return (settings.task_servers||[]).find(s=>s.type==='github'&&(s.repos||[]).some(r=>(typeof r==='string'?r:`${r.org}/${r.repo}`).toLowerCase()===repo))||{};}
function explanation(type,server={},labels=[]){return logicalType(type,server,labels)==='epic'&&String(type?.name||type).toLowerCase()==='task'?'GitHub: Task · label: epic':null;}
function prepare(task,server){const epic=task.isEpic||String(task.issueType).toLowerCase()==='epic'||logicalType(task.issueType,server,task.labels)==='epic';return epic?{...task,issueType:'epic',labels:[...new Set([...(task.labels||[]).filter(l=>String(l?.name||l).toLowerCase()!=='epic'),'epic'])]}:task;}
module.exports={logicalType,serverType,forIssue,explanation,prepare};

'use strict';
const fs=require('node:fs'),path=require('node:path');
const core=require('../../robos-agent-client/work-task/core');
function fileFor(dir,id){if(typeof id!=='string'||! /^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid work item ID');return path.join(dir,id+'.json');}
function remove(dir,id){const file=fileFor(dir,id),record=JSON.parse(fs.readFileSync(file));if(record.kind==='project')throw Error('Manage projects from Project settings; this action deletes work items only.');const state=record.workTaskUrl?core.read(record.workTaskUrl):null;if(state?.workerPid){try{process.kill(state.workerPid,0);throw Error('Stop the running agent before removing this work item.');}catch(e){if(e.code!=='ESRCH')throw e;}}
 const backup=path.join(path.dirname(dir),'deleted-work-items',id+'-'+Date.now()+'.json');fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,JSON.stringify({record,state},null,2),{mode:0o600});
 if(state)core.save(record.workTaskUrl,{approvedPlanHash:null,planApproval:null,plannerProjectId:null,phase:'plan-review'});
 fs.unlinkSync(file);return {ok:true,backup};}
function saveSignoff(dir,{id,personUid,githubLogin,scope},people){const file=fileFor(dir,id),record=JSON.parse(fs.readFileSync(file));if(!['plan','pr','both'].includes(scope))throw Error('Choose a signoff stage');const person=people.find(p=>p.uid===personUid);if(!person)throw Error('Choose a person from People Directory');if(!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(githubLogin||''))throw Error('Enter the reviewer’s GitHub login');record.requiredSignoff={personUid,name:person.displayName,githubLogin,scope,updatedAt:new Date().toISOString()};record.updatedAt=Date.now();fs.writeFileSync(file,JSON.stringify(record,null,2));if(record.workTaskUrl)core.save(record.workTaskUrl,{approvedPlanHash:null,planApproval:null,phase:'plan-review'});return {ok:true,requiredSignoff:record.requiredSignoff};}
module.exports={remove,saveSignoff,fileFor};

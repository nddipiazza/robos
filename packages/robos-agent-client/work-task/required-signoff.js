'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function requirement(state,dir=path.join(os.homedir(),'.config/robos/task-planner/projects')){const id=state.plannerProjectId;if(!id)return null;if(!/^[\w-]+$/.test(id))throw Error('Invalid Planner record');const file=path.join(dir,id+'.json');if(!fs.existsSync(file))return null;return JSON.parse(fs.readFileSync(file)).requiredSignoff||null;}
function includes(r,stage){return !!r&&(r.scope==='both'||r.scope===stage);}
function assertPlanSigner(r,login){if(includes(r,'plan')&&login.toLowerCase()!==r.githubLogin.toLowerCase())throw Error(`Plan signoff is required from ${r.name} (@${r.githubLogin}). Sign in as that reviewer to approve.`);}
function assertPlanCertificate(state,r){if(includes(r,'plan')&&state.planApproval?.githubLogin?.toLowerCase()!==r.githubLogin.toLowerCase())throw Error(`This plan still requires ${r.name}'s signoff in Task Planner.`);}
function assertPR(r,reviews,head){if(!includes(r,'pr'))return;const latest=reviews.filter(v=>v.author?.login?.toLowerCase()===r.githubLogin.toLowerCase()&&v.state!=='COMMENTED').sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)))[0];if(latest?.state!=='APPROVED'||latest.commit?.oid!==head)throw Error(`PR signoff is required from ${r.name} (@${r.githubLogin}) on the current commit.`);}
module.exports={requirement,includes,assertPlanSigner,assertPlanCertificate,assertPR};

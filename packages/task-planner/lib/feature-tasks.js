'use strict';
const {execFile}=require('node:child_process');
const core=require('../../robos-agent-client/work-task/core');
function query(args){return new Promise((resolve,reject)=>execFile('gh',args,{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024},(err,out,stderr)=>{if(err)return reject(Error(stderr||err.message));try{resolve(JSON.parse(out));}catch(e){reject(e);}}));}
async function featureTasks(url,run=query){
 const {repo,number}=core.identity(url);
 const pages=await run(['api',`repos/${repo}/issues/${number}/sub_issues`,'--paginate','--slurp']);
 const issues=pages.flat();
 return issues.map(issue=>{const workflow=core.read(issue.html_url);return {number:issue.number,title:issue.title,updatedAt:issue.updated_at,createdAt:issue.created_at,body:issue.body||'',url:issue.html_url,state:issue.state,status:issue.state==='closed'?'Done':workflow.phase&&workflow.phase!=='new'?workflow.phase.replaceAll('-',' '):'Open',assignees:(issue.assignees||[]).map(a=>a.login)};});
}
module.exports={featureTasks};

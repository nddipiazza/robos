'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const defaultRoot=path.join(os.homedir(),'.robos','local-reviews');
const identity=value=>createHash('sha256').update(value).digest('hex').slice(0,16);
const isEpic=task=>(task.labels||[]).some(l=>/^epic$/i.test(typeof l==='string'?l:l.name))||/^epic\b/i.test(task.type||'');
function savedTasks(root=defaultRoot){
 const rows=[];if(!fs.existsSync(root))return rows;
 for(const entry of fs.readdirSync(root,{withFileTypes:true})){
  if(!entry.isDirectory())continue;const manifest=path.join(root,entry.name,'review.json');
  try{const review=JSON.parse(fs.readFileSync(manifest,'utf8')),task=review.task||{};if(isEpic(task))continue;
   rows.push({id:identity(manifest),title:task.title||review.title,url:task.url||review.taskUrl||'',repo:review.repo||'',workspace:review.workspace,manifest,task,updatedAt:fs.statSync(manifest).mtime.toISOString(),available:!!review.workspace&&fs.existsSync(review.workspace),saved:true,branch:review.pullRequest?.headRefName||''});
  }catch{/* An incomplete manifest must not hide other reviews. */}
 }
 return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
module.exports={savedTasks};

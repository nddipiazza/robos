'use strict';
async function reviewNeighbors(review,{lookup=require('../../robos-task-client/epic-navigation').epicNavigation,saved=require('./task-picker').savedTasks}={}){
 const result=await lookup(review?.task?.url||review?.taskUrl);
 if(!result)return null;
 const rows=saved();
 const attach=task=>{if(!task)return null;const row=rows.find(r=>r.url===task.url&&r.available);return {...task,reviewId:row?.id||null};};
 return {...result,previous:attach(result.previous),next:attach(result.next)};
}
module.exports={reviewNeighbors};

'use strict';
function typeArgs(task,server,{creating=false}={}){
 const raw=task.issueType||(creating?(task.isEpic?'feature':'task'):null);
 if(!raw)return [];
 const types=server.issueTypes||[];
 const found=types.find(t=>[t.id,t.label].some(v=>String(v).toLowerCase()===String(raw).toLowerCase()));
 if(types.length&&!found)throw Error('Choose a configured GitHub issue type before syncing this task.');
 const name=found?.label||({task:'Task',bug:'Bug',feature:'Feature'}[String(raw).toLowerCase()]||raw);
 return ['--type',name];
}
module.exports={typeArgs};

'use strict';
function typeArgs(task,server,{creating=false}={}){
 const raw=task.issueType||(creating?(task.isEpic?'epic':'task'):null);
 if(!raw)return [];
 const types=server.issueTypes||[];
 let found=types.find(t=>[t.id,t.label].some(v=>String(v).toLowerCase()===String(raw).toLowerCase()));
 if(!found&&String(raw).toLowerCase()==='epic')found=types.find(t=>String(t.id).toLowerCase()==='feature');
 if(types.length&&!found)throw Error('Choose a configured GitHub issue type before syncing this task.');
 const name=found?.label||({task:'Task',bug:'Bug',feature:'Feature',epic:'Epic'}[String(raw).toLowerCase()]||raw);
 return ['--type',name];
}
module.exports={typeArgs};

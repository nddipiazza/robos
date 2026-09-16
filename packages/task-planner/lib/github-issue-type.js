'use strict';
function typeArgs(task,server,{creating=false}={}){
 let raw=task.issueType||(creating?(task.isEpic?'epic':'task'):null);
 if(!raw)return [];
 const mapping=require('../../robos-lib/github-epics');
 const epic=String(raw).toLowerCase()==='epic';
 if(epic)raw=mapping.serverType(raw,server);
 const types=server.issueTypes||[];
 let found=types.find(t=>[t.id,t.label].some(v=>String(v).toLowerCase()===String(raw).toLowerCase()));
 if(epic)return ['--type',raw];
 if(types.length&&!found)throw Error('Choose a configured GitHub issue type before syncing this task.');
 const name=found?.label||({task:'Task',bug:'Bug',feature:'Feature',epic:'Epic'}[String(raw).toLowerCase()]||raw);
 return ['--type',name];
}
module.exports={typeArgs};

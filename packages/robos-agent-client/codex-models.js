'use strict';
const {spawn}=require('node:child_process');
// Read-only CLI discovery. No thread or turn is created, and no model is invoked.
function listModels(binary,{spawnCLI=spawn,timeout=15000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawnCLI(binary,['app-server','--listen','stdio://'],{stdio:['pipe','pipe','pipe']});
  let buffer='',done=false,id=0,requestId=0;const models=new Map(),cursors=new Set();
  const timer=setTimeout(()=>finish(Error('Codex model discovery timed out.')),timeout);
  function finish(error){if(done)return;done=true;clearTimeout(timer);child.stdin.end();child.kill();if(error)reject(error);else resolve([...models.values()]);}
  function send(message){if(!done)child.stdin.write(JSON.stringify(message)+'\n');}
  function page(cursor){requestId=++id;send({id:requestId,method:'model/list',params:{limit:100,includeHidden:false,...(cursor?{cursor}:{})}});}
  child.on('error',()=>finish(Error('Could not start Codex model discovery.')));
  child.on('close',()=>{if(!done)finish(Error('Codex closed before returning its model list.'));});
  child.stdin.on('error',()=>finish(Error('Codex model discovery connection closed.')));
  child.stderr.on('data',()=>{}); // Do not expose CLI diagnostics that may contain account data.
  child.stdout.on('data',chunk=>{
   buffer+=chunk;if(buffer.length>4*1024*1024)return finish(Error('Codex model response exceeded the size limit.'));
   let end;while(!done&&(end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let message;try{message=JSON.parse(line);}catch{continue;}
    if(message.id!==requestId)continue;
    if(message.error)return finish(Error('Codex model discovery failed: '+(message.error.code||'RPC error')));
    if(requestId===0){send({method:'initialized',params:{}});page();continue;}
    if(!Array.isArray(message.result?.data))return finish(Error('Codex returned an invalid model list.'));
    for(const m of message.result.data){const model=m.model||m.id;if(typeof model==='string'&&model&&!m.hidden)models.set(model,{id:model,label:m.displayName||model,isDefault:!!m.isDefault});}
    const cursor=message.result.nextCursor;if(cursor){if(cursors.has(cursor))return finish(Error('Codex repeated a model-list page.'));cursors.add(cursor);page(cursor);}else finish(models.size?null:Error('Codex returned no available models.'));
   }
  });
  send({id:0,method:'initialize',params:{clientInfo:{name:'robos_model_catalog',title:'RobOS model catalog',version:'1.0.0'}}});
 });
}
module.exports={listModels};

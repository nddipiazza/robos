'use strict';
const {AgentQuestions}=require('../../robos-lib/agent-questions');
function attach({session,source,kind,resume,show,notify,store=new AgentQuestions()}){
 let consuming=false;const notifications=new Map();
 function observe(state){if(state.status==='running'){for(const item of store.list().filter(q=>q.source===source&&q.kind===kind&&q.status==='pending')){store.save({...item,status:'superseded'});notifications.get(item.id)?.close?.();}return;}if(state.status!=='error')return;const message=state.messages.filter(m=>m.role!=='user'&&m.kind!=='progress').at(-1);if(!message)return;
  const {created,item}=store.create({source,kind,sessionId:state.sessionId,eventId:message.id+':'+message.timestamp,context:message.text,questions:session.pendingQuestions,agentName:state.agentName});
  if(created)show(item.id);
  if((created||item.status==='pending'&&!item.notifiedAt)&&!notifications.has(item.id)){const n=notify(item);n?.once?.('show',()=>{const latest=store.read(item.id);store.save({...latest,notifiedAt:Date.now()});});notifications.set(item.id,n);n?.on?.('close',()=>notifications.delete(item.id));}
 }
 async function consume(){if(consuming||session.status==='running')return;consuming=true;try{for(const item of store.list().filter(q=>q.source===source&&q.kind===kind&&q.status==='answered')){
   const latest=session.state().messages.filter(m=>m.role!=='user'&&m.kind!=='progress').at(-1);
   if(item.eventId!==latest?.id+':'+latest?.timestamp||item.sessionId&&item.sessionId!==session.state().sessionId){store.save({...item,status:'stale',error:'The agent session changed. Open the current job before answering.'});continue;}
   const text=item.questions.map(q=>q.prompt+'\n'+item.answers[q.id]).join('\n\n');
   try{await resume(text);store.save({...item,status:'resolved',resolvedAt:Date.now()});notifications.get(item.id)?.close?.();}catch(e){store.save({...item,status:'pending',error:e.message});show(item.id);}break;
  }}finally{consuming=false;}}
 session.on('state',observe);const timer=setInterval(()=>consume().catch(()=>{}),2000);timer.unref?.();return {observe,observeCurrent:()=>observe(session.state()),consume,stop(){clearInterval(timer);session.off('state',observe);}};
}
module.exports={attach};

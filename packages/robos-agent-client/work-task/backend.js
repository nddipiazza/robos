'use strict';
function configuredBackend(fallback='codex', readPreferences) {
  const read=readPreferences || (()=>{const fs=require('node:fs'),path=require('node:path'),os=require('node:os');try{return JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/robos/work-task-settings.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}});
  return read().backend || fallback || 'codex';
}
function codexBinary() {
  const fs=require('node:fs');
  const candidates=[process.env.ROBOS_CODEX_PATH,process.env.CODEX_CLI_PATH,'/usr/lib/chatgpt/resources/codex','/Applications/Codex.app/Contents/Resources/codex'];
  return candidates.find(p=>p && fs.existsSync(p)) || 'codex';
}
function invocation(backend,mode,prompt) {
  if(backend==='codex')return {bin:codexBinary(),args:['exec','--json','--sandbox',mode==='plan'?'read-only':'workspace-write',...(mode==='implement'?['-c','sandbox_workspace_write.network_access=true']:[]),'--',prompt]};
  if(backend==='claude')return {bin:'claude',args:['-p','--verbose','--output-format','stream-json',...(mode==='plan'?['--permission-mode','plan']:[]),'--',prompt]};
  throw Error(`Unsupported agent backend: ${backend}`);
}
function decode(obj) {
  const events=[];let text='',error=null;
  if(obj.event==='result'){
    text=obj.result?.response||'';
    if(text)events.push({role:'assistant',text});
    if(obj.result?.status==='ERROR'||obj.result?.error)error=obj.result.error||'AGY session failed.';
    if(obj.result?.denied_actions?.length)error='AGY could not complete the task: permission required for '+obj.result.denied_actions.map(a=>a.display_name||a.action).join(', ')+'.';
  }
  if(obj.event==='init')events.push({role:'system',text:'AGY session connected'+(obj.init?.model?' · '+obj.init.model:'')+'.'});
  if(obj.event==='step_update'){
    const step=obj.step_update||{},tool=step.tool_info||{};
    if(step.step_type==='tool'){const value=tool.result??tool.output??(step.state==='DONE'?'Completed':tool.parameters??{status:step.state});events.push({role:'tool',name:step.tool_name||tool.name||'tool',text:tool.error?.message||(typeof value==='string'?value:JSON.stringify(value,null,2))});}
    else if(step.step_type==='agent_response'&&step.state==='DONE')events.push({role:'agent',text:step.text||step.response||'Reasoning complete; continuing the task.'});
  }
  if(obj.type==='assistant')for(const b of obj.message?.content||[]){if(b.type==='text'){text+=b.text+'\n';events.push({role:'assistant',text:b.text});}if(b.type==='tool_use')events.push({role:'tool',text:JSON.stringify(b.input,null,2),name:b.name});}
  if(obj.type==='user')for(const b of obj.message?.content||[])if(b.type==='tool_result')events.push({role:'tool',text:typeof b.content==='string'?b.content:JSON.stringify(b.content),name:'result'});
  if(obj.type==='item.completed') {
    const item=obj.item||{};
    if(item.type==='agent_message'){text=item.text||'';events.push({role:'assistant',text});}
    else events.push({role:item.type==='reasoning'?'agent':'tool',name:item.type,text:item.text||[item.command,item.aggregated_output].filter(Boolean).join('\n')||JSON.stringify(item,null,2)});
  }
  if(['item.updated','item.completed'].includes(obj.type)&&obj.item?.type==='todo_list')events.push({role:'milestones',text:(obj.item.items||[]).map(i=>(i.completed?'✓ ':'○ ')+i.text).join('\n')});
  if(obj.type==='item.started' && obj.item?.type==='command_execution')events.push({role:'tool',name:'command',text:obj.item.command});
  if(obj.type==='turn.failed'||obj.type==='error'||(obj.type==='result'&&obj.is_error))error=obj.error?.message||obj.message||obj.result||JSON.stringify(obj.errors||obj);
  if(error)events.push({role:'error',text:error});
  return {events,text,error};
}
module.exports={configuredBackend,invocation,decode};

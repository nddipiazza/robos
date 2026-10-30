'use strict';
// Starts a coding-agent run with the agent, model and reasoning effort chosen in
// <robos-agent-selector>, and streams what the agent does as decoded events.
// Task Implementer uses it for its implementation runs and its plan generation.
//
//   const run = runner.start({ provider: 'claude', mode: 'implement', prompt, model, effort,
//     autoApprove: true, cwd, env, onEvent: e => ..., onExit: ({ code, text, error }) => ... });
//   run.stop();
//
// Events: { role, text, name? } with role 'assistant' | 'agent' | 'tool' | 'milestones' |
// 'system' | 'error' | 'stderr' | 'log'. onExit gets the exit code and the agent's final answer.
const {spawn}=require('node:child_process');
const providers=require('../providers');
const backend=require('./backend');

function defaultGuard(prompt){return require('../one-shot').guard(prompt);}

function start({provider,mode='implement',prompt,model='',effort='',autoApprove=false,cwd,env,onEvent=()=>{},onExit=()=>{},spawnCLI=spawn,authenticate=providers.authentication,resolveBinary=providers.binary,guard=defaultGuard}={}){
 if(!provider)throw Error('Choose an AI agent.');
 const label=providers.LABELS[provider];
 if(!label)throw Error(`Unsupported agent: ${provider}`);
 const scan=guard(String(prompt||''));
 if(scan.blocked)throw Error(scan.summary||'The prompt security policy blocked this prompt.');
 authenticate(provider);
 const inv=backend.invocation(provider,mode,scan.text,{model,effort,autoApprove,bin:resolveBinary(provider)});
 const child=spawnCLI(inv.bin,inv.args,{cwd,env:env||{...process.env},stdio:['ignore','pipe','pipe']});
 const emit=event=>{if(event&&event.text!=null&&String(event.text).trim()){try{onEvent(event);}catch{}}};
 let buffer='',finalText='',lastAssistant='',error=null,finished=false;
 function handleLine(line){
  if(!line.trim())return;
  if(inv.format!=='jsonl'){emit({role:'assistant',text:line});finalText+=line+'\n';return;}
  let obj;try{obj=JSON.parse(line);}catch{emit({role:'log',text:line});return;}
  const out=backend.decode(obj);
  for(const event of out.events){if(event.role==='assistant')lastAssistant=event.text;emit(event);}
  if(out.text)finalText=out.text;
  if(out.error)error=out.error;
  // Claude Code ends with a result event carrying the final answer; show it unless it repeats the last message.
  if(obj.type==='result'&&!obj.is_error&&typeof obj.result==='string'&&obj.result.trim()){
   if(obj.result.trim()!==String(lastAssistant).trim())emit({role:'assistant',text:obj.result});
   finalText=obj.result;
  }
 }
 function finish(code,startError){
  if(finished)return;finished=true;
  if(startError)error=startError;
  try{onExit({code,text:String(finalText).trim(),error,provider,label});}catch{}
 }
 child.stdout.on('data',chunk=>{buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop();lines.forEach(handleLine);});
 child.stderr.on('data',chunk=>emit({role:'stderr',text:String(chunk)}));
 child.on('error',e=>{emit({role:'error',text:`Could not start ${label}: ${e.message}`});finish(-1,`Could not start ${label}: ${e.message}`);});
 child.on('close',code=>{if(buffer){handleLine(buffer);buffer='';}finish(code);});
 return {child,invocation:inv,provider,label,stop(){try{child.kill();}catch{}}};
}

module.exports={start};

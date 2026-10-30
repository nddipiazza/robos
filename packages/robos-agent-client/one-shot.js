'use strict';
// One-shot prompts through the agent chosen in <robos-agent-selector> (the RobOS
// provider catalog in ./providers: Codex, AGY, Claude Code, GitHub Copilot), with its
// model and reasoning effort. The agent only answers: Codex runs in its read-only
// sandbox, Claude Code in plan mode and Copilot without write or shell tools, from a
// temp directory.
const {spawn}=require('node:child_process');
const os=require('node:os');
const providers=require('./providers');
const backend=require('./work-task/backend');

const MAX_OUTPUT=4*1024*1024;
const NAMES={codex:'Codex',agy:'AGY',claude:'Claude Code',copilot:'GitHub Copilot'};

// minimal drops optional flags (model, Copilot's -s) for CLI builds that reject them.
function invocation(provider,prompt,{model='',effort='',agyBinary=null,binary=null,minimal=false}={}){
 if(minimal)model='';
 if(provider==='codex'){
  const inv=backend.invocation('codex','plan',prompt);
  const args=inv.args.slice(),at=args.indexOf('--');
  const extra=['--skip-git-repo-check'];
  if(model)extra.push('--model',model);
  if(effort)extra.push('-c',`model_reasoning_effort="${effort}"`);
  args.splice(at,0,...extra);
  return {bin:binary||inv.bin,args,format:'codex-json'};
 }
 if(provider==='agy'){
  // --print takes the next token as the prompt, so it goes last; stdin stays closed
  // (an open stdin pipe makes some AGY versions wait or print nothing).
  return {bin:binary||agyBinary||providers.binary('agy'),args:[...(model?['--model',model]:[]),'--print',prompt],format:'text'};
 }
 if(provider==='claude'){
  return {bin:binary||providers.binary('claude'),args:['-p','--output-format','text','--permission-mode','plan',...(model?['--model',model]:[]),'--',prompt],format:'text'};
 }
 if(provider==='copilot'){
  // -s prints only the answer (no usage summary); --deny-tool overrides --allow-all-tools.
  return {bin:binary||providers.binary('copilot'),args:[...(model?['--model',model]:[]),'-p',prompt,...(minimal?[]:['-s']),'--allow-all-tools','--deny-tool','write','--deny-tool','shell'],format:'text'};
 }
 throw Error(`Unsupported agent provider: ${provider}`);
}

// Codex prints JSON events; the answer is its last agent message.
function readCodex(stdout){
 let text='',error=null;
 for(const line of stdout.split('\n')){
  let obj;try{obj=JSON.parse(line);}catch{continue;}
  const out=backend.decode(obj);
  if(out.text)text=out.text;
  if(out.error)error=out.error;
 }
 return {text:text.trim(),error};
}

function spawnOnce({bin,args},{timeoutMs,cwd,spawnCLI}){
 return new Promise(resolve=>{
  let child;
  try{child=spawnCLI(bin,args,{cwd,env:{...process.env},stdio:['ignore','pipe','pipe']});}
  catch(e){return resolve({code:-1,stdout:'',stderr:`Could not start ${bin}: ${e.message}`});}
  let stdout='',stderr='',done=false;
  const finish=(code,extra='')=>{if(done)return;done=true;clearTimeout(timer);resolve({code,stdout,stderr:stderr+extra});};
  const timer=setTimeout(()=>{try{child.kill('SIGTERM');}catch{}finish(-1,`\nTimed out after ${Math.round(timeoutMs/1000)}s.`);},timeoutMs);
  child.stdout.on('data',d=>{if(stdout.length<MAX_OUTPUT)stdout+=d;});
  child.stderr.on('data',d=>{if(stderr.length<MAX_OUTPUT)stderr+=d;});
  child.on('error',e=>finish(-1,`Could not start ${bin}: ${e.message}`));
  child.on('close',code=>finish(code));
 });
}

function guard(prompt){
 let lib=null;
 try{lib=require('../robos-lib/prompt-security');}catch{try{lib=require('/usr/local/share/robos/robos-lib/prompt-security');}catch{}}
 if(!lib)return {blocked:false,text:prompt};
 const result=new lib.PromptSecurityGuard().scan(prompt);
 if(!result.allowed)return {blocked:true,summary:result.summary};
 return {blocked:false,text:result.mode==='redact'&&result.findings.length?result.redactedText:prompt};
}

/**
 * ask({ provider, model, effort, prompt }) -> { ok, text, error, provider }
 */
async function ask({provider,model='',effort='',prompt,timeoutMs=180000,cwd=os.tmpdir(),spawnCLI=spawn,authenticate=providers.authentication,agyBinary=null,binary=null}={}){
 if(!provider)return {ok:false,text:'',error:'Choose an AI agent.'};
 const scan=guard(String(prompt||''));
 if(scan.blocked)return {ok:false,text:'',error:scan.summary,code:'prompt_security_violation',provider};
 let inv;
 try{authenticate(provider);inv=invocation(provider,scan.text,{model,effort,agyBinary,binary});}
 catch(e){return {ok:false,text:'',error:e.message,provider};}
 const name=NAMES[provider]||provider;
 let res=await spawnOnce(inv,{timeoutMs,cwd,spawnCLI});
 // AGY/Copilot builds without --model or -s reject the flag; retry without optional flags.
 if((provider==='agy'||provider==='copilot')&&res.code!==0&&/unknown (flag|option)|flag provided but not defined/i.test(res.stderr)){
  res=await spawnOnce(invocation(provider,scan.text,{agyBinary,binary,minimal:true}),{timeoutMs,cwd,spawnCLI});
 }
 if(inv.format==='codex-json'){
  const {text,error}=readCodex(res.stdout);
  if(res.code!==0||error||!text)return {ok:false,text,error:error||res.stderr.trim().slice(-400)||`${name} exited with code ${res.code}.`,provider};
  return {ok:true,text,error:null,provider};
 }
 const text=res.stdout.trim();
 if(res.code!==0){
  const detail=res.stderr.trim().slice(-400)||text.slice(-400)||`${name} exited with code ${res.code}.`;
  return {ok:false,text,error:detail,provider};
 }
 if(!text)return {ok:false,text,error:`${name} returned no output.${provider==='agy'?' Update AGY: older versions print nothing when not run in a terminal.':''}`,provider};
 return {ok:true,text,error:null,provider};
}

module.exports={ask,invocation,readCodex,guard};

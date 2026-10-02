'use strict';
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile);
function parseBuildURL(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='buildkite.com'||u.port||u.username||u.password)return null;const m=u.pathname.match(/^\/([\w-]+)\/([\w-]+)\/builds\/(\d+)(?:\/list)?\/?$/);return m?{org:m[1],pipeline:m[2],number:Number(m[3])}:null;}catch{return null;}
}
function validate(config){
 if(!/^[\w-]+$/.test(config.org||'')||!/^([\w-]+)?$/.test(config.pipeline||''))throw Error('Enter a Buildkite organization and optional pipeline slug.');
 const passPath=config.passPath||'buildkite-api-access-token';
 if(!/^[\w][\w./-]*$/.test(passPath)||passPath.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Enter a valid pass entry name.');
 return {org:config.org,pipeline:config.pipeline||'',passPath};
}
function state(value){
 if(value==='passed')return {status:'completed',conclusion:'success'};
 if(['failed','timed_out'].includes(value))return {status:'completed',conclusion:'failure'};
 if(['canceled','canceling'].includes(value))return {status:'completed',conclusion:'cancelled'};
 if(['skipped','broken','not_run'].includes(value))return {status:'completed',conclusion:'skipped'};
 if(value==='blocked')return {status:'blocked',conclusion:null};
 return {status:['scheduled','creating','waiting','assigned'].includes(value)?'queued':'in_progress',conclusion:null};
}
function failureExcerpt(log){
 const lines=log.replace(/\r/g,'').split('\n');
 let start=lines.findIndex(l=>/Error: expect\(|AssertionError/.test(l));
 if(start<0)start=lines.findIndex(l=>/^\s*FAIL(?:ED)?[ :]|^\s*error:/i.test(l));
 return start<0?lines.slice(-120).join('\n'):lines.slice(Math.max(0,start-5),start+65).join('\n');
}
class Buildkite {
 constructor(config,{run=exec,fetchImpl=globalThis.fetch}={}){this.config=validate(config);this.run=run;this.fetch=fetchImpl;}
 async request(suffix,{text=false,tailBytes=0}={}){
  let token;try{token=(await this.run('pass',['show',this.config.passPath],{encoding:'utf8',timeout:15000,maxBuffer:65536})).stdout.trim().split('\n')[0];}catch{throw Error('Cannot read Buildkite token from pass: '+this.config.passPath);}
  if(!token)throw Error('Buildkite token is empty.');
  let response;try{response=await this.fetch('https://api.buildkite.com/v2/organizations/'+this.config.org+suffix,{headers:{Authorization:'Bearer '+token,Accept:text?'text/plain':'application/json',...(tailBytes?{Range:'bytes=-'+tailBytes}:{})},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('Cannot reach Buildkite. Check your network and retry.');}
  if(!response.ok)throw Error(response.status===401?'Buildkite rejected the token.':response.status===403?'Buildkite token lacks access. Check organization access and read scopes.':`Buildkite request failed (HTTP ${response.status}).`);
  let raw='';
  if(tailBytes&&response.body?.getReader){
   const reader=response.body.getReader(),decoder=new TextDecoder();
   try{for(;;){const {done,value}=await reader.read();if(done)break;raw=(raw+decoder.decode(value,{stream:true})).slice(-tailBytes);}raw=(raw+decoder.decode()).slice(-tailBytes);}finally{reader.releaseLock();}
  }else raw=await response.text();

  if(text){let content=raw;try{const parsed=JSON.parse(raw);if(typeof parsed.content==='string')content=parsed.content;}catch{}return (tailBytes?content.slice(-tailBytes):content).replaceAll(token,'[REDACTED]').replace(/\x1b_bk;t=\d+\x07|\x1b\[[0-9;]*[a-zA-Z]/g,'');}
  return JSON.parse(raw);
 }
 path(number){if(!this.config.pipeline||!Number.isSafeInteger(number)||number<1)throw Error('Invalid Buildkite build identity.');return '/pipelines/'+this.config.pipeline+'/builds/'+number;}
 async list(){const rows=await this.request((this.config.pipeline?'/pipelines/'+this.config.pipeline:'')+'/builds?per_page=30');return rows.map(b=>({provider:'buildkite',repo:this.config.org+'/'+b.pipeline.slug,id:b.number,name:'#'+b.number+' · '+b.message,workflowName:b.pipeline.name,branch:b.branch,...state(b.state),event:b.source||'Buildkite',created:b.created_at,updated:b.finished_at||b.started_at||b.created_at,url:b.web_url}));}
 async build(number){const b=await this.request(this.path(number));return {provider:'buildkite',number:b.number,head:b.commit,state:b.state,url:b.web_url,jobs:(b.jobs||[]).filter(j=>j.type==='script').map(j=>({id:j.id,name:j.name||'Job',...state(j.state),rawState:j.state,url:b.web_url+'#'+j.id,steps:[],exitStatus:j.exit_status}))};}
 async tail(number,id){if(!/^[\da-f-]{36}$/i.test(id))throw Error('Invalid Buildkite job.');return this.request(this.path(number)+'/jobs/'+id+'/log',{text:true,tailBytes:65536});}
 async log(number,id){if(!/^[\da-f-]{36}$/i.test(id))throw Error('Invalid Buildkite job.');return this.request(this.path(number)+'/jobs/'+id+'/log',{text:true});}
 async detail(number){const build=await this.build(number),failures=build.jobs.filter(j=>j.conclusion==='failure');const logs=await Promise.all(failures.map(async j=>{try{return j.name+'\n'+await this.log(number,j.id);}catch(e){return j.name+'\nLog unavailable: '+e.message;}}));return {...build,failedLog:logs.join('\n\n'),failureExcerpt:logs.map(failureExcerpt).join('\n\n'),artifactsUrl:build.url+'#artifacts'};}
}
module.exports={Buildkite,parseBuildURL,validate,state,failureExcerpt};

'use strict';
// Organization-owned, pinned environment manifests. The host orchestrates services;
// agents never receive Docker access or a developer checkout.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const ID=/^[a-z][a-z0-9-]{0,50}$/;
const REPO=/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/;
function registered(){let settings={};try{settings=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/robos/settings.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}return settings.sandbox_environments||[];}
function registration(p){if(!p||!ID.test(p.id)||!p.title||!REPO.test(p.repository)||!/^[a-f0-9]{40}$/.test(p.revision)||!p.manifest||path.isAbsolute(p.manifest)||p.manifest.split('/').includes('..'))throw Error('Environment needs an id, title, GitHub repository, pinned commit and relative manifest path.');return p;}
function list(repositories){const selected=new Set(repositories.map(r=>r.toLowerCase()));return registered().filter(p=>(p.repositories||[]).some(r=>selected.has(r.toLowerCase()))).map(p=>{registration(p);return {id:p.id,title:p.title,description:p.description||''};});}
function get(id){if(!id)return null;return registration(registered().find(p=>p.id===id));}
function sourcePath(value,roots){const match=/^@([a-z][a-z0-9-]*)\/(.*)$/.exec(value||'');if(!match||!roots[match[1]])throw Error('Environment path must reference a declared source: '+value);const root=fs.realpathSync(roots[match[1]]),file=fs.realpathSync(path.resolve(root,match[2]));if(file!==root&&!file.startsWith(root+path.sep))throw Error('Environment path escapes source');return file;}
function only(value,keys,label){for(const key of Object.keys(value))if(!keys.includes(key))throw Error('Unsupported '+label+' field: '+key);}
function compile(manifest,roots,project){
 if(manifest.version!==1)throw Error('Unsupported environment manifest version');
 if(!manifest.services||!Object.keys(manifest.services).length)throw Error('Environment has no services');
 const services={},volumes={};
 for(const [name,s] of Object.entries(manifest.services)){
  if(!ID.test(name))throw Error('Invalid service name');
  only(s,['image','build','command','entrypoint','environment','volumes','depends_on','healthcheck','user','working_dir','memoryMb','cpus','networkDisabled','init'],'service');
  if(s.environment&&(!s.environment||Array.isArray(s.environment)||Object.values(s.environment).some(v=>typeof v!=='string')))throw Error('Service environment must use explicit string values; host inheritance is forbidden');
  const service={};for(const k of ['command','entrypoint','environment','depends_on','healthcheck','user','working_dir','init'])if(s[k]!==undefined)service[k]=s[k];
  if(s.image){if(typeof s.image!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9./:@_-]+$/.test(s.image))throw Error('Invalid image');service.image=s.image;}
  if(s.build){only(s.build,['context','dockerfile'],'build');const context=sourcePath(s.build.context,roots);const dockerfile=fs.realpathSync(path.resolve(context,s.build.dockerfile||'Dockerfile'));if(!dockerfile.startsWith(context+path.sep))throw Error('Dockerfile escapes context');service.build={context,dockerfile};const digest=require('node:crypto').createHash('sha256').update(JSON.stringify(s.build)).update(JSON.stringify(s.build.context.startsWith('@profile/')?manifest.profileRevision:manifest.sources||{})).update(fs.readFileSync(dockerfile)).digest('hex').slice(0,16);service.image='robos-environment/'+name+':'+digest;}
  if(!service.image&&!service.build)throw Error('Service needs image or build');
  service.volumes=(s.volumes||[]).map(v=>{only(v,['source','target','readOnly'],'volume');if(!v.target?.startsWith('/')||v.target.includes('docker.sock'))throw Error('Invalid volume target');if(v.source?.startsWith('@')){if(v.readOnly!==true)throw Error('Source mounts must be read-only');return {type:'bind',source:sourcePath(v.source,roots),target:v.target,read_only:true};}if(!ID.test(v.source))throw Error('Invalid session volume');volumes[v.source]={};return {type:'volume',source:v.source,target:v.target,read_only:!!v.readOnly};});
  service.mem_limit=(Math.min(8192,Math.max(128,Number(s.memoryMb)||512)))+'m';service.cpus=Math.min(4,Math.max(.25,Number(s.cpus)||1));service.pids_limit=512;
  service.security_opt=['no-new-privileges:true'];service.logging={driver:'local',options:{'max-size':'10m','max-file':'2'}};
  if(s.networkDisabled)service.network_mode='none';
  services[name]=service;
 }
 const environment=manifest.agentEnvironment||{};for(const [key,value] of Object.entries(environment)){if(!/^[A-Z][A-Z0-9_]*$/.test(key)||/^(PATH|HOME|LD_|NODE_|GH_|GITHUB_|ROBOS_)/.test(key)||typeof value!=='string')throw Error('Invalid agent environment: '+key);}
 const escape=value=>typeof value==='string'?value.replace(/\$/g,'$$$$'):Array.isArray(value)?value.map(escape):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,escape(v)])):value;
 return {compose:escape({name:project,services,volumes,networks:{default:{}}}),environment,instructions:String(manifest.instructions||'')};
}
async function prepare({profile,id,dir,command,cli,onEvent,signal,stopped=()=>false}){
 if(!profile)return null;
 const root=path.join(dir,'environment');fs.mkdirSync(root,{recursive:true,mode:0o700});
 const project=id+'-env',roots={};let active=false;
 const token=await cli('gh',['auth','token']);
 const registryDir=fs.mkdtempSync(path.join(os.tmpdir(),'robos-environment-registry-'));
 fs.writeFileSync(path.join(registryDir,'config.json'),JSON.stringify({auths:{'ghcr.io':{auth:Buffer.from('x-access-token:'+token).toString('base64')}},cliPluginsExtraDirs:[path.join(os.homedir(),'.docker/cli-plugins')]}),{mode:0o600});
 const {execFile}=require('node:child_process');
 const git=(args)=>new Promise((resolve,reject)=>execFile('git',args,{env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.extraHeader',GIT_CONFIG_VALUE_0:'AUTHORIZATION: basic '+Buffer.from('x-access-token:'+token).toString('base64')},signal,timeout:300000,maxBuffer:1024*1024},(e,out)=>e?reject(Error('Cannot fetch pinned environment source. Check GitHub access.')):resolve(out)));
 async function fetch(name,source){if(stopped())throw Error('Environment startup stopped');if(!ID.test(name)||!REPO.test(source.repository)||!/^[a-f0-9]{40}$/.test(source.revision))throw Error('Environment sources must use GitHub URLs and pinned commits');const target=path.join(root,name);await git(['init',target]);await git(['-C',target,'fetch','--depth=1',source.repository,source.revision]);await git(['-C',target,'checkout','--detach','FETCH_HEAD']);roots[name]=target;}
 const file=path.join(root,'compose.json'),args=['compose','--project-name',project,'--file',file];
 async function execute(verb,timeout){let bytes=0;const log=path.join(root,'startup.log');const timer=setInterval(()=>onEvent('system','Environment '+verb[0]+' is still running. Startup output is saved with this session.'),30000);try{return await command(['--config',registryDir,...args,...verb],undefined,{signal,timeout,output:b=>{if(bytes<10*1024*1024){fs.appendFileSync(log,b);bytes+=b.length;}}});}catch(error){throw Error('Environment '+verb[0]+' failed: '+error.message.trim().split('\n').slice(-3).join(' ')+' Startup log: '+log);}finally{clearInterval(timer);}}
 async function finish(){if(!active)return;const evidence=path.join(dir,'evidence','environment');fs.mkdirSync(evidence,{recursive:true});try{fs.writeFileSync(path.join(evidence,'services.log'),await command([...args,'logs','--no-color','--tail','150']),{mode:0o600});}catch{}const names={containers:await command([...args,'ps','--all','--format','json']),volumes:await command(['volume','ls','--filter','label=com.docker.compose.project='+project,'--format','{{.Name}}']),networks:await command(['network','ls','--filter','label=com.docker.compose.project='+project,'--format','{{.Name}}'])};onEvent('system','Releasing environment '+project+' (session-owned containers, network and data volumes).');fs.writeFileSync(path.join(root,'cleanup-resources.json'),JSON.stringify(names,null,2),{mode:0o600});await command(['network','disconnect',project+'_default',id]).catch(()=>{});await command([...args,'down','--volumes','--timeout','10']);active=false;}
 try{
  onEvent('system','Preparing '+profile.title+' from pinned source revisions.');await fetch('profile',profile);
  const manifest=JSON.parse(fs.readFileSync(sourcePath('@profile/'+profile.manifest,roots),'utf8'));
  for(const [name,source] of Object.entries(manifest.sources||{})){if(name==='profile')throw Error('Reserved source name');await fetch(name,source);}
  const compiled=compile({...manifest,profileRevision:profile.revision},roots,project);const readinessScript=manifest.readinessScript?fs.readFileSync(sourcePath(manifest.readinessScript,roots),'utf8'):null;fs.writeFileSync(file,JSON.stringify(compiled.compose,null,2));
  fs.writeFileSync(path.join(root,'sources.json'),JSON.stringify({profile,...manifest.sources},null,2));
  onEvent('system','Building environment images; cached layers are reused. The first setup can take several minutes.');
  const missing=[];for(const [name,service] of Object.entries(compiled.compose.services)){if(service.build){try{await command(['image','inspect',service.image]);}catch{missing.push(name);}}}
  if(missing.length)await execute(['build',...missing],1800000);if(stopped())throw Error('Environment startup stopped');
  active=true;onEvent('system','Starting services and waiting for health checks: '+Object.keys(manifest.services).join(', '));
  await execute(['up','--detach','--no-build','--wait','--wait-timeout','300'],600000);if(stopped())throw Error('Environment startup stopped');
  await command(['network','connect','--alias','agent',project+'_default',id]);
  if(readinessScript){onEvent('system','Checking application readiness from inside the agent sandbox.');try{const result=await command(['exec','-i',...Object.entries(compiled.environment).flatMap(([key,value])=>['-e',key+'='+value]),id,'node'],readinessScript,{signal,timeout:60000});fs.writeFileSync(path.join(root,'readiness.log'),result);onEvent('system',result.trim());}catch(error){throw Error('Application environment is not ready: '+error.message);}}
  onEvent('system',profile.title+' is ready on this session’s private service network.');
  return {...compiled,finish,project};
 }catch(error){try{await finish();}catch(cleanup){error.environmentRecovery={id:profile.id,project,status:'cleanup-required'};onEvent('error','Environment cleanup failed for '+project+': '+cleanup.message);}throw error;}finally{fs.unlinkSync(path.join(registryDir,'config.json'));fs.rmdirSync(registryDir);}
}
module.exports={list,get,registration,sourcePath,compile,prepare};

'use strict';
// RobOS agent provider catalog behind <robos-agent-selector>: Codex, AGY (Antigravity),
// Claude Code and GitHub Copilot. Each entry reports whether the CLI is installed and
// signed in, and which models it offers. Nothing here starts a model.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const agySecretScript=`import dbus,sys
b=dbus.SessionBus()
s=dbus.Interface(b.get_object('org.freedesktop.secrets','/org/freedesktop/secrets'),'org.freedesktop.Secret.Service')
items,locked=s.SearchItems({'service':'gemini','username':'antigravity'})
if not items: raise Exception('AGY login is missing or the desktop keyring is locked. Sign in to AGY and unlock the keyring.')
_,session=s.OpenSession('plain',dbus.String('',variant_level=1))
try:
 item=dbus.Interface(b.get_object('org.freedesktop.secrets',items[0]),'org.freedesktop.Secret.Item')
 sys.stdout.buffer.write(bytes(item.GetSecret(session)[2]))
finally:
 dbus.Interface(b.get_object('org.freedesktop.secrets',session),'org.freedesktop.Secret.Session').Close()
`;
// Order matters: the selector picks the first available provider by default.
const IDS=['codex','agy','claude','copilot'];
const LABELS={codex:'Codex',agy:'AGY (Antigravity)',claude:'Claude Code',copilot:'GitHub Copilot'};
// Claude Code accepts these aliases for --model and maps them to the newest model of each family.
const CLAUDE_MODELS=[{id:'opus',label:'Claude Opus (latest)'},{id:'sonnet',label:'Claude Sonnet (latest)'},{id:'haiku',label:'Claude Haiku (latest)'}];

const readJson=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
// Finds an executable from an override variable, PATH, then well-known install locations.
// When ROBOS_REAL_BINARIES=0 (the E2E test harness), PATH comes first so sandbox stubs win
// over CLIs installed in the developer's real home directory.
function findExecutable(name,{envVar,extra=[]}={}){
 const home=os.homedir(),pathEntries=(process.env.PATH||'').split(path.delimiter).filter(Boolean).map(p=>path.join(p,name));
 const userDirs=[...extra,path.join(home,'.local/bin',name)];
 const candidates=[envVar&&process.env[envVar],...(process.env.ROBOS_REAL_BINARIES==='0'?[...pathEntries,...userDirs]:[...userDirs,...pathEntries]),path.join('/usr/local/bin',name),path.join('/opt/homebrew/bin',name),path.join(home,'.npm-global/bin',name)];
 const found=candidates.find(p=>{if(!p)return false;try{return fs.statSync(p).isFile();}catch{return false;}});
 return found?fs.realpathSync(found):null;
}
function binary(provider){
 if(provider==='codex')return require('./work-task/backend').invocation('codex','plan','').bin;
 if(provider==='agy'){const found=findExecutable('agy',{envVar:'ROBOS_AGY_PATH'});if(!found)throw Error('AGY is not installed. Install AGY or set ROBOS_AGY_PATH.');return found;}
 if(provider==='claude'){const found=findExecutable('claude',{envVar:'ROBOS_CLAUDE_PATH',extra:[path.join(os.homedir(),'.claude/local/claude')]});if(!found)throw Error('Claude Code is not installed. Install it from RobOS Agents or set ROBOS_CLAUDE_PATH.');return found;}
 if(provider==='copilot'){const found=findExecutable('copilot',{envVar:'ROBOS_COPILOT_PATH'});if(!found)throw Error('GitHub Copilot CLI is not installed. Install it from RobOS Agents or set ROBOS_COPILOT_PATH.');return found;}
 throw Error('Unknown task runner provider.');
}
function readAuthentication(provider){
 if(provider==='codex'){const file=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'auth.json');if(!fs.existsSync(file))throw Error('Sign in to Codex before launching.');return JSON.parse(fs.readFileSync(file,'utf8'));}
 if(provider==='claude'){
  // API key or long-lived token, the Linux credentials file, or (macOS keychain) the signed-in account in ~/.claude.json.
  if(process.env.ANTHROPIC_API_KEY||process.env.CLAUDE_CODE_OAUTH_TOKEN)return {source:'environment'};
  const configDir=process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude');
  if(fs.existsSync(path.join(configDir,'.credentials.json')))return {source:'credentials'};
  const state=readJson(path.join(os.homedir(),'.claude.json'))||readJson(path.join(configDir,'.claude.json'));
  if(state?.oauthAccount)return {source:'account'};
  throw Error('Sign in to Claude Code before launching: run claude and use /login.');
 }
 if(provider==='copilot'){
  if(process.env.COPILOT_GITHUB_TOKEN||process.env.GH_TOKEN||process.env.GITHUB_TOKEN)return {source:'environment'};
  const config=readJson(path.join(process.env.COPILOT_HOME||path.join(os.homedir(),'.copilot'),'config.json'));
  if(config&&((config.logged_in_users||[]).length||config.last_logged_in_user))return {source:'account'};
  throw Error('Sign in to GitHub Copilot before launching: run copilot and use /login.');
 }
 if(provider!=='agy')throw Error('Unknown task runner provider.');
 try{
  const raw=process.platform==='darwin'?execFileSync('security',['find-generic-password','-s','gemini','-a','antigravity','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}):execFileSync('/usr/bin/python3',['-c',agySecretScript],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000});
  const auth=JSON.parse(raw);if(!auth.token?.access_token)throw Error('Missing token');return auth;
 }catch{throw Error('AGY login unavailable. Sign in to AGY and unlock your desktop keyring. Linux also requires python3-dbus.');}
}
function authentication(provider){try{return readAuthentication(provider);}catch(error){require('../robos-lib/auth-notifications').reportAgent(provider,error.message);throw error;}}
// `copilot --help` lists the models its --model flag accepts: (choices: "a", "b", ...).
function parseCopilotModels(help){
 const lines=String(help).split('\n'),start=lines.findIndex(l=>/^\s*--model\b/.test(l));
 if(start<0)return [];
 let block=lines[start];
 for(let i=start+1;i<lines.length&&!/^\s*-/.test(lines[i])&&lines[i].trim();i++)block+=' '+lines[i].trim();
 const choices=block.match(/\(choices:\s*([^)]*)\)/);
 return choices?[...choices[1].matchAll(/"([^"]+)"/g)].map(m=>({id:m[1],label:m[1]})):[];
}
const modelCache=require('./model-cache').createCache({file:path.join(os.homedir(),'.config/robos/provider-model-cache.json')});
async function models(id,{refresh=false}={}){
 const bin=binary(id),stat=fs.statSync(bin);
 const codexHome=process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
 let account='';if(id==='codex'){try{const auth=JSON.parse(fs.readFileSync(path.join(codexHome,'auth.json'),'utf8'));account=require('node:crypto').createHash('sha256').update(String(auth.tokens?.account_id||auth.account_id||codexHome)).digest('hex').slice(0,16);}catch{}}
 const key=[id,id==='codex'?'cli-model-list-v2':'models-v1',bin,stat.mtimeMs,account].join(':');
 return modelCache.get(key,async()=>{
  if(id==='codex')return require('./codex-models').listModels(bin);
  if(id==='claude')return CLAUDE_MODELS;
  const {promisify}=require('node:util'),run=promisify(require('node:child_process').execFile);
  if(id==='copilot'){const {stdout}=await run(bin,['--help'],{timeout:15000,maxBuffer:1024*1024});return parseCopilotModels(stdout);}
  const {stdout}=await run(bin,['models'],{timeout:15000,maxBuffer:1024*1024});
  return stdout.split('\n').map(line=>line.trim().split('\t')).filter(parts=>parts.length>=2).map(([id,label])=>({id,label}));
 },{refresh});
}
function configuredModel(id){
 try{
  if(id==='codex')return fs.readFileSync(path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'config.toml'),'utf8').match(/^model\s*=\s*"([^"]+)"/m)?.[1]||'';
  if(id==='copilot')return readJson(path.join(process.env.COPILOT_HOME||path.join(os.homedir(),'.copilot'),'config.json'))?.model||'';
 }catch{}
 return '';
}
async function options({refresh=false}={}){
 return Promise.all(IDS.map(async id=>{
  const item={id,label:LABELS[id],available:true,model:'',models:[]};
  try{const bin=binary(id);if(!path.isAbsolute(bin)||!fs.existsSync(bin))throw Error('Provider executable is missing.');authentication(id);
   item.model=configuredModel(id);
   const catalog=await models(id,{refresh});Object.assign(item,{models:catalog.models,modelsUpdatedAt:catalog.updatedAt,modelsStale:!!catalog.stale,modelsWarning:catalog.warning});
   // Copilot's config may name a model its --help no longer lists; use Provider default instead.
   if(id==='copilot'&&item.model&&!item.models.some(m=>m.id===item.model))item.model='';
  }catch(error){require('../robos-lib/auth-notifications').reportAgent(id,error.message);item.available=false;item.error=error.message;}return item;
 }));
}
module.exports={IDS,LABELS,binary,authentication,models,options,parseCopilotModels};

'use strict';
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
function binary(provider){
 if(provider==='codex')return require('./work-task/backend').invocation('codex','plan','').bin;
 if(provider!=='agy')throw Error('Unknown task runner provider.');
 const candidates=[process.env.ROBOS_AGY_PATH,path.join(os.homedir(),'.local/bin/agy'),...(process.env.PATH||'').split(path.delimiter).map(p=>path.join(p,'agy'))];
 const found=candidates.find(p=>p&&fs.existsSync(p));if(!found)throw Error('AGY is not installed. Install AGY or set ROBOS_AGY_PATH.');return fs.realpathSync(found);
}
function readAuthentication(provider){
 if(provider==='codex'){const file=path.join(os.homedir(),'.codex/auth.json');if(!fs.existsSync(file))throw Error('Sign in to Codex before launching.');return JSON.parse(fs.readFileSync(file,'utf8'));}
 try{
 const raw=process.platform==='darwin'?execFileSync('security',['find-generic-password','-s','gemini','-a','antigravity','-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}):execFileSync('/usr/bin/python3',['-c',agySecretScript],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000});
 const auth=JSON.parse(raw);if(!auth.token?.access_token)throw Error('Missing token');return auth;
 }catch{throw Error('AGY login unavailable. Sign in to AGY and unlock your desktop keyring. Linux also requires python3-dbus.');}
}
function authentication(provider){try{return readAuthentication(provider);}catch(error){require('../robos-lib/auth-notifications').reportAgent(provider,error.message);throw error;}}
const modelCache=require('./model-cache').createCache({file:path.join(os.homedir(),'.config/robos/provider-model-cache.json')});
async function models(id,{refresh=false}={}){
 const bin=binary(id),stat=fs.statSync(bin),key=[id,bin,stat.mtimeMs].join(':');
 return modelCache.get(key,async()=>{
  if(id==='codex'){
   const data=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.codex/models_cache.json'),'utf8'));
   return (data.models||[]).filter(m=>m.visibility!=='hide').map(m=>({id:m.slug,label:m.display_name||m.slug}));
  }
  const {promisify}=require('node:util');const {stdout}=await promisify(require('node:child_process').execFile)(bin,['models'],{timeout:15000,maxBuffer:1024*1024});
  return stdout.split('\n').map(line=>line.trim().split('\t')).filter(parts=>parts.length>=2).map(([id,label])=>({id,label}));
 },{refresh});
}
async function options({refresh=false}={}){
 return Promise.all(['codex','agy'].map(async id=>{
  const item={id,label:id==='agy'?'AGY (Antigravity)':'Codex',available:true,model:'',models:[]};
  try{const bin=binary(id);if(!path.isAbsolute(bin)||!fs.existsSync(bin))throw Error('Provider executable is missing.');authentication(id);
   if(id==='codex'){try{item.model=fs.readFileSync(path.join(os.homedir(),'.codex/config.toml'),'utf8').match(/^model\s*=\s*"([^"]+)"/m)?.[1]||'';}catch{}}
   const catalog=await models(id,{refresh});Object.assign(item,{models:catalog.models,modelsUpdatedAt:catalog.updatedAt,modelsStale:!!catalog.stale,modelsWarning:catalog.warning});
  }catch(error){require('../robos-lib/auth-notifications').reportAgent(id,error.message);item.available=false;item.error=error.message;}return item;
 }));
}
module.exports={binary,authentication,models,options};

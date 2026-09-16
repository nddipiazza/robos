'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
// References live in local configuration; secret values never enter repo exports.
async function resolve(repositories,readSecret,bindings){
 if(!bindings){let settings={};try{settings=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/robos/settings.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}bindings=settings.registry_secret_bindings||[];}
 const selected=new Set(repositories.map(r=>r.toLowerCase().replace(/\.git$/,''))),env={};
 for(const binding of bindings){
  if(!selected.has(String(binding.repository).toLowerCase().replace(/\.git$/,'')))continue;
  if(!/^[A-Z][A-Z0-9_]*(?:TOKEN|KEY)$/.test(binding.environment)||['GH_TOKEN','GITHUB_TOKEN','NODE_AUTH_TOKEN'].includes(binding.environment))throw Error('Invalid package-registry secret environment name.');
  let bin,args;
  if(binding.provider==='google-secret-manager'&&/^[-a-z0-9]+$/.test(binding.project)&&/^[-a-zA-Z0-9_]+$/.test(binding.secret)){bin='gcloud';args=['secrets','versions','access','latest','--project='+binding.project,'--secret='+binding.secret];}
  else if(binding.provider==='pass'&&typeof binding.entry==='string'&&/^[a-zA-Z0-9_@][a-zA-Z0-9_@./-]*$/.test(binding.entry)&&!binding.entry.split('/').includes('..')){bin='pass';args=['show',binding.entry];}
  else throw Error('Invalid package-registry secret reference.');
  try{const value=await readSecret(bin,args);const credential=binding.provider==='pass'?value.split(/\r?\n/)[0].trim():value.trim();if(!credential)throw Error('Empty secret');env[binding.environment]=credential;}
  catch{throw Error('Cannot load '+binding.environment+' for '+binding.repository+(binding.provider==='pass'?'. Unlock your password store and verify entry '+binding.entry+'.':'. Sign in with gcloud auth login and verify access to '+binding.project+'/'+binding.secret+'.'));}
 }
 return env;
}
module.exports={resolve};

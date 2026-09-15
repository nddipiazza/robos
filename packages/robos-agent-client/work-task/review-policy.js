'use strict';
const fs=require('node:fs');
const path=require('node:path');
const file=()=>path.join(process.env.HOME,'.config/robos/pr-review-policies.json');
function organization(repo){const org=String(repo||'').split('/')[0].toLowerCase();if(!/^[a-z0-9][a-z0-9-]*$/.test(org))throw Error('Invalid repository organization');return org;}
function read(){try{return JSON.parse(fs.readFileSync(file(),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
function get(repo){const org=organization(repo);return {organization:org,requireCompletionCertificate:read()[org]?.requireCompletionCertificate===true};}
function set(repo,required){if(typeof required!=='boolean')throw Error('Certificate requirement must be a boolean');const org=organization(repo),data=read();data[org]={requireCompletionCertificate:required};fs.mkdirSync(path.dirname(file()),{recursive:true});const tmp=file()+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file());return get(repo);}
module.exports={get,set,organization};

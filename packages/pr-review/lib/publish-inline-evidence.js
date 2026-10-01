'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');
function servicePath(){
 const roots=[path.resolve(__dirname,'../..'),process.env.ROBOS_HOME&&path.join(process.env.ROBOS_HOME,'packages'),path.join(os.homedir(),'.hermetiq/robos/packages')].filter(Boolean);
 const file=roots.map(r=>path.join(r,'cloud-file-provider/lib/service.js')).find(p=>fs.existsSync(p));
 if(!file)throw Error('Configure RobOS Cloud File Provider to publish screenshots. Your draft is saved.');return file;
}
function service(){return require(servicePath());}

async function shareUnlisted(connection,id){
 const {credentials}=require(path.join(path.dirname(servicePath()),'transfer.js'));
 const {token}=await credentials(connection.remote);
 const endpoint='https://www.googleapis.com/drive/v3/files/'+id+'/permissions';
 const request=async(suffix,options={})=>{const r=await fetch(endpoint+suffix,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Could not configure unlisted screenshot access (HTTP '+r.status+').');return r.json();};
 let permissions=(await request('?fields=permissions(id,type,role,allowFileDiscovery)')).permissions||[];
 const existing=permissions.find(p=>p.type==='anyone');
 if(!existing)await request('',{method:'POST',body:JSON.stringify({type:'anyone',role:'reader',allowFileDiscovery:false})});
 else if(existing.role!=='reader'||existing.allowFileDiscovery!==false)await request('/'+existing.id,{method:'PATCH',body:JSON.stringify({role:'reader',allowFileDiscovery:false})});
 permissions=(await request('?fields=permissions(type,role,allowFileDiscovery)')).permissions||[];
 if(!permissions.some(p=>p.type==='anyone'&&p.role==='reader'&&p.allowFileDiscovery===false))throw Error('Unlisted screenshot access was not confirmed.');
 const url='https://lh3.googleusercontent.com/d/'+id;
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok||!/^image\/(png|jpeg|webp)/.test(response.headers.get('content-type')||''))throw Error('The uploaded screenshot is not loading anonymously as an image.');
 await response.arrayBuffer();return url;
}
async function publishInlineEvidence(markdown,review,store,evidence,{cloud,share=shareUnlisted,run=async args=>(await promisify(execFile)('rclone',args,{maxBuffer:8*1024*1024,timeout:120000})).stdout,progress=()=>{}}={}){
 const ids=new Set([...markdown.matchAll(/robos-evidence:\/\/screenshot\/([a-f0-9]{16})/g)].map(m=>m[1]));
 const items=[...ids].map(id=>{const e=evidence.find(e=>e.id===id&&e.kind==='screenshot');if(!e)throw Error('A screenshot in this draft is missing from the evidence catalog.');return e;}).filter(e=>!e.url);
 if(!items.length)return evidence;
 cloud=cloud||service();const owner=review.repo.split('/')[0].toLowerCase();
 const choices=cloud.catalog().filter(c=>c.repositoryOwner?.toLowerCase()===owner);
 const connection=review.cloudProviderId?choices.find(c=>c.id===review.cloudProviderId):choices.length===1?choices[0]:null;
 if(!connection)throw Error('Select one Cloud File Provider for this repository owner in RobOS before publishing screenshots.');
 if(connection.provider!=='drive')throw Error('Inline review screenshot publication currently requires a Google Drive connection.');
 const files=items.map(e=>{if(!e.path||! /\.(png|jpe?g|webp)$/i.test(e.path)||!fs.statSync(e.path).isFile())throw Error('Screenshot file is unavailable.');const data=fs.readFileSync(e.path);return {item:e,data,hash:crypto.createHash('sha256').update(data).digest('hex'),name:e.id+path.extname(e.path).toLowerCase()};});
 const digest=crypto.createHash('sha256').update(JSON.stringify(files.map(f=>[f.name,f.hash]).sort())).digest('hex');
 const directory=path.join(store.directory,'publication',digest);fs.mkdirSync(directory,{recursive:true,mode:0o700});for(const f of files)fs.writeFileSync(path.join(directory,f.name),f.data,{mode:0o600});
 progress(`Uploading ${files.length} screenshots to ${connection.name} and verifying team access…`);
 const receiptFile=path.join(store.directory,'publication',digest+'.json');
 let receipt;try{receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));if(receipt.providerId!==connection.id)receipt=null;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!receipt){receipt=await cloud.publish(connection.id,directory,'pr-screenshots');fs.writeFileSync(receiptFile,JSON.stringify(receipt),{mode:0o600});}
 const rows=JSON.parse(await run(['lsjson',connection.remote+':','--drive-root-folder-id',receipt.folderId,'--files-only','--max-depth','1']));
 const published=await Promise.all(files.map(async f=>{const matches=rows.filter(r=>r.Path===f.name);if(matches.length!==1||! /^[A-Za-z0-9_-]+$/.test(matches[0].ID||''))throw Error('Could not identify a published screenshot.');const unlisted=review.screenshotSharing==='unlisted';const url=unlisted?await share(connection,matches[0].ID):'https://drive.google.com/file/d/'+matches[0].ID+'/view';return {id:f.item.id,path:f.item.path,sha256:f.hash,url,linkOnly:!unlisted,sharing:unlisted?'unlisted':'organization'};}));
 const target=path.join(store.directory,'published-screenshots.json');let previous=[];try{previous=JSON.parse(fs.readFileSync(target,'utf8')).evidence||[];}catch(e){if(e.code!=='ENOENT')throw e;}
 fs.writeFileSync(target+'.tmp',JSON.stringify({receipt,evidence:[...previous.filter(e=>!ids.has(e.id)),...published]},null,2),{mode:0o600});fs.renameSync(target+'.tmp',target);
 progress(review.screenshotSharing==='unlisted'?'Screenshots uploaded; anonymous image access verified. Creating the PR…':'Screenshots uploaded; team access verified. Creating the PR…');
 return evidence.map(e=>({...e,...published.find(p=>p.id===e.id)}));
}
module.exports={publishInlineEvidence};

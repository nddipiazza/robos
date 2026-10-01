'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const kindFor=file=>/\.(png|jpe?g|webp)$/i.test(file)?'screenshot':/\.(webm|mp4)$/i.test(file)?'video':/\.(json|jsonl|md|txt|log|html)$/i.test(file)?'report':null;
function evidenceFor(review,store){
  const evidence=[],seen=new Set(),sources=[],limits=[];
  const add=item=>{if(!item||typeof item!=='object')return;const key=item.path||item.url;if(!key||seen.has(key))return;seen.add(key);evidence.push({id:createHash('sha256').update(key).digest('hex').slice(0,16),...item,label:String(item.label||path.basename(key)),kind:item.kind||kindFor(key)||'report'});};
  for(const item of review.evidence||[])add(item);
  const readIndex=file=>{try{const c=JSON.parse(fs.readFileSync(file,'utf8'));sources.push(file);for(const item of c.evidence||[])add(item);}catch(e){if(e.code!=='ENOENT')limits.push(`Could not read evidence index: ${file}`);}};
  if(store?.directory)readIndex(path.join(store.directory,'evidence','index.json'));
  for(const file of review.evidenceIndexes||[])readIndex(file);
  if(review.videoPath)add({label:'Recorded review video',path:review.videoPath,kind:'video'});
  const roots=[...(review.evidenceRoots||[]),...(review.videoPath?[path.dirname(review.videoPath)]:[]),...(store?.directory?[path.join(store.directory,'evidence')]:[])];
  const visited=new Set();
  const scan=(dir,depth)=>{if(depth>8||evidence.length>=2000){limits.push('Evidence inventory limit reached; inspect the supplied root directly.');return;}let entries;try{const real=fs.realpathSync(dir);if(visited.has(real))return;visited.add(real);entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){if(['node_modules','.git'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file,depth+1);else if(entry.isFile()&&kindFor(file))add({path:file,kind:kindFor(file),capturedAt:fs.statSync(file).mtime.toISOString(),source:dir});}};
  for(const root of roots)scan(root,0);
  if(review.demoProcess)add({path:review.demoProcess,label:'Walkthrough definition, including before-change checkpoints',kind:'report'});
  if(store?.transcript)add({path:store.transcript,label:'Complete saved human/agent walkthrough conversation',kind:'report'});
  if(store?.snapshot)add({path:store.snapshot,label:'Saved walkthrough state and baseline revision',kind:'report'});
  // Keep every page available; the full transcript path is also supplied for long reviews.
  let cursor,reviewNotes=[],bytes=0;
  if(store?.page)do{const page=store.page(cursor,{includeCleared:true});const notes=page.messages.filter(m=>m.kind!=='progress').map(m=>({role:m.role,text:m.text,timestamp:m.timestamp}));reviewNotes=notes.concat(reviewNotes);bytes+=JSON.stringify(notes).length;if(!page.before||page.before===cursor)break;cursor=page.before;}while(bytes<200000);
  return {evidence,reviewNotes,evidenceRoots:roots,evidenceIndexes:sources,inventoryWarnings:[...new Set(limits)],baseline:review.beforeWorkspace||null};
}
function registerScreenshot(store,item){
  if(!store?.directory||!fs.existsSync(item.path))return;
  const directory=path.join(store.directory,'evidence');fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,'index.json');let index={evidence:[]};try{index=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!index.evidence.some(e=>e.path===item.path)){index.evidence.push(item);fs.writeFileSync(file+'.tmp',JSON.stringify(index,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.tmp',file);}
}
module.exports={evidenceFor,registerScreenshot};

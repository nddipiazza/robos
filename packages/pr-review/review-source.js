'use strict';
const {prIdentity}=require('../robos-agent-client/work-task/review');
function createSourceLoader(ctx,command){
 const {repo,number}=prIdentity(ctx.pr.url);let metadata;
 const cache=new Map();
 const json=async endpoint=>JSON.parse(await command('gh',['api',endpoint]));
 async function refs(){
  const live=await json(`repos/${repo}/pulls/${number}`);
  if(live.head.sha!==ctx.pr.headRefOid)throw Error('PR changed. Refresh before loading source.');
  const comparison=await json(`repos/${repo}/compare/${live.base.sha}...${ctx.pr.headRefOid}`);
  const pages=JSON.parse(await command('gh',['api',`repos/${repo}/pulls/${number}/files?per_page=100`,'--paginate','--slurp']));
  return {base:comparison.merge_base_commit.sha,head:ctx.pr.headRefOid,headRepo:live.head.repo?.full_name||repo,files:pages.flat()};
 }
 async function content(repository,path,ref){
  const data=await json(`repos/${repository}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
  if(data.type!=='file'||data.size>2*1024*1024||data.encoding!=='base64')throw Error('This file is binary, too large, or not a regular source file. Open it in the IDE.');
  const bytes=Buffer.from(data.content,'base64');
  if(bytes.includes(0))throw Error('Binary file — open it in the IDE to review.');
  return bytes.toString('utf8');
 }
 return async path=>{
  if(!ctx.pr.files.some(f=>f.path===path))throw Error('File is not in this reviewed PR.');
  if(cache.has(path))return cache.get(path);
  const job=(async()=>{
   if(!metadata)metadata=refs().catch(e=>{metadata=null;throw e;});
   const info=await metadata,file=info.files.find(f=>f.filename===path);
   if(!file)throw Error('File metadata unavailable. Refresh the PR.');
   const [original,modified]=await Promise.all([
    file.status==='added'?'':content(repo,file.previous_filename||path,info.base),
    file.status==='removed'?'':content(info.headRepo,path,info.head)
   ]);
   return {original,modified,path,originalPath:file.previous_filename||path};
  })();
  cache.set(path,job);try{return await job;}catch(e){cache.delete(path);throw e;}
 };
}
module.exports={createSourceLoader};

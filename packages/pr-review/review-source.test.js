'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSourceLoader}=require('./review-source');
const ctx={pr:{url:'https://github.com/o/r/pull/1',headRefOid:'head',files:[{path:'new.ts'}]}};
function fixture(status='renamed'){
 const calls=[];
 const command=async(_cmd,args)=>{
  const endpoint=args[1];calls.push(endpoint);
  if(endpoint.endsWith('/pulls/1'))return JSON.stringify({head:{sha:'head',repo:{full_name:'o/r'}},base:{sha:'base-tip'}});
  if(endpoint.includes('/compare/'))return JSON.stringify({merge_base_commit:{sha:'merge-base'}});
  if(endpoint.includes('/files?'))return JSON.stringify([[{filename:'new.ts',previous_filename:'old.ts',status}]]);
  return JSON.stringify({type:'file',size:8,encoding:'base64',content:Buffer.from(endpoint.includes('ref=merge-base')?'old code':'new code').toString('base64')});
 };
 return {command,calls};
}
test('source is loaded at PR merge base and reviewed head, including renames; repeat reads cached',async()=>{
 const f=fixture(),load=createSourceLoader(ctx,f.command);
 const data=await load('new.ts');assert.equal(data.original,'old code');assert.equal(data.modified,'new code');
 assert.ok(f.calls.includes('repos/o/r/contents/old.ts?ref=merge-base'));
 const n=f.calls.length;await load('new.ts');assert.equal(f.calls.length,n);
 await assert.rejects(load('secret.txt'),/not in/);
});
test('added and removed files use an empty opposite side',async()=>{
 assert.equal((await createSourceLoader(ctx,fixture('added').command)('new.ts')).original,'');
 assert.equal((await createSourceLoader(ctx,fixture('removed').command)('new.ts')).modified,'');
});
test('moved PR head is rejected before retrieving source',async()=>{
 const load=createSourceLoader(ctx,async()=>JSON.stringify({head:{sha:'changed'}}));
 await assert.rejects(load('new.ts'),/PR changed/);
});

test('binary and oversized sources are not rendered as misleading text',async()=>{
 for(const data of [{type:'file',size:3000000,encoding:'base64',content:''},{type:'file',size:2,encoding:'base64',content:Buffer.from([0,1]).toString('base64')}]){
  const f=fixture();
  const load=createSourceLoader(ctx,async(cmd,args)=>args[1].includes('/contents/')?JSON.stringify(data):f.command(cmd,args));
  await assert.rejects(load('new.ts'),/Binary|too large/);
 }
});

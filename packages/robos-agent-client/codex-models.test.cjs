'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {listModels}=require('./codex-models');
function fixture(reply){const sent=[];let killed=false;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new EventEmitter();child.stdin.end=()=>{};child.kill=()=>{killed=true;};child.stdin.write=text=>{const request=JSON.parse(text);sent.push(request);setImmediate(()=>{const result=reply(request);if(result){const text=JSON.stringify(result)+'\n';child.stdout.write(text.slice(0,9));child.stdout.write(text.slice(9));}});};return {spawnCLI:()=>child,sent,killed:()=>killed};}
test('CLI discovery initializes and pages through visible model list without starting an agent',async()=>{
 const cli=fixture(r=>r.method==='initialize'?{id:r.id,result:{}}:r.method==='model/list'?{id:r.id,result:r.params.cursor?{data:[{model:'two',displayName:'Second'},{model:'hidden',hidden:true}],nextCursor:null}:{data:[{model:'one',displayName:'First',isDefault:true}],nextCursor:'next'}}:null);
 const models=await listModels('codex',cli);assert.deepEqual(models.map(m=>m.id),['one','two']);assert(models[0].isDefault);assert.deepEqual(cli.sent.map(m=>m.method),['initialize','initialized','model/list','model/list']);assert(cli.killed());
});
test('CLI RPC errors and timeout close discovery cleanly',async()=>{
 const cli=fixture(r=>({id:r.id,error:{code:-1,message:'private diagnostic'}}));await assert.rejects(listModels('codex',cli),/discovery failed: -1/);assert(cli.killed());
 const silent=fixture(()=>null);await assert.rejects(listModels('codex',{...silent,timeout:10}),/timed out/);assert(silent.killed());
});

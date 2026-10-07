'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {openAppContext}=require('../../../dev-central/lib/open-app-context');
test('missing desktop manager produces a handled failure',async()=>{
 const r=await openAppContext({app:'task-planner'},{socket:'/tmp/robos-test-missing-'+process.pid+'.sock'});
 assert.equal(r.ok,false);assert.match(r.error,/ENOENT/);
});
test('Code Review launches directly without inheriting another review',async()=>{
 let options,args,unref=false;
 const r=await openAppContext({app:'pr-review'},{spawn:(_command,a,o)=>{args=a;options=o;const child=new EventEmitter();child.unref=()=>unref=true;process.nextTick(()=>child.emit('spawn'));return child;}});
 assert.equal(r.ok,true);assert.match(args[0],/packages\/pr-review$/);assert.equal(options.env.ROBOS_LOCAL_REVIEW,undefined);assert.equal(options.env.ELECTRON_RUN_AS_NODE,undefined);assert.equal(unref,true);
});
test('launch failure returns an error instead of an unhandled event',async()=>{
 const r=await openAppContext({app:'pr-review'},{spawn:()=>{const child=new EventEmitter();process.nextTick(()=>child.emit('error',new Error('executable missing')));return child;}});
 assert.equal(r.ok,false);assert.match(r.error,/executable missing/);
});

test('Review evidence resolves the exact tracker URL and passes its local manifest',async()=>{
 let env;
 const r=await openAppContext({app:'pr-review',taskEvidence:true,taskUrl:'https://github.com/Hermetiq/task-and-issue-tracking/issues/144'}, {
  listReviews:()=>[
   {manifest:'/wrong.json',config:{taskUrl:'https://github.com/Hermetiq/cloud-native/issues/144'}},
   {manifest:'/correct.json',config:{task:{url:'https://github.com/Hermetiq/task-and-issue-tracking/issues/144'}}}
  ],spawn:(_c,_a,o)=>{env=o.env;const child=new EventEmitter();child.unref=()=>{};process.nextTick(()=>child.emit('spawn'));return child;}
 });
 assert.equal(r.ok,true);assert.equal(env.ROBOS_LOCAL_REVIEW,'/correct.json');assert.equal(env.ROBOS_REVIEW_STAGE,'evidence');
});
test('missing task review never falls back to listing tracker pull requests',async()=>{
 let spawned=false;
 for(const taskUrl of ['', 'https://github.com/Hermetiq/task-and-issue-tracking/issues/999']){
  const r=await openAppContext({app:'pr-review',taskEvidence:true,taskUrl},{listReviews:()=>[],spawn:()=>spawned=true});
  assert.equal(r.ok,false);
 }
 assert.equal(spawned,false);
});

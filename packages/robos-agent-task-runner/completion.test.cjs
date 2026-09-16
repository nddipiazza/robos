'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {verify}=require('./completion');
const state={sandbox:{artifacts:'/preserved/session'},launchConfig:{repositories:['https://github.com/example/repo']},reviewFix:{repo:'example/repo',head:'old',branch:'fix'}};
function deps({dirty='',head='new',remote='new',branch='fix'}={}){
 return {command:async(cmd,args)=>({'status':dirty,'rev-parse':head,'symbolic-ref':branch}[args[0]]),gh:async()=>({sha:remote})};
}
test('zero-exit run with tracked deletions fails instead of opening old PR',async()=>{
 await assert.rejects(verify(state,deps({dirty:' D docs/log.txt'})),/uncommitted changes/);
});
test('unpushed commit and wrong branch fail',async()=>{
 await assert.rejects(verify(state,deps({remote:'old'})),/Push did not finish/);
 await assert.rejects(verify(state,deps({branch:'wrong'})),/different branch/);
});
test('pushed fix and clean no-change result succeed',async()=>{
 await verify(state,deps());
 await verify(state,deps({head:'old'}));
});
test('missing export and remote verification failure fail visibly',async()=>{
 await assert.rejects(verify({...state,sandbox:null},deps()),/export is missing/);
 await assert.rejects(verify(state,{...deps(),gh:async()=>{throw Error('offline')}}),/cannot verify/);
});

test('a clean dependency PR checkout may use a local branch alias, but not unpublished commits',async()=>{
 const dependency={sandbox:state.sandbox,launchConfig:state.launchConfig,prs:[{url:'https://github.com/example/repo/pull/12'}]};
 const command=async(bin,args)=>args[0]==='status'?'':args[0]==='symbolic-ref'?'local-review':args[1]==='HEAD'?'candidate':'base';
 await verify(dependency,{command,gh:async args=>{if(args[0]==='api')throw Error('No alias on remote');return {headRefOid:'candidate'};}});
 await assert.rejects(verify(dependency,{command,gh:async args=>{if(args[0]==='api')throw Error('No alias on remote');return {headRefOid:'older'};}}),/cannot verify/);
});

test('detached dependency is accepted only when its clean head is the current linked PR head',async()=>{
 const dependency={sandbox:state.sandbox,launchConfig:state.launchConfig,prs:[{url:'https://github.com/example/repo/pull/12'}]};
 const command=async(bin,args)=>{if(args[0]==='symbolic-ref')throw Error('detached HEAD');return args[0]==='status'?'':args[1]==='HEAD'?'candidate':'base';};
 await verify(dependency,{command,gh:async()=>({headRefOid:'candidate'})});
 await assert.rejects(verify(dependency,{command,gh:async()=>({headRefOid:'older'})}),/detached commits/);
});

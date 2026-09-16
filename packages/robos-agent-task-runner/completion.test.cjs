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

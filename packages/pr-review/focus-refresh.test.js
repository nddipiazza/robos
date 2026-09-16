'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./renderer/work-task-bridge.js'),'utf8').split('// Check on return,')[1];
function setup(){
 let listener,calls=0,reloads=0;
 const ctx={real:true,lastRefresh:Date.now()-61000,pr:{url:'pr',headRefOid:'old',body:'',title:'Title'},fileDiffs:[]};
 const window={refreshReviewPages:async()=>{},addEventListener:(_,fn)=>listener=fn,api:{reviewRevision:async()=>{calls++;return {ok:true,head:'old',body:'',title:'Title'};}},setReviewInnerTab:()=>{}};
 const context={window,theaterContext:ctx,document:{getElementById:()=>({classList:{contains:()=>false},getAttribute:()=>null}),querySelector:()=>null},activeDiffFileIndex:0,openReviewPage:async()=>{reloads++;},showError:message=>{throw Error(message);}};
 vm.runInNewContext('// Check on return,'+source,context);
 return {ctx,window,run:()=>listener(),counts:()=>({calls,reloads})};
}
test('focus checks are throttled and unchanged PR leaves current review intact',async()=>{
 const s=setup();await s.run();await s.run();assert.deepEqual(s.counts(),{calls:1,reloads:0});
});
test('new PR head reloads files; busy summary generation defers refresh',async()=>{
 const s=setup();s.ctx.summaryBusy=true;await s.run();assert.equal(s.counts().calls,0);
 s.ctx.summaryBusy=false;s.window.api.reviewRevision=async()=>({ok:true,head:'new',body:'',title:'Title'});
 await s.run();assert.equal(s.counts().reloads,1);
});

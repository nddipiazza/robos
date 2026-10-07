'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {epicNavigation}=require('../../../robos-task-client/epic-navigation');
const {reviewNeighbors}=require('../../../pr-review/lib/epic-navigation');
const task=n=>({number:n,title:'Task '+n,html_url:`https://github.com/org/tracker/issues/${n}`});
test('uses task-server repo and epic order across pages, including closed tasks',async()=>{
 const calls=[];const run=async(args,opts)=>{calls.push({args,opts});return JSON.stringify(args[1].endsWith('/parent')?{...task(10),labels:[{name:'epic'}]}:[[task(5),{...task(2),state:'closed'}],[task(9)]]);};
 const result=await epicNavigation(task(2).html_url,run);
 assert.equal(result.previous.key,'#5');assert.equal(result.next.key,'#9');assert.equal(calls[0].opts.repo,'org/tracker');assert.ok(calls[1].args.includes('--paginate'));
 const last=await epicNavigation(task(9).html_url,run);assert.equal(last.next,null);
 const first=await epicNavigation(task(5).html_url,run);assert.equal(first.previous,null);
});
test('no parent hides navigation, authentication errors surface',async()=>{
 assert.equal(await epicNavigation(task(2).html_url,async()=>{throw Error('HTTP 404');}),null);
 await assert.rejects(epicNavigation(task(2).html_url,async()=>{throw Error('HTTP 401');}),/401/);
});
test('matches saved reviews by full task URL, never issue number or code repo',async()=>{
 const lookup=async()=>({previous:{url:task(1).html_url},next:{url:task(3).html_url}});
 const result=await reviewNeighbors({task:{url:task(2).html_url}},{lookup,saved:()=>[{url:'https://github.com/org/code/issues/1',id:'wrong',available:true},{url:task(1).html_url,id:'correct',available:true},{url:task(3).html_url,id:'missing',available:false}]});
 assert.equal(result.previous.reviewId,'correct');assert.equal(result.next.reviewId,null);
});

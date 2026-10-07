'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core');
test('epic navigation opens chosen neighbor and reports unavailable review',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'});
 try{
  const page=await browser.newPage();await page.setContent('<div class="theater-actions"></div>');
  await page.evaluate(()=>{window.calls=[];window.api={reviewEpicNavigation:async()=>({ok:true,navigation:{previous:{key:'#1',title:'Previous task',reviewId:'one'},next:{key:'#3',title:'Next task',reviewId:null}}}),openEpicNeighbor:async direction=>{window.calls.push(direction);return {ok:false,error:'Wait for the current review action to finish before changing tasks.'};}};});
  await page.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/epic-navigation.js')});
  await page.getByRole('button',{name:/Previous Task/}).click();await page.getByRole('status').filter({hasText:'Wait for'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls),['previous']);assert.equal(await page.getByRole('button',{name:/Next Task/}).isDisabled(),true);
  assert.match(await page.getByRole('button',{name:/Next Task/}).getAttribute('title'),/no local review/);
 }finally{await browser.close();}
});

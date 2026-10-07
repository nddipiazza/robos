'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const dir=path.resolve(__dirname,'../../../pr-review/renderer');
const html=name=>fs.readFileSync(path.join(dir,name),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<meta\b[^>]*http-equiv[^>]*>/gi,'');
test('cold launch returns to picker without reading task-server PRs; closing does the same',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'});
 try{
  const page=await browser.newPage();await page.setContent(html('index.html'));
  await page.evaluate(()=>{window.returns=0;window.api={getLocalReview:async()=>null,returnToTaskPicker:async()=>window.returns++,getConfig:async()=>{throw Error('Must not fetch tracker PRs');}};});
  for(const name of ['startup.js','app.js'])await page.addScriptTag({path:path.join(dir,name)});
  await page.waitForFunction(()=>document.getElementById('startup-screen').hidden);
  assert.equal(await page.evaluate(()=>window.returns),1);
  await page.evaluate(()=>window.exitTheater());assert.equal(await page.evaluate(()=>window.returns),2);
 }finally{await browser.close();}
});
test('saved tasks can be searched and opened without GitHub',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'});
 try{
  const page=await browser.newPage();await page.setContent(html('task-picker.html'));
  await page.evaluate(()=>{window.opened=[];window.api={listReviewTasks:async()=>({ok:true,tasks:[{id:'a',title:'Requested project',url:'https://github.com/org/tasks/issues/144',available:true},{id:'b',title:'Missing checkout',available:false}]}),openReviewTask:async id=>{window.opened.push(id);return{ok:true}}};});
  await page.addScriptTag({path:path.join(dir,'task-picker.js')});
  await page.getByRole('searchbox').fill('144');
  await page.getByRole('button',{name:'Open review'}).click();
  assert.deepEqual(await page.evaluate(()=>window.opened),['a']);
  assert.match(await page.locator('#picker-status').innerText(),/Opened Requested project/);
 }finally{await browser.close();}
});

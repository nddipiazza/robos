'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE||'playwright-core');
test('startup hides unfinished review until initialization settles and offers retry on failure',async()=>{
 const b=await chromium.launch({headless:true});try{const p=await b.newPage();const html=fs.readFileSync(path.resolve(__dirname,'../../../pr-review/renderer/index.html'),'utf8');const style=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 await p.setContent('<html data-startup="loading"><style>'+style+'</style><body><section id="startup-screen"><p id="startup-message">Loading your review…</p><button id="startup-retry" hidden>Try again</button></section><div id="app">Unfinished review</div></body></html>');await p.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/startup.js')});
 await p.evaluate(()=>{window.startCodeReview(()=>new Promise(r=>window.finishInit=r));});assert.equal(await p.locator('#app').isVisible(),false);assert.equal(await p.locator('#startup-screen').isVisible(),true);
 await p.evaluate(()=>window.finishInit());await p.locator('#app').waitFor({state:'visible'});assert.equal(await p.locator('#startup-screen').isVisible(),false);
 await p.evaluate(()=>{document.documentElement.dataset.startup='loading';document.getElementById('startup-screen').hidden=false;return window.startCodeReview(async()=>{throw Error('Connection failed');});});assert.equal(await p.locator('#app').isVisible(),false);assert.equal(await p.getByRole('button',{name:'Try again'}).isVisible(),true);assert.match(await p.getByRole('alert').innerText(),/Connection failed/);
 }finally{await b.close();}
});

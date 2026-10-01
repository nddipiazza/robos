'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.ROBOS_PLAYWRIGHT_MODULE || 'playwright-core');
const {DemoSession}=require('../../../pr-review/lib/demo-session');
test('Start over toolbar resets a completed walkthrough and blocks duplicate actions',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'restart-ui-'));const file=path.join(dir,'process.json');
 fs.writeFileSync(file,JSON.stringify({instructions:'Test fixture process',checkpoints:[{title:'First',given:'Initial',when:'Open',then:'Ready'},{title:'Last',given:'Ready',when:'Continue',then:'Done'}]}));
 // Test double for the external model; real session state machine and renderer.
 const session=new DemoSession({workspace:dir,processFile:file},async()=>({reply:'Test checkpoint',checkpointReached:true}));
 await session.act('start');await session.act('next');
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();await page.setContent('<section id="stage-6"></section>');
  await page.exposeFunction('readDemo',()=>session.state());
  await page.exposeFunction('actDemo',async opts=>({ok:true,state:await session.act(opts.action,opts.text)}));
  await page.evaluate(()=>{window.api={getDemoState:window.readDemo,demoAction:window.actDemo,onDemoState:fn=>window.updateDemo=fn};});
  session.on('state',state=>page.evaluate(s=>window.updateDemo(s),state));
  await page.addScriptTag({path:path.resolve(__dirname,'../../../pr-review/renderer/demo-ui.js')});await page.evaluate(()=>window.mountWalkthrough());
  let finish;session.runAgent=()=>new Promise(r=>finish=r);
  await page.getByRole('button',{name:'Start over',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.walkthrough-status').textContent==='Agent working…');
  assert.equal(await page.getByRole('button',{name:'Start over',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Next checkpoint →',exact:true}).isDisabled(),true);
  finish({reply:'First checkpoint ready',checkpointReached:true});
  await page.waitForFunction(()=>document.querySelector('.walkthrough-status').textContent==='Paused · 1/2');
  assert.equal(await page.locator('.walkthrough-checkpoint h3').textContent(),'First');
  assert.match(await page.getByRole('log').textContent(),/Start over: First/);
  assert.equal(await page.getByRole('button',{name:'Next checkpoint →',exact:true}).isEnabled(),true);
 } finally {session.removeAllListeners();await browser.close();}
});

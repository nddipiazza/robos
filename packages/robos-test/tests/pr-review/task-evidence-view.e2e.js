'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright-core');
test('task evidence uses the shared component with bounded previews and lazy scenarios', async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.ROBOS_CHROMIUM_PATH || '/usr/bin/google-chrome'});
 try {
  const page = await browser.newPage({viewport:{width:1200,height:900}});
  await page.setContent('<section id="stage-5">100% VERIFIED PROOF-OF-WORK <video></video></section>');
  await page.evaluate(() => {
   window.reads=[];
   window.api={taskEvidenceBundle:async()=>({ok:true,bundle:{revision:'abc123',finishedAt:'2026-10-06',template:{'@id':'urn:robos:evidence-template:test:v1','dcterms:title':'MCP calls and responses','robos:version':1,'robos:webElement':'robos-evidence-transcript','robos:artifactSlots':[{id:'request',name:'Exact request',kind:'text',required:true}]},scenarios:[{id:'first',title:'Requested project',status:'passed',summary:'Synthetic local capture.'},{id:'second',title:'Unavailable switching',status:'blocked',summary:'Connection unavailable.'}],artifacts:[{id:'one',label:'Captured request',source:'Synthetic local fixture'},{id:'two',label:'Other request'}],templateBindings:[{scenarioId:'first',slotId:'request',artifactId:'one'},{scenarioId:'second',slotId:'request',artifactId:'two'}]}}),taskEvidenceText:async id=>{window.reads.push(id);return {ok:true,text:'<script>window.injected=true</script>\n'+Array.from({length:90},(_,i)=>'Captured line '+i).join('\n')}}};
  });
  for(const script of ['../../../robos-ui/evidence-template.js','../../../pr-review/renderer/task-evidence.js'])await page.addScriptTag({path:path.resolve(__dirname,script)});
  await page.evaluate(()=>window.renderTaskEvidence());
  await page.waitForFunction(()=>window.reads.length===1);
  assert.deepEqual(await page.evaluate(()=>window.reads),['one']);
  assert.equal(await page.locator('video').count(),0);
  assert.doesNotMatch(await page.locator('#stage-5').innerText(),/100% VERIFIED/);
  assert.equal(await page.evaluate(()=>window.injected),undefined);
  assert.doesNotMatch(await page.locator('robos-evidence-transcript pre').innerText(),/Captured line 89/);
  await page.getByRole('button',{name:'Show more captured output'}).click();
  assert.match(await page.locator('robos-evidence-transcript pre').innerText(),/Captured line 89/);
  await page.getByText('Unavailable switching',{exact:true}).click();
  await page.waitForFunction(()=>window.reads.length===2);
  assert.deepEqual(await page.evaluate(()=>window.reads),['one','two']);
  await page.evaluate(()=>{window.api.taskEvidenceBundle=async()=>({ok:false,error:'Capture is missing'});return window.renderTaskEvidence();});
  assert.match(await page.locator('#stage-5').innerText(),/Capture is missing/);
 } finally {await browser.close();}
});

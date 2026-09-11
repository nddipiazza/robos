'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { _electron: electron } = require('playwright-core');
const { GraphWorkspace } = require('../../../robos-graph/lib/graph-workspace');
test('Electron topology draws actual links with contrast, labels, safe text and bounded scope controls', { timeout: 90000 }, async () => {
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'robos-topology-'));
 const proof=path.resolve(__dirname,'../../run/topology'); fs.mkdirSync(proof,{recursive:true});
 const n=(id,extra={})=>({'@id':`urn:test:${id}`,'@type':['example:Node'],'dcterms:title':id,'robos:package':'one',...extra});
 const nodes=Array.from({length:60},(_,i)=>n(`isolate${i}`)).concat([
  n('root',{'dcterms:title':'Root & <safe> "title"','robos:uses':{'@id':'urn:test:data'},'robos:calls':['urn:test:api'],'robos:relatedTo':{'@id':'urn:test:doc'}}),
  n('data'),n('api',{'robos:package':'two'}),n('doc'),n('false',{'dcterms:description':'A mention of urn:test:root is just prose'})
 ]);
 const ws=new GraphWorkspace(tmp);ws.apply(ws.propose({document:{...ws.empty('Generic topology proof'),'robos:nodes':nodes}}));
 const captions=[],start=Date.now(),errors=[];
 const recorder=spawn('ffmpeg',['-loglevel','error','-y','-f','x11grab','-video_size','1920x1080','-framerate','15','-i',process.env.DISPLAY,'-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8',path.join(proof,'topology.webm')],{stdio:['pipe','ignore','pipe']});
 let recorderError='';recorder.stderr.on('data',b=>recorderError+=b);const recordingDone=new Promise(resolve=>recorder.on('close',resolve));
 let app;
 try {
  app=await electron.launch({executablePath:process.env.ELECTRON_BIN||require('electron'),args:[path.resolve(__dirname,'../../../robos-graph/main.js'),'--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],env:{...process.env,ROBOS_GRAPH_ROOT:tmp,ROBOS_TEST:'1'}});
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  const step=async(selector,text,action)=>{
   await page.locator(selector).first().scrollIntoViewIfNeeded();
   captions.push({time:(Date.now()-start)/1000,text});
   await page.evaluate(({selector,text})=>{
    let banner=document.getElementById('proof-caption');if(!banner){banner=document.createElement('div');banner.id='proof-caption';banner.style.cssText='position:fixed;bottom:10px;left:10px;right:10px;background:#163440;color:white;border:2px solid #22d3ee;padding:15px;z-index:999999;pointer-events:none;font:18px sans-serif';document.body.append(banner);}banner.textContent=text;
    document.querySelector(selector).style.outline='2px solid #22d3ee';
   },{selector,text});if(action)await action(page.locator(selector));await page.waitForTimeout(700);
  };
  await page.locator('#node-search-input').fill('Root &');await page.locator('#node-urn_test_root').click();
  await step('#tab-btn-topology','Open topology for the selected root with real JSON-LD references.',el=>el.click());
  await page.locator('path.topology-edge').first().waitFor();
  assert.equal(await page.locator('path.topology-edge').count(),3);
  assert.equal(await page.locator('.topology-node-group').count(),4);
  const relations=await page.evaluate(()=>window.sdlcGraph.getGraphRelations());
  assert.ok(relations.every(e=>Object.keys(e).sort().join(',')==='from,kind,predicate,to'));
  const dependency=page.locator('path.topology-edge[data-predicate="robos:uses"]');
  assert.equal(await dependency.getAttribute('data-from'),'urn:test:root');assert.equal(await dependency.getAttribute('data-to'),'urn:test:data');
  assert.equal(await dependency.getAttribute('stroke'),'#22d3ee');assert.equal(await dependency.getAttribute('stroke-dasharray'),null);
  assert.equal(await page.locator('path.topology-edge[data-kind="reference"]').getAttribute('stroke-dasharray'),'7 5');
  assert.match(await page.locator('.topology-svg').textContent(),/robos:calls/);
  assert.equal(await page.locator('.topology-svg safe').count(),0);
  assert.ok(await dependency.evaluate(el=>el.getTotalLength()>100 && getComputedStyle(el).strokeOpacity==='1'));
  await step('#topology-legend','Solid cyan dependencies and dashed slate references have explicit predicate labels.');
  await page.screenshot({path:path.join(proof,'01-visible-links.png')});
  const before=await dependency.getAttribute('d');
  await step('#topology-direction-toggle','Switch to left-to-right ports and routing.',el=>el.click());
  await page.waitForFunction(()=>document.querySelector('#topology-direction-toggle').textContent.includes('Left-to-Right'));
  assert.notEqual(await page.locator('path.topology-edge[data-predicate="robos:uses"]').getAttribute('d'),before);
  assert.equal(await page.locator('path.topology-edge').count(),3);
  await page.screenshot({path:path.join(proof,'02-left-right.png')});
  await step('#topology-scope-select','Package scope excludes the API endpoint in the other package.',el=>el.selectOption('package'));
  assert.equal(await page.locator('path.topology-edge[data-to="urn:test:api"]').count(),0);
  assert.equal(await page.locator('path.topology-edge').count(),2);
  await step('#topology-scope-select','All scope keeps connected nodes ahead of sixty unrelated nodes and reports truncation.',el=>el.selectOption('all'));
  assert.equal(await page.locator('path.topology-edge').count(),3);
  assert.equal(await page.locator('.topology-node-group').count(),48);
  assert.match(await page.locator('#topology-truncation').textContent(),/17 of 65 nodes/);
  await page.screenshot({path:path.join(proof,'03-bounded-all.png')});
  await step('#topology-scope-select','Return to the exact neighborhood: prose mentions are excluded.',el=>el.selectOption('neighborhood'));
  assert.equal(await page.locator('.topology-node-group').count(),4);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(proof,'result.json'),JSON.stringify({passed:true,assertions:['real compact IPC','object/string/array references','visible dependency/reference strokes','labels','escaped title','TD/LR ports','package boundaries','bounded connected all scope','no prose links'],captions,errors},null,2));
 } finally {
  if(app)await app.close();recorder.stdin.write('q');await recordingDone;
  const stamp=s=>new Date(Math.floor(s*1000)).toISOString().slice(11,23);
  fs.writeFileSync(path.join(proof,'topology.vtt'),'WEBVTT\n\n'+captions.map((c,i)=>`${i+1}\n${stamp(c.time)} --> ${stamp(captions[i+1]?.time||(Date.now()-start)/1000)}\n${c.text}\n`).join('\n'));
 }
 assert.equal(recorder.exitCode,0,recorderError);
});

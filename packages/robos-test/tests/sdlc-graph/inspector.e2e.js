'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {_electron:electron}=require('playwright-core');
const {GraphWorkspace}=require('../../../robos-graph/lib/graph-workspace');
test('Electron inspector capabilities: faithful data, safe documents, source context, relationships, paths and isolate fallback',{timeout:90000},async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'robos-inspector-')),proof=path.resolve(__dirname,'../../run/inspector');fs.mkdirSync(proof,{recursive:true});
 const n=(id,type='example:Node',extra={})=>({'@id':`urn:test:${id}`,'@type':[type],'dcterms:title':id,'robos:package':'services',...extra});
 const revision='a'.repeat(40),hash='b'.repeat(64),malicious='<img src=x onerror="window.inspectorPwned=1">';
 const evidence={repository:'example/docs',path:'README.md',line:12,revision,sha256:hash,workingTreeStatus:'clean'};
 const nodes=[n('app','robos:Microservice',{'dcterms:title':'API '+malicious,'robos:repository':{'@id':'urn:test:repo'},'robos:uses':{'@id':'urn:test:data'},'robos:hasDocumentationPage':{'@id':'urn:test:doc'}}),n('data'),n('doc','robos:DocumentationPage',{'robos:docPath':'README.md','robos:sourcePath':'README.md','robos:slug':'readme','robos:content':malicious,'robos:inRepository':[{'@id':'urn:test:repo'}],'robos:evidence':[evidence]}),n('repo','example:Repository',{'robos:url':'https://github.com/example/docs.git'}),n('isolated'),n('edge-evidence','example:Node',{'robos:uses':{'@id':'urn:test:data'},'robos:relationshipEvidence':[{predicate:'robos:uses',target:'urn:test:data',evidence:[evidence]}]})];
 const ws=new GraphWorkspace(tmp);ws.apply(ws.propose({document:{...ws.empty('Generic inspector proof'),'robos:nodes':nodes}}));
 const captions=[],start=Date.now(),errors=[];
 const recorder=spawn('ffmpeg',['-loglevel','error','-y','-f','x11grab','-video_size','1920x1080','-framerate','15','-i',process.env.DISPLAY,'-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8',path.join(proof,'inspector.webm')],{stdio:['pipe','ignore','pipe']});
 let recordingError='';recorder.stderr.on('data',b=>recordingError+=b);const done=new Promise(r=>recorder.on('close',r));let app;
 try{
 app=await electron.launch({executablePath:process.env.ELECTRON_BIN||require('electron'),args:[path.resolve(__dirname,'../../../robos-graph/main.js'),'--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],env:{...process.env,ROBOS_GRAPH_ROOT:tmp,ROBOS_TEST:'1'}});
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 const step=async(selector,text,action)=>{await page.locator(selector).first().scrollIntoViewIfNeeded();captions.push({time:(Date.now()-start)/1000,text});await page.evaluate(({selector,text})=>{let b=document.getElementById('proof-caption');if(!b){b=document.createElement('div');b.id='proof-caption';b.style.cssText='position:fixed;bottom:10px;left:10px;right:10px;background:#163440;color:white;border:2px solid #22d3ee;padding:14px;z-index:999999;pointer-events:none;font:18px sans-serif';document.body.append(b);}b.textContent=text;document.querySelector(selector).style.outline='2px solid #22d3ee';},{selector,text});if(action)await action(page.locator(selector));await page.waitForTimeout(500);};
 await page.locator('#overview-relationships').waitFor();
 await step('#nodes-resizer','Drag the divider to give Graph Nodes more room.',async el=>{
   await el.dblclick();
   const box=await el.boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
   await page.mouse.down();await page.mouse.move(box.x+box.width/2+140,box.y+box.height/2,{steps:12});await page.mouse.up();
 });
 const sidebarWidth=()=>page.locator('.nodes-panel').evaluate(el=>el.getBoundingClientRect().width);
 assert.ok(Math.abs(await sidebarWidth()-500)<2);
 await step('#nodes-resizer','Arrow keys resize the focused separator; the chosen width survives reload.',async el=>{await el.focus();await el.press('ArrowLeft');});
 assert.ok(Math.abs(await sidebarWidth()-490)<2);
 await page.reload();await page.locator('#overview-relationships').waitFor();
 assert.ok(Math.abs(await sidebarWidth()-490)<2);
 await step('#nodes-resizer','Resizing the window keeps both panels usable and restores the preferred width.',async()=>{
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(760,960));
   await page.waitForFunction(()=>document.querySelector('.workspace-grid').clientWidth<760 && document.querySelector('.nodes-panel').getBoundingClientRect().width<=360);
   assert.ok(await sidebarWidth()<=360);
   assert.ok((await page.locator('.inspector-panel').boundingBox()).width>=340);
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
   await page.waitForFunction(()=>Number(document.getElementById('nodes-resizer').getAttribute('aria-valuenow'))===490);
 });
 await step('#nodes-resizer','Home and End respect panel limits; double-click restores the default width.',async el=>{
   await el.focus();await el.press('Home');assert.equal(await sidebarWidth(),240);
   await el.press('End');assert.ok((await page.locator('.inspector-panel').boundingBox()).width>=359);
   await el.dblclick();assert.equal(await sidebarWidth(),360);
 });
 await page.screenshot({path:path.join(proof,'00-resizable-sidebar.png')});

 assert.match(await page.locator('#inspector-content').textContent(),/robos:repository/);
 assert.equal(await page.locator('#inspector-content img').count(),0);
 for(const tab of ['gitops','edd','video','fabric','traceability'])assert.equal(await page.locator('#tab-btn-'+tab).count(),0);
 assert.doesNotMatch(await page.locator('#inspector-content').textContent(),/3 endpoints|100% VERIFIED|ALL SCENARIOS PASS|Probe Mock|Launch App/);
 await step('#tab-btn-documentation','Documentation shows recorded text and one deduplicated source document.',el=>el.click());
 assert.equal(await page.locator('.source-document-card').count(),1);
 assert.match(await page.locator('.source-document-card').textContent(),/Repository.*example\/docs.*Recorded revision/s);
 assert.match(await page.locator('.source-document-card').textContent(),/source reference|Source reference/);
 assert.equal(await page.locator('.source-document-card a').getAttribute('href'),`https://github.com/example/docs/blob/${revision}/README.md#L12`);
 assert.equal(await page.locator('#inspector-content img').count(),0);
 await page.screenshot({path:path.join(proof,'01-documentation.png')});
 await step('.view-source-evidence','Inspect the exact recorded repository, path, line, revision and hash.',el=>el.click());
 await page.waitForFunction(()=>document.querySelector('#tab-btn-evidence').classList.contains('active'));
 assert.match(await page.locator('#inspector-content').textContent(),new RegExp(hash));
 await step('#node-urn_test_app','Return to the API; unsupported Source Evidence falls back to Overview.',el=>el.click());
 assert.match(await page.locator('#tab-btn-visual').getAttribute('class'),/active/);
 await step('#tab-btn-topology','Topology shows only recorded internal connections.',el=>el.click());assert.ok(await page.locator('path.topology-edge').count()>0);
 await step('#tab-btn-impact','Dependencies show factual counts without risk ratings.',el=>el.click());
 await step('[onclick="window.setImpactDirection(\'upstream\')"]','Inspect the modeled upstream dependency.',el=>el.click());
 assert.match(await page.locator('.impact-summary-card').textContent(),/1 modeled dependencies/);
 assert.doesNotMatch(await page.locator('.impact-summary-card').textContent(),/CRITICAL|LOW IMPACT|HIGH IMPACT|MODERATE/);
 await step('#tab-btn-query','Query starts from the selected API node.',el=>el.click());assert.equal(await page.locator('#path-from-select').inputValue(),'urn:test:app');
 await page.locator('#path-to-select').selectOption('urn:test:data');await step('[onclick="window.runFindPath()"]','Trace the real recorded reference path.',el=>el.click());
 await page.locator('.path-hop-card').first().waitFor();assert.ok(await page.locator('.path-hop-card').count()>=2);
 await step('#tab-btn-rdf','JSON-LD displays unsafe markup as literal text.',el=>el.click());assert.equal(await page.locator('#inspector-content img').count(),0);assert.match(await page.locator('#inspector-content').textContent(),/onerror/);
 await step('#tab-btn-visual','Overview relationships navigate to actual graph nodes.',el=>el.click());await page.locator('#overview-relationships [data-inspect-id="urn:test:data"]').click();
 await page.locator('#tab-btn-query').click();assert.equal(await page.locator('#path-from-select').inputValue(),'urn:test:data');
 await step('#node-urn_test_doc','Select a documentation node, then open its Documentation tab.',el=>el.click());await page.locator('#tab-btn-documentation').click();
 await step('#node-urn_test_isolated','An isolated node has only Overview, Query & Paths and JSON-LD.',el=>el.click());
 assert.deepEqual(await page.locator('.inspector-tabs .tab-btn:visible').allTextContents(),['Overview','Query & Paths','JSON-LD']);
 assert.match(await page.locator('#tab-btn-visual').getAttribute('class'),/active/);
 for(const tab of ['video','gitops','edd','fabric','traceability','documentation','evidence','topology','impact']){await page.evaluate(tab=>window.switchTab(tab),tab);assert.match(await page.locator('#tab-btn-visual').getAttribute('class'),/active/);}
 await page.screenshot({path:path.join(proof,'02-isolate.png')});
 await step('#node-urn_test_edge-evidence','Relationship evidence is available even without node-level evidence.',el=>el.click());await page.locator('#tab-btn-evidence').click();assert.match(await page.locator('#inspector-content').textContent(),/relationship predicate/);
 assert.equal(await page.evaluate(()=>window.inspectorPwned),undefined);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(proof,'result.json'),JSON.stringify({passed:true,errors,captions,assertions:['removed fixture tabs','faithful object refs','conditional tabs and fallback','deduplicated source document','recorded revision link','all evidence fields','safe malicious content','real relationships','neutral dependency counts','selected query root and path','JSON-LD','isolate relevance']},null,2));
 }finally{if(app)await app.close();recorder.stdin.write('q');await done;const stamp=s=>new Date(Math.floor(s*1000)).toISOString().slice(11,23);fs.writeFileSync(path.join(proof,'inspector.vtt'),'WEBVTT\n\n'+captions.map((c,i)=>`${i+1}\n${stamp(c.time)} --> ${stamp(captions[i+1]?.time||(Date.now()-start)/1000)}\n${c.text}\n`).join('\n'));}
 assert.equal(recorder.exitCode,0,recordingError);
});

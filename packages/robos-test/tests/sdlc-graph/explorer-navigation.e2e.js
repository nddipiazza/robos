'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {_electron:electron}=require('playwright-core');
const {GraphWorkspace}=require('../../../robos-graph/lib/graph-workspace');

test('Electron Explorer status and node/tab navigation history',{timeout:90000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'robos-explorer-navigation-'));
 const proof=path.resolve(__dirname,'../../run/explorer-navigation');fs.mkdirSync(proof,{recursive:true});
 const graphName='Generic navigation workspace';
 const nodes=['A','B','C'].map(id=>({'@id':`urn:navigation:${id}`,'@type':[id==='A'?'robos:Team':'robos:Feature'],'dcterms:title':`Object ${id}`,'dcterms:description':id==='A'?'Organization record':'Search cohort record','robos:package':'navigation'}));
 const ws=new GraphWorkspace(root);ws.apply(ws.propose({document:{...ws.empty(graphName),'robos:nodes':nodes}}));
 const errors=[],captions=[],start=Date.now();let app,recordingError='';
 const recorder=spawn('ffmpeg',['-loglevel','error','-y','-f','x11grab','-video_size','1920x1080','-framerate','15','-i',process.env.DISPLAY,'-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8',path.join(proof,'explorer-navigation.webm')],{stdio:['pipe','ignore','pipe']});
 recorder.stderr.on('data',b=>recordingError+=b);const done=new Promise(resolve=>recorder.on('close',resolve));
 try{
  app=await electron.launch({executablePath:process.env.ELECTRON_BIN||require('electron'),args:[path.resolve(__dirname,'../../../robos-graph/main.js'),'--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],env:{...process.env,ROBOS_GRAPH_ROOT:root,ROBOS_TEST:'1'}});
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.locator('#graph-status-bar').waitFor();
  const step=async(selector,text,action)=>{
   await page.locator(selector).first().scrollIntoViewIfNeeded();captions.push({time:(Date.now()-start)/1000,text});
   await page.evaluate(text=>{let b=document.getElementById('proof-caption');if(!b){b=document.createElement('div');b.id='proof-caption';b.style.cssText='position:fixed;bottom:45px;left:12px;right:12px;background:#163440;color:white;padding:14px;border:2px solid #22d3ee;z-index:999999;pointer-events:none;font:18px sans-serif';document.body.append(b);}b.textContent=text;},text);
   await action(page.locator(selector));await page.waitForTimeout(350);
  };
  const click=(selector,text)=>step(selector,text,el=>el.click());
  const select=id=>click(`#node-urn_navigation_${id}`,`Select Object ${id}.`);
  const expectState=async(id,tab)=>{
   await page.waitForFunction(({id,tab})=>document.querySelector('.node-item.selected')?.dataset.nodeId===`urn:navigation:${id}` && document.querySelector(`#tab-btn-${tab}`)?.classList.contains('active'),{id,tab});
  };
  const expectFilters=async(search,type,visibleIds)=>{
   assert.equal(await page.locator('#node-search-input').inputValue(),search);
   assert.equal(await page.locator('#node-type-filter').inputValue(),type);
   assert.equal(await page.locator('#btn-clear-node-search').isVisible(),Boolean(search.trim()));
   assert.deepEqual(await page.locator('.node-item:visible').evaluateAll(items=>items.map(item=>item.dataset.nodeId).sort()),visibleIds.map(id=>`urn:navigation:${id}`).sort());
   assert.equal(await page.locator('#nodes-count-badge').textContent(),`${visibleIds.length} of 3 Nodes`);
  };
  await expectState('A','visual');
  await expectFilters('','all',['A','B','C']);
  assert.equal(await page.locator('#stat-bar').count(),0);
  assert.doesNotMatch((await page.locator('.node-item').allTextContents()).join('\n'),/\binferred\b/i);
  const status=await page.locator('#graph-status-bar').textContent();
  assert.ok(status.includes(graphName));assert.ok(status.includes(root));assert.equal(await page.locator('#graph-status-nodes').textContent(),'Nodes: 3');assert.match(await page.locator('#graph-status-schemas').textContent(),/^Schemas: [1-9][0-9,]*$/);
  assert.equal(await page.locator('#btn-nav-back').isDisabled(),true);
  assert.equal(await page.locator('#btn-nav-forward').isDisabled(),true);
  await page.screenshot({path:path.join(proof,'01-status.png')});
  await select('B');await click('#tab-btn-query','Keep Query & Paths as Object B’s inspector tab.');
  await step('#node-type-filter','Save the Feature filter with Object B.',el=>el.selectOption('robos:Feature'));
  await expectFilters('','robos:Feature',['B','C']);
  await step('#node-search-input','Save a cohort search with Object B; only matching cards remain.',el=>el.fill('cohort'));
  await expectFilters('cohort','robos:Feature',['B','C']);
  await select('C');await step('#node-type-filter','Use All Types on Object C.',el=>el.selectOption('all'));
  await expectFilters('cohort','all',['B','C']);
  await click('#btn-clear-node-search','Clear Object C’s search and restore every card.');
  await expectFilters('','all',['A','B','C']);await click('#tab-btn-rdf','Keep JSON-LD as Object C’s inspector tab.');
  await click('#btn-nav-back','Back restores Object B and its Query & Paths tab.');await expectState('B','query');
  await expectFilters('cohort','robos:Feature',['B','C']);
  await click('#btn-nav-back','Back restores Object A and Overview.');await expectState('A','visual');
  await expectFilters('','all',['A','B','C']);
  assert.equal(await page.locator('#btn-nav-back').isDisabled(),true);
  await click('#btn-nav-forward','Forward restores Object B and its tab.');await expectState('B','query');
  await expectFilters('cohort','robos:Feature',['B','C']);
  await select('C');await expectState('C','query');
  await click('#btn-clear-node-search','Clear the new visit’s search without replacing Object B’s saved search.');
  await step('#node-type-filter','Show all types for the new Object C visit.',el=>el.selectOption('all'));
  await expectFilters('','all',['A','B','C']);
  assert.equal(await page.locator('#btn-nav-forward').isDisabled(),true,'new selection discards the old forward branch');
  await click('#tab-btn-rdf','Record JSON-LD on the new Object C history entry.');
  await step('#btn-nav-back','Alt+Left goes back exactly one object.',()=>page.keyboard.press('Alt+ArrowLeft'));await expectState('B','query');
  await step('#btn-nav-forward','Alt+Right restores Object C and JSON-LD.',()=>page.keyboard.press('Alt+ArrowRight'));await expectState('C','rdf');
  await step('#btn-nav-back','Electron’s browser-back app command restores Object B.',()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].emit('app-command',{preventDefault(){}},'browser-backward')));await expectState('B','query');
  await step('#btn-nav-forward','Electron’s browser-forward app command restores Object C.',()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].emit('app-command',{preventDefault(){}},'browser-forward')));await expectState('C','rdf');
  await step('#btn-nav-back','Chromium’s native history back emits popstate and restores Object B.',()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.navigationHistory.goBack()));await expectState('B','query');
  await step('#btn-nav-forward','Chromium’s native history forward restores Object C.',()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.navigationHistory.goForward()));await expectState('C','rdf');
  for(const [button,id,tab] of [[3,'B','query'],[4,'C','rdf']]){
   await step('#inspector-content',`Mouse auxiliary button ${button} restores Object ${id}.`,()=>page.locator('#inspector-content').dispatchEvent('auxclick',{button,bubbles:true,cancelable:true}));await expectState(id,tab);
  }
  await step('#btn-nav-back','The public navigation back hook restores Object B.',()=>page.evaluate(()=>window.RobosGraphNavigation.back()));await expectState('B','query');
  await step('#btn-nav-forward','The public navigation forward hook restores Object C.',()=>page.evaluate(()=>window.RobosGraphNavigation.forward()));await expectState('C','rdf');
  await step('#graph-status-bar','Reload restores the current object, tab, and available history.',()=>page.reload());await expectState('C','rdf');
  await click('#btn-nav-back','History still restores Object B after reload.');await expectState('B','query');
  await expectFilters('cohort','robos:Feature',['B','C']);
  await page.screenshot({path:path.join(proof,'02-restored-history.png')});
  await click('#btn-nav-forward','Return to Object C before removing an older visited object.');await expectState('C','rdf');
  await step('#graph-status-bar','Delete Object B through the real graph API in this disposable workspace, then reload its nodes.',()=>page.evaluate(async()=>{await window.sdlcGraph.deleteNode('urn:navigation:B');await window.load();}));
  await expectState('C','rdf');
  assert.equal(await page.locator('#node-urn_navigation_B').count(),0);
  assert.equal(ws.read()['robos:nodes'].some(node=>node['@id']==='urn:navigation:B'),false,'deletion persisted in the temporary workspace');
  assert.equal(await page.locator('#graph-status-nodes').textContent(),'Nodes: 2');
  await click('#btn-nav-back','Back skips the deleted Object B visit and restores Object A.');await expectState('A','visual');
  assert.equal(await page.locator('#btn-nav-back').isDisabled(),true);
  await click('#btn-nav-forward','Forward also skips the deleted visit and restores Object C.');await expectState('C','rdf');
  assert.equal(await page.locator('#btn-nav-forward').isDisabled(),true);
  await page.screenshot({path:path.join(proof,'04-deleted-visit.png')});
  // Only automate the OS directory choice; the app opens and reads a real second workspace.
  const secondRoot=fs.mkdtempSync(path.join(os.tmpdir(),'robos-navigation-second-'));
  const second=new GraphWorkspace(secondRoot);second.apply(second.propose({document:{...second.empty('Second generic workspace'),'robos:nodes':[nodes[2]]}}));
  await app.evaluate(({dialog},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});},secondRoot);
  await click('#btn-workspace-review','Open another graph to verify history is scoped to its workspace.');
  await click('#workspace-open','Select the second real workspace.');
  await click('#workspace-close','Return to the second workspace’s Explorer.');
  await page.waitForFunction(()=>document.getElementById('graph-status-name').textContent==='Second generic workspace');
  assert.equal(await page.locator('.node-item.selected').getAttribute('data-node-id'),'urn:navigation:C');
  assert.equal(await page.locator('#btn-nav-back').isDisabled(),true);
  assert.equal(await page.locator('#btn-nav-forward').isDisabled(),true);
  assert.equal(await page.locator('#graph-status-path').textContent(),second.root);
  assert.equal(await page.locator('#graph-status-nodes').textContent(),'Nodes: 1');
  await page.screenshot({path:path.join(proof,'03-workspace-scope.png')});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(proof,'result.json'),JSON.stringify({passed:true,errors,captions,graphName,graphRoot:root,assertions:['graph status name/path/count','no stat cards or inferred labels','back/forward boundaries','node and tab restoration','branch truncation','Alt arrows','native Electron app commands','auxiliary mouse events','public navigation hooks','reload persistence','filter restoration','native Chromium history','workspace scope reset','search results and clear-button restoration','type-filtered card contents','persisted deletion and skipped visits in both directions']},null,2));
 }finally{
  if(app)await app.close();recorder.stdin.write('q');await done;
  const stamp=s=>new Date(Math.floor(s*1000)).toISOString().slice(11,23);
  fs.writeFileSync(path.join(proof,'explorer-navigation.vtt'),'WEBVTT\n\n'+captions.map((c,i)=>`${i+1}\n${stamp(c.time)} --> ${stamp(captions[i+1]?.time||(Date.now()-start)/1000)}\n${c.text}\n`).join('\n'));
 }
 assert.equal(recorder.exitCode,0,recordingError);assert.ok(fs.statSync(path.join(proof,'explorer-navigation.webm')).size>1000);
});

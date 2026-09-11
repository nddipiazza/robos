'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {_electron:electron}=require('playwright-core');
const {GraphWorkspace}=require('../../../robos-graph/lib/graph-workspace');
const {GROUPS}=require('../../../robos-graph/lib/inspector-groups');

test('Electron schema groups show recorded properties and inverse children without invoking runtimes',{timeout:120000},async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'robos-inspector-groups-'));
 const proof=path.resolve(__dirname,'../../run/inspector-groups');fs.mkdirSync(proof,{recursive:true});
 const ref=id=>({'@id':`urn:groups:${id}`});
 const n=(id,type,fields={})=>({...ref(id),'@type':[type],'dcterms:title':id,'robos:package':'generic-proof',...fields});
 const hostile='<img src=x onerror="window.groupsPwned=1">';
 const toolMetadata={
  'robos:inputSchema':{type:'object',properties:{query:{type:'string',description:hostile}},additionalProperties:false},
  'robos:outputSchema':{type:'object',properties:{count:{type:'integer',minimum:0}}},
  'robos:annotations':{readOnlyHint:false,destructiveHint:false},
  'robos:availabilityStatus':'conditional',
  'robos:registrationCondition':'Recorded catalog configuration must be enabled',
  'robos:runtimePrerequisites':['Recorded catalog credentials'],
  'robos:toolAnnotations':{idempotentHint:false,priority:0}
 };
 const nodes=[
  n('server','robos:MCPServer',{'robos:transport':'stdio','robos:toolsProvided':['catalog-search'],'robos:tools':[ref('tool')]}),
  n('tool','robos:MCPTool',{'robos:toolName':'catalog-search','robos:mcpServer':ref('server'),'robos:toolOfServer':ref('server'),'robos:parameters':{inputSchema:{type:'object',properties:{query:{type:'string',description:hostile}}}},...toolMetadata,'robos:evidence':[{repository:'example/catalog',path:'tools/search.json',line:7,revision:'a'.repeat(40)}]}),
  n('resource','robos:MCPResource',{'robos:uriTemplate':'catalog://items/{id}','robos:mcpServer':ref('server'),'robos:resourceOfServer':ref('server')}),
  n('prompt','robos:MCPPrompt',{'robos:promptName':'summarize-catalog','robos:mcpServer':ref('server'),'robos:promptOfServer':ref('server')}),
  n('content-server','robos:MCPServer',{'robos:transport':'stdio'}),
  n('content-resource','robos:MCPResource',{'robos:uriTemplate':'catalog://reference','robos:mcpServer':ref('content-server'),'robos:annotations':{priority:0}}),
  n('content-prompt','robos:MCPPrompt',{'robos:promptName':'explain-reference','robos:mcpServer':ref('content-server')}),
  n('large-server','robos:MCPServer',{'robos:transport':'stdio'}),
  n('array-server','robos:MCPServer',{'robos:transport':'stdio'}),
  ...Array.from({length:43},(_,i)=>n(`paged-tool-${String(i).padStart(2,'0')}`,'robos:MCPTool',{'robos:toolName':`recorded-action-${i}`,'robos:mcpServer':ref('large-server')})),
  n('repo','robos:GitRepository',{'robos:url':'https://github.com/example/catalog.git','robos:defaultBranch':'trunk'}),
  n('console','robos:ConsoleApp',{'robos:repository':ref('repo'),'robos:technology':'Node.js','robos:cliCommand':'catalog inspect'}),
  n('route','robos:WebRoute',{'robos:routePath':'/catalog/:itemId','robos:app':ref('console')}),
  n('item-model','robos:DataModel',{'robos:modelName':'CatalogItem','robos:modelKind':'protobuf-message'}),
  n('broker','robos:MessageBroker',{'robos:brokerType':'NATS','robos:endpoint':'nats://broker.example.invalid:4222'}),
  n('topic','robos:MessageTopic',{'robos:topicName':'catalog.item.updated','robos:broker':ref('broker')}),
  n('team','robos:Team'),
  n('task','robos:Task',{'robos:status':'blocked','robos:assignedTeam':ref('team'),'robos:acceptanceCriteria':'Preserve item revision on import'}),
  n('test-case','oslc_qm:TestCase',{'dcterms:description':'Reject duplicate item identifiers'}),
  n('execution','robos:TestExecutionRecord',{'oslc_qm:executionStatus':'failed','oslc_qm:reportsOnTestCase':ref('test-case')}),
  n('course','robos:ELearning',{'robos:topic':'Catalog operations','robos:modules':[ref('module')],'robos:gitopsFile':'learning/catalog.yaml'}),
  n('module','robos:LearningModule',{'robos:course':ref('course')}),
  n('lesson','robos:LearningLesson',{'robos:module':ref('module'),'robos:estimatedDuration':'15 minutes','dcterms:description':'Practice inspecting recorded item revisions.','robos:documentation':{content:'Step 1: Compare the recorded revision before importing an item.'}}),
  n('snippet','robos:CodeSnippet',{'robos:language':'JavaScript','robos:code':'const itemCount = 0;'}),
  n('review-agent','robos:AgentPersona',{'robos:role':'Catalog reviewer','robos:systemPrompt':'Report unresolved references with their recorded source paths.'}),
  n('build-system','robos:BuildSystem',{'robos:buildTool':'Bazel','robos:configFile':'.bazelrc'}),
  n('configuration','robos:ContextSource',{'robos:sourceType':'file','robos:location':'config/catalog.yaml'}),
  n('declaration','robos:SourceArtifact',{'robos:sourceKind':'protobuf-enum','robos:sourcePath':'proto/catalog.proto','robos:declaredName':'ItemState','robos:inRepository':ref('repo'),'robos:evidence':[{repository:'example/catalog',path:'proto/catalog.proto',line:18,revision:'a'.repeat(40),sha256:'b'.repeat(64)}]}),
  n('decision','robos:ArchitectureDecisionRecord',{'robos:status':'accepted','robos:context':'Catalog readers need stable item identifiers.','robos:decision':'Use immutable item identifiers across imports.','robos:consequences':'Importers must preserve existing identifiers.'}),
  n('service','robos:Microservice',{'robos:repository':ref('repo')}),
  n('endpoint','robos:APIEndpoint',{'robos:pathPattern':'/v1/items','robos:httpMethod':'GET','robos:endpointOf':ref('service')}),
  n('database','robos:Database',{'robos:engine':'postgresql','robos:databaseName':'catalog','robos:host':'db.example.invalid'}),
  n('schema','robos:DatabaseSchema',{'robos:schemaName':'inventory','robos:database':ref('database'),'robos:schemaOf':ref('database')}),
  n('table','robos:DatabaseTable',{'robos:tableName':'items','robos:database':ref('database'),'robos:tableOfSchema':ref('schema')}),
  n('cluster','robos:KubernetesCluster',{'robos:provider':'local','robos:apiEndpoint':'https://cluster.example.invalid','robos:clusterContext':'recorded-context'}),
  n('namespace','robos:KubernetesNamespace',{'robos:namespaceName':'catalog','robos:cluster':ref('cluster')}),
  n('deployment','robos:KubernetesDeployment',{'robos:namespace':ref('namespace'),'robos:image':'example/catalog:recorded','robos:replicas':0}),
  n('pipeline','robos:CICDPipeline',{'robos:platform':'generic-ci','robos:workflowFile':'.ci/build.yaml'}),
  n('stage','robos:PipelineStage',{'robos:stageName':'compile','robos:pipeline':ref('pipeline')}),
  n('feature','robos:Feature',{'robos:scenarios':[{'@id':'urn:groups:scenario','dcterms:title':'Inline revision scenario','robos:steps':['Given a retained revision','Then preserve '+hostile]}]}),
  n('array-tool','robos:MCPTool',{'robos:toolName':'recorded-options','robos:mcpServer':ref('array-server'),'robos:parameters':Array.from({length:43},(_,i)=>`option-${String(i).padStart(2,'0')}`)}),
  n('scenario','robos:Scenario',{'robos:inFeature':ref('feature'),'robos:steps':['Given a recorded catalog','Then items are listed']}),
  n('empty-feature','robos:Feature',{'robos:steps':[],'robos:narrative':'  '}),
  n('unrelated','example:Node',{'robos:transport':'stdio','robos:parameters':{inputSchema:hostile}})
 ];
 const ws=new GraphWorkspace(tmp);ws.apply(ws.propose({document:{...ws.empty('Generic schema group proof'),'robos:nodes':nodes}}));
 const coveredGroups=new Set();
 const captions=[],errors=[],start=Date.now();let app,recordingError='';
 const recorder=spawn('ffmpeg',['-loglevel','error','-y','-f','x11grab','-video_size','1920x1080','-framerate','15','-i',process.env.DISPLAY,'-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8',path.join(proof,'inspector-groups.webm')],{stdio:['pipe','ignore','pipe']});
 recorder.stderr.on('data',b=>recordingError+=b);const done=new Promise(resolve=>recorder.on('close',resolve));
 try{
  app=await electron.launch({executablePath:process.env.ELECTRON_BIN||require('electron'),args:[path.resolve(__dirname,'../../../robos-graph/main.js'),'--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],env:{...process.env,ROBOS_GRAPH_ROOT:tmp,ROBOS_TEST:'1'}});
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.locator('#tab-btn-visual').waitFor();
  // Passively record real IPC calls, forwarding every handler unchanged. No data or runtime mocks.
  await app.evaluate(({ipcMain})=>{
   globalThis.groupProofCalls=[];
   for(const [channel,handler] of ipcMain._invokeHandlers){ipcMain._invokeHandlers.set(channel,(...args)=>{globalThis.groupProofCalls.push(channel);return handler(...args);});}
  });
  const click=async(selector,text)=>{
   const target=page.locator(selector).first();await target.scrollIntoViewIfNeeded();
   captions.push({time:(Date.now()-start)/1000,text});
   await page.evaluate(text=>{let b=document.getElementById('proof-caption');if(!b){b=document.createElement('div');b.id='proof-caption';b.style.cssText='position:fixed;bottom:8px;left:8px;right:8px;background:#163440;color:white;padding:14px;border:2px solid #22d3ee;z-index:999999;pointer-events:none;font:18px sans-serif';document.body.append(b);}b.textContent=text;},text);
   await target.click();await page.waitForTimeout(300);
  };
  const select=async id=>click(`#node-urn_groups_${id}`,`Select the recorded ${id} object.`);
  const group=async id=>{await click(`#tab-btn-group-${id}`,`Open the applicable ${id} properties and recorded relationships.`);await page.locator(`.schema-group-view[data-group="${id}"]`).waitFor();coveredGroups.add(id);};
  const card=id=>`.schema-related-node[data-node-id="urn:groups:${id}"]`;
  const property=(predicate,scope='.schema-group-view')=>page.locator(`${scope} .schema-property[data-predicate="${predicate}"]`).first();
  const assertToolMetadata=async scope=>{
   for(const [predicate,value] of Object.entries(toolMetadata)){
    const field=property(predicate,scope);assert.equal(await field.count(),1,`${predicate} is rendered`);
    if(value && typeof value==='object' && !Array.isArray(value))assert.deepEqual(JSON.parse(await field.locator('pre').textContent()),value,`${predicate} preserves false and zero`);
    else assert.ok((await field.textContent()).includes(Array.isArray(value)?value[0]:value),`${predicate} retains recorded value`);
   }
  };
  const navigate=async id=>click(`${card(id)} > [data-inspect-id="urn:groups:${id}"]`,`Follow the recorded relationship to ${id}.`);
  const caps=await page.evaluate(nodes=>nodes.map(node=>({id:node['@id'],groups:window.RobosInspector.capabilities(node,nodes).groups.map(g=>g.id)})),nodes);
  const groupsFor=id=>caps.find(x=>x.id===`urn:groups:${id}`).groups;
  for(const [id,expected] of [['server','mcp-server'],['tool','mcp-tool'],['resource','mcp-resource'],['prompt','mcp-prompt'],['service','services'],['endpoint','contracts'],['database','database'],['cluster','deployment'],['pipeline','pipeline'],['feature','bdd']]) assert.ok(groupsFor(id).includes(expected),`${id} exposes ${expected} through capabilities.groups`);
  assert.deepEqual(groupsFor('empty-feature'),[]);assert.deepEqual(groupsFor('unrelated'),[]);
  await select('server');await group('mcp-server');
  for(const id of ['tool','resource','prompt'])assert.equal(await page.locator(card(id)).count(),1,`one card per child ${id}, regardless of reference direction or predicate`);
  const toolContext=await page.locator(`${card('tool')} .schema-relation-context`).textContent();
  assert.match(toolContext,/Outgoing: robos:tools/);
  assert.match(toolContext,/Incoming: robos:toolOfServer/);
  assert.match(toolContext,/Incoming: robos:mcpServer/);
  assert.deepEqual((await page.locator('.schema-relation-group > h3').allTextContents()).sort(),['Actions / tools (1)','Prompts (1)','Resources (1)']);
  assert.match(await property('robos:parameters',card('tool')).textContent(),/inputSchema.*onerror/s);
  await assertToolMetadata(card('tool'));
  assert.equal(await page.locator('.schema-group-view img, .schema-group-view script').count(),0);
  assert.match(await property('robos:uriTemplate',card('resource')).textContent(),/catalog:\/\/items/);
  assert.match(await property('robos:promptName',card('prompt')).textContent(),/summarize-catalog/);
  assert.match(await page.locator('.schema-group-view').textContent(),/robos:toolOfServer/);
  await page.screenshot({path:path.join(proof,'01-mcp-inverse.png')});
  await navigate('tool');await group('mcp-tool');assert.match(await property('robos:parameters').textContent(),/onerror/);
  await assertToolMetadata('.schema-group-view');
  assert.equal(await page.locator('.schema-group-view img, .schema-group-view script').count(),0);
  await property('robos:inputSchema').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(proof,'05-direct-tool-schemas.png')});
  await select('server');await group('mcp-server');
  await click(`${card('tool')} button:has-text("Source Evidence")`,'Inspect the tool’s recorded source evidence without running the tool.');
  assert.match(await page.locator('#tab-btn-evidence').getAttribute('class'),/active/);assert.match(await page.locator('#inspector-content').textContent(),/tools\/search.json/);
  for(const [id,g,p,value] of [['resource','mcp-resource','robos:uriTemplate','catalog://'],['prompt','mcp-prompt','robos:promptName','summarize-catalog']]){
   await select('server');await group('mcp-server');await navigate(id);await group(g);assert.ok((await property(p).textContent()).includes(value));
  }
  assert.ok(groupsFor('content-server').includes('mcp-server'));
  await select('content-server');await group('mcp-server');
  assert.deepEqual((await page.locator('.schema-relation-group > h3').allTextContents()).sort(),['Prompts (1)','Resources (1)']);
  assert.equal(await page.locator('.schema-related-node').count(),2);
  assert.equal(await property('robos:tools').count(),0);assert.equal(await property('robos:toolsProvided').count(),0);
  assert.deepEqual(JSON.parse(await property('robos:annotations',card('content-resource')).locator('pre').textContent()),{priority:0});
  await page.screenshot({path:path.join(proof,'06-resources-prompts-only.png')});
  await select('large-server');await group('mcp-server');
  assert.deepEqual(await page.locator('.schema-relation-group > h3').allTextContents(),['Actions / tools (43)']);
  assert.equal(await page.locator('.schema-related-node').count(),40);
  assert.equal(await page.locator(card('paged-tool-42')).count(),0);
  await click('.schema-relation-group button:has-text("Show more")','Show the remaining three recorded actions; no action is executed.');
  const pagedIds=await page.locator('.schema-related-node').evaluateAll(cards=>cards.map(card=>card.dataset.nodeId));
  assert.equal(pagedIds.length,43);assert.equal(new Set(pagedIds).size,43);
  assert.equal(await page.locator('.schema-relation-group button:has-text("Show more")').count(),0);
  await page.screenshot({path:path.join(proof,'07-expanded-actions.png')});
  await navigate('paged-tool-42');await group('mcp-tool');assert.match(await property('robos:toolName').textContent(),/recorded-action-42/);
  await select('service');await group('services');assert.match(await property('robos:pathPattern',card('endpoint')).textContent(),/\/v1\/items/);
  await navigate('endpoint');await group('contracts');assert.match(await property('robos:httpMethod').textContent(),/GET/);
  await select('database');await group('database');await navigate('schema');await group('database');
  assert.match(await property('robos:tableName',card('table')).textContent(),/items/);await navigate('table');await group('database');assert.match(await property('robos:tableName').textContent(),/items/);
  await page.screenshot({path:path.join(proof,'02-database.png')});
  await select('cluster');await group('deployment');await navigate('namespace');await group('deployment');
  assert.match(await property('robos:image',card('deployment')).textContent(),/example\/catalog:recorded/);await navigate('deployment');await group('deployment');assert.match(await property('robos:replicas').textContent(),/0/);
  await select('pipeline');await group('pipeline');assert.match(await property('robos:stageName',card('stage')).textContent(),/compile/);await navigate('stage');await group('pipeline');
  await select('feature');await group('bdd');assert.match(await property('robos:steps',card('scenario')).textContent(),/Given a recorded catalog/);await navigate('scenario');await group('bdd');
  await page.screenshot({path:path.join(proof,'03-bdd.png')});
  // Hand-authored examples: expected fields and values describe real domain records,
  // independent of the catalog. The catalog is used only for the final completeness check.
  const examples=[
   ['console','application','robos:technology','Technology','Node.js'],
   ['route','routes-cli','robos:routePath','Route Path','/catalog/:itemId'],
   ['item-model','data-model','robos:modelName','Model Name','CatalogItem'],
   ['broker','messaging','robos:brokerType','Broker Type','NATS'],
   ['repo','source-control','robos:defaultBranch','Default Branch','trunk'],
   ['task','work-items','robos:status','Status','blocked'],
   ['team','organization','robos:status','Status','blocked',card('task')],
   ['execution','testing','oslc_qm:executionStatus','Execution Status','failed'],
   ['lesson','learning','robos:estimatedDuration','Estimated Duration','15 minutes'],
   ['snippet','documentation','robos:code','Code','const itemCount = 0;'],
   ['review-agent','agent','robos:systemPrompt','System Prompt','Report unresolved references with their recorded source paths.'],
   ['build-system','build','robos:buildTool','Build Tool','Bazel'],
   ['configuration','configuration','robos:location','Location','config/catalog.yaml'],
   ['declaration','source','robos:sourceKind','Source Kind','protobuf-enum'],
   ['decision','decisions','robos:decision','Decision','Use immutable item identifiers across imports.']
  ];
  for(const [id,g,p,label,value,scope='.schema-group-view'] of examples){
   await select(id);await group(g);
   const field=property(p,scope);
   assert.equal((await field.locator('dt').textContent()).toLowerCase(),label.toLowerCase(),`${g} has a meaningful field label`);
   assert.ok((await field.locator('dd').textContent()).includes(value),`${g} renders the recorded value ${value}`);
   if(g==='source-control')assert.equal(await property('robos:url').locator('a').getAttribute('href'),'https://github.com/example/catalog.git');
   if(g==='organization'){
    assert.equal(await page.locator(card('task')).count(),1);
    assert.match(await page.locator(`${card('task')} .schema-relation-context`).textContent(),/Incoming: robos:assignedTeam/);
    await navigate('task');await group('work-items');assert.match(await property('robos:status').textContent(),/blocked/);
   }
   if(g==='testing')assert.doesNotMatch(await page.locator('.schema-group-view').textContent(),/PASS|100%|VERIFIED|SUCCESS/);
   if(g==='learning'){
    assert.match(await page.locator('.schema-description').first().textContent(),/Practice inspecting recorded item revisions/);
    await click('#tab-btn-documentation','Read the lesson’s recorded instructions; no generated lesson is substituted.');
    assert.match(await page.locator('#inspector-content').textContent(),/Step 1: Compare the recorded revision before importing an item/);
   }
   if(g==='messaging')assert.match(await property('robos:topicName',card('topic')).textContent(),/catalog.item.updated/);
   if(g==='decisions'){
    assert.match(await property('robos:context').textContent(),/Catalog readers need stable item identifiers/);
    assert.match(await property('robos:consequences').textContent(),/Importers must preserve existing identifiers/);
   }
  }
  await page.screenshot({path:path.join(proof,'08-recorded-decision.png')});
  assert.deepEqual([...coveredGroups].sort(),GROUPS.map(g=>g.id).sort(),'every catalog group was opened and checked against a concrete recorded example');
  await select('array-tool');await group('mcp-tool');
  const values=property('robos:parameters');
  assert.equal(await values.locator('dd > .schema-value > ul > li').count(),40);
  assert.doesNotMatch(await values.textContent(),/option-42/);
  await click('.schema-property[data-predicate="robos:parameters"] .schema-array-more','Expand all 43 recorded parameter values.');
  assert.deepEqual(await values.locator('dd > .schema-value > ul > li').allTextContents(),Array.from({length:43},(_,i)=>`option-${String(i).padStart(2,'0')}`));
  assert.equal(await values.locator('.schema-array-more').count(),0);
  await select('feature');await group('bdd');
  const inline=property('robos:scenarios');
  assert.match(await inline.textContent(),/Inline revision scenario/);
  assert.match(await inline.locator('.schema-property[data-predicate="robos:steps"]').textContent(),/Given a retained revision/);
  assert.equal(await inline.locator('img, script').count(),0);
  assert.equal(await inline.locator('[data-inspect-id="urn:groups:scenario"]').count(),1,'reference retains navigation to the existing scenario');
  assert.match(await inline.locator('.schema-property[data-predicate="dcterms:title"]').textContent(),/Inline revision scenario/);
  assert.match(await inline.locator('.schema-property[data-predicate="robos:steps"]').textContent(),/onerror/);
  await click('.schema-property[data-predicate="robos:scenarios"] [data-inspect-id="urn:groups:scenario"]','Open the referenced scenario while keeping inline metadata distinct.');
  await group('bdd');assert.match(await property('robos:steps').textContent(),/Given a recorded catalog/);
  assert.doesNotMatch(await property('robos:steps').textContent(),/Given a retained revision/);
  const tabOrder=()=>page.locator('.inspector-tabs .tab-btn:visible').evaluateAll(tabs=>tabs.map(tab=>tab.id));
  await select('console');await group('application');const firstOrder=await tabOrder();
  await select('route');await group('routes-cli');await select('console');
  assert.deepEqual(await tabOrder(),firstOrder,'same object has stable tab order after a different predecessor');
  assert.match(await page.locator('#tab-btn-group-routes-cli').getAttribute('class'),/active/);
  assert.deepEqual(firstOrder.filter(id=>id.startsWith('tab-btn-group-')),['tab-btn-group-application','tab-btn-group-routes-cli']);
  await select('empty-feature');assert.match(await page.locator('#tab-btn-visual').getAttribute('class'),/active/);
  for(const id of ['empty-feature','unrelated']){
   await select(id);assert.equal(await page.locator('[id^="tab-btn-group-"]:visible').count(),0);
   assert.deepEqual(await page.locator('.inspector-tabs .tab-btn:visible').allTextContents(),['Overview','Query & Paths','JSON-LD']);
  }
  await page.screenshot({path:path.join(proof,'04-empty-fallback.png')});
  assert.equal(await page.evaluate(()=>window.groupsPwned),undefined);assert.deepEqual(errors,[]);
  const calls=await app.evaluate(()=>globalThis.groupProofCalls);
  const readOnly=new Set(['graph-get-all','graph-get-relations','graph-get-node','graph-query','graph-find-dependents','graph-get-impact']);
  assert.deepEqual(calls.filter(channel=>!readOnly.has(channel)),[],'group navigation invokes only graph reads, never runtime or mutation IPC');
  fs.writeFileSync(path.join(proof,'result.json'),JSON.stringify({passed:true,errors,calls,captions,coveredGroupIds:[...coveredGroups].sort(),capabilities:caps},null,2));
 }finally{
  if(app)await app.close();recorder.stdin.write('q');await done;
  const stamp=s=>new Date(Math.floor(s*1000)).toISOString().slice(11,23);
  fs.writeFileSync(path.join(proof,'inspector-groups.vtt'),'WEBVTT\n\n'+captions.map((c,i)=>`${i+1}\n${stamp(c.time)} --> ${stamp(captions[i+1]?.time||(Date.now()-start)/1000)}\n${c.text}\n`).join('\n'));
 }
 assert.equal(recorder.exitCode,0,recordingError);
 assert.ok(fs.statSync(path.join(proof,'inspector-groups.webm')).size>1000);
});

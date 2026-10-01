'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DemoSession,validateProcess}=require('../../../pr-review/lib/demo-session');
function session(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'demo-session-test-'));const file=path.join(dir,'process.json');fs.writeFileSync(file,JSON.stringify({instructions:'Use local dev mode and Chrome DevTools MCP',checkpoints:[{title:'One',given:'Ready',when:'Open',then:'Visible'},{title:'Two',given:'Open',when:'Click',then:'Changed'}]}));return new DemoSession({workspace:dir,processFile:file},run);}
test('start pauses at one checkpoint; only Next advances',async()=>{const prompts=[];const s=session(async p=>{prompts.push(p);return {reply:'Observed',checkpointReached:true};});await s.act('start');assert.equal(s.index,0);assert.equal(s.status,'paused');await s.act('explain');assert.equal(s.index,0);assert.match(prompts[1],/Do not edit code or move the browser/);await s.act('message','Make the label shorter');assert.equal(s.index,0);assert.match(prompts[2],/Make the label shorter/);await s.act('next');assert.equal(s.index,1);await assert.rejects(s.act('next'),/final checkpoint/);});
test('failed assertion does not advance and Retry targets failed checkpoint',async()=>{let pass=true;const s=session(async()=>({reply:'result',checkpointReached:pass}));await s.act('start');pass=false;await s.act('next');assert.equal(s.index,0);assert.equal(s.status,'error');await assert.rejects(s.act('next'),/Reach/);pass=true;await s.act('retry');assert.equal(s.index,1);});
test('startup failure can be retried without skipping first checkpoint',async()=>{let fail=true;const s=session(async()=>{if(fail)throw Error('Chrome unavailable');return {reply:'ready',checkpointReached:true};});await s.act('start');assert.equal(s.index,-1);assert.equal(s.status,'error');fail=false;await s.act('retry');assert.equal(s.index,0);});
test('concurrent actions and process edits are refused',async()=>{let release;const s=session(()=>new Promise(r=>release=r));const run=s.act('start');await assert.rejects(s.act('next'),/already working/);assert.throws(()=>s.saveProcess(s.process),/Wait/);release({reply:'Ready',checkpointReached:true});await run;});
test('process customization validates and resets state, persists to disk',async()=>{const s=session(async()=>({reply:'Ready',checkpointReached:true}));await s.act('start');assert.throws(()=>s.saveProcess({instructions:'bad',checkpoints:[]}),/at least one/);s.saveProcess({...s.process,instructions:'Different flow'});assert.equal(s.index,-1);assert.equal(s.status,'idle');assert.equal(JSON.parse(fs.readFileSync(s.processFile)).instructions,'Different flow');});
test('malformed agent results never claim checkpoint readiness',async()=>{const s=session(async()=>({reply:'all good'}));await s.act('start');assert.equal(s.status,'error');assert.equal(s.index,-1);});
test('empty messages and unknown actions are rejected',async()=>{const s=session(async()=>({reply:'ready',checkpointReached:true}));await s.act('start');await assert.rejects(s.act('message',' '),/Enter a message/);await assert.rejects(s.act('merge'),/Unknown/);});
test('checkpoint schema requires intentions and expected outcomes',()=>{assert.throws(()=>validateProcess({instructions:'demo',checkpoints:[{title:'x'}]}),/given/);});
test('agent executable receives structured-output paths and returns a real process result',async()=>{
 const s=session();s.agent={command:process.execPath,args:['-e',`const fs=require('node:fs');const a=process.argv;const out=a[a.indexOf('--output-last-message')+1];let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>fs.writeFileSync(out,JSON.stringify({reply:input.includes('Checkpoint 1/2')?'context received':'missing',checkpointReached:true})));`,'--'],timeoutMs:2000};
 await s.act('start');assert.equal(s.status,'paused');assert.equal(s.messages.at(-1).text,'context received');
});
test('timeout cannot advance progress',async()=>{const s=session();s.agent={command:process.execPath,args:['-e','setInterval(()=>{},1000)','--'],timeoutMs:30};await s.act('start');assert.equal(s.index,-1);assert.equal(s.status,'error');assert.match(s.messages.at(-1).text,/timed out/);});
test('missing executable is reported without becoming a ready checkpoint',async()=>{const s=session();s.agent={command:'/nonexistent/robos-test-agent',args:[],timeoutMs:1000};await s.act('start');assert.equal(s.status,'error');assert.equal(s.index,-1);});
test('Start over reruns checkpoint one, preserves chat/code context and process',async()=>{
 const prompts=[];const s=session(async p=>{prompts.push(p);return {reply:'Verified',checkpointReached:true};});
 await s.act('start');await s.act('message','Keep the new label');await s.act('next');
 const processBefore=JSON.stringify(s.process);await s.act('restart');
 assert.equal(s.index,0);assert.equal(s.status,'paused');assert.equal(s.failedIndex,0);
 assert.equal(JSON.stringify(s.process),processBefore);assert.ok(s.messages.some(m=>m.text==='Keep the new label'));
 assert.match(prompts.at(-1),/Re-establish the initial app\/browser state/);assert.match(prompts.at(-1),/do not undo code edits/);
 await s.act('next');assert.equal(s.index,1);
});
test('failed restart does not retain old completion; Retry returns to first checkpoint',async()=>{
 let pass=true;const s=session(async()=>({reply:'Result',checkpointReached:pass}));await s.act('start');await s.act('next');
 pass=false;await s.act('restart');assert.equal(s.index,-1);assert.equal(s.status,'error');
 pass=true;await s.act('retry');assert.equal(s.index,0);
});
test('Start over cannot race an active agent action',async()=>{
 let finish;const s=session(()=>new Promise(r=>finish=r));const pending=s.act('start');
 await assert.rejects(s.act('restart'),/already working/);finish({reply:'Ready',checkpointReached:true});await pending;
});

test('optional before walkthrough has independent progress and conversational guidance',async()=>{
 const prompts=[];const s=session(async p=>{prompts.push(p);return {reply:'Observed',guidance:'Try the old filters, then choose Next checkpoint.',checkpointReached:true};});
 await assert.rejects(s.act('before'),/No before-change/);
 s.process.before={instructions:'Read-only baseline',checkpoints:s.process.checkpoints};
 s.baseline={workspace:'/tmp/baseline-test',ref:'origin/main',revision:'1234567890'};
 await s.act('before');assert.equal(s.state().mode,'before');assert.equal(s.index,0);
 assert.match(prompts.at(-1),/Workspace: \/tmp\/baseline-test/);assert.match(prompts.at(-1),/showDemoCallout/);
 assert.equal(s.state().guidance,'Try the old filters, then choose Next checkpoint.');
 await s.act('next');assert.equal(s.index,1);await s.act('restart');assert.equal(s.index,0);assert.equal(s.mode,'before');
 await s.act('feature');assert.equal(s.index,0);assert.equal(s.mode,'feature');assert.equal(s.state().baseline,null);
});
test('baseline checkout pins main without touching dirty feature files',()=>{
 const {execFileSync}=require('node:child_process');const {prepareBaseline}=require('../../../pr-review/lib/demo-baseline');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'baseline-test-'));
 const git=args=>execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','-b','main']);git(['config','user.email','test@example.test']);git(['config','user.name','Test']);
 fs.writeFileSync(path.join(dir,'app.txt'),'main');git(['add','app.txt']);git(['commit','-m','baseline']);const sha=git(['rev-parse','HEAD']);
 git(['switch','-c','feature']);fs.writeFileSync(path.join(dir,'app.txt'),'unsaved feature');
 const baseline=prepareBaseline(dir,'main');assert.equal(baseline.revision,sha);assert.equal(fs.readFileSync(path.join(baseline.workspace,'app.txt'),'utf8'),'main');
 assert.equal(git(['branch','--show-current']),'feature');assert.equal(fs.readFileSync(path.join(dir,'app.txt'),'utf8'),'unsaved feature');
 assert.throws(()=>prepareBaseline(dir,'--bad'),/Invalid baseline ref/);
});
test('public progress streams while busy without leaking tool payloads or advancing checkpoints',async()=>{
 let finish;const s=session(()=>new Promise(r=>finish=r));const run=s.act('start');
 assert.ok(s.startedAt);assert.match(s.state().progress[0].text,/Preparing One/);
 s.handleAgentEvent({type:'item.completed',item:{type:'agent_message',text:'Checking whether the saved compact view is visible.'}});
 assert.match(s.state().progress.at(-1).text,/saved compact/);
 s.handleAgentEvent({type:'item.started',item:{type:'mcp_tool_call',tool:'take_snapshot',arguments:{token:'SECRET'}}});
 assert.match(s.state().progress.at(-1).text,/Inspecting the page/);
 s.handleAgentEvent({type:'item.completed',item:{type:'reasoning',text:'PRIVATE'}});
 s.handleAgentEvent({type:'item.completed',item:{type:'agent_message',text:'{"reply":"final"}'}});
 s.handleAgentEvent({type:'item.started',item:{type:'command_execution',command:'echo SECRET'}});
 assert.doesNotMatch(JSON.stringify(s.progress),/SECRET|PRIVATE|final/);assert.equal(s.index,-1);
 for(let i=0;i<10;i++)s.reportProgress('Update '+i);assert.equal(s.progress.length,6);
 finish({reply:'Ready',checkpointReached:true});await run;const count=s.progress.length;s.reportProgress('late');assert.equal(s.progress.length,count);
});

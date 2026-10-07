'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {EvidenceRunner,validateResult}=require('../../../pr-review/lib/evidence-runner');
test('refreshed implementation evidence replaces cached results and rejects stale proof',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'proof-refresh-'));
 const template=require('../../../robos-lib/evidence-templates').BUILTIN[3];
 const file=path.join(dir,'bundle.json'),artifact=path.join(dir,'actual.txt');
 fs.writeFileSync(artifact,'actual response');
 function write(revision,summary){
  const result={summary,questions:[],scenarios:[{id:'a',status:'passed',summary,artifacts:['actual.txt']}],templateArtifacts:[{scenarioId:'a',slotId:'result',path:'actual.txt'}]};
  const artifacts=validateResult(result,dir,revision);
  fs.writeFileSync(file,JSON.stringify({...result,...require('../../../robos-lib/evidence-bundle').bindTemplate(template,result,artifacts,dir),'@type':'robos:EvidenceBundle','robos:evidenceTemplate':template['@id'],revision,artifacts,status:'completed'}));
 }
 write('before','Earlier response');
 const review={head:'before',evidenceBundlePath:file};
 const runner=new EvidenceRunner(review,{directory:dir});
 write('after','New response');review.head='after';
 let emitted;runner.on('state',state=>emitted=state);
 runner.refreshBundle();
 assert.equal(emitted.summary,'New response');assert.equal(emitted.scenarios[0].status,'passed');
 review.head='newer';runner.refreshBundle();
 assert.equal(emitted.scenarios[0].status,'blocked');assert.match(emitted.scenarios[0].summary,/earlier revision/);
});
test('passed evidence must exist within this run, including symlink checks',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'proof-check-'));fs.writeFileSync(path.join(root,'call.json'),'{}');
 const r={summary:'done',scenarios:[{id:'146',status:'passed',artifacts:['call.json']}]};assert.equal(validateResult(r,root,'head')[0].verified,true);
 r.scenarios[0].artifacts=[];assert.throws(()=>validateResult(r,root,'head'),/without captured/);
 r.scenarios[0].artifacts=['missing'];assert.throws(()=>validateResult(r,root,'head'));
 fs.symlinkSync('/etc/hosts',path.join(root,'outside'));r.scenarios[0].artifacts=['outside'];assert.throws(()=>validateResult(r,root,'head'),/outside/);
});
test('runner executes a real child, registers captured files, streams progress and blocks omitted scenarios',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'proof-run-'));execFileSync('git',['init','-q',dir]);execFileSync('git',['-C',dir,'-c','user.name=Test','-c','user.email=test@example.test','commit','--allow-empty','-qm','baseline']);
 const script=path.join(dir,'agent');fs.writeFileSync(script,`#!/usr/bin/env node
const fs=require('fs'),path=require('path');const out=process.argv[process.argv.indexOf('--output-last-message')+1];process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Calling the local MCP server.'}}));fs.writeFileSync(path.join(path.dirname(out),'actual.txt'),'actual test child output');fs.writeFileSync(out,JSON.stringify({summary:'146 checked; 147 unavailable',questions:[],templateArtifacts:[{scenarioId:'146',slotId:'result',path:'actual.txt'}],scenarios:[{id:'146',status:'passed',summary:'Observed response',artifacts:['actual.txt']}]}));});`,{mode:0o700});
 const runner=new EvidenceRunner({workspace:dir,demoAgent:{command:script,args:['exec'],evidenceTimeoutMs:2000}},{directory:dir});
 const finished=new Promise(resolve=>runner.on('state',s=>{if(s.status!=='running')resolve(s);}));runner.start({template:require('../../../robos-lib/evidence-templates').BUILTIN[3],markdown:'Cache trend checks',scenarios:[{id:'146',title:'Cache trend drill-down'},{id:'147',title:'Comparable builds'}]});assert.throws(()=>runner.start({markdown:'146'}),/already/);const s=await finished;
 assert.equal(s.template['dcterms:title'],'Task checks and artifacts');assert.equal(s.templateBindings[0].slotId,'result');assert.equal(s['@type'],'robos:EvidenceBundle');
 assert.equal(s.status,'needs-attention');assert.equal(s.scenarios[0].title,'Cache trend drill-down');assert.equal(s.scenarios[1].title,'Comparable builds');assert.match(s.artifacts[0].label,/Cache trend drill-down/);assert.equal(s.scenarios[1].status,'blocked');assert.match(s.progress[0].text,/Calling/);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'evidence','index.json'))).evidence.length,1);
});

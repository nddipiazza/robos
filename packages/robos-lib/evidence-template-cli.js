#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const templates=require('./evidence-templates');
function run(args){
 const command=args.shift(),flags={};while(args.length){const key=args.shift();if(!key.startsWith('--')||!args.length)throw Error('Use --name value arguments.');flags[key.slice(2)]=args.shift();}
 const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
 let value;
 if(command==='list')value=templates.listTemplates(flags['graph-root']);
 else if(command==='register')value=templates.registerTemplate(read(flags.file),flags['graph-root']);
 else if(command==='select'){
  value=templates.listTemplates(flags['graph-root']).find(t=>t['@id']===flags.template);if(!value)throw Error('Unknown evidence template. Register it first.');
 }else if(command==='collect'){
  const template=templates.readTemplate(flags.template),result=read(flags.result),root=path.dirname(path.resolve(flags.result));
  const revision=execFileSync('git',['-C',flags.workspace||process.cwd(),'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const artifacts=require('./evidence-runner').validateResult(result,root,revision);
  const rendered=require('./evidence-bundle').bindTemplate(template,result,artifacts,root);
  for(const artifact of artifacts){artifact.status=result.scenarios.find(s=>s.id===artifact.scenarioId).status;artifact.verified=artifact.status==='passed';}
  value={...result,...rendered,'@id':'urn:robos:evidence-bundle:'+randomUUID(),'@type':'robos:EvidenceBundle','robos:evidenceTemplate':template['@id'],'robos:revision':revision,'robos:resultPath':path.resolve(flags.output||'bundle.json'),revision,artifacts,status:result.scenarios.every(s=>s.status==='passed')?'completed':'needs-attention',origin:'task-implementation',finishedAt:new Date().toISOString(),progress:[]};
 }else if(command==='refresh'){
  const revision=execFileSync('git',['-C',flags.workspace||process.cwd(),'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  value=require('./evidence-bundle').readBundle(flags.bundle,revision);
  value={...value,regeneratedAt:new Date().toISOString(),regeneration:{kind:'presentation-only',sourceBundle:path.resolve(flags.bundle),note:'Existing captures revalidated; tests were not rerun.'}};
 }else throw Error('Commands: list, select --template ID --output FILE, register --file FILE, collect --template FILE --result FILE --workspace DIR --output FILE; refresh --bundle FILE --workspace DIR --output FILE');
 if(flags.output){fs.mkdirSync(path.dirname(path.resolve(flags.output)),{recursive:true});fs.writeFileSync(flags.output,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
 else console.log(JSON.stringify(value,null,2));return value;
}
if(require.main===module)try{run(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={run};

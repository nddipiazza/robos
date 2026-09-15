'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const manage=require('./work-item-management'),learning=require('./feature-learning'),{GraphWorkspace}=require('../../robos-graph/lib/graph-workspace');const sign=require('../../robos-agent-client/work-task/required-signoff');
test('required signer and current PR approval cannot be substituted',()=>{const r={name:'Tim Potter',githubLogin:'thelabdude',scope:'both'};assert.throws(()=>sign.assertPlanSigner(r,'other'),/required/);sign.assertPlanSigner(r,'TheLabDude');assert.throws(()=>sign.assertPlanCertificate({planApproval:{}},r),/requires/);const reviews=[{author:{login:'thelabdude'},state:'APPROVED',commit:{oid:'head'},submittedAt:'2026-09-15'}];sign.assertPR(r,reviews,'head');assert.throws(()=>sign.assertPR(r,reviews,'new-head'),/current commit/);assert.throws(()=>sign.assertPR(r,[...reviews,{author:{login:'thelabdude'},state:'CHANGES_REQUESTED',submittedAt:'2026-09-16'}],'head'),/required/);});
test('delete is scoped with recovery; project and path traversal are rejected',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'robos-delete-'));fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify({id:'task',kind:'task',name:'Task'}));fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify({id:'project',kind:'project'}));const r=manage.remove(dir,'task');assert.equal(fs.existsSync(path.join(dir,'task.json')),false);assert.equal(JSON.parse(fs.readFileSync(r.backup)).record.id,'task');assert.throws(()=>manage.remove(dir,'../other'),/Invalid/);assert.throws(()=>manage.remove(dir,'project'),/projects/);});
test('learning generates lessons, preserves source metadata, and reuses the current generator version',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'robos-learning-')),record={id:'feature-test',kind:'feature',name:'Test feature',workTaskUrl:'https://github.com/example/repo/issues/1'},plan='## Inspection limits\nGitHub returned 404.\n## Workflow\nValidate before saving.';
 assert.throws(()=>learning.build(record,''),/save/);
 let calls=0;const generate=async source=>{calls++;assert.equal(source['robos:sourcePlan'],plan);assert.deepEqual(source['robos:modules'],[]);return [{title:'Why validate?',markdown:'Validation catches mistakes before a configuration is saved.'}];};
 const first=await learning.create(record,plan,root,{generate});assert.equal(first.reused,false);assert.equal(first.course['robos:sourcePlan'],plan);assert(!JSON.stringify(first.course['robos:modules']).includes('404'));
 assert.equal((await learning.create(record,plan,root,{generate})).reused,true);assert.equal(calls,1);
 assert.equal(new GraphWorkspace(root).read()['robos:nodes'].length,1);
});
test('generation errors and audit-shaped output do not save a course',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'robos-learning-')),record={id:'feature-test',kind:'feature',name:'Test feature'};
 await assert.rejects(learning.create(record,'A plan',root,{generate:async()=>{throw Error('Provider unavailable');}}),/Provider unavailable/);
 await assert.rejects(learning.create(record,'A plan',root,{generate:async()=>[{title:'Verified source status',markdown:'All inspected sources.'}]}),/source audit/);
 assert.equal(new GraphWorkspace(root).read()['robos:nodes'].length,0);
});
test('concurrent creation shares generation and upgrades a legacy course only after success',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'robos-learning-')),record={id:'legacy',kind:'feature',name:'Legacy'},plan='## Inspection limits\nOld plan notes';
 const graph=new GraphWorkspace(root),legacy=learning.build(record,plan,[{title:'Old heading',markdown:'Old plan notes'}]);
 const proposal=graph.propose({mode:'refine',edits:[{op:'add',node:legacy}],prompt:'Fixture',requireEvidence:true});graph.apply(proposal,{expectedProposalId:proposal.id});
 await assert.rejects(learning.create(record,plan,root,{generate:async()=>{throw Error('offline');}}),/offline/);
 assert.equal(graph.read()['robos:nodes'][0]['robos:modules'][0].title,'Old heading');
 let finish,calls=0;const generate=()=>{calls++;return new Promise(r=>finish=r);};
 const a=learning.create(record,plan,root,{generate}),b=learning.create(record,plan,root,{generate});
 finish([{title:'Learn the workflow',markdown:'Start with a draft, validate it, then save.'}]);
 const results=await Promise.all([a,b]);assert.equal(calls,1);assert.equal(results[0].course['robos:generatorVersion'],learning.GENERATOR_VERSION);assert.equal(results[1].course['@id'],legacy['@id']);
});
test('required reviewer metadata remains explicit without an audit section',()=>{
 const modules=learning.includeRequiredReviewer([{title:'Delivery',markdown:'Review the operator journey.'}],{requiredSignoff:{name:'Tim Potter',scope:'both'}});
 assert.match(modules[0].markdown,/Tim Potter must sign off on the plan and pull request/);
});

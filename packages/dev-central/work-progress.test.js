'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {progress,ticketWorkflow}=require('./work-progress');
test('opening task runner is visible before starting an agent',()=>{
  const p=progress({phase:'new',workOpenedAt:'2026-09-15T00:00:00Z'});
  assert.equal(p.started,true);assert.equal(p.running,false);assert.equal(p.label,'Task Runner opened');
});
test('running and interrupted workers are distinguished without changing saved state',()=>{
  const s={workerPid:123,phase:'implementing'};
  assert.equal(progress(s,()=>true).running,true);
  assert.equal(progress(s,()=>false).label,'Agent interrupted');
  assert.equal(s.phase,'implementing');
});
test('review stays awaiting human review and highlights the correct stage',()=>{
  const p=progress({phase:'review',plan:'approved',workerPid:null});
  assert.equal(p.label,'Awaiting PR review');assert.equal(p.running,false);
  assert.deepEqual(p.stages.filter(s=>s.current).map(s=>s.id),['review']);
});
test('resolves the server ticket type workflow and current label',()=>{
  const server={workflows:[{name:'Feature workflow',type_id:'feature-request',states:[{id:'open',label:'Open',is_initial:true},{id:'design',label:'Design'}]}]};
  const w=ticketWorkflow({labels:[{name:'type:feature'},{name:'state:design'}]},server);
  assert.equal(w.name,'Feature workflow');assert.deepEqual(w.states.filter(s=>s.current).map(s=>s.id),['design']);
  assert.equal(ticketWorkflow({labels:['bug']},server),null);
  assert.equal(ticketWorkflow({labels:['type:feature']}),null);
  assert.equal(ticketWorkflow({labels:['feature','open','state:design']},server).ambiguous,true);
});
test('native type wins over a conflicting legacy label and saved phase selects configured state',()=>{
 const server={workflows:[{type_id:'feature',name:'Feature',states:[{id:'open',is_initial:true},{id:'review-plan',agent_phases:['plan-review']},{id:'done',is_final:true}]},{type_id:'bug',states:[]}]};
 const item={issueType:'Feature',labels:['bug'],state:'OPEN',session:{phase:'plan-review'}};
 assert.equal(ticketWorkflow(item,server).typeId,'feature');assert.equal(ticketWorkflow(item,server).states.find(s=>s.current).id,'review-plan');
 assert.equal(ticketWorkflow({...item,state:'CLOSED'},server).states.find(s=>s.current).id,'done');
});

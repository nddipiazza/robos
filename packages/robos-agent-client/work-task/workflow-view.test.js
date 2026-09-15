'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{view}=require('./workflow-view');
const url='https://github.com/example/issues/issues/3';
const server={name:'Example',type:'github',repos:[{org:'example',repo:'issues'}],issue_types:[{id:'feature',label:'Feature'}],workflows:[{type_id:'feature',name:'Feature delivery',states:[{id:'open',label:'Triage',is_initial:true},{id:'plan',label:'Design review',agent_phases:['plan-review']},{id:'work',label:'Deliver child tasks',agent_phases:['implementing']},{id:'done',label:'Delivered',is_final:true}],transitions:[{from:'plan',to:'work'}]}]};
test('uses issue type workflow names and configured phase mappings',()=>{const r=view({url,phase:'plan-review'},{type:{name:'Feature'},state:'open',labels:[]},{task_servers:[server]});assert.equal(r.issueType,'Epic');assert.equal(r.workflow.name,'Epic delivery');assert.equal(r.currentStage,'Design review');assert.deepEqual(r.nextStages,['Deliver child tasks']);});
test('preparing an approved implementation stays in its implementation stage',()=>{const r=view({url,phase:'provisioning',approvedPlanHash:'approved'},{type:{name:'Feature'},state:'open'},{task_servers:[server]});assert.equal(r.currentStage,'Deliver child tasks');});
test('unknown issue types do not get a made-up task workflow',()=>{const r=view({url,phase:'plan-review'},{type:{name:'Bug'},state:'open'},{task_servers:[server]});assert.equal(r.issueType,'Bug');assert.equal(r.workflow,null);});
test('closed tickets use the configured final stage',()=>{const r=view({url,phase:'merged'},{type:{name:'Feature'},state:'closed'},{task_servers:[server]});assert.equal(r.currentStage,'Delivered');});
test('live and failed runs retain the error on the stage where it occurred',()=>{
 const issue={type:{name:'Feature'},state:'open'},settings={task_servers:[server]};
 const state={url,phase:'plan-review',executionError:{text:'Slack login required',phase:'plan-review'}};
 assert.equal(view(state,issue,settings).error,'Slack login required');
 const failed=view({...state,phase:'failed',approvedPlanHash:'approved'},issue,settings);
 assert.equal(failed.currentStage,'Design review');assert.equal(failed.error,'Slack login required');
 const retry=view({...state,phase:'provisioning',executionError:null,error:null,approvedPlanHash:'approved'},issue,settings);
 assert.equal(retry.error,null);assert.equal(retry.currentStage,'Deliver child tasks');
 assert.equal(view({url,phase:'review',error:null,executionError:null},issue,settings).error,null);
});
test('legacy failed sessions and tasks without a workflow still expose their error',()=>{
 assert.equal(view({url,phase:'failed',error:'Agent exited 1'},{},{task_servers:[]}).error,'Agent exited 1');
 assert.ok(view({url,phase:'implementation-needs-attention'},{},{task_servers:[]}).error);
});
test('GitHub CLI native issueType objects resolve the configured workflow',()=>{
 const result=view({url,phase:'planning'},{issueType:{name:'Feature'},state:'open'},{task_servers:[server]});
 assert.equal(result.issueType,'Epic');assert.equal(result.workflow.name,'Epic delivery');
});

test('implementation without mandatory approval uses the implementation workflow stage',()=>{const r=view({url,phase:'provisioning',executionMode:'implement',plan:'Saved plan'},{type:{name:'Feature'},state:'open'},{task_servers:[server]});assert.equal(r.currentStage,'Deliver child tasks');});

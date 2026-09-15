'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {approved,assertStart,hash}=require('./plan-approval');
const plan='Reviewed implementation plan';const state={plan,approvedPlanHash:hash(plan),planApproval:{source:'task-planner',hash:hash(plan)}};
test('only Task Planner can initiate planning',()=>{assert.throws(()=>assertStart({},'plan','', 'task-implementer'),/Task Planner/);assert.doesNotThrow(()=>assertStart({},'plan','', 'task-planner'));});
test('implementation requires exact Task Planner approval',()=>{assert(approved(state));assert.doesNotThrow(()=>assertStart(state,'implement',plan,'task-implementer'));for(const invalid of [{...state,plan:plan+' edited'},{...state,planApproval:null},{...state,approvedPlanHash:null}])assert.throws(()=>assertStart(invalid,'implement',invalid.plan,'task-implementer'),/approve/);assert.throws(()=>assertStart(state,'implement',plan+' edited','task-implementer'),/approve/);});

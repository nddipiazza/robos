'use strict';
const {createHash}=require('node:crypto');
const signoff=require('./required-signoff');
const hash=plan=>createHash('sha256').update(plan).digest('hex');
function approved(state,plan=state.plan){return !!(typeof plan==='string'&&plan.trim()&&state.plan===plan&&state.approvedPlanHash===hash(plan)&&state.planApproval?.source==='task-planner'&&state.planApproval.hash===hash(plan));}
function assertPlan(state,plan,requirement){
 if(typeof plan!=='string'||!plan.trim())throw Error('Create and save an implementation plan in Task Planner before running this task.');
 if(plan!==state.plan)throw Error('Save the updated implementation plan in Task Planner before running this task.');
 if(signoff.includes(requirement,'plan')){
  signoff.assertPlanCertificate(state,requirement);
  if(!approved(state,plan))throw Error('This task explicitly requires signoff. Approve the current plan in Task Planner before running it.');
 }
}
function readiness(state,requirement=signoff.requirement(state)){
 const planApprovalRequired=signoff.includes(requirement,'plan');
 try{assertPlan(state,state.plan,requirement);return {planReady:true,planApprovalRequired,planBlocker:null};}
 catch(e){return {planReady:false,planApprovalRequired,planBlocker:e.message};}
}
function assertStart(state,mode,plan,origin){
 if(mode==='plan'){if(origin!=='task-planner')throw Error('Create the implementation plan in RobOS Task Planner before running this task.');return;}
 if(mode!=='implement')throw Error('Invalid work stage');
 assertPlan(state,plan,signoff.requirement(state));
}
module.exports={approved,assertStart,hash,readiness};

'use strict';
const {createHash}=require('node:crypto');
const hash=plan=>createHash('sha256').update(plan).digest('hex');
function approved(state,plan=state.plan){return !!(typeof plan==='string'&&plan.trim()&&state.plan===plan&&state.approvedPlanHash===hash(plan)&&state.planApproval?.source==='task-planner'&&state.planApproval.hash===hash(plan));}
function assertStart(state,mode,plan,origin){
 if(mode==='plan'){if(origin!=='task-planner')throw Error('Create and approve the plan in RobOS Task Planner before running this task.');return;}
 if(mode!=='implement')throw Error('Invalid work stage');
 const signoff=require('./required-signoff');signoff.assertPlanCertificate(state,signoff.requirement(state));
 if(!approved(state,plan))throw Error('Open RobOS Task Planner and approve this exact plan before running the task.');
}
module.exports={approved,assertStart,hash};

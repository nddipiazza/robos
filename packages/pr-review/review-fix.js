'use strict';
const {randomUUID}=require('node:crypto');
const core=require('../robos-agent-client/work-task/core');
function validate(state,target,instruction,config){
 if(!state.prs?.some(p=>p.url===target.prUrl))throw Error('This PR is not linked to the current task.');
 if(target.repo!==target.headRepo)throw Error('AI fixes for fork PRs are not supported yet. Open the fork workspace in your IDE.');
 if(typeof instruction!=='string'||!instruction.trim()||instruction.length>20000)throw Error('Describe the requested fix (up to 20,000 characters).');
 if(!config.repositories.some(url=>require('../robos-lib/project-ides').normalize(url)===('https://github.com/'+target.repo).toLowerCase()))throw Error('Include the PR repository in this run.');
 require('../robos-agent-client/work-task/plan-approval').assertStart(state,'implement',state.plan,'pr-review');
 return {...target,instruction:instruction.trim(),id:randomUUID()};
}
async function start(url,target,instruction,launchConfig,electron,services=core){
 const state=services.read(url),fix=validate(state,target,instruction,launchConfig);
 const result=await services.startWorker(url,'implement',{plan:state.plan,launchConfig,origin:'pr-review',reviewFix:fix},electron);
 let openError;try{await services.launchApp('robos-agent-task-runner',url,electron);}catch(e){openError=e.message;}
 return {ok:true,fixId:fix.id,workerPid:result.workerPid,openError};
}
function instructions(fix){return `Address only this PR review feedback within the saved Task Planner plan. The sandbox has checked out the reviewed PR head ${fix.head} on branch ${fix.branch} in ${fix.repo}. Update the EXISTING PR ${fix.prUrl}; do not open another PR or ticket. Commit the focused fix and push normally to this branch, never force-push. If the branch has changed incompatibly, stop and report it. Do not merge or approve. Do not post comments, Slack messages or emails. Run relevant tests and preserve evidence outside the repository. Stop for human review.\nSelected lines: ${fix.path}:${fix.startLine&&fix.startLine!==fix.line?fix.startLine+'–':''}${fix.line} (${fix.side})\nCode: ${fix.text}\nRequested fix:\n${fix.instruction}`;}
module.exports={validate,start,instructions};

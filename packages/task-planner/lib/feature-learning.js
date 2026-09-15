'use strict';
const crypto=require('node:crypto');const {GraphWorkspace}=require('../../robos-graph/lib/graph-workspace');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function build(record,plan,modules=[]){if(!['feature','epic'].includes(record.kind))throw Error('Select an epic to create its e-learning.');if(!plan?.trim())throw Error('Draft and save the epic plan in Task Planner before creating e-learning.');const version=hash(plan),id='urn:robos:elearning:feature:'+record.id+':'+version.slice(0,16);
 const evidence=[{repository:record.workTaskUrl||'robos-task-planner',path:'plans/'+record.id+'.md',revision:version,sha256:version,line:1}];
 const node={'@id':id,'@type':['robos:ELearning'],'dcterms:title':record.name+' — '+record.kind+' plan','dcterms:description':'Practical lessons explaining the feature workflow, key concepts, and delivery checks.','robos:package':'learning','robos:topic':record.name,'robos:gitopsFile':'.robos/kgraphs/learning/package.jsonld','robos:modules':modules.map((m,i)=>({...m,id:id+':module:'+i})),'robos:planHash':version,'robos:sourcePlan':plan,'robos:sourceIssue':record.workTaskUrl||'','robos:plannerRecordId':record.id,'robos:evidence':evidence};return node;}
const GENERATOR_VERSION='lessons-v2';
const pending=new Map();
function includeRequiredReviewer(modules,record){
 const reviewer=record.requiredSignoff;if(!reviewer?.name)return modules;
 const scope=reviewer.scope==='plan'?'the plan':reviewer.scope==='pr'?'the pull request':'the plan and pull request';
 const note='**Required review:** '+reviewer.name+' must sign off on '+scope+'. Completing this course does not grant that approval.';
 return modules.map((m,i)=>i===modules.length-1?{...m,markdown:m.markdown+'\n\n'+note}:m);
}
async function create(record,plan,graphRoot,{generate=require('../../robos-lib/course-editor-main').revise}={}){
 const node=build(record,plan),workspace=new GraphWorkspace(graphRoot),key=workspace.root+':'+node['@id'];
 if(pending.has(key))return pending.get(key);
 const run=(async()=>{
  const old=workspace.read()['robos:nodes'].find(n=>n['@id']===node['@id']);
  if(old?.['robos:generatorVersion']===GENERATOR_VERSION)return {course:old,reused:true,graphRoot:workspace.root};
  const generated=await generate({...node,requiredReviewer:record.requiredSignoff||null},'Create a practical course from the saved epic plan. Teach the feature to a teammate who has not read the plan. Explain the workflow through an example, then its concepts and delivery steps. Keep agent reports and source verification in metadata only.');
  const modules=includeRequiredReviewer(generated,record);
  require('../../robos-lib/lesson-policy').assertLessonContent(require('../../robos-lib/course-editor-main').validateRevision({modules}));
  const current=workspace.read()['robos:nodes'].find(n=>n['@id']===node['@id']);
  if(JSON.stringify(current)!==JSON.stringify(old))throw Error('This course changed during generation. Reopen it before trying again.');
  const course={...build(record,plan,modules),'robos:generatorVersion':GENERATOR_VERSION,'robos:updatedAt':new Date().toISOString(),'robos:courseRevision':hash(JSON.stringify(modules))};
  const {'@id':id,...set}=course;
  const proposal=workspace.propose({mode:'refine',edits:[old?{op:'update',id,set}:{op:'add',node:course}],prompt:'Generate learner-focused lessons from the saved epic plan; retain source provenance in metadata.',requireEvidence:true});
  if(!proposal.validation.conforms)throw Error('The course did not pass graph validation.');
  workspace.apply(proposal,{expectedProposalId:proposal.id});return {course,reused:false,graphRoot:workspace.root};
 })();pending.set(key,run);try{return await run;}finally{pending.delete(key);}
}
module.exports={build,create,GENERATOR_VERSION,includeRequiredReviewer};

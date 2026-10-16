'use strict';
const fs=require('node:fs'),path=require('node:path');
const {promisify}=require('node:util'),{execFile}=require('node:child_process');
const run=promisify(execFile);
const {GraphWorkspace,hash}=require('../../robos-graph/lib/graph-workspace');
const {OSLCGraphParser}=require('../../robos-graph/lib/oslc-parser');
const {sha}=require('./importer');
function inside(root,relative){const file=path.resolve(root,relative);if(!file.startsWith(path.resolve(root)+path.sep))throw new Error('Recall path outside cache');return file;}
function loadPlan(root,relative){const build=inside(root,relative);const plan=JSON.parse(fs.readFileSync(path.join(build,'plan.json')));if(plan.build!==relative)throw new Error('Mismatched recall build');return {build,plan};}
function documentFor(build,shard,workspace){const raw=fs.readFileSync(inside(build,shard.file));if(sha(raw)!==shard.sha256)throw new Error('Recall shard hash mismatch');return {...workspace.empty('NHTSA bulk recalls'),...JSON.parse(raw)};}
function review(root,relative){
 const {build,plan}=loadPlan(root,relative);if(sha(fs.readFileSync(path.join(build,'index.sqlite')))!==plan.indexSha256)throw new Error('Recall index hash mismatch');
 const reviews=[];
 for(const shard of plan.shards){const ws=new GraphWorkspace(path.join(build,'graphs',shard.id));const proposal=ws.propose({document:documentFor(build,shard,ws),prompt:'Import NHTSA bulk recalls, remedies, affected components and source rows'});if(!proposal.validation.conforms)throw new Error(proposal.validation.errors.slice(0,10).join('; '));reviews.push({shard:shard.id,proposal:proposal.id});}
 const result={...plan,reviews};result.reviewId=hash(result);fs.writeFileSync(path.join(build,'review.json'),JSON.stringify(result,null,2));return result;
}
function apply(root,relative,reviewId,progress=()=>{}){
 const {build,plan}=loadPlan(root,relative);const reviewed=JSON.parse(fs.readFileSync(path.join(build,'review.json')));const {reviewId:stored,...body}=reviewed;
 if(stored!==reviewId||hash(body)!==reviewId)throw new Error('Recall review has changed');
 if(hash({...plan,reviews:reviewed.reviews})!==hash(body))throw new Error('Recall plan changed after review');
 if(sha(fs.readFileSync(inside(root,plan.source.file)))!==plan.archiveSha256)throw new Error('Recall archive changed after review');
 if(sha(fs.readFileSync(path.join(build,'index.sqlite')))!==plan.indexSha256)throw new Error('Recall index hash mismatch');
 for(const shard of plan.shards){
  const ws=new GraphWorkspace(path.join(build,'graphs',shard.id));const expected=reviewed.reviews.find(r=>r.shard===shard.id)?.proposal;const receipt=path.join(build,'applied-'+shard.id+'.json');
  if(fs.existsSync(receipt)){const r=JSON.parse(fs.readFileSync(receipt));if(r.proposal===expected&&hash(ws.read())===r.revision)continue;throw new Error('Previously applied shard changed');}
  const proposal=ws.propose({document:documentFor(build,shard,ws),prompt:'Import NHTSA bulk recalls, remedies, affected components and source rows'});
  const result=ws.apply(proposal,{expectedProposalId:expected});fs.writeFileSync(receipt,JSON.stringify(result));progress(shard.id);
 }
 const target=path.join(root,'recalls/current.json');fs.writeFileSync(target+'.tmp',JSON.stringify({...plan,reviewId},null,2));fs.renameSync(target+'.tmp',target);return {nodes:plan.nodes,records:plan.records,counts:plan.counts};
}
class RecallStore{
 constructor(root){this.root=root;this.cached=null;}
 current(){const f=path.join(this.root,'recalls/current.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):null;}
 async query(request){if(!this.current())return request.action==='search'?{total:0,nodes:[]}:null;const {stdout}=await run('python3',[path.join(__dirname,'../recall_data.py'),'query',this.root,JSON.stringify(request)],{maxBuffer:16*1024*1024,timeout:60000});return JSON.parse(stdout);}
 async search(request){return this.query({action:'search',...request});}
 async detail(id){
  const entry=await this.query({action:'lookup',id});if(!entry)return null;
  const current=this.current();const {build}=loadPlan(this.root,current.build);
  const key=current.build+'/'+entry.shard;
  if(this.cached?.key!==key){const ws=new GraphWorkspace(path.join(build,'graphs',entry.shard));this.cached={key,parser:new OSLCGraphParser(ws.read())};}
  const p=this.cached.parser,n=p.getNode(id);if(!n)throw new Error('Recall index and graph disagree');
  const related=p.nodes.filter(n=>n['robos:campaignNumber']===entry.campaign);
  return {node:n,selectedPart:p.getNode(n['robos:affectedPart']?.['@id']),selectedRemedy:p.getNode(n['robos:remedy']?.['@id']),campaign:related.find(n=>n['@type']==='robos:BulkRecallCampaign'),remedies:related.filter(n=>n['@type']==='robos:RecallRemedy'),parts:related.filter(n=>n['@type']==='robos:RecallAffectedPart').slice(0,100),partCount:related.filter(n=>n['@type']==='robos:RecallAffectedPart').length,applicabilities:related.filter(n=>n['@type']==='robos:RecallApplicability').slice(0,100),applicabilityCount:related.filter(n=>n['@type']==='robos:RecallApplicability').length};
 }
 async source(id){const detail=await this.detail(id);if(!detail)throw new Error('Unknown recall entry');return this.query({action:'source',line:detail.node['robos:sourceRow']});}
}
module.exports={review,apply,RecallStore,loadPlan};

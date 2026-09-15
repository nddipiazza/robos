'use strict';
const fs=require('fs'),path=require('path'),{randomUUID,createHash}=require('crypto'),{execFileSync}=require('child_process');
const {GraphWorkspace}=require('../../robos-graph/lib/graph-workspace');
const PROVIDERS={buildkite:'Buildkite',jenkins:'Jenkins','github-actions':'GitHub Actions','gitlab-ci':'GitLab CI','azure-pipelines':'Azure Pipelines',circleci:'CircleCI',teamcity:'TeamCity'};
function list(file){try{return JSON.parse(fs.readFileSync(file,'utf8')).ci_pipeline_servers||[];}catch(e){if(e.code==='ENOENT')return [];throw e;}}
function save(file,input){
 if(!PROVIDERS[input.provider])throw Error('Choose a supported CI provider.');if(!input.name?.trim())throw Error('Enter a server name.');
 const url=new URL(input.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP(S) URL without credentials.');
 let settings={};try{settings=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const server={id:input.id||randomUUID(),name:input.name.trim(),provider:input.provider,url:url.href,credentialRef:input.credentialRef||'',graphRoot:input.graphRoot||'',updatedAt:new Date().toISOString()};
 settings.ci_pipeline_servers=[...(settings.ci_pipeline_servers||[]).filter(s=>s.id!==server.id),server];
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(settings,null,2));return server;
}
const patterns={buildkite:/^\.buildkite\/.*\.ya?ml$/i,jenkins:/(^|\/)Jenkinsfile(?:\.[^/]+)?$/,'github-actions':/^\.github\/workflows\/.*\.ya?ml$/,'gitlab-ci':/(^|\/)\.gitlab-ci\.ya?ml$/,'azure-pipelines':/(^|\/)azure-pipelines[^/]*\.ya?ml$/,circleci:/^\.circleci\/config\.ya?ml$/,teamcity:/^\.teamcity\/.*\.(kts|xml)$/};
function preview(server,repositoryRoot){
 if(!server.graphRoot)throw Error('Choose a knowledge graph workspace.');
 const workspace=new GraphWorkspace(server.graphRoot),current=workspace.read();
 const git=args=>execFileSync('git',['-C',repositoryRoot,...args],{encoding:'utf8',maxBuffer:8*1024*1024}).trim();
 const remote=git(['remote','get-url','origin']);const remoteUrl=new URL(remote.replace(/^git@([^:]+):/,'https://$1/').replace(/^ssh:\/\/git@/,'https://'));remoteUrl.username='';remoteUrl.password='';remoteUrl.search='';remoteUrl.hash='';const repository=remoteUrl.href.replace(/\.git$/,'').replace(/\/$/,'');const revision=git(['rev-parse','HEAD']);
 const files=git(['ls-files']).split('\n').filter(f=>patterns[server.provider].test(f));if(!files.length)throw Error(`No tracked ${PROVIDERS[server.provider]} pipeline definitions found in this repository.`);
 const evidence=files.map(file=>{const text=fs.readFileSync(path.join(repositoryRoot,file),'utf8');return {repository:repository.split('/').pop(),path:file,line:1,revision,sha256:createHash('sha256').update(text).digest('hex'),workingTreeStatus:git(['status','--porcelain','--',file])?'modified':'clean'};});
 const serverId='urn:robos:ci-server:'+server.id;
 const base={'robos:package':'devops','robos:classification':[{'@id':'https://robos.dev/ns/sdlc#classification/infrastructure'}],'robos:evidenceStatus':'declared'};
 const node={'@id':serverId,'@type':['robos:CIPipelineServer'],'dcterms:title':server.name,...base,'robos:provider':server.provider,'robos:url':server.url,'robos:credentialRef':server.credentialRef||'','robos:evidence':evidence};
 const nodes=[node,...evidence.map(e=>({'@id':'urn:robos:ci-pipeline:'+createHash('sha256').update(repository+'#'+e.path).digest('hex').slice(0,24),'@type':['robos:CICDPipeline'],'dcterms:title':repository.split('/').pop()+' · '+e.path,...base,'robos:platform':PROVIDERS[server.provider],'robos:workflowFile':e.path,'robos:sourceRepository':repository,'robos:status':'imported definition','robos:ciServer':{'@id':serverId},'robos:evidence':[e],'robos:relationshipEvidence':[{predicate:'robos:ciServer',target:{'@id':serverId},evidence:[e]}]}))];
 const edits=[];
 for(const node of nodes){
  if(node['@type'].includes('robos:CICDPipeline')){
   const match=current['robos:nodes'].find(n=>[].concat(n['@type']).includes('robos:CICDPipeline')&&(n['robos:workflowFile']||n['robos:sourcePath'])===node['robos:workflowFile']&&(n['robos:evidence']||[]).some(e=>[repository,repository.split('/').pop()].map(s=>s.toLowerCase()).includes(e.repository.toLowerCase())));
   if(match){node['@id']=match['@id'];node['dcterms:title']=match['dcterms:title'];node['@type']=match['@type'];node['robos:classification']=match['robos:classification']||node['robos:classification'];node['robos:relationshipEvidence']=[...(match['robos:relationshipEvidence']||[]).filter(e=>e.predicate!=='robos:ciServer'),...node['robos:relationshipEvidence']];}
  }
  const previous=current['robos:nodes'].find(n=>n['@id']===node['@id']);
  if(previous){if(node['@id']===serverId)node['robos:evidence']=[...new Map([...(previous['robos:evidence']||[]),...node['robos:evidence']].map(e=>[e.repository+'#'+e.path,e])).values()];const {'@id':id,...set}=node;if(Object.entries(set).some(([k,v])=>JSON.stringify(previous[k])!==JSON.stringify(v)))edits.push({op:'update',id,set});}
  else edits.push({op:'add',node});
 }
 let proposal=edits.length?workspace.propose({mode:'refine',edits,prompt:'Import selected CI server and tracked pipeline definitions. Source configuration only; no builds are started.',requireEvidence:true}):null;
 if(proposal&&!proposal.delta.added.length&&!proposal.delta.changed.length&&!proposal.delta.removed.length)proposal=null;
 return {server,repositoryRoot,repository,files,proposal,graphRoot:server.graphRoot};
}
function apply(prepared){if(!prepared.proposal)return {unchanged:true};const workspace=new GraphWorkspace(prepared.graphRoot);return workspace.apply(prepared.proposal,{expectedProposalId:prepared.proposal.id});}
module.exports={PROVIDERS,list,save,preview,apply};

'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const core=require('../robos-agent-client/work-task/core'),metadata=require('../task-planner/lib/issue-metadata');
function normalize(values){const result=[];for(const value of values||[]){try{const url=metadata.repositoryUrl(typeof value==='string'?value:value.url);if(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)&&!result.some(r=>r.toLowerCase()===url.toLowerCase()))result.push(url);}catch{}}return result;}
function project(state){if(!state.plannerProjectId)return {};try{return JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/robos/task-planner/projects',state.plannerProjectId+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
async function resolve(url,issue,dependencies={}){
 const read=dependencies.read||core.read,load=dependencies.project||project,getMetadata=dependencies.metadata||metadata.metadata;
 const state=read(url),saved=load(state);
 let repositories=normalize(saved.repos),source='Ticket repositories';
 if(!repositories.length){repositories=normalize(state.launchConfig?.repositories);source='Previous task session';}
 if(!repositories.length){repositories=normalize(issue.repositories);source='Ticket metadata';}
 const visited=new Set([url]);let parent=issue.parentUrl;const warnings=[];
 while(!repositories.length&&parent&&!visited.has(parent)&&visited.size<8){visited.add(parent);const parentState=read(parent),parentProject=load(parentState);repositories=normalize(parentProject.repos?.length?parentProject.repos:parentState.launchConfig?.repositories);source='Parent feature repositories';if(repositories.length)break;try{const info=await getMetadata(parent);repositories=normalize(info.repositories);parent=info.parentUrl;}catch(e){warnings.push('Could not load parent feature repositories: '+e.message);break;}}
 let registry=dependencies.registry;if(!registry){try{registry=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/robos/git-projects.json'),'utf8')).projects||[];}catch{registry=[];}}
 return {repositories,repositorySource:repositories.length?source:null,availableRepositories:normalize([...repositories,...normalize(registry)]),repositoryWarnings:warnings};
}
module.exports={resolve,normalize};

'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('../robos-agent-client/work-task/core'),ides=require('../robos-lib/project-ides'),{prIdentity}=require('../robos-agent-client/work-task/review');
const projectRoots=require('../robos-lib/project-roots');
const readJSON=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
function repositoryPaths(state){
 if(!state.sandbox?.artifacts)throw Error('This task has no preserved agent workspace. Run it through Task Runner before opening its session IDE.');
 return (state.launchConfig?.repositories||[]).map(url=>{const normalized=ides.normalize(url);if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(normalized))throw Error('Invalid session repository URL.');const name=url.replace(/\.git$/,'').replace(/\/$/,'').split('/').slice(-2).join('--');return {url,name,path:path.join(state.sandbox.artifacts,'repos',name)};});
}
function orderPages(prs,projects,paths=[]){
 const dependencies=new Map(projects.map(p=>[ides.normalize(p.url),new Set((p.dependsOn||[]).map(ides.normalize))]));
 const manifests=paths.flatMap(repo=>{try{return projectRoots.discover(repo.path).roots.filter(r=>r.markers.some(m=>m.endsWith('package.json'))).map(r=>({repo:ides.normalize(repo.url),manifest:readJSON(path.join(repo.path,r.relativePath,'package.json'))}));}catch{return [];}});
 const packages=new Map(manifests.filter(p=>p.manifest?.name).map(p=>[p.manifest.name,p.repo]));
 for(const {repo,manifest} of manifests){const deps=dependencies.get(repo)||new Set();for(const name of Object.keys({...manifest?.dependencies,...manifest?.devDependencies,...manifest?.peerDependencies,...manifest?.optionalDependencies})){if(packages.has(name)&&packages.get(name)!==repo)deps.add(packages.get(name));}dependencies.set(repo,deps);}
 const closure=repo=>{const seen=new Set();const visit=r=>{for(const dep of dependencies.get(r)||[]){if(!seen.has(dep)){seen.add(dep);visit(dep);}}};visit(repo);return seen;};
 const pages=prs.map(pr=>{const {repo,number}=prIdentity(pr.url),repoUrl=ides.normalize('https://github.com/'+repo),project=projects.find(p=>ides.normalize(p.url)===repoUrl),ide=ides.preferred(project);const configured=[...new Set([ide?.id,...(project?.projectRoots||[]).map(r=>r.ideId)].filter(Boolean))].map(id=>ides.catalog.find(i=>i.id===id)).filter(Boolean);return {...pr,repo,number,repoUrl,ide,ides:configured,dependsOn:prs.filter(other=>closure(repoUrl).has(ides.normalize('https://github.com/'+prIdentity(other.url).repo))).map(p=>p.url)};});
 const result=[],remaining=new Map(pages.map(p=>[p.url,p]));while(remaining.size){const ready=[...remaining.values()].filter(p=>p.dependsOn.every(url=>!remaining.has(url))).sort((a,b)=>a.repo.localeCompare(b.repo)||a.number-b.number);if(!ready.length)return {pages:[...result,...remaining.values()],cycle:true};for(const p of ready){result.push(p);remaining.delete(p.url);}}
 return {pages:result,cycle:false};
}
async function pages(state,query=core.gh){
 const prs=await Promise.all((state.prs||[]).map(async p=>({...p,...await query(['pr','view',p.url,'--json','url,number,title,state,headRefOid,headRefName,baseRefName'])})));
 let paths=[];try{paths=repositoryPaths(state);}catch{}
 return {...orderPages(prs,ides.projects(),paths),repositories:paths.map(p=>({...p,ide:ides.preferred(ides.projects().find(project=>ides.normalize(project.url)===ides.normalize(p.url)))}))};
}
const {writeWorkspace}=require('../robos-lib/ide-workspaces');
const pending=new Map();
async function prepare(state,page,run=core.command,allPages=[page]){
 const roots=repositoryPaths(state);if(!roots.length)throw Error('This session has no associated Git projects.');
 const reviewRepo=ides.normalize('https://github.com/'+page.repo);if(!roots.some(p=>ides.normalize(p.url)===reviewRepo))throw Error('This PR repository was not included in the task sandbox. Associate it and run the task with that repository.');
 if(!page.ide)throw Error('Choose this repository’s IDE in Git Projects or set the default IDE in Preferences.');
 const revisions=[];
 for(const repo of roots){if(!fs.existsSync(path.join(repo.path,'.git')))throw Error('Preserved session clone is missing: '+repo.name);const sha=allPages.find(p=>ides.normalize('https://github.com/'+p.repo)===ides.normalize(repo.url))?.headRefOid||(await run('git',['-C',repo.path,'rev-parse','HEAD'])).trim();if(!/^[0-9a-f]{40,64}$/.test(sha))throw Error('Invalid review commit');revisions.push({...repo,sha});}
 const key=crypto.createHash('sha256').update(JSON.stringify(revisions.map(r=>[r.url,r.sha]))).digest('hex').slice(0,20),root=path.join(state.sandbox.artifacts,'review',key);
 const jobKey=root;if(pending.has(jobKey)){await pending.get(jobKey);return prepare(state,page,run,allPages);}
 const job=(async()=>{const copies=[];for(const repo of revisions){const target=path.join(root,'repos',repo.name);if(!fs.existsSync(path.join(target,'.git'))){fs.mkdirSync(path.dirname(target),{recursive:true});await run('git',['clone','--no-hardlinks','--no-checkout','--',repo.path,target]);await run('git',['-C',target,'remote','set-url','origin',repo.url]);}
 // Never checkout over developer edits in a previously opened review workspace.
 const head=await run('git',['-C',target,'rev-parse','HEAD']).catch(()=> '');if(head.trim()!==repo.sha||!fs.existsSync(path.join(root,repo.name+'.ready'))){if(fs.existsSync(path.join(root,repo.name+'.ready')))throw Error('Review workspace HEAD changed. Preserve your edits and reopen a fresh session.');try{await run('git',['-C',target,'cat-file','-e',repo.sha+'^{commit}']);}catch{await run('git',['-C',target,'fetch','origin',repo.sha]);}await run('git',['-C',target,'checkout','--detach',repo.sha]);fs.writeFileSync(path.join(root,repo.name+'.ready'),repo.sha);}
 copies.push({...repo,path:target});}
 const projects=ides.projects(),workspaceRoots=[];
 for(const repo of copies){const project=projects.find(p=>ides.normalize(p.url)===ides.normalize(repo.url));const discovered=project?.projectRoots?.length?project.projectRoots:projectRoots.discover(repo.path).roots;
 for(const rootInfo of discovered.length?discovered:[{relativePath:'.'}])workspaceRoots.push({name:repo.name+(rootInfo.relativePath==='.'?'':'/'+rootInfo.relativePath),path:projectRoots.resolve(repo.path,rootInfo.relativePath),gitRoot:repo.path});}
 const target=writeWorkspace(path.join(root,'ides',page.ide.id),workspaceRoots,page.ide,{name:'Task '+(state.issue?.number?'#'+state.issue.number:'review')+' · '+(state.issue?.title||page.repo)});return {target,reviewRoot:root,repositories:copies,roots:workspaceRoots,ide:page.ide};})();pending.set(jobKey,job);try{return await job;}finally{pending.delete(jobKey);}
}
async function open(state,prUrl,ideId,reviewedHead){const review=await pages(state),page=review.pages.find(p=>p.url===prUrl);if(!page)throw Error('PR is not linked to the current task.');if(reviewedHead&&page.headRefOid!==reviewedHead)throw Error('The PR changed. Reload its page before opening the IDE workspace.');if(ideId){const selected=page.ides.find(i=>i.id===ideId);if(!selected)throw Error('IDE is not associated with this repository.');page.ide=selected;}const workspace=await prepare(state,page,core.command,review.pages);require('../robos-lib/ide-trust').trustReviewWorkspace(workspace.target,workspace.reviewRoot,workspace.ide);return {...await ides.launch(workspace.ide.id,workspace.target),repositories:workspace.repositories};}
function assertPrerequisites(result,prUrl){if(result.cycle)throw Error('Repository dependencies contain a cycle. Fix them in Git Projects before merging.');const page=result.pages.find(p=>p.url===prUrl),blocked=result.pages.filter(p=>page?.dependsOn.includes(p.url)&&p.state!=='MERGED');if(blocked.length)throw Error('Merge the prerequisite PRs first: '+blocked.map(p=>p.url).join(', '));}
async function assertMergeOrder(prUrl){
 const root=path.join(require('node:os').homedir(),'.config/robos/work-tasks');if(!fs.existsSync(root))return;
 for(const dir of fs.readdirSync(root)){const state=readJSON(path.join(root,dir,'state.json'));if(!state?.prs?.some(p=>p.url===prUrl))continue;const result=await pages(state);assertPrerequisites(result,prUrl);}
}
module.exports={assertPrerequisites,assertMergeOrder,repositoryPaths,orderPages,pages,prepare,writeWorkspace,open};

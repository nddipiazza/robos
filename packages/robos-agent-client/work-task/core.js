'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const root = path.join(os.homedir(), '.config/robos/work-tasks');
function identity(url) {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)$/.exec(url || '');
  if (!m) throw Error('Expected a GitHub issue URL');
  return { owner: m[1], name: m[2], repo: `${m[1]}/${m[2]}`, number: Number(m[3]) };
}
function folder(url) { identity(url); return path.join(root, crypto.createHash('sha256').update(url.toLowerCase()).digest('hex').slice(0, 24)); }
function read(url) { try { return JSON.parse(fs.readFileSync(path.join(folder(url), 'state.json'))); } catch(e) { if(e.code==='ENOENT') return {url, phase:'new',plan:''}; throw e; } }
function save(url, patch) {
  const dir=folder(url); fs.mkdirSync(dir,{recursive:true});
  const state={...read(url),...patch,url,updatedAt:new Date().toISOString()};
  const temp=path.join(dir,`state.${process.pid}.tmp`);fs.writeFileSync(temp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(temp,path.join(dir,'state.json'));return state;
}
function command(bin,args,options={}) { return new Promise((resolve,reject)=>execFile(bin,args,{encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,...options},(e,out,err)=> e?reject(Error((err||e.message).trim())):resolve(out))); }
const gh = async args => {try{const result=JSON.parse(await command('gh',args));require('../../robos-lib/auth-notifications').resolve('github','github.com');return result;}catch(error){const auth=require('../../robos-lib/auth-notifications');if(auth.isLoginError(error.message))auth.report({kind:'github',id:'github.com',name:'GitHub'});throw error;}};
async function inspect(url, query=gh) {
  const id=identity(url);
  const issue=await query(['issue','view',String(id.number),'--repo',id.repo,'--json','number,title,body,state,assignees,url,issueType,labels']);
  // GitHub cross references reveal linked PRs across repositories, including drafts.
  const queryText=`query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){issue(number:$number){timelineItems(first:100,after:$after,itemTypes:[CROSS_REFERENCED_EVENT]){pageInfo{hasNextPage endCursor} nodes{... on CrossReferencedEvent{source{... on PullRequest{url state isDraft title number headRefOid repository{nameWithOwner}}}}}}}}}`;
  let after, prs=[];
  do {
    const args=['api','graphql','-f',`query=${queryText}`,'-f',`owner=${id.owner}`,'-f',`name=${id.name}`,'-F',`number=${id.number}`];
    if(after)args.push('-f',`after=${after}`);
    const result=await query(args);if(result.errors)throw Error(result.errors.map(e=>e.message).join('; '));
    const page=result.data?.repository?.issue?.timelineItems;if(!page)throw Error('GitHub did not return the task workflow');
    for(const node of page.nodes){const pr=node.source;if(pr?.url && pr.state==='OPEN' && !prs.some(p=>p.url===pr.url))prs.push(pr);}
    after=page.pageInfo.hasNextPage?page.pageInfo.endCursor:null;
  }while(after);
  return {issue,prs,route:prs.length?'pr-review':issue.state==='CLOSED'?'complete':'task-planner'};
}
function plannerProject(url, issue) {
  const id = 'work-task-' + path.basename(folder(url));
  const dir = path.join(os.homedir(), '.config/robos/task-planner/projects');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, id + '.json');
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({
    id, kind:issue.issueType?.name==='Feature'?'feature':'task', name: issue.title, prompt: `${issue.url}\n\n${issue.body || ''}`,
    tasks: [{ title: issue.title, body: issue.body || '', labels: (issue.labels||[]).map(l=>typeof l==='string'?l:l.name),issueType:issue.issueType?.name||null, ticketKey: `#${issue.number}`, ticketUrl: issue.url, ticketStatus: issue.state }],
    features: [], techStack: '', createdAt: Date.now(), updatedAt: Date.now(), workTaskUrl: url,
  }, null, 2), { mode: 0o600, flag: 'wx' });
  const record=JSON.parse(fs.readFileSync(file,'utf8')),before=JSON.stringify(record);
  record.kind=record.kind||(issue.issueType?.name==='Feature'?'feature':'task');
  if(issue.issueType?.name){record.issueMetadata={...record.issueMetadata,type:issue.issueType.name};for(const task of record.tasks||[])if(task.ticketUrl===url)task.issueType=issue.issueType.name;}
  if(JSON.stringify(record)!==before)fs.writeFileSync(file,JSON.stringify(record,null,2));
  return id;
}
function electronEnv(){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;return env;}
async function launchApp(app,url,electron){
  const dir=path.resolve(__dirname,'../..',app);
  await new Promise((resolve,reject)=>{const child=spawn(electron,[dir,`--work-task=${url}`,'--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],{cwd:dir,detached:true,stdio:'ignore',env:electronEnv()});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
}
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function route(url,electron){
  const current=read(url);const live=await inspect(url);
  const running=current.workerPid&&alive(current.workerPid);
  const plannerProjectId = live.route === 'task-planner' ? plannerProject(url, live.issue) : current.plannerProjectId;
  const state=save(url,{...live,plannerProjectId,phase:running?current.phase:live.route==='pr-review'?'review':live.route==='complete'?'complete':current.plan?(current.approvedPlanHash?'plan-approved':'plan-review'):'planning',error:current.error||null,dispatcherPid:process.pid});
  if(live.route!=='complete')await launchApp(live.route,url,electron);
  return state;
}
async function dispatch(url,electron){
  identity(url);const dir=folder(url);fs.mkdirSync(dir,{recursive:true});
  const lock=path.join(dir,'dispatch.lock');
  try {const pid=Number(fs.readFileSync(lock,'utf8'));if(alive(pid))return {ok:true,message:'RobOS Agent is already routing this task.'};}catch(e){if(e.code!=='ENOENT')throw e;}
  // A short-lived exclusive lock prevents repeated clicks launching duplicate dispatchers.
  try{fs.writeFileSync(lock,String(process.pid),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;fs.renameSync(lock,lock+'.stale');fs.writeFileSync(lock,String(process.pid),{flag:'wx'});}
  const log=fs.openSync(path.join(dir,'agent.log'),'a',0o600);
  try {
    const child=spawn(electron,[path.join(__dirname,'runner.js'),'/work-task',url,electron],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},detached:true,stdio:['ignore',log,log]});
    await new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',resolve);});
    fs.writeFileSync(lock,String(child.pid));child.unref();return {ok:true,pid:child.pid,message:'RobOS Agent launched /work-task; inspecting GitHub workflow.'};
  }catch(error){fs.renameSync(lock,lock+'.failed');throw error;}finally{fs.closeSync(log);}
}
function planHash(plan){return crypto.createHash('sha256').update(plan).digest('hex');}
async function startWorkerUnlocked(url,mode,{workspace,plan,refinement,backend='codex',launchConfig,origin}={},electron){
  const old=read(url);
  backend=require('./backend').configuredBackend(backend);
  if(old.workerPid&&alive(old.workerPid))throw Error('A RobOS Agent session is already running for this task.');
  require('./plan-approval').assertStart(old,mode,plan,origin);
  if(!launchConfig)throw Error('Review the Task Runner launch settings before starting.');
  launchConfig=require('../../robos-agent-task-runner/sandbox').validate(launchConfig);
  backend=launchConfig.provider;

  const state=save(url,{autoStart:false,plan:plan??old.plan,backend,launchConfig,origin,...(mode==='plan'?{approvedPlanHash:null,planApproval:null}:{}),refinement:refinement||'',phase:'provisioning',error:null,executionError:null,output:''});
  const log=fs.openSync(path.join(folder(url),'agent.log'),'a',0o600);
  try {
    const child=spawn(electron,[path.join(__dirname,'runner.js'),mode,url,electron],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},detached:true,stdio:['ignore',log,log]});
    await new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',resolve);});
    save(url,{workerPid:child.pid});child.unref();return {...state,workerPid:child.pid};
  }finally{fs.closeSync(log);}
}
async function startWorker(url,mode,options,electron) {
  const dir=folder(url);fs.mkdirSync(dir,{recursive:true});const lock=path.join(dir,'launch.lock');
  try {const owner=Number(fs.readFileSync(lock,'utf8'));if(alive(owner))throw Error('This task is already starting an agent.');fs.renameSync(lock,lock+'.stale-'+Date.now());}catch(e){if(e.code!=='ENOENT')throw e;}
  fs.writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});
  try{return await startWorkerUnlocked(url,mode,options,electron);}
  finally{fs.unlinkSync(lock);}
}
function recordMergedPR(prUrl,merged) {
  if(!fs.existsSync(root))return;
  for(const name of fs.readdirSync(root)){
    const file=path.join(root,name,'state.json');let state;
    try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}
    if(!state.prs?.some(p=>p.url===prUrl))continue;
    const prs=state.prs.filter(p=>p.url!==prUrl);
    save(state.url,{prs,merged,phase:prs.length?'review':'merged'});
  }
}
async function runWorker(url,mode,electron){
  const state=read(url),dir=folder(url);require('./plan-approval').assertStart(state,mode,state.plan,state.origin);const outputFile=path.join(dir,`${mode}-output.txt`);
  const instruction=mode==='plan'
    ? 'Read the task and workspace instructions. Produce or refine a concrete implementation plan in Markdown. Inspect existing work and linked issues. Do not modify source code, create issues or PRs, or merge anything. Stop for human plan review.'
    : 'Implement only this ticket and the human-approved plan. The parent feature and successor tickets are context, not additional implementation scope. If this ticket is a design or documentation task, produce that document only; do not implement the future work it describes. Follow workspace instructions and tests. The repositories are isolated clones inside the RobOS ephemeral sandbox; use those clones, create a draft PR with a closing link to the task, and report the PR URL and evidence. Never approve or merge a PR. Do not send Slack, email, or other messages, or post issue comments. Only the implementation and draft PR creation are authorized. Stop for human review in PR Review Theater. If blocked, report the blocker; do not claim completion.';
  const prompt=`You are the RobOS Agent executing /work-task ${url}.\n${instruction}\nTask: ${state.issue.title}\n${state.issue.body}\nApproved/current plan:\n${state.plan||'(No plan yet)'}\nHuman refinement:\n${state.refinement||'(none)'}`;
  if(state.launchConfig){
    const eventsFile=path.join(dir,'events.jsonl');
    fs.writeFileSync(eventsFile,'',{mode:0o600});
    const event=(role,text,name)=>{const at=new Date().toISOString();fs.appendFileSync(eventsFile,JSON.stringify({role,text,name,at})+'\n');if(role==='error'&&!/WARN |Reading additional input/.test(text)){save(url,{executionError:{text,at,phase:read(url).phase}});require('../../robos-lib/auth-notifications').reportAgent(state.backend,text);require('../../robos-lib/human-requests').reportError(url,text);}};
    event('user',`${mode==='plan'?'Draft implementation plan':'Implement approved plan'} for ${url}`);
    try{
      const output=await require('../../robos-agent-task-runner/sandbox').run(url,mode,prompt,event);
      require('../../robos-lib/auth-notifications').resolve('agent',state.backend);
      require('../../robos-lib/human-requests').resolveTask(url);
      fs.writeFileSync(outputFile,output,{mode:0o600});
      if(mode==='plan')save(url,{plan:output,approvedPlanHash:null,planApproval:null,phase:'plan-review',workerPid:null,error:null,executionError:null});
      else{const live=await inspect(url);save(url,{...live,phase:live.prs.length?'review':'implementation-needs-attention',workerPid:null,...(live.prs.length?{executionError:null}:{}),error:live.prs.length?null:'Agent finished without a linked PR. Review the preserved output.'});if(live.prs.length)await launchApp('pr-review',url,electron);}
    }catch(e){event('error',e.message);save(url,{phase:read(url).phase==='stopped'?'stopped':'failed',workerPid:null,error:e.message});throw e;}
    return;
  }
  throw Error('This task has no sandbox launch configuration. Open RobOS Agent Task Runner to launch it.');
}

module.exports={recordMergedPR,launchApp,plannerProject,identity,folder,read,save,gh,command,inspect,dispatch,route,startWorker,runWorker,planHash};

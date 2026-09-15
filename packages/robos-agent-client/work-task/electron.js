'use strict';
const fs=require('node:fs');const path=require('node:path');const core=require('./core');const review=require('./review');
function register({app,ipcMain,dialog},screen){
  ipcMain.handle('robos-provider-catalog',(_,options)=>require('../providers').options({refresh:options?.refresh===true}));
  let url=process.argv.find(a=>a.startsWith('--work-task='))?.slice(12)||null;
  const reviews=new Map();
  app.on('second-instance',(_,argv)=>{const next=argv.find(a=>a.startsWith('--work-task='))?.slice(12);if(next){core.identity(next);url=next;for(const window of require('electron').BrowserWindow.getAllWindows())window.loadFile(path.join(__dirname,'../..',screen,'renderer/index.html'));}});
  const wrap=fn=>async(_,input)=>{try{return{ok:true,data:await fn(input||{})};}catch(e){return{ok:false,error:e.message};}};
  function current(){if(!url)throw Error('No /work-task session was opened');return core.read(url);}
  ipcMain.handle('work-task-select',wrap(async({issueUrl})=>{
    const live=await core.inspect(issueUrl);url=issueUrl;
    return core.save(url,{...live,plannerProjectId:core.plannerProject(url,live.issue),autoStart:false});
  }));
  ipcMain.handle('work-task-launch-options',wrap(({mode,plan})=>{const state=current();if(mode)require('./plan-approval').assertStart(state,mode,plan,screen);return require('../../robos-agent-task-runner/sandbox').options(url);}));
  ipcMain.handle('work-task-open-runner',wrap(async()=>{current();await core.launchApp('robos-agent-task-runner',url,process.execPath);}));
  ipcMain.handle('work-task-state',wrap(async()=>{if(!url)return null;const s=current();const dir=core.folder(url);let output='';for(const mode of ['plan','implement']){const file=path.join(dir,`${mode}-output.txt`);if(fs.existsSync(file))output+=fs.readFileSync(file,'utf8').slice(-40000);}let events=[];const eventsFile=path.join(dir,'events.jsonl');if(fs.existsSync(eventsFile))events=fs.readFileSync(eventsFile,'utf8').split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});return{...s,screen,planApproved:require('./plan-approval').approved(s),output,events,workflowView:await require('./workflow-view').load(s)};}));
  ipcMain.handle('work-task-plan-links',wrap(async()=>{current();return require('./plan-links').links(url);}));
  ipcMain.handle('work-task-open-related-plan',wrap(async({targetUrl})=>{current();return require('./plan-links').open(url,targetUrl,process.execPath);}));
  ipcMain.handle('work-task-open-implementer',wrap(async()=>{current();await core.launchApp('task-implementer',url,process.execPath);}));
  ipcMain.handle('work-task-open-planner',wrap(async()=>{current();await core.launchApp('task-planner',url,process.execPath);}));
  ipcMain.handle('work-task-stop',wrap(()=>{const s=current();if(s.workerPid)process.kill(s.workerPid,'SIGTERM');return core.save(url,{phase:'stopped',workerPid:null,error:'Stopped by user'});}));
  ipcMain.handle('work-task-folder',wrap(async()=>{current();const r=await dialog.showOpenDialog({properties:['openDirectory'],title:'Choose the source workspace for this task'});return r.canceled?null:r.filePaths[0];}));
  ipcMain.handle('work-task-save',wrap(({plan,workspace})=>{current();return core.save(url,{plan,workspace,approvedPlanHash:null,planApproval:null,phase:'plan-review'});}));
  ipcMain.handle('work-task-approve-plan',wrap(async({plan,workspace})=>{current();if(screen!=='task-planner')throw Error('Approve plans in RobOS Task Planner.');if(!plan?.trim())throw Error('A plan is required');const old=current();if(old.workerPid)throw Error('Wait for the running agent before approving a plan.');const githubLogin=(await core.command('gh',['api','user','--jq','.login'])).trim();const signoff=require('./required-signoff');signoff.assertPlanSigner(signoff.requirement(old),githubLogin);return core.save(url,{plan,workspace:workspace||old.workspace,approvedPlanHash:core.planHash(plan),planApproval:{source:'task-planner',githubLogin,hash:core.planHash(plan),approvedAt:new Date().toISOString()},phase:'plan-approved'});}));
  ipcMain.handle('work-task-agent',wrap(async input=>{current();return core.startWorker(url,input.mode,{...input,origin:screen},process.execPath);}));
  ipcMain.handle('work-task-route',wrap(async()=>{current();return core.dispatch(url,process.execPath);}));
  ipcMain.handle('work-task-review',wrap(async({prUrl})=>{const s=current();if(!s.prs.some(p=>p.url===prUrl))throw Error('PR is not linked to this task');const ctx=await review.context(prUrl);reviews.set(prUrl,{...ctx,passed:false,inspected:false});return{pr:ctx.pr,questions:ctx.questions.map(({label,options})=>({label,options}))};}));
  ipcMain.handle('work-task-quiz',wrap(({prUrl,answers})=>{current();const ctx=reviews.get(prUrl);if(!ctx)throw Error('Load the PR first');const score=ctx.questions.filter((q,i)=>q.answer===answers?.[i]).length/ctx.questions.length;ctx.passed=score>=0.8;if(!ctx.passed)throw Error('Knowledge check requires at least 80%. Review the PR context and retry.');ctx.inspected=true;return{score,diff:ctx.diff,head:ctx.pr.headRefOid};}));
  ipcMain.handle('work-task-merge',wrap(async({prUrl,notes,reviewed})=>{current();const ctx=reviews.get(prUrl);if(!ctx?.passed||!ctx.inspected||reviewed!==true)throw Error('Complete the knowledge check and review the changes and evidence before approving.');const merged=await review.approveAndMerge(prUrl,ctx.pr.headRefOid,notes,undefined,undefined,require('./required-signoff').requirement(current()));core.save(url,{phase:'merged',merged,reviewCertificate:{prUrl,head:ctx.pr.headRefOid,approvedAt:new Date().toISOString(),notes}});return merged;}));
}
module.exports={register};

'use strict';
let workSession;
let autoStarted=false;
function messageTimestamp(at) {
  const time=document.createElement('time');
  const date=at?new Date(at):null;
  if(!date || !Number.isFinite(date.getTime())) {
    time.textContent='Time unavailable';
    time.title='This message has no recorded timestamp';
    return time;
  }
  time.dateTime=date.toISOString();
  time.title=date.toLocaleString(undefined,{dateStyle:'full',timeStyle:'long'});
  time.setAttribute('aria-label',time.title);
  const seconds=Math.round((date.getTime()-Date.now())/1000);
  const age=Math.abs(seconds);
  if(age<60)time.textContent='just now';
  else {
    const [unit,size]=age<3600?['minute',60]:age<86400?['hour',3600]:age<2592000?['day',86400]:age<31536000?['month',2592000]:['year',31536000];
    time.textContent=new Intl.RelativeTimeFormat(undefined,{numeric:'always'}).format(Math.trunc(seconds/size),unit);
  }
  return time;
}
async function sessionCall(name,input) {const r=await window.workTask[name](input);if(!r.ok)throw Error(r.error);return r.data;}
async function resumeSession() {
  const state=await sessionCall('state');if(!state)return;
  workSession=state;
  if(!selectedTask || selectedTask.url!==state.url) {
    selectTask({key:'#'+state.issue.number,title:state.issue.title,body:state.issue.body,url:state.url,labels:[]});
    document.getElementById('task-description').style.display='none';
    document.getElementById('desc-toggle').textContent='▸ Task Description';
  }
  document.title='RobOS Agent Task Runner';document.querySelector('h1').textContent='RobOS Agent Task Runner';
  const out=document.getElementById('agent-output');
  const pinned=out.scrollHeight-out.scrollTop-out.clientHeight<80;
  const scroll=out.scrollTop;
  out.style.whiteSpace='normal';
  const expanded=new Set([...out.querySelectorAll('details[open]')].map(e=>e.dataset.event));
  out.replaceChildren();
  renderSessionWorkflow(state);
  for(const event of state.events || []) {
    if(event.role==='error' && /WARN |Reading additional input/.test(event.text)) continue;
    const isTool=event.role==='tool';
    const card=document.createElement(isTool?'details':'article');card.className='session-message '+event.role;
    card.dataset.event=event.at;if(isTool)card.open=expanded.has(event.at);
    const header=document.createElement(isTool?'summary':'div');header.className='session-message-header';
    const label=document.createElement('strong');
    label.textContent=isTool?(event.name+' · '+event.text.split('\n')[0].slice(0,100)):event.role==='assistant'?`RobOS Agent${state.backend?' · '+state.backend:''}`:event.role==='user'?'Task instructions':event.role;
    const body=document.createElement(event.role==='assistant'?'div':'pre');
    if(event.role==='assistant'&&window.marked&&window.DOMPurify){body.className='session-markdown';body.innerHTML=DOMPurify.sanitize(marked.parse(event.text||''),{USE_PROFILES:{html:true}});body.querySelectorAll('a').forEach(a=>a.onclick=e=>{e.preventDefault();if(/^https?:/.test(a.href))window.robos.openUrl(a.href);});}else if(event.role==='assistant')appendLinkedText(body,event.text);else body.textContent=event.text;
    const meta=document.createElement('span');meta.className='session-message-meta';
    const copy=document.createElement('robos-copy');copy.setAttribute('text',event.text||'');copy.setAttribute('label','Copy message');
    meta.append(messageTimestamp(event.at),copy);header.append(label,meta);
    card.append(header,body);out.append(card);
  }
  out.scrollTop=pinned?out.scrollHeight:scroll;
  if(!(state.events||[]).length && state.output){const body=document.createElement('pre');body.textContent=state.output;out.append(body);}
  agentRunning=!!state.workerPid;setAgentBusy(agentRunning);
  const launched=!!(state.sandbox?.id || state.workerPid || state.events?.some(e=>e.role==='assistant'));
  const provider=launched?(state.launchConfig?.provider||state.backend):null;
  const executionError=state.phase==='failed'&&!state.workerPid?(state.workflowView?.error||state.error||state.executionError?.text||'Agent execution failed.'):null;
  setAgentStatus(executionError || [provider,provider?state.launchConfig?.model:null,state.sandbox?.status||state.workflowView?.currentStage||state.phase||'Ready',provider&&state.launchConfig?state.launchConfig.memoryGb+' GiB':null].filter(Boolean).join(' · '),executionError?'done-err':agentRunning?'running':'');
  document.getElementById('btn-start-text').textContent=state.prs?.length?'Review PR':'Run Task';
  document.getElementById('btn-start-agent').disabled=agentRunning||(!state.prs?.length&&!state.planReady);
  document.getElementById('btn-start-agent').title=state.planReady?'Review launch settings and implement the saved plan':state.planBlocker;
  if(!document.getElementById('session-planner')) {
    const btn=document.createElement('button');btn.id='session-planner';btn.className='btn';btn.textContent='Review plan in Task Planner';btn.onclick=()=>sessionCall('open-planner');document.getElementById('btn-start-agent').parentElement.append(btn);
    const review=document.createElement('button');review.id='session-review';review.className='btn';review.textContent='Open PR Review Theater';review.onclick=()=>sessionCall('route');btn.parentElement.append(review);
  }
  const reviewButton=document.getElementById('session-review');reviewButton.hidden=!state.prs?.length;
  let handoff=document.getElementById('session-review-handoff');if(!handoff){handoff=document.createElement('section');handoff.id='session-review-handoff';handoff.setAttribute('role','status');handoff.style.cssText='margin:12px 20px;padding:14px;border:1px solid #3b596d;border-radius:6px;display:flex;align-items:center;gap:16px;flex-wrap:wrap';document.querySelector('.workspace-header').after(handoff);}
  handoff.hidden=!state.prs?.length;handoff.style.display=state.prs?.length?'flex':'none';
  if(state.prs?.length){const message=document.createElement('span');message.style.flex='1';message.textContent='Implementation finished. '+state.prs.length+' PR'+(state.prs.length===1?' is':'s are')+' ready for human review in PR Review Theater. Reopen it here at any time.';handoff.replaceChildren(message,reviewButton);}

  document.getElementById('session-planner').textContent=state.plan?'Review plan in Task Planner':'Create plan in Task Planner';
  let blocker=document.getElementById('session-plan-blocker');if(!blocker){blocker=document.createElement('p');blocker.id='session-plan-blocker';blocker.setAttribute('role','status');document.querySelector('.workspace-header').after(blocker);}
  blocker.hidden=!!state.planReady||!!state.prs?.length;blocker.textContent=state.planBlocker||'';
  if(state.autoStart && !autoStarted && !state.workerPid && !state.prs?.length){autoStarted=true;await handleStartAgent();}
}
handleStartAgent=async function() {
  if(!workSession) {setAgentStatus('Open a ticket using Work ticket in Dev Central.','done-err');return;}
  try {
    if(workSession.workerPid){await resumeSession();return;}
    if(workSession.prs?.length){await sessionCall('route');return;}
    if(!workSession.planReady){setAgentStatus(workSession.planBlocker||'Save an implementation plan in Task Planner before running this task.','done-err');return;}
    await openTaskRunnerLaunch({mode:'implement',plan:workSession.plan||'',refinement:document.getElementById('extra-context').value||'',call:sessionCall,afterLaunch:resumeSession});
    await resumeSession();
  }catch(e){setAgentStatus(e.message,'done-err');}
};
handleStopAgent=async function(){try{await sessionCall('stop');await resumeSession();}catch(e){setAgentStatus(e.message,'done-err');}};
document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>resumeSession().catch(e=>setAgentStatus(e.message,'done-err')),800);});
setInterval(()=>resumeSession().catch(()=>{}),2000);

window.selectWorkTask=async task=>{
  try {autoStarted=false;await sessionCall('select',{issueUrl:task.url});await resumeSession();}
  catch(e){setAgentStatus(e.message,'done-err');}
};

function appendLinkedText(element,text) {
  const links=/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;let last=0,match;
  while((match=links.exec(text))){element.append(document.createTextNode(text.slice(last,match.index)));const a=document.createElement('a');a.textContent=match[1];a.href=match[2];a.onclick=e=>{e.preventDefault();window.robos.openUrl(a.href);};element.append(a);last=links.lastIndex;}
  element.append(document.createTextNode(text.slice(last)));
}

let taskListActionPending=false;
const stoppingTasks=new Set();
window.taskListAction=async function(action,task){
  if(taskListActionPending||!task)return;
  if(action==='issue'){await window.robos.openUrl(task.url);return;}
  if(action==='refresh'){await loadTasks();return;}
  if(action==='stop'){if(stoppingTasks.has(task.url))return;stoppingTasks.add(task.url);const stopButton=[...document.querySelectorAll('.task-stop-button')].find(b=>b.closest('.task-item').dataset.key===task.key);if(stopButton){stopButton.disabled=true;stopButton.title='Stopping agent and preserving work…';}try{const result=await window.robos.stopTask(task.url);if(!result.ok)throw Error(result.error);await refreshTaskActivity();if(workSession?.url===task.url)await resumeSession();}catch(error){setAgentStatus(error.message,'done-err');}finally{stoppingTasks.delete(task.url);renderTaskList();}return;}
  taskListActionPending=true;
  document.querySelectorAll('.task-run-button').forEach(b=>{b.disabled=true;if(b.closest('.task-item').dataset.key===task.key){b.textContent='◌';b.title='Opening task…';b.setAttribute('aria-busy','true');}});
  try {
    // Resolve the clicked row before routing; never act on the previously selected task.
    autoStarted=true;
    await sessionCall('select',{issueUrl:task.url});
    await resumeSession();
    if(action==='plan')await sessionCall('open-planner');
    else if(action==='run')await handleStartAgent();
  }catch(error){setAgentStatus(error.message,'done-err');}
  finally{taskListActionPending=false;renderTaskList();}
};
window.robos.onTaskMenuAction(({action,task})=>window.taskListAction(action,task));

function renderSessionWorkflow(state) {
  let panel=document.getElementById('session-workflow');
  if(!panel){panel=document.createElement('section');panel.id='session-workflow';panel.setAttribute('aria-label','Issue type and workflow');document.querySelector('.agent-output-header').before(panel);}
  panel.replaceChildren();
  const view=state.workflowView;
  const error=state.phase==='failed'&&!state.workerPid?(view?.error||state.error||state.executionError?.text||'Agent execution failed.'):null;
  panel.classList.toggle('has-error',!!error);
  const heading=document.createElement('div');heading.className='session-workflow-heading';
  const type=document.createElement('strong');type.className='session-issue-type';type.textContent=view?.issueType||'Issue type unavailable';heading.append(type);
  const name=document.createElement('span');name.textContent=view?.workflow?.name||'No workflow configured for this issue type';heading.append(name);panel.append(heading);if(view?.epicMapping){const mapping=document.createElement('p');mapping.className='session-epic-mapping';mapping.textContent=view.epicMapping;panel.append(mapping);}
  if(view?.workflow){
    const current=document.createElement('p');current.className='session-workflow-current';current.textContent='Current stage: '+(view.currentStage||'Unresolved')+(error?' — Error':'');panel.append(current);
    const stages=document.createElement('ol');stages.className='session-workflow-stages';
    for(const stage of view.workflow.states){const li=document.createElement('li');li.textContent=stage.label;li.title=stage.current?(error?'Error: '+error:'Current workflow stage'):stage.label;if(stage.current&&error)li.textContent+=' · Error';if(stage.current)li.setAttribute('aria-current','step');stages.append(li);}panel.append(stages);
    const next=document.createElement('small');next.textContent=view.nextStages.length?'Allowed next stages: '+view.nextStages.join(' · '):'No next transition configured';panel.append(next);
  }
  if(view?.warning){const warning=document.createElement('p');warning.className='workflow-warning';warning.textContent=view.warning;panel.append(warning);}
  if(error){const detail=document.createElement('p');detail.className='workflow-error';detail.setAttribute('role','status');detail.textContent=error;panel.append(detail);}
  if(state.phase==='stopped'&&!error){const status=document.createElement('p');status.className='workflow-warning';status.textContent='Agent: '+state.phase.replaceAll('-',' ');panel.append(status);}
}

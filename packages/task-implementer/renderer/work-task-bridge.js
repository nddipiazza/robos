'use strict';
let workSession;
let autoStarted=false;
async function sessionCall(name,input) {const r=await window.workTask[name](input);if(!r.ok)throw Error(r.error);return r.data;}
async function resumeSession() {
  const state=await sessionCall('state');if(!state)return;
  workSession=state;
  if(!selectedTask || selectedTask.url!==state.url) {
    selectTask({key:'#'+state.issue.number,title:state.issue.title,body:state.issue.body,url:state.url,labels:[]});
    document.getElementById('task-description').style.display='none';
    document.getElementById('desc-toggle').textContent='▸ Task Description';
  }
  const out=document.getElementById('agent-output');
  const pinned=out.scrollHeight-out.scrollTop-out.clientHeight<80;
  const scroll=out.scrollTop;
  out.style.whiteSpace='normal';
  const expanded=new Set([...out.querySelectorAll('details[open]')].map(e=>e.dataset.event));
  out.replaceChildren();
  const stages=[['Task loaded',true],['Plan prepared',!!state.plan],['Plan reviewed',!!state.approvedPlanHash],[state.phase==='implementing'?'Implementation running':'Implementation complete',['checking-pr','review','merged'].includes(state.phase)],['Ready for PR review',['review','merged'].includes(state.phase)],['Merged',state.phase==='merged']];
  const milestones=document.createElement('div');milestones.className='session-milestones';
  milestones.textContent=stages.map(([label,done])=>(done?'✓ ':'○ ')+label).join('   →   ');out.append(milestones);
  for(const event of state.events || []) {
    if(event.role==='error' && /WARN |Reading additional input/.test(event.text)) continue;
    const isTool=event.role==='tool';
    const card=document.createElement(isTool?'details':'article');card.className='session-message '+event.role;
    card.dataset.event=event.at;if(isTool)card.open=expanded.has(event.at);
    const label=document.createElement(isTool?'summary':'strong');
    label.textContent=isTool?(event.name+' · '+event.text.split('\n')[0].slice(0,100)):event.role==='assistant'?`RobOS Agent · ${state.backend || 'codex'}`:event.role==='user'?'Task instructions':event.role;
    const body=document.createElement('pre');
    if(event.role==='assistant')appendLinkedText(body,event.text);else body.textContent=event.text;
    card.append(label,body);out.append(card);
  }
  out.scrollTop=pinned?out.scrollHeight:scroll;
  if(!(state.events||[]).length && state.output){const body=document.createElement('pre');body.textContent=state.output;out.append(body);}
  agentRunning=!!state.workerPid;setAgentBusy(agentRunning);
  setAgentStatus(state.error || `${state.backend || 'codex'} · Workflow: ${state.phase || 'ready'}`,state.error?'done-err':agentRunning?'running':'');
  document.getElementById('btn-start-text').textContent=state.prs?.length?'Review PR':state.approvedPlanHash?'Implement approved plan':state.plan?'Refine plan':'Prepare plan';
  if(!document.getElementById('session-planner')) {
    const btn=document.createElement('button');btn.id='session-planner';btn.className='btn';btn.textContent='Review plan in Task Planner';btn.onclick=()=>sessionCall('open-planner');document.getElementById('btn-start-agent').parentElement.append(btn);
    const review=document.createElement('button');review.id='session-review';review.className='btn';review.textContent='Open PR Review Theater';review.onclick=()=>sessionCall('route');btn.parentElement.append(review);
  }
  document.getElementById('session-review').hidden=!state.prs?.length;
  if(state.autoStart && !autoStarted && !state.workerPid && !state.prs?.length){autoStarted=true;await handleStartAgent();}
}
handleStartAgent=async function() {
  if(!workSession) {setAgentStatus('Open a ticket using Work ticket in Dev Central.','done-err');return;}
  try {
    if(workSession.prs?.length){await sessionCall('route');return;}
    const workspace=workSession.workspace || await sessionCall('folder');if(!workspace)return;
    await sessionCall('agent',{backend:workSession.backend || 'codex',mode:workSession.approvedPlanHash?'implement':'plan',workspace,plan:workSession.plan||'',refinement:document.getElementById('extra-context').value||''});
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

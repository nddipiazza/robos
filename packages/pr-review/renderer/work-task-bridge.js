'use strict';
// Adapt the existing six-stage theater to verified GitHub data.
window.prepareRealTheater=function() {
  const ctx=theaterContext;
  window.showReviewPlanLinks?.();
  document.querySelector('.quiz-instruction').textContent='Review the PR scope and commit details, then answer each question.';
  document.querySelector('#stage-1 .stage-title-wrap p').textContent='Understand the proposed change before reviewing its diff and evidence.';
  document.querySelector('#step-btn-5 .step-label').textContent='Validation & Evidence';
  document.querySelector('#stage-5 .stage-title-wrap h3').textContent='Stage 5: Validation and evidence';
  document.querySelector('#stage-5 .stage-title-wrap p').textContent='Inspect the reported checks and evidence links; distinguish completed validation from limitations.';
  document.getElementById('theater-rest-card').hidden=true;
  document.getElementById('theater-debugger-card').hidden=true;
  document.querySelectorAll('#stage-4 .ide-target-box,#stage-4 .bridge-status-dot').forEach(e=>e.hidden=true);
  document.getElementById('intellij-branch-cmd').textContent=`${ctx.pr.baseBranch} … ${ctx.pr.headBranch}`;
  document.getElementById('vscode-branch-cmd').textContent=ctx.pr.url;
  document.getElementById('gate-pill-ide').textContent='Optional IDE review';
  document.getElementById('gate-pill-docs').textContent='PR documentation';
  document.querySelector('#stage-2 .stage-title-wrap p').textContent='Review the PR description, scope, and linked documentation.';
  document.querySelector('#stage-6 .stage-title-wrap h3').textContent='Stage 6: Review and merge';
  document.querySelector('#stage-6 .stage-title-wrap p').textContent='Approval merges this exact reviewed commit, subject to GitHub branch rules.';
  document.querySelectorAll('#stage-5 .canvas-mode-bar,#canvas-desktop-view,#canvas-video-view').forEach(e=>e.hidden=true);
  const badge=document.getElementById('proof-canvas-badge');badge.textContent='Evidence requires review';badge.className='gate-pill';
  let evidence=document.getElementById('real-pr-evidence');
  if(!evidence){evidence=document.createElement('div');evidence.id='real-pr-evidence';evidence.className='theater-card';document.querySelector('#stage-5 .stage-nav-footer').before(evidence);}
  evidence.replaceChildren();
  const description=document.createElement('pre');description.style.whiteSpace='pre-wrap';description.textContent=ctx.pr.body||'The PR has no evidence links or validation notes.';evidence.append(description);
  const checks=document.createElement('ul');
  for(const check of ctx.checks){const row=document.createElement('li');row.textContent=`${check.name||check.context}: ${check.conclusion||check.state||check.status}`;if(check.detailsUrl||check.targetUrl){const b=document.createElement('button');b.textContent='Open check';b.onclick=()=>window.api.openUrl(check.detailsUrl||check.targetUrl);row.append(b);}checks.append(row);}evidence.append(checks);
  if(!ctx.checks.length){const p=document.createElement('p');p.textContent='No automated checks reported by GitHub.';evidence.append(p);}
  const acknowledgement=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='real-evidence-reviewed';checkbox.onchange=()=>{ctx.validationGates.evidenceReviewed=checkbox.checked;renderTheaterSignOff();};acknowledgement.append(checkbox,' I reviewed the validation results and linked evidence for this commit.');evidence.append(acknowledgement);
  const sub=document.querySelector('#gate-card-ci .gate-subtext');sub.textContent='GitHub checks for the reviewed commit';
  document.querySelector('#gate-card-docs .gate-subtext').textContent='PR scope and documentation reviewed';
  document.getElementById('theater-certificate-card').classList.add('hidden');
  document.querySelector('#theater-certificate-card .cert-ribbon').textContent='Knowledge check recorded for this commit';
  document.querySelectorAll('[onclick="window.openAppCourseInHub()"] ').forEach(e=>e.hidden=true);
  renderTheaterSignOff();
};
window.renderRealSignOff=function() {
  const ctx=theaterContext,g=ctx.validationGates;
  for(const [id,pass,label] of [['elearning',g.elearningPassed,g.elearningPassed?`Passed (${ctx.quizScore}%)`:'Pending'],['docs',g.docsReviewed,g.docsReviewed?'Reviewed':'Pending'],['diffs',g.diffsInspected,g.diffsInspected?'Inspected':'Pending'],['ci',g.ciPassed,ctx.checks.length?(g.ciPassed?'Passing':'Pending / failed'):'No checks reported'],['ide',g.ideDiffLaunched,g.ideDiffLaunched?'Opened':'Optional']]){
    const e=document.getElementById('gate-badge-'+id);e.textContent=label;e.className='gate-status-badge '+(pass?'gate-pass':'gate-pending');
  }
  document.getElementById('theater-signoff-lock-banner').classList.toggle('hidden',!!g.elearningPassed);
  const button=document.getElementById('btn-theater-submit-review');
  const approving=document.querySelector('input[name="theater-decision"]:checked')?.value==='approve';
  button.disabled=approving && !(g.elearningPassed&&g.docsReviewed&&g.diffsInspected&&g.evidenceReviewed&&g.ciPassed);
  button.title=button.disabled?'Review the knowledge check, documentation, diffs, and evidence before merging.':'Submit this review to GitHub';
};
document.querySelectorAll('input[name="theater-decision"]').forEach(e=>e.addEventListener('change',()=>{if(theaterContext?.real)renderTheaterSignOff();}));
async function resumeReview() {
  const r=await window.workTask.state();if(!r.ok||!r.data)return;
  const prs=r.data.prs||[];
  if(!prs.length){showError('This task has no linked open PR yet.');return;}
  const open=pr=>window.openPRReviewTheater({...pr,repo:pr.repository?.nameWithOwner || new URL(pr.url).pathname.split('/').slice(1,3).join('/')});
  if(prs.length===1)return open(prs[0]);
  const list=document.getElementById('pr-list');
  if(list){list.replaceChildren();for(const pr of prs){const b=document.createElement('button');b.textContent=`#${pr.number}: ${pr.title}`;b.onclick=()=>open(pr);list.append(b);}}
}
// Existing initialization is independent of a task's cross-repository PR route.
setTimeout(()=>resumeReview().catch(e=>showError(e.message)),400);

const originalLaunchTheaterIDE=window.launchTheaterIDE;
window.launchTheaterIDE=async function(ide){
  if(!theaterContext?.real)return originalLaunchTheaterIDE(ide);
  if(!theaterContext.validationGates.elearningPassed){showError('Complete the knowledge check first.');return;}
  const p=theaterContext.pr;
  const fn=ide==='vscode'?window.api.openInVSCode:window.api.openInIntelliJ;
  const result=await fn({repo:p.repo,number:p.number,headBranch:p.headBranch,changedFiles:p.files.map(f=>f.path)});
  if(!result.ok)showError(result.error||'Could not open IDE.');
  else {theaterContext.validationGates.ideDiffLaunched=true;renderTheaterSignOff();}
};

window.showReviewPlanLinks=async function() {
  let links=document.getElementById('theater-plan-links');
  if(!links){links=document.createElement('nav');links.id='theater-plan-links';links.setAttribute('aria-label','Related plans');document.querySelector('.theater-actions').before(links);}
  links.replaceChildren();
  const result=await window.workTask['plan-links']();
  if(!result.ok){links.title=result.error;return;}
  for(const [label,issue] of [['Task plan',result.data.task],...result.data.features.map(issue=>['Feature plan',issue])]) {
    const button=document.createElement('button');button.className='btn-plan-link';button.dataset.planUrl=issue.url;
    button.textContent=`${label} #${issue.number}`;button.title=`Open ${issue.title} in Task Planner`;
    button.onclick=async()=>{button.disabled=true;try{const opened=await window.workTask['open-related-plan']({targetUrl:issue.url});if(!opened.ok)showError(opened.error);}catch(e){showError(e.message);}finally{button.disabled=false;}};
    links.append(button);
  }
};

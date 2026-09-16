'use strict';
// Adapt the existing six-stage theater to verified GitHub data.
window.prepareRealTheater=function() {
  const ctx=theaterContext;
  ctx.lastRefresh=Date.now();
  const prLink=document.getElementById('theater-open-pr');
  prLink.href=ctx.pr.url;prLink.hidden=false;
  prLink.onclick=async event=>{event.preventDefault();try{const result=await window.api.openUrl(ctx.pr.url);if(!result.ok)showError(result.error||'Could not open the PR in Chrome.');}catch(error){showError(error.message);}};
  window.showReviewPlanLinks?.();
  renderReviewPages();
  document.querySelector('.quiz-instruction').textContent='After reviewing the changes and evidence, check your understanding of this PR.';
  prepareReviewSequence();
  document.querySelector('#stage-1 .stage-title-wrap p').textContent='Understand the proposed change before reviewing its diff and evidence.';
  document.querySelector('#step-btn-5 .step-label').textContent='Validation & Evidence';
  document.querySelector('#stage-5 .stage-title-wrap h3').textContent='Validation and evidence';
  document.querySelector('#stage-5 .stage-title-wrap p').textContent='Inspect the reported checks and evidence links; distinguish completed validation from limitations.';
  document.getElementById('theater-rest-card').hidden=true;
  document.getElementById('theater-debugger-card').hidden=true;
  document.querySelectorAll('#stage-4 .ide-target-box,#stage-4 .bridge-status-dot').forEach(e=>e.hidden=true);
  document.getElementById('intellij-branch-cmd').textContent=`${ctx.pr.baseBranch} … ${ctx.pr.headBranch}`;
  document.getElementById('vscode-branch-cmd').textContent=ctx.pr.url;
  document.getElementById('gate-pill-ide').textContent='Optional IDE review';
  document.getElementById('gate-pill-docs').textContent='PR documentation';
  document.querySelector('#stage-2 .stage-title-wrap p').textContent='Review the PR description, scope, and linked documentation.';
  document.querySelector('#stage-6 .stage-title-wrap h3').textContent='Review and merge';
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
  const approve=document.querySelector('input[name=theater-decision][value=approve]').closest('label');approve.querySelector('strong').textContent='Approve and merge this PR';approve.querySelector('span').textContent='Merge the reviewed commit into '+ctx.pr.baseBranch+'. GitHub branch rules still apply.';
  document.querySelector('input[name=theater-decision][value=request-changes]').closest('label').querySelector('span').textContent='Request revisions on GitHub; this does not restart the agent.';
  document.querySelector('#gate-card-ci strong').textContent='GitHub automated checks';
  const sub=document.querySelector('#gate-card-ci .gate-subtext');sub.textContent='GitHub checks for the reviewed commit';
  document.querySelector('#gate-card-docs .gate-subtext').textContent='PR scope and documentation reviewed';
  document.getElementById('theater-certificate-card').classList.add('hidden');
  document.querySelector('#theater-certificate-card .cert-ribbon').textContent='Knowledge check recorded for this commit';
  document.querySelectorAll('[onclick="window.openAppCourseInHub()"] ').forEach(e=>e.hidden=true);
  prepareReviewInnerTabs();
  prepareSummaryAndChanges(ctx);
  renderTheaterSignOff();
};
window.renderRealSignOff=function() {
  const ctx=theaterContext,g=ctx.validationGates;
  document.querySelector('#gate-card-docs strong').textContent='PR scope & documentation';
  document.querySelector('#gate-card-elearning strong').textContent='Knowledge check';
  document.getElementById('gate-card-ide').hidden=true;
  let evidenceGate=document.getElementById('gate-card-evidence');if(!evidenceGate){evidenceGate=document.getElementById('gate-card-docs').cloneNode(true);evidenceGate.id='gate-card-evidence';evidenceGate.querySelector('[id^=gate-badge]').id='gate-badge-evidence';document.getElementById('gate-card-ci').after(evidenceGate);}evidenceGate.querySelector('strong').textContent='Validation & evidence';evidenceGate.querySelector('.gate-subtext').textContent='Review reported tests and remaining limitations';const evidenceBadge=document.getElementById('gate-badge-evidence');evidenceBadge.textContent=g.evidenceReviewed?'Reviewed':'Pending';evidenceBadge.className='gate-status-badge '+(g.evidenceReviewed?'gate-pass':'gate-pending');
  for(const [id,stage] of [['docs',1],['diffs',3],['evidence',5],['elearning',7]]){const card=document.getElementById('gate-card-'+id);let link=card.querySelector('button');if(!link){link=document.createElement('button');link.className='btn-stage-nav';link.textContent='Review';card.append(link);}link.onclick=()=>{window.setTheaterStage(stage);if(stage===1)window.setReviewInnerTab('summary');};}

  for(const [id,pass,label] of [['elearning',g.elearningPassed,g.elearningPassed?`Passed (${ctx.quizScore}%)`:'Pending'],['docs',g.docsReviewed,g.docsReviewed?'Reviewed':'Pending'],['diffs',g.diffsInspected,g.diffsInspected?'Inspected':'Pending'],['ci',g.ciPassed,ctx.checks.length?(g.ciPassed?'Passing':'Pending / failed'):'No checks reported'],['ide',g.ideDiffLaunched,g.ideDiffLaunched?'Opened':'Optional']]){
    const e=document.getElementById('gate-badge-'+id);e.textContent=label;e.className='gate-status-badge '+(pass?'gate-pass':'gate-pending');
  }
  const required=ctx.reviewPolicy?.requireCompletionCertificate===true;
  document.getElementById('theater-signoff-lock-banner').classList.toggle('hidden',!required||!!g.elearningPassed);
  if(!required&&!g.elearningPassed)document.getElementById('gate-badge-elearning').textContent='Optional';
  document.getElementById('gate-desc-elearning').textContent=required?'Certificate required by organization policy':'Optional — does not block merge';
  const button=document.getElementById('btn-theater-submit-review');
  const action=document.querySelector('input[name="theater-decision"]:checked')?.value;const approving=action==='approve';
  button.textContent=approving?'Approve & merge PR':action==='request-changes'?'Submit change request':'Submit comment';
  const page=reviewPages.find(p=>p.url===ctx.pr.url);
  const blocked=reviewPageCycle||page?.dependsOn.some(url=>reviewPages.some(p=>p.url===url&&p.state!=='MERGED'));
  button.disabled=approving && (blocked||!((!required||g.elearningPassed)&&g.docsReviewed&&g.diffsInspected&&g.evidenceReviewed&&g.ciPassed));
  button.title=blocked?'Merge prerequisite PR pages first; resolve dependency cycles in Git Projects.':button.disabled?'Review the documentation, diffs, and evidence, and complete any required knowledge check before merging.':'Submit this review to GitHub';
};
document.querySelectorAll('input[name="theater-decision"]').forEach(e=>e.addEventListener('change',()=>{if(theaterContext?.real)renderTheaterSignOff();}));
let reviewPages=[];
let reviewPageCycle=false;
const reviewedPages=new Map();
async function openReviewPage(pr){
 if(theaterContext?.real)reviewedPages.set(theaterContext.reviewId,Object.fromEntries(['docsReviewed','diffsInspected','evidenceReviewed'].map(k=>[k,theaterContext.validationGates[k]])));
 await window.openPRReviewTheater({...pr,repo:pr.repo||pr.repository?.nameWithOwner||new URL(pr.url).pathname.split('/').slice(1,3).join('/')});
 if(theaterContext?.real&&reviewedPages.has(theaterContext.reviewId)){Object.assign(theaterContext.validationGates,reviewedPages.get(theaterContext.reviewId));prepareSummaryAndChanges(theaterContext);document.getElementById('real-evidence-reviewed').checked=!!theaterContext.validationGates.evidenceReviewed;renderTheaterSignOff();}
}
function renderReviewPages(){
 let nav=document.getElementById('review-pr-pages');if(!nav){nav=document.createElement('nav');nav.id='review-pr-pages';nav.setAttribute('aria-label','Pull requests in merge order');document.querySelector('.theater-topbar').after(nav);}nav.replaceChildren();nav.hidden=!reviewPages.length;
 const label=document.createElement('span');label.textContent=reviewPageCycle?'Dependency cycle — fix Git project dependencies before merging':'PR pages · dependency order';nav.append(label);
 for(const [index,pr] of reviewPages.entries()){const b=document.createElement('button');b.textContent=`${index+1}. ${pr.repo} #${pr.number}`+(pr.state==='MERGED'?' · Merged':'');b.title=pr.title+(pr.dependsOn.length?' · Merge after '+pr.dependsOn.join(', '):' · No preceding PR dependency');b.className='btn-plan-link';b.setAttribute('aria-current',String(theaterContext?.pr.url===pr.url));b.onclick=()=>{nav.querySelectorAll('button').forEach(x=>x.disabled=true);openReviewPage(pr).catch(e=>showError(e.message)).finally(()=>nav.querySelectorAll('button').forEach(x=>x.disabled=false));};nav.append(b);}
}
window.refreshReviewPages=async()=>{const result=await window.workTask['review-pages']();if(result.ok){const merged=reviewPages.filter(p=>!result.data.pages.some(x=>x.url===p.url)).map(p=>({...p,state:'MERGED'}));reviewPages=[...merged,...result.data.pages];reviewPageCycle=result.data.cycle;renderReviewPages();renderTheaterSignOff();}};
async function resumeReview() {
 const state=await window.workTask.state();if(!state.ok||!state.data)return;
 const result=await window.workTask['review-pages']();if(!result.ok)throw Error(result.error);
 reviewPages=result.data.pages;reviewPageCycle=result.data.cycle;
 if(!reviewPages.length){showError('This task has no linked open PR yet.');return;}
 await openReviewPage(reviewPages.find(p=>p.state==='OPEN')||reviewPages[0]);
}
// Existing initialization is independent of a task's cross-repository PR route.
setTimeout(()=>resumeReview().catch(e=>showError(e.message)),400);

window.launchTheaterIDE=async function(){
  if(!theaterContext?.real){showError('Open a task-linked PR to launch its review workspace.');return;}
  const ctx=theaterContext,p=ctx.pr;
  try {
    const result=await window.robosOpenIDE({
      load:async()=>{const r=await window.workTask['review-ide-options']({prUrl:p.url});if(!r.ok)throw Error(r.error);return r.data;},
      launch:async ideId=>{if(theaterContext!==ctx)throw Error('The selected PR changed. Open its IDE again.');const r=await window.workTask['open-review-workspace']({prUrl:p.url,ideId,reviewedHead:p.headRefOid});if(!r.ok)throw Error(r.error);return r.data;}
    });
    if(result&&theaterContext===ctx){ctx.validationGates.ideDiffLaunched=true;renderTheaterSignOff();}
    return result;
  }catch(e){showError(e.message);}
};

window.showReviewPlanLinks=async function() {
  let links=document.getElementById('theater-plan-links');
  if(!links){links=document.createElement('nav');links.id='theater-plan-links';links.setAttribute('aria-label','Related plans');document.querySelector('.theater-actions').before(links);}
  links.replaceChildren();
  const result=await window.workTask['plan-links']();
  if(!result.ok){links.title=result.error;return;}
  for(const [label,issue] of [['Task plan',result.data.task],...result.data.features.map(issue=>['Epic plan',issue])]) {
    const button=document.createElement('button');button.className='btn-plan-link';button.dataset.planUrl=issue.url;
    button.textContent=`${label} #${issue.number}`;button.title=`Open ${issue.title} in Task Planner`;
    button.onclick=async()=>{button.disabled=true;try{const opened=await window.workTask['open-related-plan']({targetUrl:issue.url});if(!opened.ok)showError(opened.error);}catch(e){showError(e.message);}finally{button.disabled=false;}};
    links.append(button);
  }
};

// Keep the overview first; assess comprehension only after the review.
function prepareReviewSequence() {
  const ctx=theaterContext;
  let quizStage=document.getElementById('stage-7');
  if(!quizStage){
    quizStage=document.createElement('section');quizStage.id='stage-7';quizStage.className='theater-stage';
    quizStage.innerHTML='<div class="stage-header"><div class="stage-title-wrap"><h3>Knowledge check</h3><p>Check your understanding after reviewing the PR.</p></div></div><div class="stage-nav-footer"></div>';
    document.getElementById('stage-6').before(quizStage);
    quizStage.querySelector('.stage-nav-footer').before(document.getElementById('theater-quiz-card'));
    const step=document.createElement('button');step.id='step-btn-7';step.className='step-btn';step.dataset.stage='7';step.onclick=()=>window.setTheaterStage(7);
    step.innerHTML='<span class="step-num">6</span> <span class="step-label">Knowledge check</span>';
    document.getElementById('step-btn-6').before(step);
  }
  const labels={1:'Review changes',5:'Validation & evidence',7:'Knowledge check',6:'Review & merge'};
  const order=[1,5,7,6];
  for(const id of [2,3,4])document.getElementById('step-btn-'+id).hidden=true;
  order.forEach((id,i)=>{
    const step=document.getElementById('step-btn-'+id);document.getElementById('theater-stepper').append(step);step.querySelector('.step-num').textContent=i+1;step.querySelector('.step-label').textContent=labels[id];
    document.querySelector('#stage-'+id+' .stage-title-wrap h3').textContent=labels[id];
    const footer=document.querySelector('#stage-'+id+' .stage-nav-footer');if(!footer)return;footer.replaceChildren();
    for(const [target,text] of [[order[i-1],'← Back'],[order[i+1],'Next: '+labels[order[i+1]]+' →']]){if(!target)continue;const b=document.createElement('button');b.className='btn-stage-nav';b.textContent=text;b.onclick=()=>window.setTheaterStage(target);footer.append(b);}
    if(id===5){const b=document.createElement('button');b.className='btn-stage-nav';b.id='skip-knowledge-check';b.textContent='Skip optional quiz → Review & merge';b.onclick=()=>window.setTheaterStage(6);footer.append(b);}
  });
  document.querySelector('#stage-1 .anti-rubber-stamp-banner').hidden=true;
  const oldGrid=document.querySelector('#stage-1 .stage-grid-2col');
  oldGrid.before(document.getElementById('theater-elearning-modules-card'));oldGrid.style.display='none';
  const lock=document.getElementById('theater-signoff-lock-banner');
  lock.querySelector('strong').textContent='Completion certificate required';
  lock.querySelector('.banner-body span').textContent='This organization requires a passed knowledge check (80%) before merging.';
  lock.querySelector('button').textContent='Open knowledge check';lock.querySelector('button').onclick=()=>window.setTheaterStage(7);
  document.getElementById('theater-review-notes').placeholder='Review findings and approval notes';
  document.getElementById('review-policy-settings')?.remove();
  const settings=document.createElement('details');settings.id='review-policy-settings';settings.className='review-policy-settings';
  const summary=document.createElement('summary');summary.textContent='Organization review policy · '+ctx.reviewPolicy.organization;settings.append(summary);
  const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=ctx.reviewPolicy.requireCompletionCertificate;
  label.append(toggle,' Require a completion certificate before merge');settings.append(label);
  const note=document.createElement('p');note.textContent='Applies to this organization’s repositories on this RobOS installation. GitHub branch rules and required reviewers still apply.';settings.append(note);
  const refresh=()=>{document.getElementById('skip-knowledge-check').hidden=ctx.reviewPolicy.requireCompletionCertificate;document.getElementById('gate-pill-elearning').textContent=ctx.reviewPolicy.requireCompletionCertificate?'Knowledge check required':'Knowledge check optional';renderTheaterSignOff();};
  toggle.onchange=async()=>{toggle.disabled=true;try{const result=await window.api.setPRReviewPolicy({repo:ctx.pr.repo,required:toggle.checked});if(!result.ok)throw Error(result.error);ctx.reviewPolicy=result.policy;refresh();}catch(e){toggle.checked=ctx.reviewPolicy.requireCompletionCertificate;showError(e.message);}finally{toggle.disabled=false;}};
  document.querySelector('#stage-6 .stage-header').after(settings);refresh();
}

function prepareSummaryAndChanges(ctx){
 const card=document.getElementById('theater-elearning-modules-card');
 card.querySelector('h4').textContent='Developer summary & subject guide';
 const brief=document.getElementById('theater-course-brief');brief.replaceChildren();
 const status=document.createElement('p');status.setAttribute('role','status');
 const lesson=document.createElement('article');lesson.className='review-markdown';
 const retry=document.createElement('button');retry.className='btn-primary';retry.textContent='Retry summary & training';retry.hidden=true;
 const docs=document.createElement('details');docs.innerHTML='<summary>PR description & linked documentation</summary>';const description=document.createElement('article');description.className='review-markdown';description.innerHTML=renderReviewMarkdown(ctx.pr.body||'No PR description supplied.');docs.append(description);
 const summaryActions=document.createElement('div');summaryActions.style.cssText='display:flex;gap:10px;align-items:center;margin:16px 0';
 const refine=document.createElement('button');refine.className='btn-primary';refine.textContent='Refine';refine.title='Refine the existing summary and training with an AI prompt';
 const editor=document.createElement('section');editor.hidden=true;editor.style.cssText='margin:16px 0;padding:16px;border:1px solid #303d4b;border-radius:8px';
 editor.innerHTML='<h4>Refine summary &amp; training</h4><robos-ai-textarea show-submit="false" show-commands="false" show-agent="false" min-height="100" max-chars="20000" placeholder="What should change? For example, explain the key concept with a concrete example, or shorten the summary…"></robos-ai-textarea><div style="display:flex;gap:10px;margin-top:12px"><button class="btn-primary" data-update disabled>Choose model &amp; refine…</button><button class="btn-stage-nav" data-cancel>Cancel</button></div>';
 const input=editor.querySelector('robos-ai-textarea'),update=editor.querySelector('[data-update]');
 let busy=false;
 ctx.summaryBusy=false;
 const updateButtons=()=>{refine.hidden=!ctx.savedSummary?.markdown;refine.disabled=busy;retry.disabled=busy;update.disabled=busy||!input.value?.trim();};
 input.addEventListener('input',updateButtons);input.addEventListener('change',updateButtons);
 input.addEventListener('robos-path-query',event=>{const query=event.detail.query.replace(/^~\//,'').toLowerCase();input._showMentions?.((ctx.pr.files||[]).filter(f=>f.path.toLowerCase().includes(query)).slice(0,12).map(f=>({name:f.path,path:f.path})));});
 refine.onclick=()=>{editor.hidden=false;refine.setAttribute('aria-expanded','true');input.focus();};
 editor.querySelector('[data-cancel]').onclick=()=>{editor.hidden=true;refine.setAttribute('aria-expanded','false');refine.focus();};
 refine.setAttribute('aria-expanded','false');
 summaryActions.append(retry,refine);brief.append(status,summaryActions,editor,lesson,docs);
 const saved=ctx.savedSummary;
 if(saved?.markdown){lesson.innerHTML=renderReviewMarkdown(saved.markdown);status.textContent=saved.stale?(saved.commitsBehind===null?'PR changed since this summary was generated':saved.commitsBehind+' commit'+(saved.commitsBehind===1?'':'s')+' since this summary was updated')+(saved.diverged?' · Branch history changed':'')+' · Generated for '+saved.head.slice(0,7):'Summary for commit '+(saved.head||ctx.pr.headRefOid).slice(0,7)+(saved.model?' · '+saved.model:'');}else status.textContent='No summary or training generated. Choose an agent and model when you want to create it.';
 retry.hidden=false;retry.textContent=saved?.stale?'Update summary & training…':saved?.markdown?'Generate with another model…':'Generate summary & training…';
 document.getElementById('review-summary-state').textContent=saved?.stale?(saved.commitsBehind===null?' · Update available':' · '+saved.commitsBehind+' commit'+(saved.commitsBehind===1?'':'s')+' behind'):saved?.markdown?'':' · Not generated';
 document.getElementById('step-status-1').textContent='';
 updateButtons();
 const generate=async(launchConfig,refinement)=>{busy=true;ctx.summaryBusy=true;updateButtons();status.textContent='Generating with '+launchConfig.provider+(launchConfig.model?' · '+launchConfig.model:'')+'… File changes remain available.';document.getElementById('review-summary-state').textContent=' · Generating…';try{const result=await window.api.reviewLesson({reviewId:ctx.reviewId,launchConfig,refinement});if(theaterContext!==ctx)return;if(!result.ok)throw Error(result.error);lesson.innerHTML=renderReviewMarkdown(result.markdown);ctx.savedSummary={markdown:result.markdown,...launchConfig,head:ctx.pr.headRefOid};if(refinement&&input.value.trim()===refinement.instruction){input.value='';editor.hidden=true;refine.setAttribute('aria-expanded','false');}status.textContent='AI explanation · '+launchConfig.provider+(launchConfig.model?' · '+launchConfig.model:'')+' — verify it against the file changes.';document.getElementById('review-summary-state').textContent='';retry.textContent='Generate with another model…';}catch(e){if(theaterContext!==ctx)return;status.textContent='Summary unavailable: '+e.message;document.getElementById('review-summary-state').textContent=' · Retry needed';}finally{busy=false;ctx.summaryBusy=false;if(theaterContext===ctx)updateButtons();}};
 const chooseModel=refinement=>window.openTaskRunnerLaunch({mode:'summary',call:async(action,input)=>{
  if(action==='launch-options'){const result=await window.api.reviewLessonOptions({reviewId:ctx.reviewId});if(!result.ok)throw Error(result.error);if(refinement){result.title='Refine summary & training';result.actionLabel='Refine';result.purpose='Update the existing summary using your prompt and the PR diff. The current summary stays available while AI works.';}return result;}
  if(action==='agent'){if(theaterContext!==ctx)throw Error('The selected PR changed. Reopen generation settings.');if(busy)throw Error('A summary update is already running.');void generate(input.launchConfig,refinement);return {ok:true};}
  throw Error('Unsupported summary action.');
 }});
 retry.onclick=()=>chooseModel(ctx.savedSummary?.stale?{markdown:ctx.savedSummary.markdown,instruction:'Update this summary and training for the current PR changes. Preserve the existing refinements and useful teaching content; remove claims that no longer apply.'}:undefined);
 update.onclick=()=>{if(update.disabled)return;chooseModel({markdown:ctx.savedSummary.markdown,instruction:input.value.trim()});};
 input.addEventListener('robos-submit',()=>update.click());
 function acknowledge(parent,id,text,key){document.getElementById(id)?.remove();const label=document.createElement('label');label.id=id;label.style.cssText='display:block;margin:18px 0';const box=document.createElement('input');box.type='checkbox';box.checked=!!ctx.validationGates[key];box.onchange=()=>{ctx.validationGates[key]=box.checked;renderTheaterSignOff();};label.append(box,' '+text);parent.append(label);}
 acknowledge(brief,'summary-reviewed','I reviewed the PR scope and documentation.','docsReviewed');
 const stage=document.getElementById('stage-3');
 document.getElementById('review-diff-actions')?.remove();const actions=document.createElement('div');actions.id='review-diff-actions';actions.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap';stage.querySelector('.stage-nav-footer').before(actions);
 const page=reviewPages.find(p=>p.url===ctx.pr.url);
 const openIDE=document.createElement('button');openIDE.className='btn-stage-nav';openIDE.textContent='Open in IDE';openIDE.title='Use the IDE associations of all Git projects in this task';openIDE.onclick=async()=>{openIDE.disabled=true;openIDE.textContent='Opening…';try{await window.launchTheaterIDE();}finally{openIDE.disabled=false;openIDE.textContent='Open in IDE';}};actions.append(openIDE);
 acknowledge(actions,'diff-reviewed','I inspected the file changes for this commit.','diffsInspected');
}

function prepareReviewInnerTabs(){
 const stage=document.getElementById('stage-1');
 let tabs=document.getElementById('review-inner-tabs');
 if(!tabs){tabs=document.createElement('nav');tabs.id='review-inner-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','PR changes and explanation');
 tabs.innerHTML='<button id="review-tab-files" role="tab" aria-controls="review-panel-files" data-review-tab="files">File changes</button><button id="review-tab-summary" role="tab" aria-controls="review-panel-summary" data-review-tab="summary">Summary &amp; training<span id="review-summary-state" aria-live="polite"></span></button>';
 stage.querySelector('.stage-header').after(tabs);
 for(const name of ['files','summary']){const panel=document.createElement('section');panel.id='review-panel-'+name;panel.className='review-inner-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','review-tab-'+name);tabs.after(panel);}
 tabs.querySelectorAll('button').forEach(button=>{button.onclick=()=>window.setReviewInnerTab(button.dataset.reviewTab);button.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const name=e.key==='Home'?'files':e.key==='End'?'summary':button.dataset.reviewTab==='files'?'summary':'files';window.setReviewInnerTab(name);document.getElementById('review-tab-'+name).focus();}};});
 }
 const files=document.getElementById('stage-3');files.querySelector('.stage-title-wrap h3').hidden=true;files.querySelector('.stage-title-wrap p').textContent='Select lines and right-click for PR comment / AI fix. Click or Shift-click line numbers to select a range.';files.classList.remove('theater-stage','active');files.classList.add('review-file-content');files.querySelector('.stage-nav-footer').hidden=true;
 document.getElementById('review-panel-files').append(files);
 document.getElementById('review-panel-summary').append(document.getElementById('theater-elearning-modules-card'));
 stage.querySelector('.stage-title-wrap p').textContent='Inspect file changes and use the AI explanation alongside your review. Summary generation does not block the diff.';
 window.setReviewInnerTab('files');
}
window.setReviewInnerTab=function(name){
 for(const value of ['files','summary']){const selected=value===name;const button=document.getElementById('review-tab-'+value),panel=document.getElementById('review-panel-'+value);if(!button||!panel)return;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;panel.hidden=!selected;}
};

window.refreshInlineReviewPR=async pr=>{if(theaterContext?.pr.url!==pr.url||document.getElementById('pr-review-theater').classList.contains('hidden'))return;await openReviewPage(pr);await window.refreshReviewPages();};

// Check on return, never start a model request. Keep unchanged reviews and drafts intact.
let focusRefreshPending=false;
window.addEventListener('focus',async()=>{
 const ctx=theaterContext;
 if(!ctx?.real||ctx.summaryBusy||focusRefreshPending||Date.now()-(ctx.lastRefresh||0)<60000||document.getElementById('pr-review-theater').classList.contains('hidden'))return;
 focusRefreshPending=true;ctx.lastRefresh=Date.now();
 try{
  const result=await window.api.reviewRevision({url:ctx.pr.url});
  if(theaterContext!==ctx)return;
  if(!result.ok)throw Error(result.error);
  if(result.head!==ctx.pr.headRefOid||result.body!==(ctx.pr.body||'')||result.title!==ctx.pr.title){
   const tab=document.getElementById('review-tab-summary')?.getAttribute('aria-selected')==='true'?'summary':'files';
   const file=ctx.fileDiffs?.[activeDiffFileIndex]?.filePath;
   const draft=document.querySelector('#theater-course-brief robos-ai-textarea')?.value;
   await openReviewPage(ctx.pr);
   if(theaterContext?.pr.url!==ctx.pr.url)return;
   const index=theaterContext.fileDiffs.findIndex(f=>f.filePath===file);
   if(index>=0){activeDiffFileIndex=index;renderTheaterDiffViewer();}
   window.setReviewInnerTab(tab);
   if(draft){const input=document.querySelector('#theater-course-brief robos-ai-textarea');input.value=draft;input.closest('section').hidden=false;input.dispatchEvent(new Event('input'));}
  }
 }catch(e){showError('Could not refresh PR: '+e.message);}
 finally{focusRefreshPending=false;}
});

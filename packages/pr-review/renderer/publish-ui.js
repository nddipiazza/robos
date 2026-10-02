'use strict';
window.configureReviewPublish = function(pr) {
  window.refreshAdjustmentCommand?.();
  const ready=document.getElementById('pr-ready-button'),notice=document.getElementById('pr-ready-status');
  if(ready){
    ready.hidden=!(pr.state==='OPEN' && pr.isDraft && !pr.stateError);
    ready.disabled=false;ready.textContent='Move PR to Ready';if(notice)notice.textContent='';
    ready.onclick=()=>window.offerReadyNotification(pr,ready,notice);

  }

  const trigger=document.getElementById('step-btn-8');trigger.hidden=!pr.local;
  const status=pr.stateError||pr.published&&!pr.state?'unknown':!pr.published?'not-created':pr.state==='MERGED'?'merged':pr.state==='CLOSED'?'closed':pr.isDraft?'draft':'review';
  const labels={'unknown':'Status Unavailable','not-created':'Not Created',draft:'In Draft',review:'In Review',merged:'Merged',closed:'Closed'};
  trigger.dataset.prStatus=status;trigger.querySelector('.step-label').textContent='Pull Request ('+labels[status]+')';
  let icon=trigger.querySelector('.pr-state-icon');if(!icon){icon=document.createElement('span');icon.className='pr-state-icon';icon.setAttribute('aria-hidden','true');trigger.prepend(icon);}icon.textContent=({unknown:'?', 'not-created':'+',draft:'◌',review:'↗',merged:'✓',closed:'×'})[status];
  trigger.querySelector('.pr-tab-icon')?.setAttribute('hidden','');
  const editable=!!pr.published && pr.isAuthor && pr.state==='OPEN' && !pr.stateError;
  const stage=document.getElementById('stage-8');stage.replaceChildren();
  if (!pr.local) return;
  const key='robos-pr-draft:'+pr.repo+':'+pr.headBranch+(pr.published?':'+pr.number:'');
  let saved={};try {saved=JSON.parse(localStorage.getItem(key)||'{}');} catch {}
  {
    const dialog=document.createElement('div');dialog.className='review-publish-stage';
    const heading=document.createElement('h3');heading.textContent=pr.published?(pr.isAuthor?'Code review · Author mode':'Code review · Reviewer mode'):'Create pull request';
    const branch=document.createElement('p');branch.textContent=`${pr.repo} · ${pr.headBranch} → ${pr.baseBranch}`;
    const titleLabel=document.createElement('label');titleLabel.textContent='Title';const title=document.createElement('input');title.value=pr.published?pr.title:saved.title ?? pr.title;title.maxLength=256;titleLabel.append(title);
    const bodyLabel=document.createElement('div');bodyLabel.className='review-description-field';const bodyHeading=document.createElement('p');bodyHeading.textContent='Description';bodyLabel.append(bodyHeading);const body=document.createElement('review-markdown-editor');body.value=pr.published?pr.body:saved.body ?? pr.body ?? '';bodyLabel.append(body);
    const draftLabel=document.createElement('label');const draft=document.createElement('input');draft.type='checkbox';draft.checked=!!saved.draft;draftLabel.append(draft,' Create as draft');
    const error=document.createElement('p');error.setAttribute('role','alert');
    window.cleanupPublishProgress?.();window.cleanupPublishProgress=window.api.onPublishProgress?.(text=>{error.textContent=text;});
    const open=document.createElement('button');open.textContent='Open pull request';open.hidden=!pr.published;
    const openPR=async()=>{open.disabled=true;error.textContent='Opening pull request in your browser…';try{const result=await window.api.openUrl(pr.url);if(result?.ok===false)throw Error(result.error);error.textContent='Opened in your default browser: '+pr.url;}catch(e){error.textContent=e.message+' '+pr.url;}finally{open.disabled=false;}};
    open.onclick=openPR;
    let aiDescription;
    const save=()=>{try {localStorage.setItem(key,JSON.stringify({title:title.value,body:body.value,draft:draft.checked,...(aiDescription?.state()||{})}));} catch {error.textContent='Draft cannot be saved across restarts on this device.';}};
    for(const field of [title,body,draft])field.addEventListener('input',save);
    const messagingHost=document.createElement('div');
    const messaging=!pr.published && window.mountReviewMessageOptions?.(messagingHost,pr,title,body,saved);
    const aiHost=document.createElement('div');
    const create=document.createElement('button');create.textContent='Create PR';create.onclick=async()=>{
      create.disabled=true;create.textContent='Preparing PR…';error.textContent='Checking the description…';
      try{
        if(aiDescription && !await aiDescription.ensureReady()){error.textContent='The description needs your review. Check the description and its status above, then click Create PR when ready.';return;}
        save();create.textContent='Creating PR…';error.textContent='Checking the branch and creating the PR…';
        await messaging?.ready;save();messaging?.validate();const result=await window.api.createReviewPR({title:title.value,body:body.value,draft:draft.checked});if(!result.ok)throw new Error(result.error);
        Object.assign(pr,result.pr);await messaging?.send();
        const fresh=await window.api.refreshReviewPR();if(!fresh.ok)throw Error('PR created, but refresh failed: '+fresh.error);
        try{localStorage.removeItem(key);}catch{}
        if(window.openPRReviewTheater)await window.openPRReviewTheater(fresh.pr);else window.configureReviewPublish(fresh.pr);
        window.setTheaterStage?.(8);
      }catch(e){error.textContent=e.message;}finally{create.disabled=false;create.textContent='Create PR';error.scrollIntoView({block:'nearest'});}
    };
    const refresh=document.createElement('button');refresh.textContent='Reload PR';refresh.hidden=!pr.published;refresh.onclick=async()=>{refresh.disabled=true;try{const r=await window.api.refreshReviewPR();if(!r.ok)throw Error(r.error);if(window.openPRReviewTheater)await window.openPRReviewTheater(r.pr);else window.configureReviewPublish(r.pr);window.setTheaterStage?.(8);}catch(e){error.textContent=e.message;}finally{refresh.disabled=false;}};
    const update=document.createElement('button');update.textContent='Update PR';update.hidden=!editable;update.onclick=async()=>{update.disabled=true;error.textContent='Updating the PR…';try{const r=await window.api.updateReviewPR({title:title.value,body:body.value,expectedTitle:pr.title,expectedBody:pr.body});if(!r.ok)throw Error(r.error);Object.assign(pr,r.pr);title.value=pr.title;body.value=pr.body;const header=document.querySelector('#theater-pr-title a');if(header)header.textContent='#'+pr.number+' · '+pr.title;error.textContent='PR description updated on GitHub.';}catch(e){error.textContent=e.message;}finally{update.disabled=false;}};
    if(pr.isDraft && ready && !ready.hidden){const promote=document.createElement('button');promote.className='pr-ready-button';promote.textContent='Move PR to Ready';promote.onclick=()=>ready.click();dialog.append(promote);}
    dialog.append(heading,branch,titleLabel,aiHost,bodyLabel,draftLabel,messagingHost,error,create,update,refresh,open);stage.append(dialog);
    body.addEventListener('editor-warning',e=>error.textContent=e.detail);
    aiDescription=window.mountAIDescription?.(aiHost,{pr,title,body,saved,save,ready:messaging?.ready});
    if(pr.published){create.hidden=true;title.disabled=!editable;body.disabled=!editable;draftLabel.hidden=true;open.hidden=false;error.textContent=pr.stateError|| (editable?'Review the evidence and walkthrough, revise the description, or discuss further adjustments.':pr.state==='CLOSED'||pr.state==='MERGED'?'This PR is '+labels[status].toLowerCase()+'. Evidence and changes remain available.':'Description edits are available to the author of an open PR.');}
  }
};

window.offerReadyNotification = function(pr,ready,notice) {
 const dialog=document.createElement('dialog');dialog.className='pr-ready-dialog';dialog.setAttribute('aria-labelledby','pr-ready-heading');
 const heading=document.createElement('h2');heading.id='pr-ready-heading';heading.textContent='Ready for review';
 const text=document.createElement('p');text.className='pr-ready-intro';text.textContent='Take this PR out of draft. You can request reviewers and notify your team below.';
 const field=document.createElement('div');field.className='pr-ready-field';const label=document.createElement('label');label.htmlFor='pr-ready-reviewers';label.textContent='GitHub reviewers';const reviewers=document.createElement('input');reviewers.id='pr-ready-reviewers';reviewers.placeholder='username, organization/team';reviewers.autocomplete='off';reviewers.setAttribute('aria-describedby','pr-ready-help');const help=document.createElement('p');help.id='pr-ready-help';help.textContent='Optional. Separate GitHub usernames or teams with commas.';const assignLabel=document.createElement('label');assignLabel.className='pr-assign-reviewers';const assign=document.createElement('input');assign.type='checkbox';assign.checked=true;assignLabel.append(assign,' Request GitHub reviews');field.append(assignLabel,label,reviewers,help);
 const host=document.createElement('div'),status=document.createElement('p');status.role='status';status.className='pr-ready-feedback';
 const title=document.createElement('input'),body=document.createElement('textarea');title.value=pr.title||'';body.value=pr.body||'';
 const options=window.mountReviewMessageOptions?.(host,pr,title,body,{}, {url:pr.url,occasion:'ready'});
 const cancel=document.createElement('button');cancel.className='pr-ready-cancel';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();
 const confirm=document.createElement('button');confirm.className='pr-ready-button';confirm.textContent='Move PR to Ready';confirm.disabled=true;
 let loading=true,loadError='';reviewers.disabled=true;help.textContent='Loading configured reviewers…';
 const updateSelection=()=>{reviewers.disabled=loading||!assign.checked;confirm.disabled=loading;};assign.onchange=updateSelection;
 const defaults=window.api.reviewGitHubReviewers?window.api.reviewGitHubReviewers():window.api.reviewMessageOptions?window.api.reviewMessageOptions(pr.url).then(r=>({...r,reviewers:r.settings?.githubReviewers||[],source:'Git Projects'})):Promise.resolve({ok:true,reviewers:[],source:'Git Projects'});
 defaults.then(r=>{if(!r.ok)throw Error(r.error);reviewers.value=(r.reviewers||[]).join(', ');help.textContent=(r.reviewers?.length?'Defaults from '+r.source+'. ':'No default reviewers configured. ')+'Add or remove reviewers for this PR only. Uncheck to assign none.';}).catch(e=>{loadError=e.message;help.textContent=e.message+' Enter reviewers here or uncheck Request GitHub reviews.';}).finally(()=>{loading=false;updateSelection();});
 confirm.onclick=async()=>{
  confirm.disabled=true;cancel.disabled=true;status.textContent='Checking GitHub…';
  try{
   await options?.ready;options?.validate();
   const selected=assign.checked?reviewers.value.split(/[\s,]+/).filter(Boolean):[];
   if(assign.checked&&!selected.length)throw Error(loadError||'Add a GitHub reviewer, or uncheck Request GitHub reviews to assign none.');
   const result=await window.api.readyReviewPR(pr.headRefOid,pr.url,selected);if(!result.ok)throw Error(result.error);
   Object.assign(pr,result.pr);ready.hidden=true;
   if(window.openPRReviewTheater)await window.openPRReviewTheater(pr);else window.configureReviewPublish(pr);
   status.textContent=result.pr.reviewerError||'PR is ready for review.';
   if(notice)notice.textContent=status.textContent;
   const message=await options?.send();if(message)status.textContent+=' '+message;
   confirm.hidden=true;cancel.textContent='Done';
  }catch(e){status.textContent=e.message;confirm.disabled=false;}finally{cancel.disabled=false;}
 };
 const footer=document.createElement('footer');footer.className='pr-ready-actions';footer.append(cancel,confirm);dialog.append(heading,text,field,host,status,footer);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
};

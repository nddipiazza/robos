'use strict';
window.configureReviewPublish = function(pr) {
  window.refreshAdjustmentCommand?.();
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
    dialog.append(heading,branch,titleLabel,aiHost,bodyLabel,draftLabel,messagingHost,error,create,update,refresh,open);stage.append(dialog);
    body.addEventListener('editor-warning',e=>error.textContent=e.detail);
    aiDescription=window.mountAIDescription?.(aiHost,{pr,title,body,saved,save,ready:messaging?.ready});
    if(pr.published){create.hidden=true;title.disabled=!editable;body.disabled=!editable;draftLabel.hidden=true;open.hidden=false;error.textContent=pr.stateError|| (editable?'Review the evidence and walkthrough, revise the description, or discuss further adjustments.':pr.state==='CLOSED'||pr.state==='MERGED'?'This PR is '+labels[status].toLowerCase()+'. Evidence and changes remain available.':'Description edits are available to the author of an open PR.');}
  }
};

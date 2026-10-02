'use strict';
window.configureReviewPublish = function(pr) {
  const trigger=document.getElementById('step-btn-8');trigger.hidden=!pr.local;trigger.querySelector('.step-label').textContent='Pull Request';
  const stage=document.getElementById('stage-8');stage.replaceChildren();
  if (!pr.local) return;
  const key='robos-pr-draft:'+pr.repo+':'+pr.headBranch;
  let saved={};try {saved=JSON.parse(localStorage.getItem(key)||'{}');} catch {}
  {
    const dialog=document.createElement('div');dialog.className='review-publish-stage';
    const heading=document.createElement('h3');heading.textContent='Create pull request';
    const branch=document.createElement('p');branch.textContent=`${pr.repo} · ${pr.headBranch} → ${pr.baseBranch}`;
    const titleLabel=document.createElement('label');titleLabel.textContent='Title';const title=document.createElement('input');title.value=saved.title ?? pr.title;title.maxLength=256;titleLabel.append(title);
    const bodyLabel=document.createElement('div');bodyLabel.className='review-description-field';const bodyHeading=document.createElement('p');bodyHeading.textContent='Description';bodyLabel.append(bodyHeading);const body=document.createElement('review-markdown-editor');body.value=saved.body ?? pr.body ?? '';bodyLabel.append(body);
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
    const messaging=window.mountReviewMessageOptions?.(messagingHost,pr,title,body,saved);
    const aiHost=document.createElement('div');
    const create=document.createElement('button');create.textContent='Create PR';create.onclick=async()=>{
      create.disabled=true;create.textContent='Preparing PR…';error.textContent='Checking the description…';
      try{
        if(aiDescription && !await aiDescription.ensureReady()){error.textContent='The description needs your review. Check the description and its status above, then click Create PR when ready.';return;}
        save();create.textContent='Creating PR…';error.textContent='Checking the branch and creating the PR…';
        await messaging?.ready;save();messaging?.validate();const result=await window.api.createReviewPR({title:title.value,body:body.value,draft:draft.checked});if(!result.ok)throw new Error(result.error);
        Object.assign(pr,result.pr);const link=document.createElement('a');link.href=result.pr.url;link.textContent=`#${result.pr.number} · ${result.pr.title}`;link.onclick=e=>{e.preventDefault();openPR();};document.getElementById('theater-pr-title').replaceChildren(link);trigger.querySelector('.step-label').textContent='Pull Request';document.getElementById('theater-target-app').textContent=`${result.pr.repo} · ${result.pr.headBranch}`;error.textContent='Pull request created.';open.hidden=false;create.hidden=true;title.disabled=true;body.disabled=true;draft.disabled=true;
        await messaging?.send();
      }catch(e){error.textContent=e.message;}finally{create.disabled=false;create.textContent='Create PR';error.scrollIntoView({block:'nearest'});}
    };
    dialog.append(heading,branch,titleLabel,aiHost,bodyLabel,draftLabel,messagingHost,error,create,open);stage.append(dialog);
    body.addEventListener('editor-warning',e=>error.textContent=e.detail);
    aiDescription=window.mountAIDescription?.(aiHost,{pr,title,body,saved,save,ready:messaging?.ready});
    if(pr.published){trigger.querySelector('.step-label').textContent='Pull Request';create.hidden=true;title.disabled=true;body.disabled=true;draft.disabled=true;error.textContent='Pull request created.';open.hidden=false;}
  }
};

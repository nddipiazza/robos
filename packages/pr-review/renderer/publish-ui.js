'use strict';
window.configureReviewPublish = function(pr) {
  const trigger=document.getElementById('step-btn-8');trigger.hidden=!pr.local;
  const stage=document.getElementById('stage-8');stage.replaceChildren();
  if (!pr.local) return;
  const key='robos-pr-draft:'+pr.repo+':'+pr.headBranch;
  let saved={};try {saved=JSON.parse(localStorage.getItem(key)||'{}');} catch {}
  {
    const dialog=document.createElement('div');dialog.className='review-publish-stage';
    const heading=document.createElement('h3');heading.textContent='Create pull request';
    const branch=document.createElement('p');branch.textContent=`${pr.repo} · ${pr.headBranch} → ${pr.baseBranch}`;
    const titleLabel=document.createElement('label');titleLabel.textContent='Title';const title=document.createElement('input');title.value=saved.title ?? pr.title;title.maxLength=256;titleLabel.append(title);
    const bodyLabel=document.createElement('label');bodyLabel.textContent='Description';const body=document.createElement('textarea');body.rows=6;body.value=saved.body ?? pr.body ?? '';bodyLabel.append(body);
    const draftLabel=document.createElement('label');const draft=document.createElement('input');draft.type='checkbox';draft.checked=!!saved.draft;draftLabel.append(draft,' Create as draft');
    const error=document.createElement('p');error.setAttribute('role','alert');
    const save=()=>{try {localStorage.setItem(key,JSON.stringify({title:title.value,body:body.value,draft:draft.checked}));} catch {error.textContent='Draft cannot be saved across restarts on this device.';}};
    for(const field of [title,body,draft])field.addEventListener('input',save);
    const messagingHost=document.createElement('div');
    const messaging=window.mountReviewMessageOptions?.(messagingHost,pr,title,body,saved);
    const create=document.createElement('button');create.textContent='Create PR';create.onclick=async()=>{
      save();create.disabled=true;error.textContent='Checking the branch and creating the PR…';
      try{await messaging?.ready;save();messaging?.validate();const result=await window.api.createReviewPR({title:title.value,body:body.value,draft:draft.checked});if(!result.ok)throw new Error(result.error);
        Object.assign(pr,result.pr);const link=document.createElement('a');link.href=result.pr.url;link.textContent=`#${result.pr.number} · ${result.pr.title}`;link.onclick=e=>{e.preventDefault();window.api.openUrl(link.href);};document.getElementById('theater-pr-title').replaceChildren(link);trigger.querySelector('.step-label').textContent='PR created';document.getElementById('theater-target-app').textContent=`${result.pr.repo} · ${result.pr.headBranch}`;error.textContent='Pull request created. Use the linked title above to open it.';create.hidden=true;title.disabled=true;body.disabled=true;draft.disabled=true;
        await messaging?.send();
      }catch(e){error.textContent=e.message;}finally{create.disabled=false;}
    };
    dialog.append(heading,branch,titleLabel,bodyLabel,draftLabel,messagingHost,error,create);stage.append(dialog);
    if(pr.published){trigger.querySelector('.step-label').textContent='PR created';create.hidden=true;title.disabled=true;body.disabled=true;draft.disabled=true;error.textContent='Pull request created. Use the linked title above to open it.';}
  }
};

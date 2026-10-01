'use strict';
window.configureReviewPublish = function(pr) {
  const trigger=document.getElementById('btn-create-review-pr');trigger.hidden=!pr.local || !!pr.published;
  trigger.onclick=()=>{
    const dialog=document.createElement('dialog');dialog.className='review-publish-dialog';dialog.setAttribute('aria-label','Create pull request');
    const heading=document.createElement('h3');heading.textContent='Create pull request';
    const branch=document.createElement('p');branch.textContent=`${pr.repo} · ${pr.headBranch} → ${pr.baseBranch}`;
    const titleLabel=document.createElement('label');titleLabel.textContent='Title';const title=document.createElement('input');title.value=pr.title;title.maxLength=256;titleLabel.append(title);
    const bodyLabel=document.createElement('label');bodyLabel.textContent='Description';const body=document.createElement('textarea');body.rows=6;body.value=pr.body||'';bodyLabel.append(body);
    const draftLabel=document.createElement('label');const draft=document.createElement('input');draft.type='checkbox';draftLabel.append(draft,' Create as draft');
    const error=document.createElement('p');error.setAttribute('role','alert');
    const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();
    const create=document.createElement('button');create.textContent='Create PR';create.onclick=async()=>{
      create.disabled=true;cancel.disabled=true;error.textContent='Checking the branch and creating the PR…';
      try{const result=await window.api.createReviewPR({title:title.value,body:body.value,draft:draft.checked});if(!result.ok)throw new Error(result.error);
        Object.assign(pr,result.pr);const link=document.createElement('a');link.href=result.pr.url;link.textContent=`#${result.pr.number} · ${result.pr.title}`;link.onclick=e=>{e.preventDefault();window.api.openUrl(link.href);};document.getElementById('theater-pr-title').replaceChildren(link);trigger.hidden=true;document.getElementById('theater-target-app').textContent=`${result.pr.repo} · ${result.pr.headBranch}`;dialog.close();
      }catch(e){error.textContent=e.message;}finally{create.disabled=false;cancel.disabled=false;}
    };
    dialog.addEventListener('cancel',event=>{if(create.disabled)event.preventDefault();});dialog.addEventListener('close',()=>dialog.remove());
    dialog.append(heading,branch,titleLabel,bodyLabel,draftLabel,error,cancel,create);document.body.append(dialog);dialog.showModal();title.focus();
  };
};

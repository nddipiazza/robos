'use strict';
document.getElementById('open-review-ide').onclick=async()=>{
 if(document.querySelector('.review-ide-dialog'))return;
 const dialog=document.createElement('dialog');dialog.className='review-ide-dialog';dialog.setAttribute('aria-labelledby','review-ide-title');
 const header=document.createElement('header');const title=document.createElement('h2');title.id='review-ide-title';title.textContent='Open in IDE';const close=document.createElement('button');close.textContent='×';close.className='review-ide-close';close.setAttribute('aria-label','Close IDE chooser');close.onclick=()=>dialog.close();header.append(title,close);
 const subtitle=document.createElement('p');subtitle.textContent='Choose where to continue working.';
 const workspace=document.createElement('p');workspace.className='review-ide-workspace';
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Finding installed IDEs…';
 const list=document.createElement('div');list.className='review-ide-list';
 const footer=document.createElement('p');footer.className='review-ide-note';footer.textContent='Opens the current checkout with your local changes.';
 dialog.append(header,subtitle,workspace,status,list,footer);document.body.append(dialog);dialog.onclose=()=>{dialog.remove();document.getElementById('open-review-ide').focus();};dialog.showModal();
 try{const result=await window.api.reviewIDEs();if(!result.ok)throw Error(result.error);if(!result.workspace)throw Error('This review has no local checkout to open.');workspace.textContent=result.workspace;workspace.title=result.workspace;
 let previous;try{previous=localStorage.getItem('robos-review-ide');}catch{}
 status.textContent=result.ides.length?'':'No supported IDEs found. Install an IDE with its command-line launcher, then reopen this chooser.';
 for(const ide of result.ides){const button=document.createElement('button');button.className='review-ide-option';const icon=document.createElement('span');icon.className='review-ide-icon';icon.textContent=({idea:'IJ',code:'<>',pycharm:'PY',webstorm:'WS',clion:'CL',rider:'RD'})[ide.id]||ide.name.slice(0,2).toUpperCase();icon.setAttribute('aria-hidden','true');const text=document.createElement('span');text.textContent=ide.name;const hint=document.createElement('small');hint.textContent=previous===ide.id?'Last used':'Open workspace';text.append(hint);const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');button.append(icon,text,arrow);button.onclick=async()=>{for(const el of list.children)el.disabled=true;status.textContent='Opening '+ide.name+'…';try{const r=await window.api.openReviewIDE(ide.id);if(!r.ok)throw Error(r.error);try{localStorage.setItem('robos-review-ide',ide.id);}catch{}dialog.close();}catch(e){status.textContent=e.message;for(const el of list.children)el.disabled=false;}};list.append(button);}
 list.querySelector('button')?.focus();
 }catch(e){status.textContent=e.message;}
};

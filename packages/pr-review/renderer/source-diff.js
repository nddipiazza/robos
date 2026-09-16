'use strict';
(()=>{
 let sequence=0,currentKey='',view=null;
 window.renderSourceDiff=async(ctx,file,mode,container)=>{
  const key=ctx.reviewId+'|'+file.filePath;
  if(view&&key===currentKey){view.mode(mode);return;}
  currentKey=key;const request=++sequence;view?.dispose();view=null;
  document.getElementById('inline-review-panel')?.remove();
  container.replaceChildren();container.classList.add('source-diff-container');
  const status=document.createElement('p');status.className='source-diff-status';status.textContent='Loading source at the reviewed commits…';container.append(status);
  try{
   const data=await window.api.reviewSource({reviewId:ctx.reviewId,path:file.filePath});
   if(request!==sequence)return;if(!data.ok)throw Error(data.error);
   const host=document.createElement('div');host.className='source-diff-editor';host.style.visibility='hidden';container.append(host);
   const editor=await window.RobosSourceDiff.create(host,'../node_modules/monaco-editor/min/vs',(side,line,startLine=line)=>{
    const inDiff=file.hunks.some(h=>{
     const lines=new Set(h.lines.map(r=>side==='LEFT'?r.oldLine:r.newLine).filter(Number.isInteger));
     return line>=startLine&&line-startLine<lines.size&&Array.from({length:line-startLine+1},(_,i)=>startLine+i).every(n=>lines.has(n));
    });
    if(!inDiff){showError('Select a continuous line range within one diff hunk on the same side.');return;}
    window.openInlineReview({ctx,path:file.filePath,line,startLine,side});
   });
   if(request!==sequence){editor.dispose();host.remove();return;}
   view=editor;status.textContent='Computing highlighted changes…';await view.show(data,currentDiffMode);
   if(request!==sequence)return;
   host.style.visibility='';status.remove();
   const tools=document.createElement('nav');tools.className='source-diff-tools';tools.setAttribute('aria-label','Source diff tools');
   const button=(label,title,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.onclick=()=>action(b);tools.append(b);};
   button('Previous change','Jump to the previous change',()=>view.editor.goToDiff('previous'));
   button('Next change','Jump to the next change',()=>view.editor.goToDiff('next'));
   button('Find','Search source (Ctrl+F)',()=>{const e=view.editor.getModifiedEditor();e.focus();e.getAction('actions.find').run();});
   let wrap=false,context=false;
   button('Wrap lines','Toggle long-line wrapping',b=>{wrap=!wrap;b.setAttribute('aria-pressed',String(wrap));view.editor.updateOptions({diffWordWrap:wrap?'on':'off'});});
   button('Full context','Expand unchanged source',b=>{context=!context;b.setAttribute('aria-pressed',String(context));view.editor.updateOptions({hideUnchangedRegions:{enabled:!context}});});
   container.prepend(tools);
  }catch(e){if(request!==sequence)return;view?.dispose();view=null;container.querySelector('.source-diff-editor')?.remove();status.textContent=e.message;const retry=document.createElement('button');retry.className='btn-stage-nav';retry.textContent='Retry';retry.onclick=()=>window.renderSourceDiff(ctx,file,currentDiffMode,container);status.append(document.createElement('br'),retry);}
 };
})();

'use strict';
(()=>{
 const drafts=new Map();let watching=null,polling=false;
 const check=result=>{if(!result?.ok)throw Error(result?.error||'Request failed');return result;};
 window.openInlineReview=async({ctx,path,line,startLine=line,side,row,anchor})=>{
  document.getElementById('inline-review-panel')?.remove();
  const target={reviewId:ctx.reviewId,path,line,startLine,side},key=JSON.stringify(target),draft=drafts.get(key)||{comment:'',fix:''};drafts.set(key,draft);
  const panel=document.createElement('section');panel.id='inline-review-panel';panel.setAttribute('aria-label','Review selected line');
  panel.innerHTML='<header><strong></strong><button type="button" data-close aria-label="Close inline review">×</button></header><div role="tablist"><button role="tab" data-tab="comment" aria-selected="true">PR comment</button><button role="tab" data-tab="fix" aria-selected="false">AI fix</button></div><section data-pane="comment" role="tabpanel"><div data-comments></div><label>Comment<textarea placeholder="Leave feedback on this line…" rows="3"></textarea></label><button type="button" data-post>Post comment</button></section><section data-pane="fix" role="tabpanel" hidden><robos-ai-textarea show-submit="false" show-commands="false" show-agent="false" min-height="100" placeholder="Describe what the agent should fix on this line…"></robos-ai-textarea><div data-runner></div></section><p role="status" aria-live="polite"></p>';
  panel.querySelector('strong').textContent=`${path}:${startLine===line?line:startLine+'–'+line} · ${side==='LEFT'?'Old':'New'} version`;panel.setAttribute('popover','auto');panel.setAttribute('role','dialog');
  document.body.append(panel);
  const fallback=(row||document.getElementById('diff-code-lines')).getBoundingClientRect();
  const point=anchor||{x:fallback.left+40,y:fallback.top+40};
  const place=()=>{
   const margin=12,width=panel.getBoundingClientRect().width,height=panel.getBoundingClientRect().height;
   const x=Math.max(margin,Math.min(point.x,innerWidth-width-margin));
   const below=point.y+8,above=point.y-height-24;
   const y=Math.max(margin,Math.min(below+height<=innerHeight-margin?below:above,innerHeight-height-margin));
   panel.style.left=x+'px';panel.style.top=y+'px';
  };
  panel.showPopover();place();
  const sizeObserver=new ResizeObserver(place);sizeObserver.observe(panel);
  window.addEventListener('resize',place);
  const cleanup=()=>{sizeObserver.disconnect();window.removeEventListener('resize',place);removed.disconnect();};
  const removed=new MutationObserver(()=>{if(!panel.isConnected)cleanup();});removed.observe(document.body,{childList:true});
  panel.addEventListener('toggle',event=>{if(event.newState==='closed'){cleanup();panel.remove();anchor?.focus?.();}});

  const status=panel.querySelector('[role=status]'),comment=panel.querySelector('textarea'),fix=panel.querySelector('robos-ai-textarea'),post=panel.querySelector('[data-post]');
  comment.value=draft.comment;fix.value=draft.fix;
  const valid=()=>{if(theaterContext!==ctx)throw Error('The selected PR changed. Reopen feedback on its current diff.');};
  let busy=false,runner=null,runnerLoading=false;const update=()=>{post.disabled=busy||!comment.value.trim();runner?.update();};
  comment.oninput=()=>{draft.comment=comment.value;update();};fix.addEventListener('input',()=>{draft.fix=fix.value;update();});fix.addEventListener('change',()=>{draft.fix=fix.value;update();});update();
  fix.addEventListener('robos-submit',()=>runner?.element.querySelector('[data-launch]')?.click());
  panel.querySelector('[data-close]').onclick=()=>panel.hidePopover();
  const tabs=[...panel.querySelectorAll('[data-tab]')];for(const tab of tabs){tab.onclick=()=>{tabs.forEach(t=>t.setAttribute('aria-selected',String(t===tab)));panel.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==tab.dataset.tab);if(tab.dataset.tab==='fix')mountRunner();};tab.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const other=tabs.find(t=>t!==tab);other.click();other.focus();}};}
  const comments=panel.querySelector('[data-comments]');
  const loadComments=async()=>{const result=check(await window.api.inlineComments(target));if(!panel.isConnected)return;comments.replaceChildren();for(const c of result.comments.filter(c=>c.path===path&&c.line>=startLine&&(c.start_line||c.line)<=line&&c.side===side)){const article=document.createElement('article'),by=document.createElement('small'),body=document.createElement('div');by.textContent=(c.user?.login||'GitHub user')+' · '+new Date(c.created_at).toLocaleString();body.className='review-markdown';body.innerHTML=renderReviewMarkdown(c.body||'');article.append(by,body);comments.append(article);}};
  post.onclick=async()=>{if(post.disabled)return;busy=true;update();status.textContent='Posting comment…';try{valid();check(await window.api.inlineComment({...target,body:comment.value}));comment.value='';draft.comment='';status.textContent='Comment posted to GitHub.';await loadComments();}catch(e){status.textContent=e.message;}finally{busy=false;update();}};
  async function mountRunner(){if(runner||runnerLoading)return;runnerLoading=true;try{valid();runner=await window.mountTaskRunnerLaunch({container:panel.querySelector('[data-runner]'),mode:'implement',isReady:()=>!!fix.value?.trim(),call:async(action,input)=>{
    valid();
    if(action==='launch-options')return check(await window.api.inlineFixOptions(target));
    if(action==='agent'){const result=check(await window.api.inlineFix({...target,instruction:fix.value,launchConfig:input.launchConfig}));watching={id:result.fixId,pr:ctx.pr,reviewId:ctx.reviewId};status.textContent=result.openError?'Fix started. Could not open Task Runner: '+result.openError:'Fix running in Task Runner. This PR will refresh when it finishes.';return result;}
    const response=await window.workTask[action]?.(input);return check(response).data;
  }});}catch(e){status.textContent=e.message;}finally{runnerLoading=false;}}
  try{await loadComments();}catch(e){status.textContent='Could not load comments: '+e.message;}
 };
 // Only runs local state polling for a fix launched here; no repeated GitHub requests.
 setInterval(async()=>{if(!watching||polling)return;polling=true;try{
  const r=await window.workTask['run-status']();if(!r.ok||!r.data)return;const s=r.data;
  const action=window.robosReviewFixCompletion(watching,s,theaterContext?.pr.url,!document.getElementById('pr-review-theater')?.classList.contains('hidden'));
  if(action==='running')return;
  const finished=watching;watching=null;
  if(action==='away'||action==='superseded')return;
  if(action==='refresh'){await window.refreshInlineReviewPR(finished.pr);}
  else showError('AI fix '+s.phase+': '+(s.error||'Inspect the session in Task Runner.'));
 }catch(e){showError(e.message);}finally{polling=false;}},5000);
})();

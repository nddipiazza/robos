'use strict';
(()=>{
 const dialog=document.createElement('dialog');dialog.className='ci-recovery';
 dialog.innerHTML=`<header><div><span class="ci-eyebrow">PULL REQUEST RECOVERY</span><h2>Back to green</h2></div><button class="ci-close" aria-label="Close CI recovery">×</button></header>
 <p class="ci-intro">Find the cause. Review a focused fix. Watch the new commit pass.</p>
 <ol class="ci-track"><li>1<span>Investigate & fix</span></li><li>2<span>Review & push</span></li><li>3<span>Watch CI</span></li></ol>
 <section class="ci-context"><strong class="ci-headline">Loading current checks…</strong><span class="ci-revision"></span><div class="ci-checks"></div></section>
 <section class="ci-config"><h3>Choose your repair agent</h3><p>The agent will read the failed logs, test a focused fix, and commit it locally for review.</p><robos-agent-selector></robos-agent-selector></section>
 <details class="ci-diff" hidden><summary>Recovery commit changes</summary><pre></pre></details><robos-agent-job-status></robos-agent-job-status><section class="ci-journal" aria-label="CI recovery conversation"></section><p class="ci-error" role="alert"></p>
 <footer><span class="ci-next">Your branch stays local until you push.</span><button class="ci-refresh">Refresh</button><button class="ci-primary">Investigate & fix</button></footer>`;
 document.body.append(dialog);let state,busy=false,timer;
 const $=selector=>dialog.querySelector(selector),primary=$('.ci-primary'),agentSelector=$('robos-agent-selector');
 const updateLaunch=()=>{primary.disabled=busy||(state?.phase!=='ready'&&!agentSelector.ready);};
 agentSelector.addEventListener('change',updateLaunch);
 const jobStatus=$('robos-agent-job-status');jobStatus.openSession=value=>window.api.openAgentSession(value);
 $('.ci-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>clearTimeout(timer));
 function render(value){state=value;const {phase,ci,session}=value;
  jobStatus.value={...session,activity:session.activitySummary?.text};
  dialog.dataset.phase=phase;$('.ci-headline').textContent={diagnose:'Let’s find what broke',working:'Working toward a verified fix',ready:'A fix is ready for your review',waiting:'Watching the new commit',passed:'Back to green',failed:'The new run still needs attention',unknown:'Waiting for confirmed CI results'}[phase];
  $('.ci-diff').hidden=!value.diff;$('.ci-diff pre').textContent=value.diff||'';
  $('.ci-revision').textContent='Current CI commit · '+(ci.head?.slice(0,8)||'unavailable');
  $('.ci-checks').replaceChildren();for(const c of ci.checks){const row=document.createElement('div');row.className='ci-check';row.dataset.state=c.state;const label=document.createElement('span');label.textContent=c.name;const status=document.createElement('span');status.textContent=c.description||c.state;row.append(label,status);if(c.detailsUrl){const link=document.createElement('button');link.textContent='Job log ↗';link.onclick=()=>window.api.openUrl(c.detailsUrl);row.append(link);}$('.ci-checks').append(row);}
  $('.ci-review-changes').hidden=!['ready','passed'].includes(phase);
  const stage=phase==='working'||phase==='diagnose'?0:phase==='ready'?1:2;dialog.querySelectorAll('.ci-track li').forEach((el,i)=>{el.classList.toggle('current',i===stage);el.classList.toggle('done',i<stage||phase==='passed');});
  $('.ci-config').hidden=!['diagnose','failed'].includes(phase);primary.hidden=['working','waiting','unknown','passed'].includes(phase);updateLaunch();primary.textContent=phase==='ready'?'Push fix & watch CI':'Investigate & fix';
  $('.ci-next').textContent=phase==='ready'?'Review the commit in Changes before pushing.':phase==='working'?(session.activitySummary?.text||'Preparing the agent and failed-check context…'):phase==='passed'?'CI passed on the current commit. Ready for code review.':phase==='waiting'?'Checking the pushed revision. This panel updates automatically.':phase==='unknown'?'CI could not be verified. Refresh to try again.':'Choose a model, then start the investigation.';
  const journal=$('.ci-journal');const follow=journal.scrollHeight-journal.scrollTop-journal.clientHeight<60;journal.replaceChildren();for(const m of session.messages){const item=document.createElement('article'),who=document.createElement('strong'),text=document.createElement('p');who.textContent=(m.role==='user'?'You':m.role==='system'?'Status':m.agentName||session.agentName||'Codex')+' · '+new Date(m.timestamp||Date.now()).toLocaleTimeString();text.textContent=m.text;item.append(who,text);journal.append(item);}journal.hidden=!session.messages.length;if(follow)journal.scrollTop=journal.scrollHeight;
 }
 async function refresh(){try{const value=await window.api.ciRecoveryState();if(!value.ok)throw Error(value.error);render(value);}catch(e){$('.ci-error').textContent=e.message;primary.disabled=true;}finally{clearTimeout(timer);if(dialog.open)timer=setTimeout(refresh,state?.phase==='working'?2500:15000);}}
 $('.ci-refresh').onclick=refresh;
 primary.onclick=async()=>{if(busy)return;busy=true;primary.disabled=true;$('.ci-error').textContent='';try{const result=await window.api.ciRecoveryAction({action:state?.phase==='ready'?'push':'start',...agentSelector.value});if(!result.ok)throw Error(result.error);await refresh();}catch(e){$('.ci-error').textContent=e.message;}finally{busy=false;updateLaunch();}};
 const review=document.createElement('button');review.textContent='Review changes';review.className='ci-review-changes';review.onclick=()=>{if(state?.diff){$('.ci-diff').open=true;$('.ci-diff').scrollIntoView({block:'nearest'});}else{dialog.close();document.querySelector('#step-btn-3')?.click();}};$('.ci-refresh').before(review);
 window.openCIRecovery=async()=>{dialog.showModal();primary.disabled=true;refresh();try{await agentSelector.load({provider:'codex'});}catch(e){$('.ci-error').textContent=e.message;updateLaunch();}};
})();

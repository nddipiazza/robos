'use strict';
(()=>{
 const dialog=document.createElement('section');dialog.className='ci-recovery';
 dialog.innerHTML=`<header><div><span class="ci-eyebrow">PULL REQUEST RECOVERY</span><h2>Back to green</h2></div><button class="ci-close" aria-label="Close CI recovery">×</button></header>
 <p class="ci-intro">Find the cause. Review a focused fix. Watch the new commit pass.</p>
 <ol class="ci-track"><li>1<span>Investigate & fix</span></li><li>2<span>Review & push</span></li><li>3<span>Watch CI</span></li></ol>
 <section class="ci-context"><strong class="ci-headline">Loading current checks…</strong><span class="ci-revision"></span><div class="ci-checks"></div></section>
 <robos-workspace-preflight></robos-workspace-preflight><section class="ci-config"><h3>Choose your repair agent</h3><p>The agent will read the failed logs, test a focused fix, and commit it locally for review.</p><robos-agent-selector></robos-agent-selector></section>
 <details class="ci-diff" hidden><summary>Recovery commit changes</summary><pre></pre></details><robos-agent-job-status></robos-agent-job-status><section class="ci-journal" aria-label="CI recovery conversation"></section><p class="ci-error" role="alert"></p>
 <footer><span class="ci-next">Your branch stays local until you push.</span><button class="ci-refresh">Refresh</button><button class="ci-primary">Investigate & fix</button></footer>`;
 dialog.hidden=true;let state,busy=false,timer;dialog.open=false;
 dialog.close=()=>{dialog.open=false;clearTimeout(timer);window.reviewAgent?.close();};
 window.reviewAgent?.register('ci',{title:'CI recovery',controls:dialog,send:async text=>{const result=await window.api.ciRecoveryAction({action:'message',text});if(!result.ok)throw Error(result.error);await refresh();}});
 const $=selector=>dialog.querySelector(selector),primary=$('.ci-primary'),agentSelector=$('robos-agent-selector');
 const updateLaunch=()=>{primary.disabled=busy||(state?.phase!=='ready'&&!agentSelector.ready);};
 agentSelector.addEventListener('change',updateLaunch);
 const jobStatus=$('robos-agent-job-status');jobStatus.openSession=value=>window.api.openAgentSession(value);
 $('.ci-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>clearTimeout(timer));
 function render(value){state=value;const {phase,ci,session}=value;
  jobStatus.value={...session,activity:session.activitySummary?.text};
  const preflight=value.workspacePreflight;$('robos-workspace-preflight').value=preflight;
  dialog.dataset.phase=phase;$('.ci-headline').textContent={diagnose:'Let’s find what broke',working:'Working toward a verified fix',ready:'A fix is ready for your review',waiting:'Watching the new commit',passed:'Back to green',failed:'The new run still needs attention',unknown:'Waiting for confirmed CI results'}[phase];
  $('.ci-diff').hidden=!value.diff;$('.ci-diff pre').textContent=value.diff||'';
  $('.ci-revision').textContent='Current CI commit · '+(ci.head?.slice(0,8)||'unavailable')+(value.meta?.isolated?' · Isolated repair workspace':'');
  $('.ci-checks').replaceChildren();for(const c of ci.checks){const row=document.createElement('div');row.className='ci-check';row.dataset.state=c.state;const label=document.createElement('span');label.textContent=c.name;const status=document.createElement('span');status.textContent=c.description||c.state;row.append(label,status);if(c.detailsUrl){const link=document.createElement('button');link.textContent='Job log ↗';link.onclick=()=>window.api.openUrl(c.detailsUrl);row.append(link);}if(c.provider==='buildkite'){
 const jobs=document.createElement('span');jobs.textContent=c.providerError||c.jobs?.filter(j=>j.conclusion==='failure').map(j=>j.name).join(' · ')||'Buildkite #'+c.buildNumber;row.append(jobs);
 const inspect=document.createElement('button');inspect.textContent='Read failure';inspect.onclick=async()=>{inspect.disabled=true;try{const r=await window.api.buildkiteFailureDetail(c.detailsUrl);if(!r.ok)throw Error(r.error);let panel=dialog.querySelector('.ci-buildkite-log');if(!panel){panel=document.createElement('details');panel.className='ci-buildkite-log';const title=document.createElement('summary');title.textContent='Buildkite failure output';panel.append(title,document.createElement('pre'));$('.ci-context').after(panel);}panel.querySelector('pre').textContent=r.failureExcerpt||r.failedLog||'No failed job logs in this build.';panel.open=true;}catch(e){$('.ci-error').textContent=e.message;}finally{inspect.disabled=false;}};row.append(inspect);
 }$('.ci-checks').append(row);}
  $('.ci-review-changes').hidden=!['ready','passed'].includes(phase);
  const stage=phase==='working'||phase==='diagnose'?0:phase==='ready'?1:2;dialog.querySelectorAll('.ci-track li').forEach((el,i)=>{el.classList.toggle('current',i===stage);el.classList.toggle('done',i<stage||phase==='passed');});
  $('.ci-config').hidden=!['diagnose','failed'].includes(phase);primary.hidden=['working','waiting','unknown','passed'].includes(phase);updateLaunch();primary.textContent=phase==='ready'?'Push fix & watch CI':preflight?.needsIsolation?'Use clean workspace & fix':'Investigate & fix';
  $('.ci-next').textContent=phase==='ready'?'Review the commit in Changes before pushing.':phase==='working'?(session.activitySummary?.text||'Preparing the agent and failed-check context…'):phase==='passed'?'CI passed on the current commit. Ready for code review.':phase==='waiting'?'Checking the pushed revision. This panel updates automatically.':phase==='unknown'?'CI could not be verified. Refresh to try again.':'Choose a model, then start the investigation.';
  window.reviewAgent?.update('ci',{messages:session.messages||[],busy:phase==='working',agentName:session.agentName,activity:session.activitySummary?.text});
 }
 async function refresh(){try{const value=await window.api.ciRecoveryState();if(!value.ok)throw Error(value.error);render(value);}catch(e){$('.ci-error').textContent=e.message;primary.disabled=true;}finally{clearTimeout(timer);if(dialog.open)timer=setTimeout(refresh,state?.phase==='working'?2500:15000);}}
 $('.ci-refresh').onclick=refresh;
 primary.onclick=async()=>{if(busy)return;busy=true;primary.disabled=true;$('.ci-error').textContent='';try{const action=state?.phase==='ready'?'push':'start';const result=await window.api.ciRecoveryAction({action,...agentSelector.value,isolate:!!state?.workspacePreflight?.needsIsolation});if(!result.ok)throw Error(result.error);if(action==='push'){dialog.close();window.openCIJobs?.();window.refreshReviewCI?.();}await refresh();}catch(e){$('.ci-error').textContent=e.message;}finally{busy=false;updateLaunch();}};
 const review=document.createElement('button');review.textContent='Review changes';review.className='ci-review-changes';review.onclick=()=>{if(state?.diff){$('.ci-diff').open=true;$('.ci-diff').scrollIntoView({block:'nearest'});}else{dialog.close();document.querySelector('#step-btn-3')?.click();}};$('.ci-refresh').before(review);
 window.openCIRecovery=async()=>{dialog.hidden=false;dialog.open=true;window.reviewAgent?.open('ci');primary.disabled=true;refresh();try{await agentSelector.load({provider:'codex'});}catch(e){$('.ci-error').textContent=e.message;updateLaunch();}};
})();

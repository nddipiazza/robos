'use strict';
(() => {
 const panel=document.createElement('section');panel.className='review-ci-jobs';panel.hidden=true;
 panel.setAttribute('aria-label','CI jobs and live log');
 panel.innerHTML=`<header><strong>CI jobs</strong><span class="ci-jobs-updated"></span><button class="ci-jobs-close" aria-label="Close CI jobs">×</button></header><div class="ci-jobs-content"><div class="ci-jobs-list"></div><section class="ci-tail"><div class="ci-tail-toolbar"><strong class="ci-tail-title">Select a job to read its log</strong><label><input class="ci-tail-live" type="checkbox" checked> Live</label><label><input class="ci-tail-follow" type="checkbox" checked> Follow</label></div><p class="ci-tail-status" role="status"></p><pre class="ci-tail-output" tabindex="0" aria-label="Job log tail"></pre></section></div>`;
 document.querySelector('.theater-topbar').after(panel);
 const $=s=>panel.querySelector(s),output=$('.ci-tail-output');
 let current,selected=null,generation=0,timer,busy=false;
 const key=(check,job)=>check.detailsUrl+'#'+job.id;
 const stateLabel=job=>job.conclusion==='success'?'Passed':job.conclusion==='failure'?'Failed':job.conclusion==='skipped'?'Skipped':job.conclusion==='cancelled'?'Cancelled':job.status==='blocked'?'Blocked':job.status==='queued'?'Queued':'Running';
 function schedule(){clearTimeout(timer);if(!panel.hidden&&!document.hidden&&$('.ci-tail-live').checked&&selected)timer=setTimeout(tail,3000);}
 async function tail(){
  if(busy||panel.hidden||!selected||document.hidden)return;
  busy=true;const ticket=generation,job=selected;
  try{
   const result=await window.api.reviewCILogTail({head:current.head,buildUrl:job.check.detailsUrl,jobId:job.job.id});
   if(ticket!==generation)return;
   if(!result.ok)throw Error(result.error);
   const scroll=output.scrollTop;output.textContent=result.content||'No output yet. Waiting for this job to write logs…';
   output.scrollTop=$('.ci-tail-follow').checked?output.scrollHeight:scroll;
   $('.ci-tail-status').textContent='Latest 64 KiB · Updated '+new Date(result.checkedAt).toLocaleTimeString();
  }catch(e){if(ticket===generation)$('.ci-tail-status').textContent='Log update failed — '+e.message+' Previous output may be stale.';}
  finally{busy=false;if(ticket!==generation&&!panel.hidden&&selected)tail();else schedule();}
 }
 function select(check,job){selected={check,job};generation++;output.textContent='Loading log…';$('.ci-tail-title').textContent=job.name;$('.ci-tail-status').textContent='Reading directly from Buildkite…';renderRows();tail();}
 function renderRows(){
  const list=$('.ci-jobs-list');list.replaceChildren();
  for(const check of current?.checks||[]){if(check.provider!=='buildkite')continue;
   const heading=document.createElement('p');heading.className='ci-jobs-build';heading.textContent=check.name+(check.buildNumber?' · #'+check.buildNumber:'');list.append(heading);
   if(check.providerError){const error=document.createElement('p');error.textContent=check.providerError;list.append(error);continue;}
   for(const job of check.jobs||[]){const button=document.createElement('button'),name=document.createElement('span'),badge=document.createElement('span');button.className='ci-job';button.setAttribute('aria-label',job.name+' '+stateLabel(job));button.dataset.state=stateLabel(job).toLowerCase();name.textContent=job.name;badge.textContent=stateLabel(job);badge.className='ci-job-state';button.append(name,badge);button.setAttribute('aria-pressed',String(!!selected&&key(check,job)===key(selected.check,selected.job)));button.onclick=()=>select(check,job);list.append(button);}
  }
  if(!list.childNodes.length)list.textContent='Waiting for CI jobs on this revision…';
 }
 window.updateCIJobs=value=>{
  const oldHead=current?.head;current=value;
  const exists=selected&&oldHead===value.head&&value.checks.some(c=>!c.providerError&&c.detailsUrl===selected.check.detailsUrl&&c.jobs?.some(j=>j.id===selected.job.id));
  if(selected&&!exists){generation++;selected=null;output.textContent='';$('.ci-tail-title').textContent='Select a job to read its log';$('.ci-tail-status').textContent='CI changed. Select a current job.';clearTimeout(timer);}
  $('.ci-jobs-updated').textContent=value.checkedAt?'Status updated '+new Date(value.checkedAt).toLocaleTimeString():value.error||'Status unavailable';
  renderRows();
 };
 window.openCIJobs=()=>{panel.hidden=false;renderRows();if(selected)tail();};
 $('.ci-jobs-close').onclick=()=>{panel.hidden=true;clearTimeout(timer);generation++;};
 $('.ci-tail-live').onchange=()=>{if($('.ci-tail-live').checked)tail();else clearTimeout(timer);};
 $('.ci-tail-follow').onchange=()=>{if($('.ci-tail-follow').checked)output.scrollTop=output.scrollHeight;};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else if($('.ci-tail-live').checked)tail();});
 window.addEventListener('beforeunload',()=>clearTimeout(timer),{once:true});
})();

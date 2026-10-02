'use strict';
const ciBanner=document.createElement('section');ciBanner.className='review-live-ci';ciBanner.setAttribute('aria-live','polite');ciBanner.hidden=true;document.querySelector('.theater-topbar').after(ciBanner);
let ciRefreshing=false,ciTimer;
async function refreshReviewCI(){
 if(ciRefreshing)return;
 ciRefreshing=true;
 try{
  const result=await window.api.reviewCIStatus();window.latestReviewCI=result;window.updateCIJobs?.(result);
  if(result.state==='unpublished'){ciBanner.hidden=true;return;}
  ciBanner.hidden=false;ciBanner.dataset.state=result.state;ciBanner.replaceChildren();
  const title=document.createElement('strong');title.textContent={failed:'CI checks failed',pending:'CI checks are running',passed:'CI checks passed',unknown:'CI status unavailable'}[result.state]||'CI status unavailable';ciBanner.append(title);
  const detail=document.createElement('span'),jobs=result.checks.flatMap(c=>c.jobs||[]);
  const counts=[['running',jobs.filter(j=>j.status==='in_progress').length],['queued',jobs.filter(j=>j.status==='queued').length],['failed',jobs.filter(j=>j.conclusion==='failure').length],['blocked',jobs.filter(j=>j.status==='blocked').length]];
  detail.textContent=result.state==='passed'?'':result.error||counts.filter(([,count])=>count>0).map(([label,count])=>`${count} ${label}`).join(' · ');ciBanner.append(detail);
  if(result.checks.some(c=>c.provider==='buildkite')){const monitor=document.createElement('button');monitor.textContent='Jobs & live logs';monitor.onclick=()=>window.openCIJobs?.();ciBanner.append(monitor);}
  if(window.openCIRecovery&&result.state==='failed'){const recover=document.createElement('button');recover.className='ci-recover-trigger';recover.textContent='Get CI back to green';recover.onclick=window.openCIRecovery;ciBanner.append(recover);}
  if(result.url){const link=document.createElement('button');link.textContent='View checks';link.onclick=()=>window.api.openUrl(result.url+'/checks');ciBanner.append(link);}
  if(typeof renderTheaterChecksUI==='function')renderTheaterChecksUI(result.checks,result.url||'');
 }catch{ciBanner.hidden=false;ciBanner.dataset.state='unknown';ciBanner.textContent='CI status unavailable — refresh to try again.';window.updateCIJobs?.({checks:[],error:'CI status unavailable.'});}
 finally{ciRefreshing=false;clearTimeout(ciTimer);ciTimer=setTimeout(()=>{if(!document.hidden)refreshReviewCI();},10000);}
}
window.refreshReviewCI=refreshReviewCI;
const refreshCI=document.createElement('button');refreshCI.textContent='Refresh CI';refreshCI.className='review-refresh-ci';refreshCI.onclick=refreshReviewCI;document.querySelector('.theater-actions')?.prepend(refreshCI);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshReviewCI();});
window.addEventListener('beforeunload',()=>clearTimeout(ciTimer),{once:true});
refreshReviewCI();

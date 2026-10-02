'use strict';
async function refreshTaskReviews(){
 const host=document.getElementById('saved-code-reviews');
 try{const result=await window.robos.savedReviews();if(!result.ok)throw Error(result.error);host.replaceChildren();if(!result.data.length)return;
 const header=document.createElement('div');header.className='dc-review-heading';const title=document.createElement('h3');title.textContent='In code review';const refresh=document.createElement('button');refresh.textContent='Refresh checks';refresh.onclick=refreshTaskReviews;header.append(title,refresh);host.append(header);
 for(const review of result.data.sort((a,b)=>(b.ci.state==='failed')-(a.ci.state==='failed'))){const card=document.createElement('article');card.className='dc-review-card';card.dataset.ci=review.ci.state;card.dataset.search=[review.title,review.repo,review.taskTitle,review.taskUrl,review.pr?.number].join(' ').toLowerCase();
 const heading=document.createElement('h4');heading.textContent=review.title;const meta=document.createElement('p');meta.className='dc-review-meta';meta.textContent=review.repo+(review.pr?' · PR #'+review.pr.number:' · Local review');
 const status=document.createElement('strong');status.className='dc-review-ci';status.textContent={failed:'CI checks failed',pending:'CI running',passed:'CI passed',unknown:'CI status unavailable',unpublished:'Not published'}[review.ci.state];
 const failures=document.createElement('p');failures.className='dc-review-failures';failures.textContent=review.ci.checks.filter(c=>c.state==='failure').map(c=>c.name).join(' · ')||review.ci.error||'';
 const links=document.createElement('div');links.className='dc-review-links';if(review.taskUrl){const task=document.createElement('button');task.className='dc-review-task';task.textContent='#'+review.taskUrl.split('/').at(-1)+' · '+(review.taskTitle||'Open task');task.onclick=()=>window.robos.openUrl(review.taskUrl);links.append(task);}
 const actions=document.createElement('div');actions.className='dc-review-actions';const open=document.createElement('button');open.className='dc-review-open';open.textContent='Open Code Review';const feedback=document.createElement('span');feedback.setAttribute('role','status');open.onclick=async()=>{open.disabled=true;feedback.textContent='Opening Code Review…';try{const r=await window.robos.openCodeReview(review.id);if(!r.ok)throw Error(r.error);feedback.textContent='Code Review opened.';}catch(e){feedback.textContent=e.message;}finally{open.disabled=false;}};actions.append(open);
 if(review.pr){const checks=document.createElement('button');checks.textContent='View CI checks';checks.onclick=()=>window.robos.openUrl(review.pr.url+'/checks');actions.append(checks);}
 actions.append(feedback);card.append(meta,heading,status,failures,links,actions);host.append(card);}
 filterSavedReviews();}catch(e){host.textContent='Saved reviews unavailable: '+e.message;}
}
refreshTaskReviews();setInterval(refreshTaskReviews,60000);

function filterSavedReviews(){const query=document.getElementById('global-search').value.toLowerCase().trim().replace(/^#/, '');document.querySelectorAll('.dc-review-card').forEach(card=>{card.hidden=!card.dataset.search.includes(query);});}
document.getElementById('global-search').addEventListener('input',filterSavedReviews);

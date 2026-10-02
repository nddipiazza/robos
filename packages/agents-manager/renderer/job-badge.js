'use strict';
window.renderAgentJobBadge=function(element,job){
 if(!element)return;element.replaceChildren();element.hidden=!job;if(!job)return;
 const running=job.status==='running';element.dataset.status=job.status;element.setAttribute('role','status');
 if(running){const spinner=document.createElement('span');spinner.className='agent-job-spinner';spinner.setAttribute('aria-hidden','true');element.append(spinner);}
 const text=document.createElement('span');text.textContent={running:'Agent running…',paused:'Finished · awaiting review',error:'Needs attention',interrupted:'Interrupted',idle:'Idle'}[job.status]||'Stopped';element.append(text);
 element.title=job.activity||text.textContent;
};

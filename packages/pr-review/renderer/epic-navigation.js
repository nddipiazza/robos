'use strict';
(() => {
 const host=document.querySelector('.theater-actions');if(!host||!window.api.reviewEpicNavigation)return;
 const nav=document.createElement('nav');nav.setAttribute('aria-label','Tasks in this epic');nav.style.cssText='display:flex;gap:8px;align-items:center';
 const status=document.createElement('span');status.setAttribute('role','status');nav.append(status);host.append(nav);
 async function load(){
  try{
   const result=await window.api.reviewEpicNavigation();if(!result.ok)throw Error(result.error);if(!result.navigation)return;
   for(const [direction,label] of [['previous','← Previous Task in Epic'],['next','Next Task in Epic →']]){
    const task=result.navigation[direction];if(!task)continue;
    const button=document.createElement('button');button.className='btn-theater-action';button.textContent=label;button.disabled=!task.reviewId;
    button.title=`${task.key}: ${task.title}`+(task.reviewId?'':' — no local review available yet');button.setAttribute('aria-label',`${label}: ${task.title}`);
    button.onclick=async()=>{for(const b of nav.querySelectorAll('button'))b.disabled=true;status.textContent='Opening '+task.key+'…';try{const opened=await window.api.openEpicNeighbor(direction);if(!opened.ok)throw Error(opened.error);}catch(e){status.textContent=e.message;for(const b of nav.querySelectorAll('button'))b.disabled=b.dataset.available!=='true';}};
    button.dataset.available=String(!!task.reviewId);nav.insertBefore(button,status);
   }
  }catch(error){status.textContent='Epic navigation unavailable';status.title=error.message;}
 }
 load();
})();

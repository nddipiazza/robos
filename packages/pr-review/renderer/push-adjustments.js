'use strict';
(() => {
  const host=document.querySelector('.theater-actions');
  if(!host||!window.api.reviewAdjustmentStatus)return;
  const button=document.createElement('button');
  button.id='push-walkthrough-adjustments';button.className='btn-theater-action';
  button.textContent='Push walkthrough adjustments';button.hidden=true;
  const feedback=document.createElement('span');feedback.setAttribute('role','status');
  feedback.style.cssText='max-width:280px;font-size:12px;color:#aebdcc';
  host.prepend(button,feedback);
  let pushing=false,checking=false;
  async function refresh(){
    if(pushing||checking)return;
    checking=true;
    try{
      const state=await window.api.reviewAdjustmentStatus();
      if(pushing)return;
      if(!state.ok)throw Error(state.error);
      button.hidden=!state.eligible||state.ahead===0;
      button.disabled=!!state.busy||!!state.dirty||state.behind>0;
      button.title=state.busy?'Wait for the agent to finish.':state.dirty?'Commit the walkthrough adjustments before pushing.':state.behind>0?'The PR has newer commits. Sync the branch before pushing.':`Push ${state.ahead} unpushed commit${state.ahead===1?'':'s'} to the PR`;
    }catch(error){
      button.disabled=true;button.title='Unable to check unpushed commits: '+error.message;
    }finally{checking=false;}
  }
  button.onclick=async()=>{
    if(pushing||button.disabled)return;
    pushing=true;button.disabled=true;button.textContent='Pushing…';feedback.textContent='';
    try{
      const result=await window.api.pushReviewAdjustments();
      if(!result.ok)throw Error(result.error);
      button.hidden=true;feedback.textContent='Adjustments pushed.';
    }catch(error){feedback.textContent=error.message;}
    finally{pushing=false;button.textContent='Push walkthrough adjustments';await refresh();}
  };
  window.refreshAdjustmentCommand=refresh;
  let previousStatus;
  window.api.onDemoState?.(state=>{
    if(state.status!==previousStatus){previousStatus=state.status;refresh();}
  });
  window.addEventListener('focus',refresh);
  const timer=setInterval(refresh,30000);
  window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
  refresh();
})();

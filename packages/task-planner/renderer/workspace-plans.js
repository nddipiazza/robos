document.addEventListener('DOMContentLoaded',()=>{
  const panel=document.getElementById('workspace-plan-panel'), status=document.getElementById('workspace-plan-review'), save=document.getElementById('workspace-plan-save'), input=document.getElementById('workspace-plan-input');
  let proposalId, generation=0;
  const render=()=>window.RobosProjectPlan.mount(document.getElementById('workspace-plan-view'),{list:window.robos.listPlans,view:window.robos.viewPlan});
  document.getElementById('btn-workspace-plans').onclick=()=>{openProjectManager();};
  document.getElementById('workspace-plan-close').onclick=()=>{panel.hidden=true;};
  input.oninput=()=>{generation++;proposalId=null;save.disabled=true;};
  document.getElementById('workspace-plan-preview').onclick=async()=>{
    const ticket=++generation; proposalId=null;save.disabled=true;
    try{
      const value=JSON.parse(input.value);status.textContent='Reading GitHub issues and validating the proposed plan…';
      const result=await window.robos.proposePlan(value);
      if(ticket!==generation)return;
      status.textContent=JSON.stringify(result,null,2);
      if(result.ok&&result.validation.conforms){proposalId=result.id;save.disabled=false;}
    }catch(e){status.textContent=e.message;}
  };
  save.onclick=async()=>{
    save.disabled=true; const result=await window.robos.applyPlan(proposalId);status.textContent=JSON.stringify(result,null,2);proposalId=null;
    if(result.ok)await render();
  };
});

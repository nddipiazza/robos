'use strict';
window.mountAIDescription=function(host,{pr,title,body,saved,save,ready}){
  host.className='review-ai-description';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=saved.aiDescription!==false;checkbox.disabled=!!pr.published;
  const label=document.createElement('label');label.append(checkbox,' Replace default PR text with an AI-generated description using review evidence, screenshots, and before/after comparisons');
  const status=document.createElement('p');status.setAttribute('role','status');
  const generate=document.createElement('button');generate.textContent='Generate description';generate.hidden=!!pr.published;
  const restore=document.createElement('button');restore.textContent='Restore previous description';restore.hidden=true;
  host.append(label,status,generate,restore);
  let generated=!!saved.aiGenerated,pending=null,previous=saved.aiPrevious||'',warnings=saved.aiWarnings||[],revision=0;
  if(generated){generate.textContent='Regenerate description';status.textContent=['AI description ready—review and edit it before creating the PR.',...warnings].join('\n');restore.hidden=!previous;}
  body.addEventListener('input',()=>revision++);
  window.cleanupPRDescription?.();
  window.cleanupPRDescription=window.api.onDescriptionProgress?.(text=>{if(pending)status.textContent=text;});
  const run=async()=>{
    if(pending)return pending;if(pr.published)return;
    pending=(async()=>{await ready;const source=body.value,version=revision;generate.disabled=true;status.textContent='Reading the diff and available review evidence…';
      try{const result=await window.api.generatePRDescription({title:title.value,body:source});if(!result.ok)throw Error(result.error);if(!host.isConnected)return false;if(revision!==version){status.textContent='You edited the description during generation. Your edits were kept; generate again when ready.';return false;}
        previous=source;warnings=result.warnings||[];body.value=result.markdown;generated=true;body.dispatchEvent(new Event('input',{bubbles:true}));restore.hidden=false;generate.textContent='Regenerate description';status.textContent=['AI description ready—review and edit it before creating the PR.',...warnings].join('\n');save();return true;
      }catch(e){status.textContent=e.message;return false;}finally{generate.disabled=false;}
    })();try{return await pending;}finally{pending=null;}
  };
  generate.onclick=()=>run();restore.onclick=()=>{body.value=previous;body.dispatchEvent(new Event('input',{bubbles:true}));checkbox.checked=false;generated=false;restore.hidden=true;status.textContent='Previous description restored.';save();};
  checkbox.onchange=()=>{if(!checkbox.checked)revision++;save();if(checkbox.checked&&!generated)run();};
  window.preparePRDescription=()=>{if(checkbox.checked&&!generated&&!pr.published)run();};
  return {state:()=>({aiDescription:checkbox.checked,aiGenerated:generated,aiPrevious:previous,aiWarnings:warnings}),async ensureReady(){if(pending){await pending;return false;}if(checkbox.checked&&!generated){await run();return false;}return true;}};
};

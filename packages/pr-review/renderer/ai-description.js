'use strict';
window.mountAIDescription=function(host,{pr,title,body,saved,save,ready}){
  host.className='review-ai-description';
  const status=document.createElement('p');status.setAttribute('role','status');
  const generate=document.createElement('button');generate.textContent='Generate description';generate.hidden=!!pr.published;
  const restore=document.createElement('button');restore.textContent='Restore previous description';restore.hidden=true;
  const gallery=document.createElement('details');gallery.className='review-evidence-gallery';gallery.hidden=true;
  host.append(status,generate,restore,gallery);
  let generated=!!saved.aiGenerated,pending=null,previous=saved.aiPrevious||'',warnings=saved.aiWarnings||[],usedEvidence=saved.aiEvidence||[],revision=0;
  const renderEvidence=()=>{gallery.replaceChildren();const images=usedEvidence.filter(e=>e.kind==='screenshot');gallery.hidden=!images.length;if(!images.length)return;const summary=document.createElement('summary');summary.textContent=`Walkthrough screenshots used (${images.length})`;gallery.append(summary);const grid=document.createElement('div');grid.className='review-evidence-grid';gallery.append(grid);for(const item of images){const figure=document.createElement('figure');const image=document.createElement('img');image.alt=item.label;const caption=document.createElement('figcaption');caption.textContent=[item.label,item.checkpoint,item.capturedAt?.slice(0,10),item.side].filter(Boolean).join(' · ');figure.append(image,caption);grid.append(figure);window.api.reviewEvidenceImage?.(item.id).then(r=>{if(r.ok)image.src=r.url;else image.alt=r.error;});}};
  renderEvidence();
  if(generated){generate.textContent='Regenerate description';status.textContent=['AI description ready—review and edit it before creating the PR.',...warnings].join('\n');restore.hidden=!previous;}
  body.addEventListener('input',()=>revision++);
  window.cleanupPRDescription?.();
  window.cleanupPRDescription=window.api.onDescriptionProgress?.(text=>{if(pending)status.textContent=text;});
  const run=async()=>{
    if(pending)return pending;if(pr.published)return;
    pending=(async()=>{await ready;const source=body.value,version=revision;generate.disabled=true;status.textContent='Reading the diff and available review evidence…';
      try{const result=await window.api.generatePRDescription({title:title.value,body:source});if(!result.ok)throw Error(result.error);if(!host.isConnected)return false;if(revision!==version){status.textContent='You edited the description during generation. Your edits were kept; generate again when ready.';return false;}
        previous=source;warnings=result.warnings||[];usedEvidence=result.selectedEvidence||[];renderEvidence();body.value=result.markdown;generated=true;body.dispatchEvent(new Event('input',{bubbles:true}));restore.hidden=false;generate.textContent='Regenerate description';status.textContent=['AI description ready—review and edit it before creating the PR.',...warnings].join('\n');save();return true;
      }catch(e){status.textContent=e.message;return false;}finally{generate.disabled=false;}
    })();try{return await pending;}finally{pending=null;}
  };
  generate.onclick=()=>run();restore.onclick=()=>{body.value=previous;body.dispatchEvent(new Event('input',{bubbles:true}));generated=false;restore.hidden=true;status.textContent='Previous description restored.';save();};
  window.preparePRDescription=()=>{};
  return {state:()=>({aiGenerated:generated,aiPrevious:previous,aiWarnings:warnings,aiEvidence:usedEvidence}),async ensureReady(){if(pending){await pending;return false;}return true;}};
};

'use strict';
function resolveEvidence(markdown,evidence){
  if(typeof markdown!=='string')throw Error('Provide a PR description.');
  const resolved=markdown.replace(/robos-evidence:\/\/screenshot\/([a-f0-9]{16})/g,(_,id)=>{
    const item=evidence.find(e=>e.id===id&&e.kind==='screenshot');
    if(!item||!/^https:\/\/[^\s<>"()]+$/.test(item.url||''))throw Error('The description includes local screenshots. Add shared HTTPS URLs to their evidence records before creating the PR; your draft is saved.');
    return item.url;
  });
  if(/robos-evidence:|!\[[^\]]*\]\((?:file:|data:|\/home\/|\/tmp\/)/i.test(resolved))throw Error('Resolve local screenshot references before publishing the description.');
  return resolved;
}
module.exports={resolveEvidence};

'use strict';
(async()=>{
 const data=await (await fetch('data.json')).json();
 document.getElementById('context').textContent=data.title+' · Reviewing '+data.head.slice(0,7);
 const videos=[],reports=[];
 for(const session of data.sessions)for(const file of session.files)(file.video?videos:reports).push({...file,session});
 function picker(id,items,target,attribute){
  document.getElementById(id).hidden=!items.length;
  if(!items.length)return;
  const select=document.querySelector('#'+id+' select');
  for(const item of items){const option=document.createElement('option');option.value=item.url;option.textContent=item.path+' · '+new Date(item.modifiedAt||item.session.time).toLocaleString();select.append(option);}
  const show=()=>document.querySelector('#'+id+' '+target).setAttribute(attribute,select.value);
  select.onchange=show;show();
 }
 picker('media',videos,'video','src');picker('reports',reports,'iframe','src');
 document.getElementById('no-video').hidden=!!videos.length;
 const prose=data.files.length&&data.files.every(f=>/\.(md|txt|rst)$/i.test(f.path));
 document.getElementById('guidance').textContent=prose?'This PR changes text documents. Review accuracy, links, examples and scope in the diff. App builds and e2e runs usually add no evidence for prose-only changes.':'Review which changed behaviors the focused tests cover, including failure paths and affected integrations. For user-visible changes, use a recorded real interaction when available to see the completed task.';
 const checks=document.getElementById('checks');
 for(const check of data.checks){const button=document.createElement('button');button.textContent=check.name;button.onclick=()=>parent.postMessage({type:'robos-open-check',url:check.url},'*');checks.append(button);}
 if(!data.checks.length)checks.textContent='No linked check runs are available. Inspect the diff and available test reports; do not assume validation passed.';
})().catch(e=>{document.body.textContent='Test report viewer could not load: '+e.message;});

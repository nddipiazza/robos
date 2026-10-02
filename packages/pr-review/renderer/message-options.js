'use strict';
window.mountReviewMessageOptions = function(host, pr, title, body, saved, context={}) {
  const box=document.createElement('div');box.className='review-message-options';box.hidden=true;host.append(box);
  const checkbox=document.createElement('input');checkbox.type='checkbox'; // Explicit opt-in for each publication.
  const label=document.createElement('label');label.append(checkbox);box.append(label);
  const detail=document.createElement('div');detail.hidden=true;box.append(detail);
  const server=document.createElement('select');server.setAttribute('aria-label','Notification workspace');
  const channel=document.createElement('select');channel.setAttribute('aria-label','Notification channel');
  const preview=document.createElement('pre');preview.className='review-message-preview';preview.setAttribute('aria-label','Notification preview');
  const status=document.createElement('p');status.setAttribute('role','status');detail.append(server,channel,preview,status);
  const reviewers=window.mountReviewerPicker(detail,id=>window.api.reviewMessageMembers(id),()=>update());
  const initialBody=body.value;
  let config,version=0,selection;
  const format=(template,data)=>template.replace(/\{\{(title|url|repo|branch|description)\}\}/g,(_,key)=>data[key]||'');
  const update=()=>{if(config)preview.textContent=(reviewers.value().map(r=>'@'+r.name).join(' ')+(reviewers.value().length?'\n':''))+format(config.settings.messageTemplate,{title:title.value,description:body.value,url:pr.url||'[PR link after creation]',repo:pr.repo,branch:pr.headBranch});};
  const load=async()=>{const current=++version;channel.replaceChildren(new Option('Choose review channel',''));await reviewers.load(server.value,config.settings.reviewers || []);if(current!==version)return;update();if(!server.value)return;status.textContent='Loading channels…';const r=await window.api.reviewMessageChannels(server.value);if(current!==version)return;if(!r.ok){status.textContent=r.error;return;}for(const c of r.channels)channel.add(new Option('#'+c.name,c.id));channel.value=config.settings.channel;status.textContent='';};
  server.onchange=()=>load().catch(e=>status.textContent=e.message);
  checkbox.onchange=()=>{detail.hidden=!checkbox.checked;};
  title.addEventListener('input',update);body.addEventListener('input',update);
  const ready=(async()=>{if(!window.api.reviewMessageOptions)return;const r=await window.api.reviewMessageOptions(context.url);if(!r.ok)throw Error(r.error);config=r;
    if(saved.body===undefined&&!pr.published&&body.value===initialBody){body.value=format(r.settings.prTemplate,{description:pr.body||'',title:title.value,repo:pr.repo,branch:pr.headBranch,url:pr.url||''});}
    if(!r.servers.length)return;box.hidden=false;label.append(' Send PR review notification to '+r.appName);
    server.add(new Option('Choose workspace',''));for(const s of r.servers)server.add(new Option(s.name,s.id));server.value=r.settings.serverId||(r.servers.length===1?r.servers[0].id:'');server.hidden=r.servers.length===1;
    update();await load();
  })().catch(e=>{box.hidden=false;status.textContent=e.message;detail.hidden=false;checkbox.disabled=true;label.append(' Messaging setup unavailable');});
  return {ready,validate(){if(checkbox.checked&&(!server.value||!channel.value))throw Error('Choose a notification workspace and review channel before creating the PR.');if(checkbox.checked)reviewers.validate();selection=checkbox.checked?{serverId:server.value,channel:channel.value,reviewers:reviewers.value()}:null;},async send(){if(!selection)return '';status.textContent='Sending review notification…';const r=await window.api.sendReviewMessage({...selection,...context});if(!r.ok){status.textContent='Notification not confirmed: '+r.error;return status.textContent;}checkbox.disabled=true;server.disabled=true;channel.disabled=true;detail.querySelector('fieldset').disabled=true;status.textContent='Review notification sent.';return status.textContent;}};
};

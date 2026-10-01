'use strict';
window.mountProjectReviewSettings = async function(project) {
  let host=document.getElementById('project-review-settings');
  if(!host){host=document.createElement('section');host.id='project-review-settings';document.getElementById('tab-edit').append(host);}
  host.replaceChildren();const selected=project.url;host.dataset.repo=selected;
  const heading=document.createElement('h3');heading.textContent='Pull request review';host.append(heading);
  const status=document.createElement('p');status.setAttribute('role','status');host.append(status);
  try{
    const result=await gp.reviewOptions(selected);if(host.dataset.repo!==selected)return;if(!result.ok)throw Error(result.error);
    const fields={};const add=(key,label,value,rows)=>{const l=document.createElement('label');l.textContent=label;const el=document.createElement('textarea');el.rows=rows;el.value=value;el.className='text-input';l.append(el);host.append(l);fields[key]=el;};
    add('prTemplate','PR description template',result.settings.prTemplate,6);
    add('messageTemplate',result.appName+' review notification template',result.settings.messageTemplate,5);
    const hint=document.createElement('p');hint.textContent='Template fields: {{title}}, {{url}}, {{repo}}, {{branch}}, {{description}}. Include {{url}} in notifications.';host.append(hint);
    const server=document.createElement('select'),channel=document.createElement('select');
    const label=(text,el)=>{const l=document.createElement('label');l.textContent=text;l.append(el);host.append(l);};
    label(result.appName+' workspace',server);label('Review channel',channel);
    server.add(new Option('Choose workspace',''));for(const s of result.servers)server.add(new Option(s.name,s.id));
    server.value=result.settings.serverId||(result.servers.length===1?result.servers[0].id:'');
    let generation=0;
    const load=async()=>{const mine=++generation;channel.replaceChildren(new Option('Choose channel',''));if(!server.value)return;status.textContent='Loading channels…';const r=await gp.reviewChannels(server.value);if(mine!==generation||host.dataset.repo!==selected)return;if(!r.ok){status.textContent=r.error;return;}for(const c of r.channels)channel.add(new Option('#'+c.name,c.id));channel.value=result.settings.channel;status.textContent='';};
    server.onchange=()=>load().catch(e=>status.textContent=e.message);await load();if(host.dataset.repo!==selected)return;
    const save=document.createElement('button');save.className='btn btn-primary';save.textContent='Save review settings';save.onclick=async()=>{const r=await gp.saveReviewSettings({repo:selected,settings:{prTemplate:fields.prTemplate.value,messageTemplate:fields.messageTemplate.value,serverId:server.value,channel:channel.value}});status.textContent=r.ok?'Review settings saved.':r.error;};host.append(save);
    if(!result.servers.length)status.textContent='Configure a workspace in Team Chat Servers to enable notifications.';
  }catch(e){status.textContent=e.message;}
};

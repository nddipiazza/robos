'use strict';
// Shared by Git Projects and PR Review Theater; apps supply only their workspace IPC.
window.robosOpenIDE=async function({load,launch}){
 const options=await load();
 if(options.ok===false)throw Error(options.error);
 if(options.missing?.length)throw Error('Choose an IDE in RobOS Git Projects for: '+options.missing.join(', '));
 const choices=options.choices||[];
 if(!choices.length)throw Error('No IDE is associated with these Git projects. Configure their IDEs in RobOS Git Projects.');
 if(choices.length===1&&choices[0].available){const result=await launch(choices[0].id);if(result.ok===false)throw Error(result.error);return result;}
 if(document.getElementById('robos-open-ide'))return null;
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.id='robos-open-ide';dialog.setAttribute('aria-labelledby','robos-open-ide-title');
  dialog.innerHTML='<header><h2 id="robos-open-ide-title">Open in IDE</h2><button type="button" data-close aria-label="Close">×</button></header><p>Choose an IDE associated with this workspace’s Git projects. Each opens the complete workspace.</p><div data-choices></div><footer><span role="status"></span><button type="button" data-cancel>Cancel</button><button type="button" data-open>Open selected</button></footer>';
  const list=dialog.querySelector('[data-choices]'),status=dialog.querySelector('[role=status]'),button=dialog.querySelector('[data-open]');
  for(const [index,ide] of choices.entries()){const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.value=ide.id;input.disabled=!ide.available;input.checked=ide.available&&index===choices.findIndex(i=>i.available);const text=document.createElement('span'),title=document.createElement('strong'),reason=document.createElement('small');title.textContent=ide.name+(ide.available?'':' — not installed');reason.textContent=ide.projects.join(' · ');text.append(title,reason);label.append(input,text);list.append(label);}
  const selected=()=>[...list.querySelectorAll('input:checked')].map(i=>i.value);const update=()=>{button.disabled=!selected().length;button.textContent=selected().length>1?'Open '+selected().length+' IDEs':'Open selected';};list.onchange=update;update();
  let completed=null,busy=false;dialog.onclose=()=>{dialog.remove();resolve(completed);};dialog.oncancel=event=>{if(busy)event.preventDefault();};
  dialog.querySelector('[data-close]').onclick=dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  button.onclick=async()=>{busy=true;button.disabled=true;dialog.querySelectorAll('input, [data-close], [data-cancel]').forEach(e=>e.disabled=true);const opened=[];
   try{for(const id of selected()){status.textContent='Opening '+choices.find(i=>i.id===id).name+'…';const result=await launch(id);if(result.ok===false)throw Error(result.error);opened.push(result);const input=[...list.querySelectorAll('input')].find(i=>i.value===id);input.checked=false;}completed={ok:true,opened};dialog.close();}
   catch(e){status.textContent=(opened.length?'Opened '+opened.map(r=>r.ide).join(', ')+'. ':'')+e.message;}
   finally{busy=false;dialog.querySelectorAll('[data-close],[data-cancel]').forEach(e=>e.disabled=false);list.querySelectorAll('input').forEach(e=>e.disabled=!choices.find(i=>i.id===e.value).available);update();}
  };
  if(choices.some(i=>!i.available))status.textContent='Missing IDEs can be installed in RobOS Software Center.';
  document.body.append(dialog);dialog.showModal();
 });
};
if(!document.getElementById('robos-open-ide-style')){const style=document.createElement('style');style.id='robos-open-ide-style';style.textContent=`
#robos-open-ide{color-scheme:dark;box-sizing:border-box;position:fixed;inset:0;margin:auto;width:min(640px,94vw);max-height:85vh;overflow:auto;background:#111820;color:#dbe5ee;border:1px solid #344354;border-radius:10px;padding:22px;font:14px/1.5 system-ui;box-shadow:0 24px 90px #0009}
#robos-open-ide::backdrop{background:#05090dbb}#robos-open-ide header{display:flex;align-items:center;justify-content:space-between;gap:16px}#robos-open-ide h2{font-size:21px;margin:0}#robos-open-ide p{margin:12px 0;color:#a3b7c7;font-size:13px}#robos-open-ide [data-choices]{max-height:44vh;overflow:auto;border-block:1px solid #303d4b;margin:18px 0}#robos-open-ide label{display:flex;align-items:flex-start;gap:12px;padding:13px 4px;cursor:pointer;border-bottom:1px solid #263340}#robos-open-ide label:last-child{border:0}#robos-open-ide input{margin-top:5px;accent-color:#00bcd4}#robos-open-ide strong,#robos-open-ide small{display:block}#robos-open-ide small{font-size:12px;color:#8fa2b3;overflow-wrap:anywhere}#robos-open-ide footer{display:flex;gap:10px;align-items:center}#robos-open-ide [role=status]{flex:1;font-size:12px;color:#a3b7c7}#robos-open-ide button{cursor:pointer;white-space:nowrap;padding:8px 12px;border:1px solid #3b4d5e;border-radius:5px;background:#1c2834;color:#dbe5ee;font:500 13px system-ui}#robos-open-ide button:disabled{opacity:.5;cursor:wait}#robos-open-ide [data-open]{background:#00bcd4;color:#05252c;border-color:#00bcd4}#robos-open-ide [data-close]{border:0;background:none;font-size:22px;padding:0 6px}#robos-open-ide :is(button,input):focus-visible{outline:2px solid #00bcd4;outline-offset:2px}
`;document.head.append(style);}

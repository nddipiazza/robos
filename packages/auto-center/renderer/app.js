'use strict';
const $=id=>document.getElementById(id);
let state,proposalId;
const text=(tag,value,className)=>{const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;};
function message(value){$('message').textContent=value;}
function card(title,body){const c=text('article','','card');c.append(text('h3',title),text('p',body));return c;}
async function safely(fn){try{await fn();}catch(e){message(e.message);}}
async function refresh(){
 state=await window.auto.status();$('count').textContent=state.total.toLocaleString()+' graph entries';$('cache').textContent='Raw cache: '+state.cache;
 $('source-list').replaceChildren(...state.sources.map(s=>{
  const c=card(s.title,s.url);c.append(text('p',`${s.status} · ${s.bytes||0} bytes · ${s.retrievedAt||''}`,s.status==='failed'?'failed':'status'));
  if(s.error)c.append(text('p',s.error,'failed'));if(s.sha256)c.append(text('p','SHA-256 '+s.sha256,'muted'));return c;
 }));
 const vehicles=state.records.filter(n=>n['@type']==='robos:OwnedVehicle');
 $('vehicles').replaceChildren(...vehicles.map(n=>{const o=text('option',n['dcterms:title']);o.value=n['@id'];return o;}));
 $('records').replaceChildren(...state.records.map(n=>{
  const v=vehicles.find(v=>v['@id']===n['robos:vehicle']?.['@id']);
  return card(n['dcterms:title'],n['@type']==='robos:OwnedVehicle'?[n['schema:modelDate'],n['schema:brand'],n['schema:model']].filter(Boolean).join(' '):`${v?.['dcterms:title']||''} · ${n['schema:startDate']} · ${n['robos:serviceNotes']||''}`);
 }));
 const schema=await window.auto.search({type:'robos:AutoVocabularyTerm'});
 $('schema-list').replaceChildren(...schema.nodes.filter(n=>!n['dcterms:source']).map(n=>text('span',n['dcterms:title'],'tag')));
 const software=await window.auto.search({type:'robos:AutoSoftware'});
 $('software').replaceChildren(...software.nodes.map(n=>{
  const c=card(n['dcterms:title'],n['schema:description']);const a=text('a',n['schema:url']);a.href=n['schema:url'];a.onclick=e=>{e.preventDefault();safely(()=>window.auto.openSource(n['schema:url']));};c.append(a,text('p',n['schema:license'],'muted'));return c;
 }));
}
async function search(){
 const result=await window.auto.search({query:$('query').value,type:$('type').value});
 $('results-count').textContent=`${result.total.toLocaleString()} matching entries${result.total>100?' · showing first 100; refine your search':''}`;
 $('results').replaceChildren(...result.nodes.map(n=>{const b=text('button',n['dcterms:title'],'result');b.append(text('small',n['@type']));b.onclick=()=>{$('detail').textContent=JSON.stringify(n,null,2);};return b;}));
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('nav button').forEach(n=>n.classList.toggle('active',n===b));
 document.querySelectorAll('.view').forEach(s=>s.hidden=s.id!==b.dataset.view);$('heading').textContent=b.textContent;
});
$('search-form').onsubmit=e=>{e.preventDefault();safely(search);};
for(const [form,kind] of [['vehicle-form','vehicle'],['service-form','service']]) $(form).onsubmit=e=>{e.preventDefault();safely(async()=>{
 await window.auto.save({kind,...Object.fromEntries(new FormData(e.target))});e.target.reset();await refresh();message('Saved to your local Auto graph.');
});};
$('decode').onclick=()=>safely(async()=>{
 const f=$('vehicle-form');const response=await window.auto.decode({vin:f.elements.vin.value,year:f.elements.year.value});const r=response.Results?.[0];
 if(!r)throw new Error('NHTSA returned no decode result');
 $('decode-result').textContent=`NHTSA decode status ${r.ErrorCode}: ${r.ErrorText||''}`;
 if(r.Make)f.elements.make.value=r.Make;if(r.Model)f.elements.model.value=r.Model;
 message('VIN decode received. Review the reported errors and fields before saving.');
});
$('collect-form').onsubmit=e=>{e.preventDefault();safely(async()=>{
 const v=Object.fromEntries(new FormData(e.target));$('collect').disabled=true;message('Collecting official sources and preparing a graph proposal. This can take several minutes.');
 try{const result=await window.auto.collect(Object.values(v).some(Boolean)?v:undefined);proposalId=result.id;$('review-summary').textContent=JSON.stringify(result,null,2);$('review').hidden=false;$('apply').disabled=!!(result.errors.length||result.conflicts.length);await refresh();message('Import prepared. Review its changes and source failures.');}finally{$('collect').disabled=false;}
});};
$('apply').onclick=()=>safely(async()=>{await window.auto.apply(proposalId);$('review').hidden=true;await refresh();await search();message('Public reference graph updated.');});
safely(async()=>{await refresh();await search();});

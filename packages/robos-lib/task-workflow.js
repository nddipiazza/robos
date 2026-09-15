'use strict';
function ticketWorkflow(item, server = {}) {
  const names = new Set((item.labels || []).map(l => typeof l === 'string' ? l : l.name).filter(Boolean).map(l=>l.toLowerCase()));
  if(item.issueType)names.add(String(item.issueType).toLowerCase().replace(/\s+/g,'-'));
  const native=String(item.issueType||'').toLowerCase().replace(/\s+/g,'-');
  const nativeMatches=(server.workflows||[]).filter(w=>w.type_id===native);
  const matches = nativeMatches.length?nativeMatches:(server.workflows || []).filter(w => names.has(w.type_id) || names.has(`type:${w.type_id}`) || w.type_id==='feature-request' && (names.has('feature') || names.has('type:feature')));
  if(matches.length!==1)return null;
  const w=matches[0],states=w.states || [];
  const selected=states.filter(s=>names.has(s.id) || names.has(`state:${s.id}`));
  const phase=item.session?.phase;
  const runtime=states.filter(s=>(s.agent_phases||[]).includes(phase));
  const closed=String(item.state).toLowerCase()==='closed';
  const current=closed?states.find(s=>s.is_final)?.id:runtime.length===1?runtime[0].id:selected.length===1?selected[0].id:selected.length===0?states.find(s=>s.is_initial)?.id:null;
  return {name:w.type_id==='feature'?w.name.replace(/\bFeature\b/g,'Epic').replace(/\bfeature\b/g,'epic'):w.name,typeId:w.type_id,states:states.map(s=>({id:s.id,label:s.label || s.id,current:s.id===current})),ambiguous:selected.length>1};
}
module.exports={ticketWorkflow};

'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {validateTemplate}=require('./evidence-templates');
function bindTemplate(template,result,artifacts,root){
 validateTemplate(template);
 const bindings=result.templateArtifacts||[],scenarios=new Map(result.scenarios.map(s=>[s.id,s]));
 const slots=new Map(template['robos:artifactSlots'].map(s=>[s.id,s]));
 const bound=[];
 for(const binding of bindings){
  const slot=slots.get(binding.slotId);
  if(!slot||!scenarios.has(binding.scenarioId)||typeof binding.path!=='string'||path.isAbsolute(binding.path))throw Error('Invalid template artifact binding.');
  const file=fs.realpathSync(path.resolve(root,binding.path));
  const artifact=artifacts.find(a=>a.path===file&&a.scenarioId===binding.scenarioId);
  if(!artifact)throw Error('Template slot must reference a captured artifact in the same scenario.');
  if(slot.kind==='screenshot'&&!/\.(png|jpe?g|webp)$/i.test(file))throw Error('Screenshot slot requires an image.');
  if(slot.kind==='text'&&!/\.(txt|md|json|jsonl|log|csv|xml|yaml|yml)$/i.test(file))throw Error('Text slot requires a text artifact.');
  if(bound.some(b=>b.scenarioId===binding.scenarioId&&b.slotId===slot.id&&b.artifactId===artifact.id))throw Error('Duplicate template artifact binding.');
  bound.push({scenarioId:binding.scenarioId,slotId:slot.id,artifactId:artifact.id});
 }
 for(const scenario of scenarios.values()){
  const missing=template['robos:artifactSlots'].filter(slot=>slot.required&&!bound.some(b=>b.scenarioId===scenario.id&&b.slotId===slot.id));
  if(missing.length){scenario.missingSlots=missing.map(s=>s.id);if(scenario.status==='passed')scenario.status='blocked';scenario.summary+=' Missing evidence: '+missing.map(s=>s.name).join(', ')+'.';}
 }
 return {template,templateBindings:bound};
}
function readBundle(file,head){
 const bundle=JSON.parse(fs.readFileSync(file,'utf8'));validateTemplate(bundle.template);
 if(bundle['@type']!=='robos:EvidenceBundle'||bundle['robos:evidenceTemplate']!==bundle.template['@id']||!Array.isArray(bundle.artifacts)||!Array.isArray(bundle.scenarios)||!Array.isArray(bundle.templateBindings))throw Error('Invalid task evidence bundle.');
 if(!bundle.revision)throw Error('Evidence bundle needs the tested revision.');
 const stale=head&&head!==bundle.revision;
 for(const artifact of bundle.artifacts){
  let intact=false;try{intact=!!artifact.sha256&&createHash('sha256').update(fs.readFileSync(artifact.path)).digest('hex')===artifact.sha256;}catch{}
  if(stale||!intact){artifact.verified=false;artifact.status='blocked';const scenario=bundle.scenarios.find(s=>s.id===artifact.scenarioId);if(scenario){scenario.status='blocked';scenario.summary=stale?'Evidence belongs to an earlier revision. Run the checks again.':'A captured artifact is missing or changed. Run the checks again.';}}
 }
 // Validate binding references before passing IDs to the renderer.
 for(const b of bundle.templateBindings)if(!bundle.template['robos:artifactSlots'].some(s=>s.id===b.slotId)||!bundle.artifacts.some(a=>a.id===b.artifactId&&a.scenarioId===b.scenarioId))throw Error('Bundle contains an unknown artifact binding.');
 for(const scenario of bundle.scenarios){
  const missing=bundle.template['robos:artifactSlots'].filter(s=>s.required&&!bundle.templateBindings.some(b=>b.slotId===s.id&&b.scenarioId===scenario.id));
  if(missing.length&&scenario.status==='passed'){scenario.status='blocked';scenario.summary='Required template artifacts are missing: '+missing.map(s=>s.name).join(', ');}
 }
 bundle.status=bundle.scenarios.length&&bundle.scenarios.every(s=>s.status==='passed')?'completed':'needs-attention';return bundle;
}
module.exports={bindTemplate,readBundle};

'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {GraphWorkspace}=require('../robos-graph/lib/graph-workspace');
const BUILTIN=require('./evidence-templates/builtin.json');
const ELEMENTS=['robos-evidence-transcript','robos-evidence-gallery','robos-evidence-checks'];
function validateTemplate(template){
 if(!template||template['@type']!=='robos:EvidenceTemplate'||!/^urn:robos:evidence-template:[a-z0-9:-]+$/.test(template['@id']||''))throw Error('Evidence template needs a stable urn:robos:evidence-template ID and robos:EvidenceTemplate type.');
 for(const key of ['dcterms:title','robos:collectionInstructions'])if(typeof template[key]!=='string'||!template[key].trim())throw Error('Evidence template requires '+key);
 if(!Number.isInteger(template['robos:version'])||template['robos:version']<1)throw Error('Evidence template needs a positive version.');
 if(!ELEMENTS.includes(template['robos:webElement']))throw Error('Unknown evidence web element. Choose a registered RobOS component.');
 const slots=template['robos:artifactSlots'],ids=new Set();
 if(!Array.isArray(slots)||!slots.length||slots.length>30)throw Error('Evidence template needs 1–30 artifact slots.');
 for(const slot of slots){
  if(!/^[a-z][a-z0-9-]*$/.test(slot.id||'')||ids.has(slot.id)||typeof slot.name!=='string'||!slot.name.trim()||!['text','screenshot','file'].includes(slot.kind)||typeof slot.required!=='boolean')throw Error('Invalid or duplicate evidence artifact slot.');
  ids.add(slot.id);
 }
 return template;
}
function registry(root){return new GraphWorkspace(root||process.env.ROBOS_EVIDENCE_TEMPLATE_ROOT||path.join(os.homedir(),'.config','robos','evidence-templates'));}
function listTemplates(root){
 const custom=registry(root).read()['robos:nodes'].filter(n=>n['@type']==='robos:EvidenceTemplate');
 return [...BUILTIN,...custom.filter(n=>!BUILTIN.some(b=>b['@id']===n['@id']))].map(validateTemplate);
}
function registerTemplate(template,root){
 validateTemplate(template);const graph=registry(root),existing=listTemplates(root).find(n=>n['@id']===template['@id']);
 if(existing){if(require('../robos-graph/lib/graph-workspace').hash(existing)!==require('../robos-graph/lib/graph-workspace').hash({...template,'robos:package':'testing'}))throw Error('Template IDs are immutable. Create a new version with a new ID.');return existing;}
 const node={...template,'robos:package':'testing'};
 const proposal=graph.propose({mode:'refine',edits:[{op:'add',node}],prompt:'Register reusable evidence template '+node['dcterms:title']});
 if(!proposal.validation.conforms)throw Error(JSON.stringify(proposal.validation));graph.apply(proposal);return node;
}
function readTemplate(selection){return validateTemplate(typeof selection==='string'?JSON.parse(fs.readFileSync(selection,'utf8')):selection);}
function taskEvidenceDirectory(workspace,task={}){
 const key=String(task.url||task.key||task.id||task.title||'task');
 const id=require('node:crypto').createHash('sha256').update(key).digest('hex').slice(0,16);
 const workspaceId=require('node:crypto').createHash('sha256').update(path.resolve(workspace)).digest('hex').slice(0,16);
 return path.join(os.homedir(),'.robos','task-evidence',workspaceId,id);
}
module.exports={ELEMENTS,BUILTIN,validateTemplate,listTemplates,registerTemplate,readTemplate,taskEvidenceDirectory};

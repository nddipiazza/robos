'use strict';
const fs=require('node:fs'),path=require('node:path');
const VERSION=2;
const children={project:['feature','epic','task'],feature:['epic','task'],epic:['epic','task'],task:[]};
function normalize(record){
 const legacy=(record.hierarchyVersion||0)<VERSION;
 const kind=record.kind||(!record.workTaskUrl&&!record.product?'project':'feature');
 return {...record,kind:legacy&&kind==='feature'?'epic':kind,hierarchyVersion:VERSION};
}
function migrate(dir){
 if(!fs.existsSync(dir))return;
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){const target=path.join(dir,file);let old;try{old=JSON.parse(fs.readFileSync(target));}catch{continue;}
 if(old.hierarchyVersion>=VERSION)continue;
 const backup=path.join(dir,'hierarchy-v1-backup');fs.mkdirSync(backup,{recursive:true});const copy=path.join(backup,file);if(!fs.existsSync(copy))fs.copyFileSync(target,copy);
 fs.writeFileSync(target,JSON.stringify(normalize(old),null,2));
 }
}
function validate(record,records){
 if(!children[record.kind])throw Error('Choose Project, Feature, Epic, or Task.');
 const byId=new Map(records.map(r=>[r.id,r]));byId.set(record.id,record);
 if(record.parentPlanId){const parent=byId.get(record.parentPlanId);if(!parent||!children[parent.kind]?.includes(record.kind))throw Error('That parent cannot contain this type of work.');
 const seen=new Set([record.id]);let node=parent;while(node){if(seen.has(node.id))throw Error('This relationship would create a cycle.');seen.add(node.id);node=byId.get(node.parentPlanId);}
 if(parent.product?.id!==record.product?.id)throw Error('Parent and child must belong to the same project.');
 }
 if(record.kind==='feature'&&!record.product?.id)throw Error('Choose a project for this feature.');
 for(const id of record.relatedFeatureIds||[]){const other=byId.get(id);if(record.kind!=='feature'||id===record.id||other?.kind!=='feature')throw Error('Related features must reference other features.');}
 for(const url of record.resources||[]){let parsed;try{parsed=new URL(url);}catch{throw Error('Use complete web resource URLs.');}if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Use HTTP or HTTPS resource URLs without credentials.');}
}
function node(record){const id='urn:robos:project:'+record.id,ref=id=>({'@id':'urn:robos:project:'+id});return {'@id':id,'@type':['robos:'+record.kind[0].toUpperCase()+record.kind.slice(1)],'dcterms:title':record.name,'dcterms:description':record.description||record.prompt||'','robos:status':'active','robos:plannerRecordId':record.id,'robos:hierarchyVersion':VERSION,'robos:package':'organization','robos:hasRepository':record.repos||[],'robos:webResources':record.resources||[],'robos:relatedFeature':(record.relatedFeatureIds||[]).map(ref),...(record.product?.id&&record.kind!=='project'?{'robos:inProject':ref(record.product.id)}:{}),...(record.parentPlanId?{'robos:parentWorkItem':ref(record.parentPlanId)}:{})};}
module.exports={VERSION,children,normalize,migrate,validate,node};

// Upgrade existing graph delivery records in place; preserve IDs and all plan/review metadata.
function migrateGraph(root){
 const {GraphWorkspace}=require('../../robos-graph/lib/graph-workspace');const ws=new GraphWorkspace(root),nodes=ws.read()['robos:nodes'];
 const ids=new Set(nodes.filter(n=>(n['@type']||[]).includes('robos:Feature')&&(n['robos:hierarchyVersion']||0)<VERSION).map(n=>n['@id']));
 const edits=[];
 for(const node of nodes){const set={},unset=[];if(ids.has(node['@id'])){set['@type']=node['@type'].map(t=>t==='robos:Feature'?'robos:Epic':t);set['robos:hierarchyVersion']=VERSION;}
 const parent=node['robos:inFeature'],parentId=typeof parent==='string'?parent:parent?.['@id'];if(ids.has(parentId)){set['robos:inEpic']=parent;unset.push('robos:inFeature');}
 if(Object.keys(set).length)edits.push({op:'update',id:node['@id'],set,...(unset.length?{unset}:{})});}
 if(!edits.length)return {updated:0};const proposal=ws.propose({mode:'refine',edits,prompt:'Migrate the former delivery Feature concept to Epic, preserving IDs, ticket links, plans and signoff. New version-2 Features are lasting project capabilities.'});ws.apply(proposal,{expectedProposalId:proposal.id});return {updated:edits.length};
}
module.exports.migrateGraph=migrateGraph;

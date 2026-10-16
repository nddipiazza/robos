'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { OSLCGraphParser, OSLC_CONTEXT } = require('../../robos-graph/lib/oslc-parser');
const { GraphWorkspace } = require('../../robos-graph/lib/graph-workspace');
const { AUTO_TYPES } = require('../../robos-graph/lib/auto-shapes');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const ref = id => ({'@id':id});
const id = (kind, key) => `urn:robos:auto:${kind}:${encodeURIComponent(String(key))}`;
const context = {...OSLC_CONTEXT, rdfs:'http://www.w3.org/2000/01/rdf-schema#'};
function node(type, key, title, properties={}) {
 return {'@id':id(type,key),'@type':`robos:${type}`,'dcterms:title':title,'robos:package':'auto',...properties};
}
function contained(root, relative) {
 const file = path.resolve(root,relative);
 if (!file.startsWith(path.resolve(root)+path.sep)) throw new Error('Source path outside cache');
 return file;
}
function buildDocument(root) {
 const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 const nodes = new Map();
 const add = n => { nodes.set(n['@id'], {...nodes.get(n['@id']), ...n}); return ref(n['@id']); };
 for (const [name,upstream,required] of AUTO_TYPES) add(node('AutoVocabularyTerm',name,name,{
  'schema:url':`https://schema.org/${upstream}`, 'robos:refersFrom':`https://schema.org/${upstream}`,
  'schema:description':`RobOS Auto ${name}; required properties: ${required.join(', ')}`,
 }));
 for (const s of manifest.sources.filter(s=>s.status==='downloaded')) {
  const buffer = fs.readFileSync(contained(root,s.file));
  if (sha(buffer)!==s.sha256) throw new Error(`Source hash mismatch: ${s.id}`);
  const source = add(node('AutoDataset',s.id,s.title,{'schema:url':s.url,'schema:license':s.license,'robos:provenance':s}));
  const provenance = row => ({'dcterms:source':source,'robos:sourceRow':row});
  let rows;
  if (['epa','diagnostics'].includes(s.kind)) {
   // Re-derive from the immutable archive when collecting; verify the derivative too.
   const raw = fs.readFileSync(contained(root,s.derived));
   if (!s.derivedSha256 || sha(raw)!==s.derivedSha256) throw new Error('EPA/diagnostics derivative hash mismatch; refresh collection');
   rows = JSON.parse(raw);
  } else if (['makes','models','variables','recalls','complaints','vocabulary'].includes(s.kind)) {
   const doc = JSON.parse(buffer); rows = doc.Results || doc.results || doc['@graph'];
   if (!Array.isArray(rows)) throw new Error(`Invalid result array: ${s.id}`);
  } else continue;
  rows.forEach((r,index)=> {
   const p = provenance(index+1);
   if(s.kind==='diagnostics') add(node('DiagnosticCode',r.code,`${r.code} · ${r.description}`,{'schema:name':r.code,'schema:description':r.description,'schema:license':s.license,...p}));
   if (s.kind==='makes') add(node('VehicleMake',`nhtsa-${r.Make_ID}`,r.Make_Name,{'schema:name':r.Make_Name,...p}));
   if (s.kind==='models') {
    const make = add(node('VehicleMake',`nhtsa-${r.Make_ID}`,r.Make_Name,{'schema:name':r.Make_Name,...p}));
    add(node('VehicleModel',`nhtsa-${r.Make_ID}-${r.Model_ID}`,`${r.Make_Name} ${r.Model_Name}`,{'schema:name':r.Model_Name,'robos:make':make,...p}));
   }
   if (s.kind==='epa') {
    const make = add(node('VehicleMake',`epa-${r.make}`,r.make,{'schema:name':r.make,...p}));
    const model = add(node('VehicleModel',`epa-${r.make}-${r.model}`,`${r.make} ${r.model}`,{'schema:name':r.model,'robos:make':make,...p}));
    add(node('VehicleConfiguration',`epa-${r.id}`,`${r.year} ${r.make} ${r.model} · ${r.trany || ''}`,{
     'schema:modelDate':r.year,'schema:name':`${r.make} ${r.model}`,'robos:model':model,
     'schema:fuelType':r.fuelType,'schema:vehicleTransmission':r.trany,'schema:driveWheelConfiguration':r.drive,
     'schema:vehicleEngine':{'@type':'schema:EngineSpecification','schema:engineDisplacement':{'@type':'schema:QuantitativeValue','schema:value':r.displ,'schema:unitText':'L'}},
     'robos:epaVehicleId':r.id,'robos:combinedMpg':r.comb08,'robos:cityMpg':r.city08,'robos:highwayMpg':r.highway08,...p,
    }));
   }
   if (s.kind==='variables') add(node('AutoVocabularyTerm',`vpic-${r.ID}`,r.Name,{'schema:url':`https://vpic.nhtsa.dot.gov/api/vehicles/GetVehicleVariableValuesList/${r.ID}?format=json`,'schema:description':r.Description||'',...p}));
   if (s.kind==='vocabulary' && /(?:Vehicle|Car$|Motorcycle|BusOrCoach|MotorizedBicycle|AutoRepair|AutoPartsStore|EngineSpecification|vehicleIdentificationNumber|modelDate|mileageFromOdometer|vehicleConfiguration|numberOfPreviousOwners|OwnershipInfo|^schema:Boat$|^schema:Train$|Motorized)/.test(r['@id'])) {
    add(node('AutoVocabularyTerm',r['@id'],typeof r['rdfs:label']==='string'?r['rdfs:label']:r['@id'],{'schema:url':r['@id'].replace(/^schema:/,'https://schema.org/'),'robos:sourceSummary':{term:r},...p}));
   }
   if (s.kind==='recalls' || s.kind==='complaints') {
    const key = r.NHTSACampaignNumber || r.odiNumber;
    if (!key) throw new Error(`Missing ${s.kind} identity`);
    add(node(s.kind==='recalls'?'RecallCampaign':'SafetyComplaint',key,`${key} · ${r.Component || r.components || ''}`,{
     'schema:identifier':String(key),'schema:description':r.Summary || r.summary || '',
     'robos:sourceSummary':r,'robos:coverage':'Model-level report; does not establish history or recall status of an individual VIN',...p,
    }));
   }
  });
 }
 const software = require('../sources.json');
 for(const s of software) add(node('AutoSoftware',s.name,s.name,{'schema:url':s.url,'schema:license':s.license,'schema:description':s.description}));
 const document = {'@context':context,'@id':'urn:robos:graph:auto','@type':['robos:SystemGraph'],'dcterms:title':'RobOS Auto public reference data','robos:nodes':[...nodes.values()]};
 // Exercise the actual KGraph parser and retain explicit reference objects for traversal.
 const parser = new OSLCGraphParser(document);
 if (parser.nodes.length !== nodes.size) throw new Error('KGraph parser lost nodes');
 return document;
}
function propose(root) {
 const workspace = new GraphWorkspace(path.join(root,'workspace'));
 const proposal = workspace.propose({document:buildDocument(root),prompt:'Import official automotive reference data with source hashes; preserve local edits.'});
 return {workspace,proposal};
}
module.exports = { buildDocument, propose, node, ref, id, context, sha };

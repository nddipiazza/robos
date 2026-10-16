'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildDocument,propose,sha}=require('../lib/importer');
const {AutoCenter}=require('../lib/service');
const {OSLCGraphParser}=require('../../robos-graph/lib/oslc-parser');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'robos-auto-import-'));
 const data={makes:{Results:[{Make_ID:448,Make_Name:'Toyota'}]},models:{Results:[{Make_ID:448,Make_Name:'Toyota',Model_ID:1,Model_Name:'Camry'}]},epa:[{id:'1',year:'2015',make:'Toyota',model:'Camry',trany:'Automatic',fuelType:'Gasoline',comb08:'28',displ:'2.5'}],schemaorg:{'@graph':[{'@id':'schema:Vehicle','rdfs:label':'Vehicle'}]}};
 const sources=Object.entries(data).map(([key,doc])=>{
  const file=key+'.json';fs.writeFileSync(path.join(root,file),JSON.stringify(doc));const hash=sha(fs.readFileSync(path.join(root,file)));
  return {id:key,title:key,kind:key==='schemaorg'?'vocabulary':key,url:'https://example.org/'+key,status:'downloaded',file,sha256:hash,...(key==='epa'?{derived:file,derivedSha256:hash}:{})};
 });
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({sources}));return root;
}
test('parses year configurations and explicit make/model references; validates and applies a reviewed KGraph import',()=>{
 const root=fixture();const {workspace,proposal}=propose(root);assert.deepEqual(proposal.validation.errors,[]);
 workspace.apply(proposal,{expectedProposalId:proposal.id});const p=new OSLCGraphParser(workspace.read());
 const configuration=p.queryNodes({type:'robos:VehicleConfiguration'})[0];assert.equal(configuration['schema:modelDate'],'2015');
 assert.ok(p.getNode(configuration['robos:model']['@id']));
 assert.equal(p.queryNodes({type:'robos:VehicleModel'}).find(n=>n['@id'].includes('nhtsa'))['schema:modelDate'],undefined);
 const next=propose(root);assert.equal(next.proposal.delta.added.length,0);assert.equal(next.proposal.delta.changed.length,0);
});
test('rejects tampered raw or derived data and paths outside the cache',()=>{
 const root=fixture();fs.appendFileSync(path.join(root,'makes.json'),' ');assert.throws(()=>buildDocument(root),/hash mismatch/);
 const root2=fixture();const m=JSON.parse(fs.readFileSync(path.join(root2,'manifest.json')));m.sources[0].file='../outside';fs.writeFileSync(path.join(root2,'manifest.json'),JSON.stringify(m));assert.throws(()=>buildDocument(root2),/outside cache/);
 const root3=fixture();const m3=JSON.parse(fs.readFileSync(path.join(root3,'manifest.json')));m3.sources.find(s=>s.id==='epa').derivedSha256='0'.repeat(64);fs.writeFileSync(path.join(root3,'manifest.json'),JSON.stringify(m3));assert.throws(()=>buildDocument(root3),/derivative hash mismatch/);
});
test('private garage records survive reload and enforce dates, references, VIN format and units',()=>{
 const root=fixture(),privateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'robos-auto-private-'));
 const service=new AutoCenter({root,privateRoot});
 const vehicle=service.save({kind:'vehicle',name:'Owner-entered truck',year:'2020',plate:'TEST',jurisdiction:'Test'});
 assert.throws(()=>service.save({kind:'service',name:'Repair',vehicle:'unknown',date:'2026-10-01',mileage:'10',unit:'SMI'}),/saved vehicle/);
 assert.throws(()=>service.save({kind:'service',name:'Repair',vehicle:vehicle['@id'],date:'2026-02-30',mileage:'10',unit:'SMI'}),/date/);
 assert.throws(()=>service.save({kind:'vehicle',name:'Invalid',vin:'I'.repeat(17)}),/VIN/);
 service.save({kind:'service',name:'Oil change',vehicle:vehicle['@id'],date:'2026-10-01',mileage:'500',unit:'KMT',notes:'Filter replaced'});
 const reload=new AutoCenter({root,privateRoot});assert.equal(reload.status().records.length,2);assert.equal(reload.status().total,0);
 assert.equal(fs.statSync(privateRoot).mode&0o777,0o700);
 assert.equal(reload.workspace.read()['robos:nodes'].find(n=>n['@type']==='robos:ServiceRecord')['schema:mileageFromOdometer']['schema:unitCode'],'KMT');
});

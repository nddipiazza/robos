'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { GraphWorkspace } = require('../../robos-graph/lib/graph-workspace');
const { OSLCGraphParser } = require('../../robos-graph/lib/oslc-parser');
const { propose, node, ref, context } = require('./importer');
class AutoCenter {
 constructor({root=process.env.ROBOS_AUTO_CACHE || path.join(os.homedir(),'.robos/auto-scrape'),privateRoot=process.env.ROBOS_AUTO_PRIVATE || path.join(os.homedir(),'.config/robos/auto-center')}={}) {
  this.root=root; this.privateRoot=privateRoot; this.workspace=new GraphWorkspace(privateRoot); this.publicGraph=null; this.pending=null; this.busy=false;
  fs.mkdirSync(privateRoot,{recursive:true,mode:0o700}); fs.chmodSync(privateRoot,0o700);
 }
 publicParser() {
  if(!this.publicGraph) this.publicGraph=new OSLCGraphParser(new GraphWorkspace(path.join(this.root,'workspace')).read());
  return this.publicGraph;
 }
 status() {
  const p=this.publicParser(), counts={}; for(const n of p.nodes) counts[n['@type']]=(counts[n['@type']]||0)+1;
  const manifest=fs.existsSync(path.join(this.root,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(this.root,'manifest.json'))):{sources:[]};
  return {counts,total:p.nodes.length,sources:manifest.sources,cache:this.root,privateRoot:this.privateRoot,records:this.workspace.read()['robos:nodes']};
 }
 search({query='',type=''}={}) {
  if(typeof query!=='string'||query.length>200||typeof type!=='string') throw new Error('Invalid search');
  const results=this.publicParser().queryNodes({search:query,type:type||undefined});
  return {total:results.length, nodes:results.slice(0,100)};
 }
 async collect(vehicle) {
  if(this.busy) throw new Error('An import is already running');
  this.busy=true;
  try {
   const args=[path.join(__dirname,'../collect.py'),'--root',this.root];
   if(vehicle) {
    if(!/^\d{4}$/.test(String(vehicle.year))||!vehicle.make||!vehicle.model) throw new Error('Provide year, make and model');
    args.push('--vehicle',String(vehicle.year),String(vehicle.make).slice(0,100),String(vehicle.model).slice(0,100));
   }
   try { await run('python3',args,{timeout:900000,maxBuffer:1024*1024}); }
   catch(e) { if(!fs.existsSync(path.join(this.root,'manifest.json'))) throw e; }
   const {workspace,proposal}=propose(this.root); this.pending={workspace,proposal};
   return {id:proposal.id,added:proposal.delta.added.length,changed:proposal.delta.changed.length,removed:proposal.delta.removed.length,errors:proposal.validation.errors,conflicts:proposal.conflicts,failed:this.status().sources.filter(s=>s.status==='failed')};
  } finally {this.busy=false;}
 }
 apply(id) {
  if(!this.pending || this.pending.proposal.id!==id) throw new Error('Import review expired; collect again');
  const result=this.pending.workspace.apply(this.pending.proposal,{expectedProposalId:id});this.pending=null;this.publicGraph=null;return result;
 }
 async decode(vin,year) {
  if(typeof vin!=='string'||!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) throw new Error('Enter a 17-character VIN (without I, O or Q)');
  if(!/^\d{4}$/.test(String(year))) throw new Error('Provide the model year for VIN decoding');
  const {stdout}=await run('python3',[path.join(__dirname,'../decode.py'),vin.toUpperCase(),String(year)],{timeout:60000,maxBuffer:1024*1024});
  return JSON.parse(stdout);
 }
 save(input) {
  const title=String(input.name||'').trim(); if(!title||title.length>200) throw new Error('Name is required (200 characters maximum)');
  let n;
  if(input.kind==='vehicle') {
   if(input.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(input.vin)) throw new Error('Invalid VIN');
   if(input.year&&!/^\d{4}$/.test(String(input.year))) throw new Error('Invalid model year');
   n=node('OwnedVehicle',crypto.randomUUID(),title,{'schema:name':title,'schema:vehicleIdentificationNumber':String(input.vin||'').toUpperCase(),'schema:modelDate':String(input.year||''),'schema:brand':String(input.make||''),'schema:model':String(input.model||''),'robos:licensePlate':String(input.plate||''),'robos:registrationJurisdiction':String(input.jurisdiction||''),'robos:ownerNotes':String(input.owner||'')});
  } else if(input.kind==='service') {
   const vehicle=this.workspace.read()['robos:nodes'].find(n=>n['@id']===input.vehicle&&n['@type']==='robos:OwnedVehicle');
   if(!vehicle) throw new Error('Select a saved vehicle');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||Number.isNaN(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date) throw new Error('Valid service date required');
   const mileage=Number(input.mileage);if(input.mileage!==''&&(!Number.isFinite(mileage)||mileage<0)) throw new Error('Mileage must be non-negative');
   if(!['SMI','KMT'].includes(input.unit)) throw new Error('Choose miles or kilometers');
   n=node('ServiceRecord',crypto.randomUUID(),title,{'robos:vehicle':ref(input.vehicle),'schema:startDate':input.date,'schema:description':title,'robos:serviceNotes':String(input.notes||''),'schema:mileageFromOdometer':{'@type':'schema:QuantitativeValue','schema:value':input.mileage===''?null:mileage,'schema:unitCode':input.unit}});
  } else throw new Error('Unsupported record kind');
  for(const v of Object.values(input)) if(typeof v==='string'&&v.length>10000) throw new Error('Field too long');
  const proposal=this.workspace.propose({mode:'refine',edits:[{op:'add',node:n}],prompt:'Save locally entered auto record'});
  this.workspace.apply(proposal,{expectedProposalId:proposal.id}); return n;
 }
}
module.exports={AutoCenter};

'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { GraphWorkspace } = require('../../robos-graph/lib/graph-workspace');
const { OSLCGraphParser } = require('../../robos-graph/lib/oslc-parser');
const { propose, node, ref } = require('./importer');
const {RecallStore}=require('./recalls');
const {PrivateGit}=require('./private-git');
const invoices=require('./invoices');
const reports=require('./reports');
const shopOperations=require('./shop-operations');
const JOB_STATES=['received','diagnosing','awaiting-approval','in-progress','ready','closed'];
function date(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
class AutoCenter {
 constructor({root=process.env.ROBOS_AUTO_CACHE || path.join(os.homedir(),'.robos/auto-scrape'),privateRoot=process.env.ROBOS_AUTO_PRIVATE || path.join(os.homedir(),'.config/robos/auto-center'),clock=()=>new Date()}={}) {
  this.clock=clock;this.reportTimeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;this.root=root; this.privateRoot=privateRoot; this.settingsFile=path.join(privateRoot,'settings.json'); this.mode=fs.existsSync(this.settingsFile)?JSON.parse(fs.readFileSync(this.settingsFile)).mode:'owner'; if(!['owner','shop'].includes(this.mode))this.mode='owner'; this.recalls=new RecallStore(root); this.publicGraph=null; this.pending=null; this.busy=false;
  fs.mkdirSync(privateRoot,{recursive:true,mode:0o700}); fs.chmodSync(privateRoot,0o700);
 }
 get dataRoot(){return this.mode==='shop'?path.join(this.privateRoot,'shop'):this.privateRoot;}
 get workspace(){return new GraphWorkspace(this.dataRoot);}
 setMode(mode){if(!['owner','shop'].includes(mode))throw new Error('Invalid Auto mode');fs.writeFileSync(this.settingsFile+'.tmp',JSON.stringify({mode}),{mode:0o600});fs.renameSync(this.settingsFile+'.tmp',this.settingsFile);this.mode=mode;if(mode==='shop')new PrivateGit(this.dataRoot).ensure();return this.status();}
 gitops({action,repository}={}){if(this.mode!=='shop')throw new Error('Shop GitOps is only available in maintenance center mode');const git=new PrivateGit(this.dataRoot);if(action==='configure')return git.configure(repository);if(action==='sync')return git.sync();return git.status();}
 invoicePath(id){const n=this.workspace.read()['robos:nodes'].find(n=>n['@id']===id&&n['@type']==='robos:Invoice');if(!n)throw new Error('Unknown invoice');const file=path.resolve(this.dataRoot,n['robos:documentPath']);if(!file.startsWith(path.resolve(this.dataRoot)+path.sep)||require('./importer').sha(fs.readFileSync(file))!==n['robos:documentSha256'])throw new Error('Invoice original changed');return file;}
 recallArchivePath(){const s=this.recalls.current();if(!s)throw new Error('Import the recall archive first');const file=path.resolve(this.root,s.source.file);if(!file.startsWith(path.resolve(this.root)+path.sep))throw new Error('Invalid recall source path');return file;}
 scanInvoice(file){return invoices.scan(file,this.dataRoot);}
 async importRecalls(){if(this.busy)throw new Error('An import is already running');this.busy=true;try{const {stdout}=await run(process.execPath,[path.join(__dirname,'../recalls-cli.js')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',ROBOS_AUTO_CACHE:this.root},timeout:900000,maxBuffer:1024*1024});const summary=JSON.parse(stdout.trim().split('\n').pop());this.pending={kind:'recalls',...summary};return summary;}finally{this.busy=false;}}
 async detail(id){return await this.recalls.detail(id)||{node:this.publicParser().getNode(id)};}
 sourceRow(id){return this.recalls.source(id);}
 async vehicleRecalls(vehicleId){const v=this.workspace.read()['robos:nodes'].find(n=>n['@id']===vehicleId&&n['@type']==='robos:OwnedVehicle');if(!v)throw new Error('Select a saved vehicle');if(!v['schema:modelDate']||!v['schema:brand']||!v['schema:model'])throw new Error('Vehicle needs year, make and model');return this.recalls.search({type:'robos:RecallApplicability',vehicle:{year:v['schema:modelDate'],make:v['schema:brand'],model:v['schema:model']}});}
 reports(options={}){shopOperations.shop(this);return reports.buildReports(this.workspace.read()['robos:nodes'],{...options,now:this.clock(),timeZone:this.reportTimeZone});}
 checkIn(input){return shopOperations.checkIn(this,input);}
 checkOut(input){return shopOperations.checkOut(this,input);}
 recordFinance(input){return require('./finance').recordFinance(this,input);}
 recordPayment(input){return shopOperations.recordPayment(this,input);}
 updateJob({id,status,notes,billedTotal,currency}){
  if(this.mode!=='shop'||!JOB_STATES.includes(status))throw new Error('Invalid shop job status');
  const records=this.workspace.read()['robos:nodes'];const n=records.find(n=>n['@id']===id&&n['@type']==='robos:RepairOrder');if(!n)throw new Error('Unknown repair job');
  if(typeof notes!=='string'||notes.length>10000)throw new Error('Invalid job notes');
  const set={'robos:jobStatus':status,'robos:repairNotes':notes};
  if(status==='closed')set['robos:closedAt']=n['robos:jobStatus']==='closed'?n['robos:closedAt']||null:this.clock().toISOString();
  else if(n['robos:jobStatus']==='closed')set['robos:closedAt']=null;
  if(billedTotal!==undefined&&billedTotal!==''){
   const amount=reports.amountMinor(billedTotal);if(!reports.CURRENCIES.includes(currency))throw new Error('Choose a billing currency');
   if(records.some(p=>['robos:ShopPayment','robos:ShopFinanceEntry'].includes(p['@type'])&&p['robos:job']?.['@id']===id&&p['robos:currency']!==currency))throw new Error('Billing currency must match recorded payments and financial entries');
   set['robos:billedMinor']=amount;set['robos:billingCurrency']=currency;
  }
  shopOperations.commit(this,[{op:'update',id,set}],'auto: update repair job');return this.status();
 }
 completeSchedule(id){const n=this.workspace.read()['robos:nodes'].find(n=>n['@id']===id&&n['@type']==='robos:MaintenanceSchedule');if(!n)throw new Error('Unknown maintenance schedule');const p=this.workspace.propose({mode:'refine',edits:[{op:'update',id,set:{'robos:scheduleStatus':'completed'}}],prompt:'Mark planned maintenance complete'});this.workspace.apply(p,{expectedProposalId:p.id});if(this.mode==='shop')new PrivateGit(this.dataRoot).commit('auto: complete maintenance plan');return this.status();}
 publicParser() {
  if(!this.publicGraph) this.publicGraph=new OSLCGraphParser(new GraphWorkspace(path.join(this.root,'workspace')).read());
  return this.publicGraph;
 }
 status() {
  const p=this.publicParser(), counts={}; for(const n of p.nodes) counts[n['@type']]=(counts[n['@type']]||0)+1;
  const manifest=fs.existsSync(path.join(this.root,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(this.root,'manifest.json'))):{sources:[]};
  const recalls=this.recalls.current();for(const [type,count] of Object.entries(recalls?.counts||{}))counts[type]=(counts[type]||0)+count;
  return {schemaTypes:require('../../robos-graph/lib/auto-shapes').AUTO_TYPES.map(([name])=>name),mode:this.mode,counts,total:p.nodes.length+(recalls?.nodes||0),recalls:recalls?{nodes:recalls.nodes,records:recalls.records,retrievedAt:recalls.source.retrievedAt,outdated:manifest.sources.find(s=>s.id==='recalls-bulk')?.sha256!==recalls.archiveSha256}:null,sources:manifest.sources,cache:this.root,privateRoot:this.dataRoot,gitops:this.mode==='shop'?new PrivateGit(this.dataRoot).status():null,records:this.workspace.read()['robos:nodes']};
 }
 async search({query='',type=''}={}) {
  if(typeof query!=='string'||query.length>200||typeof type!=='string') throw new Error('Invalid search');
  const bulk=await this.recalls.search({query,type});const results=this.publicParser().queryNodes({search:query,type:type||undefined});
  return {total:results.length+bulk.total, nodes:[...bulk.nodes,...results].slice(0,100)};
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
 async apply(id) {
  if(this.pending?.kind==='recalls'){if(this.pending.reviewId!==id)throw new Error('Recall import review expired');const {stdout}=await run(process.execPath,[path.join(__dirname,'../recalls-cli.js'),'--apply-reviewed',this.pending.build,id],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',ROBOS_AUTO_CACHE:this.root},timeout:900000,maxBuffer:1024*1024});this.pending=null;this.recalls.cached=null;return JSON.parse(stdout.trim());}
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
  } else if(['schedule','job','invoice'].includes(input.kind)) {
   const vehicle=this.workspace.read()['robos:nodes'].find(n=>n['@id']===input.vehicle&&n['@type']==='robos:OwnedVehicle');if(!vehicle)throw new Error('Select a saved vehicle');
   const common={'robos:vehicle':ref(input.vehicle)};
   if(input.kind==='schedule'){
    if(input.date&&!date(input.date))throw new Error('Valid due date required');
    if(!input.date&&input.mileage==='')throw new Error('Provide a due date or odometer target');
    if(input.mileage!==''&&(!Number.isFinite(Number(input.mileage))||Number(input.mileage)<0))throw new Error('Invalid odometer target');
    if(!['SMI','KMT'].includes(input.unit))throw new Error('Choose miles or kilometers');
    n=node('MaintenanceSchedule',crypto.randomUUID(),title,{...common,'schema:startDate':input.date||'','robos:dueOdometer':input.mileage===''?null:Number(input.mileage),'robos:odometerUnit':input.unit,'robos:scheduleStatus':'planned','schema:description':String(input.notes||'')});
   }else if(input.kind==='job'){
    if(this.mode!=='shop')throw new Error('Repair jobs require maintenance center mode');
    n=node('RepairOrder',crypto.randomUUID(),title,{...common,'robos:jobStatus':'received','robos:repairNotes':String(input.notes||''),'robos:technician':String(input.technician||''),'schema:orderDate':this.clock().toISOString()});
   }else{
    if(!date(input.date))throw new Error('Valid invoice date required');
    if(!/^[A-Z]{3}$/.test(input.currency))throw new Error('Choose a currency');
    if(!/^\d+(?:\.\d{1,2})?$/.test(input.amount))throw new Error('Enter a non-negative invoice total with up to two decimals');
    const original=invoices.accept(this.dataRoot,input.token,input.sha256);
    n=node('Invoice',crypto.randomUUID(),title,{...common,'schema:dateCreated':input.date,'schema:totalPaymentDue':{'@type':'schema:MonetaryAmount','schema:value':input.amount,'schema:currency':input.currency},'robos:invoiceText':String(input.invoiceText||original.text),'robos:documentPath':original.path,'robos:documentSha256':original.sha256,'robos:extractionMethod':original.method,'robos:reviewedByUser':true});
   }
  } else throw new Error('Unsupported record kind');
  for(const v of Object.values(input)) if(typeof v==='string'&&v.length>50000) throw new Error('Field too long');
  const edits=[{op:'add',node:n}];
  if(input.kind==='job'&&input.checkIn==='on'&&!this.workspace.read()['robos:nodes'].some(s=>s['@type']==='robos:VehicleStay'&&s['robos:vehicle']?.['@id']===input.vehicle&&!s['schema:endDate']))edits.push({op:'add',node:shopOperations.checkInNode(this,{vehicle:input.vehicle},this.workspace.read()['robos:nodes'])});
  const proposal=this.workspace.propose({mode:'refine',edits,prompt:'Save locally entered auto record'});
  this.workspace.apply(proposal,{expectedProposalId:proposal.id}); if(this.mode==='shop'){try{new PrivateGit(this.dataRoot).commit('auto: save '+input.kind);}catch(error){throw new Error('Record saved locally, but Git snapshot failed: '+error.message);}}return n;
 }
}
module.exports={AutoCenter};

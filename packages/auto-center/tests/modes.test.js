'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {AutoCenter}=require('../lib/service');
const {PrivateGit}=require('../lib/private-git');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'robos-auto-modes-'));
function service(){return new AutoCenter({root:temp(),privateRoot:temp()});}
test('owner and shop modes persist separately; schedules and repair jobs have real private Git history',()=>{
 const s=service();const personal=s.save({kind:'vehicle',name:'Personal car',year:'2015'});
 assert.throws(()=>s.save({kind:'job',name:'Repair',vehicle:personal['@id']}),/maintenance center/);
 const plan=s.save({kind:'schedule',name:'Annual inspection',vehicle:personal['@id'],date:'2027-10-15',mileage:'',unit:'SMI'});
 assert.throws(()=>s.save({kind:'schedule',name:'Invalid',vehicle:personal['@id'],date:'2027-02-30',mileage:'',unit:'SMI'}),/date/);
 s.completeSchedule(plan['@id']);assert.equal(s.status().records.find(n=>n['@id']===plan['@id'])['robos:scheduleStatus'],'completed');
 s.setMode('shop');assert.equal(s.status().records.length,0);const car=s.save({kind:'vehicle',name:'Customer car'});const job=s.save({kind:'job',name:'Brake inspection',vehicle:car['@id'],notes:'Customer reports noise',technician:'Test technician'});
 s.updateJob({id:job['@id'],status:'in-progress',notes:'Inspection underway'});assert.equal(s.status().records.find(n=>n['@id']===job['@id'])['robos:jobStatus'],'in-progress');
 assert.throws(()=>s.updateJob({id:job['@id'],status:'fake',notes:''}),/status/);assert.ok(s.status().gitops.commits.length>=3);assert.equal(s.status().gitops.remote,null);
 const tracked=execFileSync('git',['ls-files'],{cwd:s.dataRoot,encoding:'utf8'});assert.match(tracked,/\.robos\/knowledge-graph/);
 const reload=new AutoCenter({root:s.root,privateRoot:s.privateRoot});assert.equal(reload.mode,'shop');reload.setMode('owner');assert.equal(reload.status().records.length,2);assert.ok(!reload.status().records.some(n=>n['@id']===job['@id']));assert.throws(()=>reload.gitops({action:'sync'}),/only available/);
});
test('private GitOps refuses public remote before configuring or pushing',()=>{
 const dir=temp(),bin=path.join(dir,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'gh'),'#!/bin/sh\nprintf \'{"isPrivate":false,"url":"https://github.com/test/public"}\'\n',{mode:0o755});
 const before=process.env.PATH;process.env.PATH=bin+path.delimiter+before;
 try{const git=new PrivateGit(dir);assert.throws(()=>git.configure('test/public'),/private/);assert.equal(git.status().remote,null);assert.throws(()=>git.sync(),/private GitHub/);}finally{process.env.PATH=before;}
});
test('invoice OCR runs locally, retains the original hash, and requires reviewed vehicle/date/amount',async()=>{
 const s=service(),file=path.join(temp(),'test-invoice.png');
 execFileSync('python3',['-c',`from PIL import Image,ImageDraw,ImageFont\nimport sys\nim=Image.new('RGB',(1400,650),'white');d=ImageDraw.Draw(im);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',40)\nfor i,t in enumerate(['TEST INVOICE - NOT A REAL REPAIR','Example Repair Shop','Oil and filter change','2026-10-15','TOTAL USD 125.00']):d.text((50,40+i*100),t,font=font,fill='black')\nim.save(sys.argv[1])`,file]);
 const pdf=path.join(path.dirname(file),'test-invoice.pdf');execFileSync('python3',['-c',"from PIL import Image;import sys;Image.open(sys.argv[1]).save(sys.argv[2],'PDF',resolution=150)",file,pdf]);const pdfReview=await s.scanInvoice(pdf);assert.match(pdfReview.text,/125\.00/);assert.equal(pdfReview.extension,'.pdf');
 const review=await s.scanInvoice(file);assert.match(review.text,/INVOICE/);assert.match(review.text,/125\.00/);const vehicle=s.save({kind:'vehicle',name:'Owner test car'});
 assert.throws(()=>s.save({kind:'invoice',name:'Example shop',vehicle:vehicle['@id'],date:'2026-10-15',amount:'bad',currency:'USD',token:review.token,sha256:review.sha256}),/total/);
 const invoice=s.save({kind:'invoice',name:'Example shop test invoice',vehicle:vehicle['@id'],date:'2026-10-15',amount:'125.00',currency:'USD',token:review.token,sha256:review.sha256,invoiceText:review.text});
 assert.ok(fs.readFileSync(path.join(s.dataRoot,invoice['robos:documentPath'])).equals(fs.readFileSync(file)));assert.equal(invoice['robos:documentSha256'],review.sha256);assert.equal(invoice['robos:reviewedByUser'],true);
 fs.appendFileSync(path.join(s.dataRoot,'pending-invoices',review.token,'original.png'),'changed');assert.throws(()=>s.save({kind:'invoice',name:'Tampered',vehicle:vehicle['@id'],date:'2026-10-15',amount:'125.00',currency:'USD',token:review.token,sha256:review.sha256}),/changed/);
});

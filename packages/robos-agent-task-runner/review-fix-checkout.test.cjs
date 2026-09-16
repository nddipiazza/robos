'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {checkoutReviewFix}=require('./review-fix-checkout');
test('fresh sandbox checks out exact PR revision and rejects a changed head',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'robos-fix-checkout-')),source=path.join(root,'source');
 const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-b','main',source);git('-C',source,'config','user.name','Test');git('-C',source,'config','user.email','test@example.com');fs.writeFileSync(source+'/code.txt','base');git('-C',source,'add','.');git('-C',source,'commit','-m','base');git('-C',source,'checkout','-b','topic');fs.writeFileSync(source+'/code.txt','reviewed');git('-C',source,'commit','-am','change');const head=git('-C',source,'rev-parse','HEAD');git('-C',source,'update-ref','refs/pull/3/head',head);git('-C',source,'checkout','main');
 const checkout=path.join(root,'sandbox');git('clone',source,checkout);
 checkoutReviewFix(cp,checkout,{number:3,head,branch:'topic'},process.env);
 assert.equal(git('-C',checkout,'rev-parse','HEAD'),head);assert.equal(git('-C',checkout,'branch','--show-current'),'topic');assert.equal(fs.readFileSync(checkout+'/code.txt','utf8'),'reviewed');
 assert.throws(()=>checkoutReviewFix(cp,checkout,{number:3,head:'0'.repeat(40),branch:'other'},process.env),/PR changed/);
 assert.equal(git('-C',checkout,'branch','--show-current'),'topic');assert.equal(fs.readFileSync(source+'/code.txt','utf8'),'base');
});

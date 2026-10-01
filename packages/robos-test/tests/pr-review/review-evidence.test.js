'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {evidenceFor,registerScreenshot}=require('../../../pr-review/lib/review-evidence');
const {ReviewSessionStore}=require('../../../pr-review/lib/review-session-store');
test('catalog includes all supplied roots, deep images, reports, indexed comparison context and old chat pages',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-evidence-'));const store=new ReviewSessionStore({repo:'org/repo',branch:'feature',workspace:root,root});
 for(let i=0;i<135;i++)store.append({role:'assistant',text:'Checkpoint note '+i,timestamp:i});
 const a=path.join(root,'proof-a'),b=path.join(root,'proof-b','nested','deeper','screens');fs.mkdirSync(a,{recursive:true});fs.mkdirSync(b,{recursive:true});
 const before=path.join(a,'before.png'),after=path.join(b,'after.png');fs.writeFileSync(before,'image');fs.writeFileSync(after,'image');fs.writeFileSync(path.join(a,'manifest.json'),'{}');fs.writeFileSync(path.join(a,'results.log'),'observed checks');
 registerScreenshot(store,{path:before,kind:'screenshot',side:'before',checkpoint:'Original filters',revision:'abc',capturedAt:'2026-10-01'});
 registerScreenshot(store,{path:after,kind:'screenshot',side:'after',checkpoint:'Compact filters',revision:'def',capturedAt:'2026-10-02'});
 const proof=evidenceFor({evidenceRoots:[a,path.join(root,'proof-b'),a]},store);
 assert.equal(proof.evidence.filter(e=>e.kind==='screenshot').length,2);assert.equal(proof.evidence.find(e=>e.path===before).side,'before');assert.equal(proof.evidence.find(e=>e.path===after).revision,'def');assert.ok(proof.evidence.some(e=>e.path.endsWith('results.log')));assert.equal(proof.reviewNotes.length,135);assert.equal(proof.reviewNotes[0].text,'Checkpoint note 0');
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{resolveReviewLink}=require('./renderer/review-links');
const pr={repo:'Hermetiq/buildbarn-forms',headRefOid:'a'.repeat(40),files:[{path:'docs/validation/issue-62/README.md'}]};
test('evidence directories and files target the reviewed commit',()=>{assert.equal(resolveReviewLink('docs/validation/issue-62',pr),`https://github.com/${pr.repo}/tree/${pr.headRefOid}/docs/validation/issue-62`);assert.equal(resolveReviewLink('./docs/validation/issue-62/README.md#checks',pr),`https://github.com/${pr.repo}/blob/${pr.headRefOid}/docs/validation/issue-62/README.md#checks`);});
test('external URLs and fragments retain their intended destinations',()=>{assert.equal(resolveReviewLink('https://example.com/proof?q=1',pr),'https://example.com/proof?q=1');assert.equal(resolveReviewLink('#checks',pr),null);});
test('unsupported schemes and missing PR context fail visibly instead of navigating Electron',()=>{for(const href of ['javascript:alert(1)','file:///etc/passwd','https://secret@github.com/x'])assert.throws(()=>resolveReviewLink(href,pr));assert.throws(()=>resolveReviewLink('docs/proof',{}),/Reload/);});

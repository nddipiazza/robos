'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {list,ready,reviewEnvironment,passing}=require('../../../dev-central/lib/pull-requests');
test('lists all configured repositories and preserves empty results and failures',async()=>{
 const r=await list([{org:'a',repo:'one'},{org:'a',repo:'two'}],async args=>args.includes('a/one')?'[]':JSON.stringify([{number:2}]));
 assert.deepEqual(r.data,[{number:2,repo:'a/two'}]);
 const failed=await list([{org:'a',repo:'one'}],async()=>{throw Error('offline');});assert.equal(failed.data.length,0);assert.match(failed.warning,/offline/);
});
test('ready requires fresh passing CI, same commit, draft and authenticated author',async()=>{
 const url='https://github.com/a/one/pull/2';
 for(const override of [{},{headRefOid:'new'},{isDraft:false},{state:'MERGED'},{author:{login:'other'}},{statusCheckRollup:[{status:'COMPLETED',conclusion:'CANCELLED'}]},{statusCheckRollup:[]}]){
  const pr={url,isDraft:true,state:'OPEN',author:{login:'me'},headRefOid:'abc',statusCheckRollup:[{state:'SUCCESS'}],...override};let mutations=0;
  const gh=async args=>{if(args[0]==='api')return '{"login":"me"}';if(args[1]==='ready'){mutations++;pr.isDraft=false;return '';}return JSON.stringify(pr);};
  if(Object.keys(override).length)await assert.rejects(ready(url,'abc',gh));else assert.equal((await ready(url,'abc',gh)).isDraft,false);
  assert.equal(mutations,Object.keys(override).length?0:1);
 }
 assert.equal(passing([{status:'IN_PROGRESS',conclusion:null}]),false);
 assert.throws(()=>reviewEnvironment('javascript:alert(1)'),/Invalid/);
 assert.equal(reviewEnvironment(url,'/nonexistent').ROBOS_REVIEW_URL,url);
});
test('opening a PR reuses only its matching saved review',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dc-review-'));fs.mkdirSync(path.join(root,'saved'));
 const url='https://github.com/a/one/pull/2',file=path.join(root,'saved','review.json');
 fs.writeFileSync(file,JSON.stringify({workspace:root,pullRequest:{url}}));
 assert.equal(reviewEnvironment(url,root).ROBOS_LOCAL_REVIEW,file);
 assert.equal(reviewEnvironment('https://github.com/a/one/pull/3',root).ROBOS_LOCAL_REVIEW,undefined);
});

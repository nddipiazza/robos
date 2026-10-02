'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ReviewPRState}=require('../../../pr-review/lib/review-pr-state');
function fixture(state='OPEN',login='author'){
 const manifest=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'author-pr-')),'review.json');fs.writeFileSync(manifest,'{}');
 const remote={number:484,url:'https://github.com/org/repo/pull/484',title:'Filters',body:'Original',state,isDraft:false,author:{login:'author'},headRefName:'codex/filters',headRefOid:'abc',baseRefName:'main'};const calls=[];
 const review={repo:'org/repo',workspace:'/tmp',pullRequest:{url:remote.url},pr:{local:true}};
 const run=async(bin,args)=>{calls.push([bin,...args]);if(args[0]==='api')return JSON.stringify({login});if(args[1]==='view')return JSON.stringify(remote);if(args[1]==='edit'){remote.body=fs.readFileSync(args[args.indexOf('--body-file')+1],'utf8');remote.title=args[args.indexOf('--title')+1];return '';}if(bin==='git')return ({branch:'codex/filters',remote:'git@github.com:org/repo.git',status:'',push:''})[args[0]];throw Error(args.join(' '));};
 return {api:new ReviewPRState(review,manifest,run),remote,calls};
}
test('reload detects author, draft, merged and closed from GitHub',async()=>{
 const f=fixture();assert.equal((await f.api.refresh()).isAuthor,true);
 f.remote.isDraft=true;assert.equal((await f.api.refresh()).isDraft,true);
 for(const state of ['CLOSED','MERGED']){f.remote.state=state;assert.equal((await f.api.refresh()).state,state);await assert.rejects(f.api.assertAuthor(),/open PR/);}
 assert.equal((await fixture('OPEN','reviewer').api.refresh()).isAuthor,false);
});
test('description updates preserve markdown and verify the saved body',async()=>{
 const f=fixture();const result=await f.api.update({title:'Fresh title',body:'![Current](https://example.test/new.png)',expectedBody:'Original',expectedTitle:'Filters'});
 assert.equal(result.title,'Fresh title');assert.match(result.body,/new.png/);assert.ok(f.calls.some(c=>c.includes('--body-file')));
});
test('non-author, closed PR, and concurrent GitHub edits cannot be overwritten',async()=>{
 for(const f of [fixture('CLOSED'),fixture('MERGED'),fixture('OPEN','someone'),fixture()]){
 await assert.rejects(f.api.update({title:'New',body:'New',expectedBody:'Stale',expectedTitle:'Filters'}),/open PR|changed on GitHub/);assert.ok(!f.calls.some(c=>c[2]==='edit'));
 }
});
test('author can push committed adjustments without forcing the remote',async()=>{
 const f=fixture();await f.api.push();assert.deepEqual(f.calls.find(c=>c[1]==='push'),['git','push','origin','HEAD:refs/heads/codex/filters']);
});
test('ready rechecks head, CI, author and draft state before mutating GitHub',async()=>{
 for(const checks of [[],[{state:'PENDING'}],[{state:'FAILURE'}],[{status:'IN_PROGRESS',conclusion:null}],[{state:'SUCCESS'},{state:'ERROR'}]]){
  const f=fixture();f.remote.isDraft=true;f.remote.statusCheckRollup=checks;
  await assert.rejects(f.api.ready('abc'),/CI checks/);assert.ok(!f.calls.some(c=>c[2]==='ready'));
 }
 const f=fixture();f.remote.isDraft=true;f.remote.statusCheckRollup=[{state:'SUCCESS'},{status:'COMPLETED',conclusion:'SKIPPED'}];
 await assert.rejects(f.api.ready('old'),/branch changed/);
 const run=f.api.run;f.api.run=async(bin,args,opts)=>{if(args[1]==='ready'){f.calls.push([bin,...args]);f.remote.isDraft=false;return '';}return run(bin,args,opts);};
 assert.equal((await f.api.ready('abc')).isDraft,false);
 assert.deepEqual(f.calls.find(c=>c[2]==='ready'),['gh','pr','ready',f.remote.url]);
 await assert.rejects(f.api.ready('abc'),/already ready/);
 for(const other of [fixture('CLOSED'),fixture('MERGED'),fixture('OPEN','reviewer')])await assert.rejects(other.api.ready('abc'),/author of an open PR/);
});

test('ready requests selected GitHub reviewers and excludes the author',async()=>{
 const f=fixture();f.remote.isDraft=true;f.remote.statusCheckRollup=[{state:'SUCCESS'}];const run=f.api.run;
 f.api.run=async(bin,args,opts)=>{if(args[1]==='ready'){f.remote.isDraft=false;return '';}if(args.includes('--add-reviewer')){f.calls.push([bin,...args]);return '';}return run(bin,args,opts);};
 await f.api.ready('abc',['author','teammate','org/backend']);
 assert.deepEqual(f.calls.find(c=>c.includes('--add-reviewer')),['gh','pr','edit',f.remote.url,'--add-reviewer','teammate,org/backend']);
});

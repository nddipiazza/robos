'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ReviewPRPublisher}=require('../../../pr-review/lib/create-review-pr');
function fixture({dirty=false,pushed=true,existing=false}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'publish-review-'));const file=path.join(dir,'review.json');fs.writeFileSync(file,'{}');const calls=[];const pr={number:42,title:'Compact filters',url:'https://github.com/org/repo/pull/42'};
 const run=async(bin,args)=>{calls.push([bin,...args]);if(bin==='git'){if(args[0]==='remote')return 'git@github.com:org/repo.git';if(args[0]==='branch')return 'codex/filters';if(args[0]==='status')return dirty?' M app.js':'';if(args[0]==='rev-parse')return 'abc';if(args[0]==='ls-remote')return pushed?'abc refs/heads/codex/filters':'';}
 if(args[1]==='list')return JSON.stringify(existing?[pr]:[]);if(args[1]==='create')return pr.url;if(args[1]==='view')return JSON.stringify(pr);throw Error('Unexpected call');};
 return {publisher:new ReviewPRPublisher({workspace:dir,repo:'org/repo',baseRef:'origin/main',pr:{}},file,run),calls,file};
}
test('only explicit publish creates PR, using pushed branch and body file; duplicate clicks share one operation',async()=>{
 const {publisher,calls,file}=fixture();assert.equal(calls.length,0);const input={title:'Compact filters',body:'Keep existing customization.'};const [a,b]=await Promise.all([publisher.create(input),publisher.create(input)]);assert.equal(a.number,b.number);const creates=calls.filter(c=>c[2]==='create');assert.equal(creates.length,1);assert.ok(!creates[0].includes('--draft'));assert.ok(creates[0].includes('--body-file'));assert.equal(JSON.parse(fs.readFileSync(file)).pullRequest.number,42);
});
test('dirty or unpushed branches cannot publish',async()=>{for(const opts of [{dirty:true},{pushed:false}]){const {publisher,calls}=fixture(opts);await assert.rejects(publisher.create({title:'Filters',body:'Change'}),/Uncommitted|Push/);assert.ok(!calls.some(c=>c[2]==='create'));}});
test('existing branch PR is reused without another creation',async()=>{const {publisher,calls}=fixture({existing:true});assert.equal((await publisher.create({title:'Filters',body:'Change'})).number,42);assert.ok(!calls.some(c=>c[2]==='create'));});
test('implementation checkout opens an unpublished local review with the actual branch',()=>{
 const {execFileSync}=require('node:child_process');const {prepareLocalReview}=require('../../../pr-review/lib/prepare-local-review');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'review-handoff-'));
 const git=args=>execFileSync('git',['-C',dir,...args],{stdio:'pipe'});git(['init','-b','main']);git(['config','user.email','test@example.test']);git(['config','user.name','Test']);git(['commit','--allow-empty','-m','base']);git(['remote','add','origin','git@github.com:org/repo.git']);git(['update-ref','refs/remotes/origin/main','HEAD']);git(['symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/main']);git(['checkout','-b','codex/task']);
 const file=prepareLocalReview(dir,{title:'Task'},path.join(dir,'saved'));const config=JSON.parse(fs.readFileSync(file));assert.equal(config.repo,'org/repo');assert.equal(config.baseRef,'origin/main');assert.equal(config.pullRequest,undefined);assert.ok(fs.existsSync(config.demoProcess));assert.equal(prepareLocalReview(dir,{title:'Task'},path.join(dir,'saved')),file);
});
test('pinned diff baseline uses a separate PR target branch',async()=>{
 const {publisher,calls}=fixture();publisher.review.baseRef='0cd40790';
 await assert.rejects(publisher.create({title:'Filters',body:'Change'}),/baseBranch/);
 publisher.review.baseBranch='main';await publisher.create({title:'Filters',body:'Change'});
 const create=calls.find(c=>c[2]==='create');assert.equal(create[create.indexOf('--base')+1],'main');
});

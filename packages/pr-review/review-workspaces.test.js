'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {orderPages,writeWorkspace,prepare}=require('./review-workspaces');
const pr=(repo,n)=>({url:`https://github.com/acme/${repo}/pull/${n}`,title:repo,headRefOid:'a'.repeat(40)});
test('orders library PR before consumer, independent pages deterministic, detects cycles',()=>{
 const projects=[{url:'https://github.com/acme/service',dependsOn:['https://github.com/acme/library'],ideId:'goland'},{url:'https://github.com/acme/library',ideId:'webstorm'}];
 const result=orderPages([pr('service',1),pr('library',2)],projects);assert.equal(result.pages[0].repo,'acme/library');assert.deepEqual(result.pages[1].dependsOn,[pr('library',2).url]);assert.equal(result.pages[1].ide.id,'goland');
 projects[1].dependsOn=[projects[0].url];assert.equal(orderPages([pr('service',1),pr('library',2)],projects).cycle,true);
});
test('workspace includes every root, escapes XML and does not write inside repository',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'robos-workspace-test-')),repos=[{name:'library',path:root+'/library & ui'},{name:'service',path:root+'/service'}];
 const code=writeWorkspace(root+'/code',repos,{family:'vscode'});assert.deepEqual(JSON.parse(fs.readFileSync(code)).folders,repos);
 const idea=writeWorkspace(root+'/idea',repos,{family:'jetbrains'});assert.match(fs.readFileSync(idea+'/.idea/library-0.iml','utf8'),/library &amp; ui/);assert.match(fs.readFileSync(idea+'/.idea/modules.xml','utf8'),/service-1.iml/);assert(!fs.existsSync(repos[0].path));
});
test('refuses missing sandbox instead of opening desktop cwd',async()=>{
 await assert.rejects(prepare({},{}),/no preserved agent workspace/);
});
test('opens all session projects at pinned commits without touching preserved clones or later review edits',async()=>{
 const cp=require('node:child_process');const run=async(bin,args)=>cp.execFileSync(bin,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'robos-session-review-'));const source=path.join(root,'repos','acme--library');fs.mkdirSync(source,{recursive:true});
 await run('git',['init',source]);await run('git',['-C',source,'config','user.email','test@example.com']);await run('git',['-C',source,'config','user.name','Test']);fs.writeFileSync(source+'/package.json','{"name":"library"}');await run('git',['-C',source,'add','.']);await run('git',['-C',source,'commit','-m','fixture']);const sha=(await run('git',['-C',source,'rev-parse','HEAD'])).trim();
 const state={sandbox:{artifacts:root},launchConfig:{repositories:['https://github.com/acme/library']}};const page={repo:'acme/library',headRefOid:sha,ide:{id:'webstorm',family:'jetbrains'}};
 const result=await prepare(state,page,run);assert.equal((await run('git',['-C',result.repositories[0].path,'rev-parse','HEAD'])).trim(),sha);assert(!fs.existsSync(source+'/.idea'));fs.writeFileSync(result.repositories[0].path+'/reviewer-notes.txt','keep my review edits');const again=await prepare(state,page,run);assert.equal(fs.readFileSync(again.repositories[0].path+'/reviewer-notes.txt','utf8'),'keep my review edits');assert(!fs.existsSync(source+'/reviewer-notes.txt'));
});
test('backend dependency gate requires merged predecessors, including closed-but-unmerged PRs',()=>{
 const {assertPrerequisites}=require('./review-workspaces');const result={pages:[{url:'library',state:'OPEN',dependsOn:[]},{url:'service',state:'OPEN',dependsOn:['library']}]};
 assert.throws(()=>assertPrerequisites(result,'service'),/prerequisite/);result.pages[0].state='CLOSED';assert.throws(()=>assertPrerequisites(result,'service'),/prerequisite/);result.pages[0].state='MERGED';assert.doesNotThrow(()=>assertPrerequisites(result,'service'));result.cycle=true;assert.throws(()=>assertPrerequisites(result,'service'),/cycle/);
});

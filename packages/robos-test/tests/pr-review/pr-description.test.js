'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {execFileSync}=require('node:child_process');
const {PRDescriptionGenerator,evidenceFor}=require('../../../pr-review/lib/pr-description');
test('description uses actual diff and proof, executes read-only, and identifies local evidence',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pr-description-test-'));const git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe'});git(['init','-b','main']);git(['config','user.name','Test']);git(['config','user.email','test@example.test']);fs.writeFileSync(path.join(root,'ui.js'),'old');git(['add','ui.js']);git(['commit','-m','base']);fs.writeFileSync(path.join(root,'ui.js'),'new');
 const runner=path.join(root,'agent');fs.writeFileSync(runner,`#!/usr/bin/env node\nconst fs=require('node:fs');const args=process.argv.slice(2);let prompt='';process.stdin.on('data',b=>prompt+=b);process.stdin.on('end',()=>{if(!args.includes('read-only')||args.includes('danger-full-access')||!prompt.includes('-old')||!prompt.includes('+new'))process.exit(2);fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify({markdown:'## Changes\\n\\nUpdated the UI.',warnings:[]}));});`,{mode:0o700});
 const video=path.join(root,'proof','demo.webm');fs.mkdirSync(path.dirname(video));fs.writeFileSync(video,'test artifact');fs.writeFileSync(path.join(root,'proof','screen.png'),'test artifact');
 const review={repo:'org/repo',workspace:root,baseRef:'HEAD',pr:{headBranch:'codex/task'},videoPath:video,demoAgent:{command:runner,args:['exec','--sandbox','danger-full-access']}};
 assert.equal(evidenceFor(review).evidence.length,2);const result=await new PRDescriptionGenerator(review).generate({title:'Change',body:'Review it'});assert.match(result.markdown,/Updated the UI/);assert.ok(result.warnings.some(w=>w.includes('local only')));
});

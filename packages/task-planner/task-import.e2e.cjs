'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),{createHash}=require('crypto');
async function ev(js){const r=await fetch('http://localhost:19134/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js})});const v=await r.json();if(v.error)throw Error(v.error);return v.result;}
(async()=>{
 const source=await ev("window.robos.searchImportTasks({query:'',state:'open'})");assert(source.ok);
 const issue=source.issues.find(i=>!i.imported&&!fs.existsSync(path.join(os.homedir(),'.config/robos/work-tasks',createHash('sha256').update(i.url.toLowerCase()).digest('hex').slice(0,24),'state.json')));assert(issue,'An unimported issue is required for isolated verification');
 const root=await ev("window.robos.saveProject({name:'Import verification '+Date.now(),kind:'project',tasks:[],prompt:''})");assert(root.ok);
 const manifest={projectId:root.project.id,issueId:'work-task-'+createHash('sha256').update(issue.url.toLowerCase()).digest('hex').slice(0,24),url:issue.url};
 fs.writeFileSync(path.join(os.homedir(),'.hermetiq/proof/robos-desktop-onboarding/import-test-records.json'),JSON.stringify(manifest,null,2));
 await ev(`document.querySelector('#task-import-dialog')?.close();loadProjectsList().then(()=>openProject('${root.project.id}')).then(()=>openTaskImport())`);
 await ev(`document.querySelector('#import-rows input[data-number="${issue.number}"]').click()`);
 assert.equal(await ev("document.querySelector('#import-submit').textContent"),'Import selected (1)');
 await ev("document.querySelector('#import-submit').onclick()");
 assert.equal(await ev("document.querySelector('#task-import-dialog')"),null);
 const imported=await ev(`window.robos.loadProject('${manifest.issueId}')`);assert(imported.ok);assert.equal(imported.project.workTaskUrl,issue.url);assert.equal(imported.project.product.name,root.project.name);assert.equal(imported.project.tasks[0].body,issue.body);
 const repeat=await ev(`window.robos.importTasks({projectId:'${root.project.id}',numbers:[${issue.number}]})`);assert(repeat.ok);assert(repeat.results[0].skipped);
 await ev('openTaskImport()');assert(await ev(`document.querySelector('#import-rows input[data-number="${issue.number}"]').disabled`));
 await ev("document.querySelector('#import-cancel').click()");
 console.log('PASS: live server listing, selection, local import, preserved source/body/project, duplicate prevention, and already-imported UI. No GitHub mutations.');console.log('Cleanup records: '+JSON.stringify(manifest));
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {runGitHub,resolveServer}=require('../../../robos-task-client/github-command');
const credentialEnv=async host=>({...require('../../../robos-lib/github-accounts').cleanEnv(),GH_HOST:host});
const settings={active_task_server:'other',task_servers:[{id:'other',type:'github',repos:[{org:'Other',repo:'tasks'}]},{id:'hermetiq',type:'github',repos:[{org:'Hermetiq',repo:'cloud-native'}],gh_api_url:'https://github.company.test/api/v3'}]};
test('repository and PR URL select their task server; unmatched repository uses active server',async()=>{
 assert.equal(resolveServer(settings,'Hermetiq/cloud-native').id,'hermetiq');assert.equal(resolveServer(settings,'unknown/repo').id,'other');
 let env;
 await runGitHub(['pr','view','https://github.company.test/Hermetiq/cloud-native/pull/1'],{settings,credentialEnv,execute:async(_bin,_args,opts)=>{env=opts.env;return{stdout:'{}'}}});
 assert.equal(env.GH_HOST,'github.company.test');
});
test('ambient credentials cannot override the RobOS Git client account; argv stays literal',async()=>{
 const saved={GH_TOKEN:process.env.GH_TOKEN,GITHUB_TOKEN:process.env.GITHUB_TOKEN,GH_DEBUG:process.env.GH_DEBUG};
 try{
  process.env.GH_TOKEN='wrong-test-token';process.env.GITHUB_TOKEN='wrong-test-token';process.env.GH_DEBUG='api';
  const body='Literal `command` and $(command)\nsecond line';
  await runGitHub(['pr','review','--repo','Hermetiq/cloud-native','1','--body',body],{settings,credentialEnv,execute:async(bin,args,opts)=>{assert.equal(bin,'gh');assert.equal(args.at(-1),body);for(const key of Object.keys(saved))assert.equal(opts.env[key],undefined);return{stdout:''}}});
 }finally{for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('pass-token task server cannot silently use a different CLI account',async()=>{
 let called=false;
 await assert.rejects(runGitHub(['pr','list'],{settings:{active_task_server:'private',task_servers:[{id:'private',type:'github',use_gh_cli:false}]},execute:async()=>{called=true}}),/Use Git client account/);assert.equal(called,false);
});

test('selected Git account is used even when gh has another active account',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'github-selection-')),'accounts.json');
 fs.writeFileSync(file,JSON.stringify({git:'work-account'}));
 const calls=[];
 const accounts=require('../../../robos-lib/github-accounts').create({configFile:file,run:async args=>{calls.push(args);return 'selected-credential';},runSync:args=>{calls.push(args);return 'selected-credential';}});
 const env=await accounts.gitEnv('github.com',{GH_TOKEN:'ambient-wrong',GITHUB_TOKEN:'ambient-wrong'});
 assert.deepEqual(calls,[['auth','token','--hostname','github.com','--user','work-account']]);
 assert.equal(env.GH_TOKEN,'selected-credential');assert.equal(env.GITHUB_TOKEN,undefined);
 fs.writeFileSync(file,JSON.stringify({git:'changed-account'}));await accounts.gitEnv('github.com');
 assert.equal(calls[1].at(-1),'changed-account');
 const enterprise=accounts.gitEnvSync('git.company.test',{GH_ENTERPRISE_TOKEN:'wrong'});
 assert.equal(enterprise.GH_ENTERPRISE_TOKEN,'selected-credential');assert.equal(enterprise.GH_TOKEN,undefined);assert.equal(calls[2].at(-1),'changed-account');
});

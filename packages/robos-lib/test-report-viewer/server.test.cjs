'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {discover,safeFile,start}=require('./server');
test('viewer discovers actual session media and reports, excludes symlinks and raw logs',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'robos-evidence-viewer-')),evidence=path.join(root,'session','evidence');
 fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'demo.webm'),'test-media');
 fs.writeFileSync(path.join(evidence,'index.html'),'<h1>Native report</h1>');fs.writeFileSync(path.join(evidence,'log.txt'),'not a verdict');
 fs.symlinkSync('/etc/passwd',path.join(evidence,'outside.html'));
 const sessions=discover(root);assert.equal(sessions.length,1);assert.equal(sessions[0].files.length,2);
 assert.throws(()=>safeFile(evidence,'outside.html'),/Invalid artifact/);
 assert.throws(()=>safeFile(evidence,'../../../etc/passwd'));
 const server=await start({sessions,title:'Fixture',head:'abc123'});
 try{
  const data=await (await fetch(server.url+'data.json')).json();assert.equal(data.sessions[0].files.length,2);
  const media=data.sessions[0].files.find(f=>f.video);
  const response=await fetch(server.url+media.url,{headers:{Range:'bytes=0-3'}});
  assert.equal(response.status,206);assert.equal(await response.text(),'test');
  assert.equal((await fetch(server.url+'artifact/session/outside.html')).status,404);
  assert.equal((await fetch(new URL('/data.json',server.url))).status,404);
 }finally{server.close();}
});
test('no evidence still supplies useful original check links without invented status',async()=>{
 const server=await start({title:'Docs',head:'abc',files:[{path:'README.md'}],checks:[{name:'Build',url:'https://github.com/o/r/actions/runs/1'}]});
 try{const data=await (await fetch(server.url+'data.json')).json();assert.deepEqual(data.sessions,[]);assert.equal(data.checks[0].name,'Build');assert.equal(data.checks[0].status,undefined);}finally{server.close();}
});

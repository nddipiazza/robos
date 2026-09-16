'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const roots=require('./project-roots');
test('discovers nested application and library roots, ignores vendored/generated manifests',()=>{
 const result=roots.fromFiles(['package.json','packages/ui/package.json','services/api/go.mod','vendor/foo/go.mod','node_modules/foo/package.json','../escape/go.mod','build/generated/package.json','tools/codegen/Cargo.toml']);
 assert.deepEqual(result.map(r=>[r.relativePath,r.ideId]),[['.','webstorm'],['packages/ui','webstorm'],['services/api','goland'],['tools/codegen','rustrover']]);
});
test('does not traverse symlinks or resolve roots outside a repository',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'robos-roots-test-'));fs.writeFileSync(path.join(root,'go.mod'),'module example');fs.symlinkSync(os.tmpdir(),path.join(root,'outside'),'dir');assert.equal(roots.discover(root).roots.length,1);assert.throws(()=>roots.resolve(root,'../outside'),/relative/);assert.throws(()=>roots.resolve(root,'outside'),/leaves/);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const settings=require('../../../robos-lib/project-review-settings');
test('template edits preserve project recipients, explicit clearing stays possible, projects remain separate',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'project-recipient-defaults-'));
 const reviewers=[{serverId:'slack',userId:'U1',name:'Cesar Andres'},{serverId:'slack',userId:'U2',name:'Tim Potter'}];
 settings.save('org/repo',{reviewers,serverId:'slack',channel:'C1'},root);
 settings.save('org/repo',{prTemplate:'New description'},root);
 settings.save('org/repo',{messageTemplate:'Please review {{url}}'},root);
 assert.deepEqual(settings.read('org/repo',root).reviewers,reviewers);
 assert.equal(settings.read('org/repo',root).channel,'C1');
 assert.deepEqual(settings.read('org/other',root).reviewers,[]);
 settings.save('org/repo',{reviewers:[]},root);assert.deepEqual(settings.read('org/repo',root).reviewers,[]);
});

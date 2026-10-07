'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {taskEvidenceDirectory}=require('../../../robos-lib/evidence-templates');
test('task evidence lives outside the checkout and is isolated per workspace and task',()=>{
 const a=taskEvidenceDirectory('/tmp/project-a',{url:'https://example.test/issues/1'});
 assert.ok(a.startsWith(path.join(os.homedir(),'.robos','task-evidence')+path.sep));
 assert.equal(a,taskEvidenceDirectory('/tmp/project-a',{url:'https://example.test/issues/1'}));
 assert.notEqual(a,taskEvidenceDirectory('/tmp/project-b',{url:'https://example.test/issues/1'}));
 assert.notEqual(a,taskEvidenceDirectory('/tmp/project-a',{url:'https://example.test/issues/2'}));
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const requests=require('./human-requests');
const url='https://github.com/example/tasks/issues/1';
test('recognizes human permission requirements without classifying ordinary failures',()=>{
 for(const s of ['sudo: a password is required','sudo: a terminal is required to read the password','administrator privileges required'])assert.equal(requests.classify(s),'administrator');
 assert.equal(requests.classify('AGY could not complete the task: permission required for GrepSearch.'),'approval');
 for(const s of ['network unavailable','token expired','file permission denied','build failed'])assert.equal(requests.classify(s),null);
});
test('one pending request per task and kind; success closes it; later requests can recur',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'human-requests-'));
 const first=requests.reportError(url,'permission required for GrepSearch',dir);
 assert.equal(first.action.label,'Review request');
 assert.equal(requests.reportError(url,'permission required for GrepSearch',dir),false);
 fs.writeFileSync(path.join(dir,'notifications.json'),'[]');
 assert.equal(requests.reportError(url,'permission required for GrepSearch',dir),false);
 requests.resolveTask(url,dir);
 const next=requests.reportError(url,'permission required for GrepSearch',dir);assert.notEqual(next.id,first.id);
 requests.resolveTask(url,dir);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'notifications.json')))[0].requestStatus,'resolved');
});
test('notification stores neither raw output nor executable commands',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'human-requests-'));
 const n=requests.reportError(url,'permission required for tool; SECRET_TOKEN=private',dir);
 assert.equal(JSON.stringify(n).includes('private'),false);
 assert.equal(n.action.command,undefined);
 assert.throws(()=>requests.report({taskUrl:url,kind:'approval',app:'arbitrary-shell'},dir));
});

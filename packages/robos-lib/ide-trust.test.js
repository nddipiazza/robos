'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {addTrustedLocation,trustReviewWorkspace}=require('./ide-trust');
test('adds exact generated workspace trust without discarding existing restrictions; idempotent',()=>{
 const source='<application><component name="Trusted.Paths"><option name="TRUSTED_PROJECT_PATHS"><map><entry key="/untrusted" value="false" /></map></option></component></application>';
 const next=addTrustedLocation(source,'/session/a & b');assert(next.includes('key="/untrusted" value="false"'));assert(next.includes('/session/a &amp; b'));assert.equal(addTrustedLocation(next,'/session/a & b'),next);
});
test('will not auto-trust an arbitrary developer checkout',()=>{assert.throws(()=>trustReviewWorkspace('/tmp/project','/tmp',{family:'jetbrains'}),/limited to RobOS/);});

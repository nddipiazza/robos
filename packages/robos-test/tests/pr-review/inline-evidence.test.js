'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {resolveEvidence}=require('../../../pr-review/lib/inline-evidence');
const markdown='![Failed builds](robos-evidence://screenshot/0123456789abcdef)';
test('publishing resolves draft screenshots to their supplied shared URLs',()=>{
 assert.equal(resolveEvidence(markdown,[{id:'0123456789abcdef',kind:'screenshot',url:'https://example.com/failed.png'}]),'![Failed builds](https://example.com/failed.png)');
});
test('publishing never sends unresolved, unknown or unsafe screenshot references',()=>{
 for(const evidence of [[],[{id:'0123456789abcdef',kind:'screenshot',path:'/tmp/failed.png'}],[{id:'0123456789abcdef',kind:'screenshot',url:'file:///tmp/failed.png'}]])assert.throws(()=>resolveEvidence(markdown,evidence),/local screenshots/);
 assert.throws(()=>resolveEvidence('![x](robos-evidence://anything)',[]),/Resolve local/);
 assert.equal(resolveEvidence('Human text',[]),'Human text');
});

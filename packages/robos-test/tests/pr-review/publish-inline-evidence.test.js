'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {publishInlineEvidence}=require('../../../pr-review/lib/publish-inline-evidence');const {resolveEvidence}=require('../../../pr-review/lib/inline-evidence');
test('uploads only referenced screenshots, embeds anonymous images and reuses upload on retry',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'publish-images-'));const screenshot=path.join(directory,'screen.png');fs.writeFileSync(screenshot,'image fixture');
 const evidence=[{id:'0123456789abcdef',kind:'screenshot',path:screenshot},{id:'fedcba9876543210',kind:'screenshot',path:'/must-not-upload.png'}];let uploads=0,shares=0;
 const dependencies={cloud:{catalog:()=>[{id:'drive',provider:'drive',repositoryOwner:'Org',remote:'test',name:'Test Drive'}],publish:async(id,dir)=>{uploads++;assert.deepEqual(fs.readdirSync(dir),['0123456789abcdef.png']);return {providerId:id,folderId:'folder'};}},run:async()=>JSON.stringify([{Path:'0123456789abcdef.png',ID:'image-id'}]),share:async()=>{shares++;return 'https://lh3.googleusercontent.com/d/image-id';}};
 const markdown='![Screenshot](robos-evidence://screenshot/0123456789abcdef)';
 for(let i=0;i<2;i++){const result=await publishInlineEvidence(markdown,{repo:'Org/repo',screenshotSharing:'unlisted'},{directory},evidence,dependencies);assert.equal(resolveEvidence(markdown,result),'![Screenshot](https://lh3.googleusercontent.com/d/image-id)');}
 assert.equal(uploads,1);assert.equal(shares,2);
});
test('does not upload without a matching project provider and does not hide failed sharing',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'publish-images-'));const file=path.join(directory,'screen.png');fs.writeFileSync(file,'test');const markdown='![x](robos-evidence://screenshot/0123456789abcdef)',evidence=[{id:'0123456789abcdef',kind:'screenshot',path:file}];
 await assert.rejects(publishInlineEvidence(markdown,{repo:'Org/repo'},{directory},evidence,{cloud:{catalog:()=>[]}}),/Select one Cloud/);
 await assert.rejects(publishInlineEvidence(markdown,{repo:'Org/repo',screenshotSharing:'unlisted'},{directory},evidence,{cloud:{catalog:()=>[{id:'drive',provider:'drive',repositoryOwner:'Org',remote:'test'}],publish:async()=>({providerId:'drive',folderId:'folder'})},run:async()=>JSON.stringify([{Path:'0123456789abcdef.png',ID:'image-id'}]),share:async()=>{throw Error('Sharing failed');}}),/Sharing failed/);
});

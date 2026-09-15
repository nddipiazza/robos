const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {openChrome}=require('./open-chrome');
test('Chrome links launch directly on Linux and macOS without a shell',async()=>{
 for(const platform of ['linux','darwin']){let call;await openChrome('https://github.com/Hermetiq/task-and-issue-tracking/issues/50',{platform,launch:(...args)=>{call=args;const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}});assert.equal(call[0],platform==='darwin'?'open':'google-chrome');assert.equal(call[1].at(-1),'https://github.com/Hermetiq/task-and-issue-tracking/issues/50');assert.equal(call[2].shell,undefined);}
});
test('rejects executable, local and credential-bearing URLs',()=>{for(const url of ['javascript:alert(1)','file:///etc/passwd','--incognito','https://user:secret@example.com'])assert.throws(()=>openChrome(url));});
test('reports Chrome launch failures',async()=>{await assert.rejects(openChrome('https://example.com',{launch:()=>{const c=new EventEmitter();queueMicrotask(()=>c.emit('error',Error('ENOENT')));return c;}}),/Could not open Google Chrome/);});

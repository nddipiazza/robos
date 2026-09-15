const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {routeExternalLinks}=require('./external-links');
test('regular and new-window links go outside Planner without creating embedded windows',async()=>{
 const wc=new EventEmitter();let handler;wc.setWindowOpenHandler=fn=>handler=fn;
 const opened=[];routeExternalLinks(wc,{open:async url=>opened.push(url)});
 const url='https://hermetiq.slack.com/archives/C0A2RNQJS8G/p1789048845808679';
 assert.deepEqual(handler({url}),{action:'deny'});
 let prevented=false;wc.emit('will-navigate',{preventDefault(){prevented=true;}},url);
 await new Promise(setImmediate);assert.equal(prevented,true);assert.deepEqual(opened,[url,url]);
});
test('reports launch failures without allowing embedded navigation',async()=>{
 const wc=new EventEmitter();wc.setWindowOpenHandler=()=>{};let error;
 routeExternalLinks(wc,{open:async()=>{throw Error('Chrome missing');},onError:e=>error=e.message});
 wc.emit('will-navigate',{preventDefault(){}},'https://example.com');await new Promise(setImmediate);assert.equal(error,'Chrome missing');
});
test('allows reloading the Planner document without treating it as an external link',()=>{
 const wc=new EventEmitter();wc.setWindowOpenHandler=()=>{};wc.getURL=()=> 'file:///planner/index.html';
 routeExternalLinks(wc,{open:()=>assert.fail('must not open Chrome for Planner reload')});
 wc.emit('will-navigate',{preventDefault:()=>assert.fail('must allow reload')},'file:///planner/index.html');
});

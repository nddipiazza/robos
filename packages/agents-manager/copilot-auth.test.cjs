'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { rpc, launch, terminalArgs } = require('./copilot-auth');
function child() {
  const c = new EventEmitter(); c.stdin = new PassThrough(); c.stdout = new PassThrough(); c.stderr = new PassThrough();
  c.kill = () => { c.killed = true; }; c.unref = () => {}; return c;
}
test('RPC parses fragmented UTF-8 frames and uses supplied Copilot environment', async () => {
  const c = child();
  const response = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { login: 'personal', statusMessage: 'Connected ✓' } });
  const frame = Buffer.from(`Content-Length: ${Buffer.byteLength(response)}\r\n\r\n${response}`);
  const result = rpc(['auth.getStatus'], { env: { COPILOT_GITHUB_TOKEN: 'test-personal-token' }, spawn: (bin,args,options) => {
    assert.equal(bin,'bash'); assert.equal(options.env.COPILOT_GITHUB_TOKEN,'test-personal-token');
    process.nextTick(() => { for (let i=0;i<frame.length;i+=3) c.stdout.write(frame.subarray(i,i+3)); }); return c;
  } });
  assert.equal((await result)['auth.getStatus'].login,'personal'); assert(c.killed);
});
test('RPC failure and timeout are explicit, never another account fallback', async () => {
  const c = child(); await assert.rejects(rpc(['auth.getStatus'], { env: {}, timeout: 5, spawn:()=>c }), /timed out/); assert(c.killed);
  const d=child(); await assert.rejects(rpc(['auth.getStatus'], { env:{}, spawn:()=>{process.nextTick(()=>d.emit('error',Error('missing binary')));return d;} }), /missing binary/);
});
test('terminal preserves arguments as argv and does not force a display', async () => {
  const args = ["project's name", '$(echo BAD)', '`echo BAD`', '--resume', 'session 1'];
  const result = await launch('open', args, '/tmp', { env:{DISPLAY:':9',COPILOT_GITHUB_TOKEN:'test-only'},spawn:(bin,argv,options)=>{
    assert.equal(bin,'x-terminal-emulator'); assert.deepEqual(argv.slice(5),args); assert.equal(options.env.DISPLAY,':9'); assert.equal(options.cwd,'/tmp');
    assert(!argv.join(' ').includes('test-only')); assert(argv[3].includes('"$@"')); assert(!argv[3].includes('gh auth'));
    const c=child();process.nextTick(()=>c.emit('exit',0));return c;
  }}); assert.equal(result.ok,true);
});
test('missing terminal and display errors reach UI', async () => {
  const result=await launch('open',[],null,{env:{},spawn:()=>{const c=child();process.nextTick(()=>c.emit('error',Error('spawn ENOENT')));return c;}});assert.match(result.error,/ENOENT/);
  const failure=await launch('open',[],null,{env:{},spawn:()=>{const c=child();process.nextTick(()=>{c.stderr.emit('data','Cannot open display');c.emit('exit',1);});return c;}});assert.match(failure.error,/Cannot open display/);
});

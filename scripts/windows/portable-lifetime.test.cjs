'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { portableLifetime } = require('./portable-lifetime.cjs');
function fixture(portable) {
  const app = new EventEmitter();
  let quit = false;
  const windows = [];
  app.quit = () => {
    let prevented = false;
    app.emit('before-quit', { preventDefault() { prevented = true; } });
    if (!prevented) quit = true;
  };
  const lifetime = portableLifetime(app, { getAllWindows: () => windows }, portable);
  const child = () => { const p = new EventEmitter(); p.unref = () => { p.unreferenced = true; }; lifetime.watch(p); return p; };
  return { app, windows, child, hasQuit: () => quit };
}
test('closing the portable launcher retains resources until all launched apps exit', () => {
  const f = fixture(true), first = f.child(), second = f.child();
  f.app.emit('window-all-closed');
  assert.equal(f.hasQuit(), false);
  first.emit('exit', 0);
  assert.equal(f.hasQuit(), false);
  second.emit('exit', 0);
  assert.equal(f.hasQuit(), true);
  assert.equal(first.unreferenced, undefined);
});
test('explicit quit closes the launcher but waits for the last portable app', () => {
  const f = fixture(true), child = f.child();
  f.windows.push({ close() { f.windows.pop(); f.app.emit('window-all-closed'); } });
  f.app.quit();
  assert.equal(f.windows.length, 0);
  assert.equal(f.hasQuit(), false);
  child.emit('exit', 0);
  assert.equal(f.hasQuit(), true);
});
test('failed launches release the portable process; native installed launches remain independent', () => {
  const portable = fixture(true), failed = portable.child();
  portable.app.emit('window-all-closed');
  failed.emit('error', new Error('spawn failed'));
  assert.equal(portable.hasQuit(), true);
  const native = fixture(false), child = native.child();
  native.app.emit('window-all-closed');
  assert.equal(native.hasQuit(), true);
  assert.equal(child.unreferenced, true);
});

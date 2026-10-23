'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readCommand } = require('./read-command.cjs');

test('a slow status probe leaves the event loop responsive', async () => {
  let ticked = false;
  const pending = readCommand(process.execPath, ['-e', 'setTimeout(() => console.log("ready"), 250)']);
  const timer = setTimeout(() => { ticked = true; }, 20);
  assert.equal(await pending, 'ready');
  clearTimeout(timer);
  assert.equal(ticked, true);
});

test('a hung or unavailable status probe settles without aborting startup', async () => {
  assert.equal(await readCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 150 }), null);
  assert.equal(await readCommand('robos-nonexistent-status-tool', []), null);
});

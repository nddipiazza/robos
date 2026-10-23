'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { nativeHelper, run } = require('./native-integration.cjs');

test('native Win + Shift recognition preserves other shortcuts and handles either release order', { skip: process.platform !== 'win32' }, async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-native-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const [one, two] = await Promise.all([nativeHelper(__dirname, home), nativeHelper(__dirname, home)]);
  assert.equal(one, two, 'Concurrent requests must share one native build');
  assert.match(await run(one, ['--self-test']), /PASS modifier-only chord/);
});

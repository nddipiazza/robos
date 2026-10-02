'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { create } = require('./github-accounts');
function fixture() {
  let active = 'work';
  const calls = [], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-accounts-'));
  const configFile = path.join(dir, 'github-accounts.json');
  const service = create({ configFile, run: async args => {
    calls.push(args);
    if (args[1] === 'status') return JSON.stringify({ hosts: { 'github.com': ['work', 'personal'].map(login => ({ login, active: login === active, state: 'success', token: 'must-not-reach-renderer' })) } });
    if (args[1] === 'token') return 'test-credential-' + args.at(-1);
    if (args[1] === 'switch') { active = args.at(-1); return ''; }
    throw Error('Unexpected command');
  } });
  return { service, calls, configFile, active: () => active };
}
test('lists only account metadata, with independent selections', async () => {
  const f = fixture(), result = await f.service.list();
  assert.equal(result.selected.git, 'work'); assert.equal(result.selected.copilot, '');
  assert(!JSON.stringify(result).includes('must-not-reach-renderer'));
});
test('persists names only; Copilot gets selected token and never switches Git identity', async () => {
  const f = fixture();
  await f.service.save({ git: 'work', copilot: 'personal' });
  const env = await f.service.copilotEnv(undefined, { GH_TOKEN: 'wrong', GITHUB_TOKEN: 'wrong', COPILOT_GITHUB_TOKEN: 'wrong', DISPLAY: ':9' });
  assert.equal(env.COPILOT_GITHUB_TOKEN, 'test-credential-personal');
  assert.equal(env.GH_TOKEN, undefined); assert.equal(env.GITHUB_TOKEN, undefined); assert.equal(env.DISPLAY, ':9');
  assert.equal(f.active(), 'work');
  assert.deepEqual(JSON.parse(fs.readFileSync(f.configFile)), { git: 'work', copilot: 'personal' });
  assert.equal(fs.statSync(f.configFile).mode & 0o777, 0o600);
  const reopened = create({ configFile: f.configFile }); assert.equal(reopened.read().copilot, 'personal');
});
test('changing Git account preserves Copilot selection', async () => {
  const f = fixture(); await f.service.save({ git: 'work', copilot: 'personal' });
  await f.service.save({ git: 'personal', copilot: 'personal' });
  assert.equal(f.active(), 'personal'); assert.equal(f.service.read().copilot, 'personal');
});
test('missing selection, unknown accounts, or rejected Copilot access never fall back', async () => {
  const f = fixture(); await assert.rejects(f.service.copilotEnv(), /Choose a Copilot account/);
  await assert.rejects(f.service.save({ git: 'work', copilot: 'missing' }), /Choose a signed-in/);
  await assert.rejects(f.service.save({ git: 'personal', copilot: 'personal' }, async () => { throw Error('No Copilot access'); }), /No Copilot access/);
  assert.equal(f.active(), 'work'); assert.equal(f.calls.filter(a => a[1] === 'switch').length, 0);
  assert(!fs.existsSync(f.configFile));
});

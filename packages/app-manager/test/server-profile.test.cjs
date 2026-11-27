'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { createServer, issueInvite } = require('../server/setup-server.cjs');
const { ServerProfile, requestSetup } = require('../lib/server-profile.cjs');
const { writeJSON } = require('../lib/profile-schema.cjs');

test('pairing pins the server, consumes the invite once, persists the profile, and supports revocation', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-setup-test-'));
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const cert = spawnSync(process.env.ROBOS_TEST_OPENSSL || 'openssl', [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1',
    '-subj', '/CN=RobOS Test', '-keyout', 'key.pem', '-out', 'cert.pem',
  ], { cwd: dir, encoding: 'utf8' });
  if (cert.error?.code === 'ENOENT') return t.skip('OpenSSL is required to test HTTPS pairing');
  assert.equal(cert.status, 0, cert.stderr);

  const profile = { schema: 1, name: 'Home PC', revision: 1, apps: ['audio-player'], settings: { theme: 'dark' } };
  function setServerProfile(value) { writeJSON(path.join(dir, 'profile.json'), value); }
  setServerProfile(profile);
  server = createServer(dir).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const address = '127.0.0.1:' + port;
  const options = {
    dataDir: path.join(dir, 'client'),
    configDir: path.join(dir, 'preferences'),
    deviceName: 'Windows test',
    storage: {
      isEncryptionAvailable: () => true,
      encryptString: value => Buffer.from(value.split('').reverse().join('')),
      decryptString: buffer => buffer.toString().split('').reverse().join(''),
    },
  };
  const client = new ServerProfile(options);
  const invite = issueInvite(dir);
  const [, fingerprint, code] = invite.split('.');
  await assert.rejects(client.pair(address, 'robos1.' + '0'.repeat(64) + '.' + code), /identity does not match/);
  assert.equal(client.state(), null);
  const connection = { host: '127.0.0.1', port, fingerprint };
  await assert.rejects(requestSetup(connection, '/v1/profile'), /authorization/);

  assert.deepEqual((await client.pair(address, invite)).profile, profile);
  await assert.rejects(requestSetup(connection, '/v1/pair', { body: { code, name: 'Second client' } }), /already used/);
  assert.deepEqual(new ServerProfile(options).state().profile, profile);
  assert.equal(Object.hasOwn(client.state(), 'credential'), false);
  assert.equal(Object.hasOwn(client.state(), 'fingerprint'), false);

  const expiredCode = issueInvite(dir).split('.')[2];
  const invites = path.join(dir, 'invites');
  const [expiredFile] = fs.readdirSync(invites);
  writeJSON(path.join(invites, expiredFile), { expires: 0 });
  await assert.rejects(requestSetup(connection, '/v1/pair', { body: { code: expiredCode, name: 'Late client' } }), /expired/);
  assert.deepEqual(fs.readdirSync(invites), []);

  const next = { ...profile, revision: 2, settings: { notification_sound: false } };
  setServerProfile(next);
  assert.deepEqual((await client.refresh()).profile, next);
  await assert.rejects(requestSetup(connection, '/v1/profile', { token: 'invalid' }), /authorization/);

  writeJSON(client.settingsFile, { theme: 'light', local_only: 'keep' });
  client.applySettings(next);
  assert.deepEqual(JSON.parse(fs.readFileSync(client.settingsFile)), { theme: 'light', local_only: 'keep', notification_sound: false });
  assert.throws(() => client.applySettings({ ...next, settings: { github_token: 'invalid' } }), /unsupported setting/);

  const devices = path.join(dir, 'devices');
  const [device] = fs.readdirSync(devices);
  fs.unlinkSync(path.join(devices, device));
  await assert.rejects(client.refresh(), /revoked/);
  assert.deepEqual(client.state().profile, next);
  client.disconnect();
  assert.equal(client.state(), null);
});

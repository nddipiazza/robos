'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Controller, parseProfile, runArguments } = require('../lib/controller');
const ca = '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----';
const text = `client\ndev tun\nproto udp\nremote vpn.example.test 1194\nca ca.crt\nauth SHA512\ncipher AES-256-CBC\n`;
test('imports only data; supplied scripts/options cannot become executable config', () => {
  const profile = parseProfile(text + '\nup /tmp/evil\nscript-security 3\nroute-up /tmp/evil\n', () => ca);
  assert.deepEqual(Object.keys(profile).sort(), ['auth', 'ca', 'cipher', 'hostname', 'port', 'protocol', 'tlsAuth'].sort());
  assert.equal(profile.auth, 'SHA512');
  assert.equal(profile.hostname, 'vpn.example.test');
});
test('accepts inline CA and refuses traversal, TAP, unsupported TLS and bad ports', () => {
  assert.equal(parseProfile(`remote test 1194\n<ca>\n${ca}\n</ca>`, () => assert.fail()).ca, ca);
  for (const extra of ['ca ../secret', 'dev tap', 'tls-crypt key', 'remote host 99999']) {
    const content = extra.startsWith('remote') ? extra + '\nca ca.crt' : extra + '\n' + text;
    assert.throws(() => parseProfile(content, () => ca));
  }
});
test('container cannot inherit host network, Docker socket, host home, or app capabilities', () => {
  const args = runArguments('qbittorrent');
  assert(args.includes('--network=bridge'));
  assert(args.includes('--cap-drop=ALL'));
  assert(args.includes('--security-opt=no-new-privileges:true'));
  assert(args.includes('--read-only'));
  assert(args.includes('127.0.0.1:18080:18080/tcp'));
  assert(!args.some(value => /docker.sock|network=host|privileged|type=bind/.test(value)));
  assert.throws(() => runArguments('qbittorrent;sh'));
});
test('VPN credentials travel through stdin, never argv/environment', async () => {
  const calls = [];
  const controller = new Controller({ run: async (...args) => { calls.push(args); return ''; },
    resolve: async () => ({ address: '203.0.113.1' }) });
  const result = await controller.start('qbittorrent', parseProfile(text, () => ca), { username: 'alice', password: 'secret-test' });
  assert.equal(calls.length, 2);
  assert(!JSON.stringify(calls.map(call => call.slice(0, 2))).includes('secret-test'));
  const payload = JSON.parse(calls[1][2].input);
  assert.equal(payload.password, 'secret-test');
  assert.equal(payload.endpoint, '203.0.113.1');
  assert.equal(payload.webPassword, result.webPassword);
});
test('injection failure kills the container instead of leaving it behind', async () => {
  const calls = [];
  const controller = new Controller({ resolve: async () => ({ address: '203.0.113.1' }),
    run: async (_, args) => {
      calls.push(args);
      if (args[0] === 'exec') throw new Error('injection failed');
      if (args[0] === 'inspect') return JSON.stringify([{ Config: { Labels: { 'dev.robos.vpn-app-container': 'true' } } }]);
      return '';
    } });
  await assert.rejects(controller.start('qbittorrent', parseProfile(text, () => ca), { username: 'a', password: 'b' }), /injection failed/);
  assert(calls.some(args => args[0] === 'rm' && args.includes('--force')));
});
test('missing runtime is reported as unavailable; never reports protected', async () => {
  const controller = new Controller({ run: async () => { throw new Error('docker missing'); } });
  assert.equal((await controller.prerequisites()).ready, false);
  assert.equal((await controller.status('qbittorrent')).state, 'unavailable');
});
test('stopping refuses an unrelated container with the same name', async () => {
  const controller = new Controller({ run: async () => JSON.stringify([{ Config: { Labels: {} } }]) });
  await assert.rejects(controller.stop('qbittorrent'), /not managed/);
});

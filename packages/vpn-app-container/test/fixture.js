'use strict';
// Disposable local VPN for real Linux network tests. Never uses a user's account.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Controller, execute } = require('../lib/controller');
const { main: live } = require('./live-qbittorrent');
async function main() {
  const runtime = await new Controller().prerequisites();
  if (!runtime.ready) throw new Error(runtime.message);
  await new Controller().build();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vpn-fixture-'));
  const server = `robos-vpn-test-${process.pid}`;
  let created = false;
  try {
    const file = name => path.join(temporary, name);
    await execute('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=RobOSFixtureCA', '-keyout', file('ca.key'), '-out', file('ca.crt')]);
    await execute('openssl', ['req', '-newkey', 'rsa:2048', '-nodes',
      '-subj', '/CN=RobOSFixtureServer', '-keyout', file('server.key'), '-out', file('server.csr')]);
    fs.writeFileSync(file('server.ext'), 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
    await execute('openssl', ['x509', '-req', '-days', '1', '-in', file('server.csr'),
      '-CA', file('ca.crt'), '-CAkey', file('ca.key'), '-CAcreateserial',
      '-extfile', file('server.ext'), '-out', file('server.crt')]);
    fs.writeFileSync(file('server.conf'), [
      'dev tun0', 'proto udp', 'port 1194', 'server 10.8.0.0 255.255.255.0',
      'ca /fixture/ca.crt', 'cert /fixture/server.crt', 'key /fixture/server.key',
      'dh none', 'verify-client-cert none', 'script-security 2',
      'auth-user-pass-verify /bin/true via-env', 'auth SHA256',
      'data-ciphers AES-256-GCM:AES-128-GCM:AES-256-CBC', 'verb 3',
    ].join('\n') + '\n');
    await execute('docker', ['run', '--detach', '--name', server, '--network=bridge',
      '--cap-add=NET_ADMIN', '--device=/dev/net/tun', '--sysctl=net.ipv4.ip_forward=1',
      '--mount', `type=bind,source=${temporary},target=/fixture,readonly`,
      '--entrypoint=/bin/sh', 'robos-vpn-app-container:0.1.0', '-c',
      'iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE && exec openvpn --config /fixture/server.conf']);
    created = true;
    const info = JSON.parse(await execute('docker', ['inspect', server]))[0];
    const address = info.NetworkSettings.IPAddress;
    fs.writeFileSync(file('client.ovpn'), `client\ndev tun\nproto udp\nremote ${address} 1194\nca ca.crt\nauth SHA256\n`);
    process.env.ROBOS_VPN_PROFILE = file('client.ovpn');
    process.env.ROBOS_VPN_TEST_FIXTURE = '1';
    await live();
  } catch (error) {
    if (created) console.error(await execute('docker', ['logs', server]));
    throw error;
  } finally {
    if (created) await execute('docker', ['rm', '--force', server]);
    // Only this freshly-created OS temporary directory is removed.
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

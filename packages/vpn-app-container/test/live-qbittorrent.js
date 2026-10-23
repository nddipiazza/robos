#!/usr/bin/env node
'use strict';
// REAL Linux integration test. No mocks. Requires a working VPN account.
// Usage: ROBOS_VPN_PROFILE=/path/server.ovpn node test/live-qbittorrent.js
// Reads username/password through a local terminal; never pass them in argv.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const { Controller, execute, parseProfile } = require('../lib/controller');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const name = 'robos-vpn-qbittorrent';
const records = [];
async function step(title, fn) {
  await fn(); records.push({ title, passed: true }); console.log(`PASS: ${title}`);
}
async function waitFor(fn, timeout = 80000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await fn()) return; await delay(250); }
  throw new Error('Timed out waiting for expected state');
}
async function main() {
  const controller = new Controller();
  const runtime = await controller.prerequisites();
  assert(runtime.ready, runtime.message);
  const file = process.env.ROBOS_VPN_PROFILE;
  assert(file, 'Set ROBOS_VPN_PROFILE to your local .ovpn file');
  const profile = parseProfile(fs.readFileSync(file, 'utf8'), name => fs.readFileSync(path.join(path.dirname(file), name), 'utf8'));
  let credentials;
  if (process.env.ROBOS_VPN_TEST_FIXTURE === '1') {
    // Public disposable fixture credentials, never a real account.
    credentials = { username: 'fixture', password: 'fixture' };
  } else {
  let mute = false;
  const output = new Writable({ write(chunk, encoding, cb) { if (!mute) process.stdout.write(chunk); cb(); } });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  const username = await rl.question('VPN username: ');
  process.stdout.write('VPN password (hidden): '); mute = true;
  const password = await rl.question(''); mute = false; process.stdout.write('\n'); rl.close();
  credentials = { username, password };
  }
  await controller.build();
  let created = false;
  try {
    // The fixed name refuses to overwrite any existing user session.
    let login;
    await step('Launch real qBittorrent only after VPN connectivity passes', async () => {
      login = await controller.start('qbittorrent', profile, credentials); created = true;
      await waitFor(async () => {
        const status = await controller.status('qbittorrent');
        if (status.state === 'stopped') throw new Error(status.logs);
        return status.state === 'running';
      });
    });
    const asApp = code => execute('docker', ['exec', '--user', '10000:10000', name, 'python3', '-c', code]);
    await step('Real qBittorrent Web API authenticates through loopback only', async () => {
      let responseDetails = '';
      try {
      await waitFor(async () => {
        try {
          const response = await fetch('http://127.0.0.1:18080/api/v2/auth/login', { method: 'POST',
            headers: { Referer: 'http://127.0.0.1:18080/' }, signal: AbortSignal.timeout(1500),
            body: new URLSearchParams({ username: 'admin', password: login.webPassword }) });
          const text = await response.text();
          responseDetails = `${response.status}: ${text.slice(0, 200)}`;
          return response.ok && text === 'Ok.';
        } catch (error) { responseDetails = error.message; return false; }
      }, 15000);
      } catch (error) { throw new Error(`${error.message}: ${responseDetails}`); }
    });
    await step('App UID has no effective/bounding/ambient capabilities and cannot read VPN credentials', async () => {
      await asApp(`from pathlib import Path
import os
s=Path('/proc/self/status').read_text()
for field in ('CapEff:', 'CapPrm:', 'CapAmb:'):
 assert int(next(l.split()[1] for l in s.splitlines() if l.startswith(field)),16)==0
try: Path('/run/vpn/auth').read_text()
except PermissionError: pass
else: raise AssertionError('VPN credentials readable')`);
      // Verify the actual qbittorrent process, not only docker exec's capability set.
      await execute('docker', ['exec', name, 'python3', '-c', `from pathlib import Path
p=next(p for p in Path('/proc').iterdir() if p.name.isdigit() and (p/'comm').read_text().strip()=='qbittorrent-nox')
s=(p/'status').read_text()
for field in ('CapEff:', 'CapPrm:', 'CapBnd:', 'CapAmb:'):
 assert int(next(l.split()[1] for l in s.splitlines() if l.startswith(field)),16)==0
assert next(l.split()[1] for l in s.splitlines() if l.startswith('Uid:'))=='10000'`]);
    });
    await step('App traffic succeeds through tun0', async () => {
      await asApp(`import subprocess
subprocess.run(['curl','--fail','--silent','--noproxy','*','--interface','tun0','--max-time','5','https://1.1.1.1/cdn-cgi/trace'],check=True,stdout=subprocess.DEVNULL)`);
    });
    await step('Direct IPv4 and host/Docker DNS bypasses fail from app UID', async () => {
      await asApp(`import subprocess,socket
r=subprocess.run(['curl','--silent','--noproxy','*','--interface','eth0','--max-time','2','https://1.1.1.1/cdn-cgi/trace'],stdout=subprocess.DEVNULL)
assert r.returncode!=0,'Direct Internet escaped'
# The Docker DNS address is deliberately excluded from loopback allow rules.
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.settimeout(1)
s.sendto(bytes.fromhex('123401000001000000000000076578616d706c6503636f6d0000010001'),('127.0.0.11',53))
try:s.recv(4096)
except (TimeoutError,OSError):pass
else:raise AssertionError('Docker DNS bypass')`);
    });
    await step('IPv6 cannot connect outside the container', async () => {
      await asApp(`import socket
s=socket.socket(socket.AF_INET6);s.settimeout(1)
try:s.connect(('2606:4700:4700::1111',443))
except OSError:pass
else:raise AssertionError('IPv6 bypass')`);
    });
    await step('Removing the tunnel kills qBittorrent and exits the container', async () => {
      const before = Date.now();
      await execute('docker', ['exec', name, 'ip', 'link', 'delete', 'tun0']);
      await waitFor(async () => !(await controller.inspect('qbittorrent')).State.Running, 4000);
      assert(Date.now() - before < 4000, 'Failure handling exceeded test deadline');
      assert.match((await controller.status('qbittorrent')).logs, /tunnel lost/);
    });
    await controller.stop('qbittorrent'); created = false;
    await step('A connectivity blackhole kills qBittorrent even while tun0 exists', async () => {
      await controller.start('qbittorrent', profile, credentials); created = true;
      await waitFor(async () => (await controller.status('qbittorrent')).state === 'running');
      // Keep the interface present; silently blackhole tunnel traffic.
      await execute('docker', ['exec', name, 'iptables', '-I', 'OUTPUT', '1', '-o', 'tun0', '-j', 'DROP']);
      await waitFor(async () => !(await controller.inspect('qbittorrent')).State.Running, 6000);
      assert.match((await controller.status('qbittorrent')).logs, /connectivity check failed/);
    });
    await controller.stop('qbittorrent'); created = false;
    await step('An unavailable VPN never launches qBittorrent', async () => {
      await controller.start('qbittorrent', { ...profile, port: 1 }, credentials); created = true;
      await waitFor(async () => !(await controller.inspect('qbittorrent')).State.Running, 70000);
      const status = await controller.status('qbittorrent');
      assert.match(status.logs, /app never launched/);
      assert(!status.logs.includes('"state": "running"'));
    });
  } finally {
    credentials.password = '';
    if (created) console.log('Final app container status:', JSON.stringify(await controller.status('qbittorrent')));
    if (created && (await controller.inspect('qbittorrent')).State.Running) {
      for (const args of [['iptables', '-nvL'], ['ip', 'route'], ['ss', '-ltn']]) {
        console.log(await execute('docker', ['exec', name, ...args]));
      }
    }
    if (created) await controller.stop('qbittorrent');
    const target = process.env.ROBOS_VPN_PROOF || path.join(__dirname, 'live-proof.json');
    fs.writeFileSync(target, JSON.stringify({ timestamp: new Date().toISOString(), records }, null, 2));
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
